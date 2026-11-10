// DE REGIE van een motion graphics-video: één rij in de bibliotheek (maker 'motion') die
// vanzelf door drie stappen loopt, op dezelfde manier als de reclame (lib/reclame/regie.ts):
//
//   stem      — Hugo spreekt het hele script in één keer in (fal, ElevenLabs)
//   animatie  — woordtijden meten, Claude tekent de animatie en controleert zijn eigen
//               proefbeelden (lib/motion/animatie.ts)
//   video     — de animatie beeld voor beeld omzetten naar een mp4 met stem en muziek
//
// Animatie en video zijn bewust twee losse stappen: elk loopt in een eigen serververzoek,
// zodat ze samen niet over de tijdslimiet van één verzoek heen gaan. Tussen de twee staat
// de rij op 'wacht-video' tot de volgende opvraging hem oppakt.
//
// Elke overgang is een voorwaardelijke update op de huidige stap: twee schermen die
// tegelijk de stand opvragen, starten een stap nooit twee keer.

import { after } from "next/server";
import { fal } from "@/lib/fal";
import { transcribeWords, type WhisperWord } from "@/lib/openai";
import { zetKostenContext } from "@/lib/provider-kosten";
import { createServiceClient } from "@/lib/supabase/service";
import { betaal, betaalTerug } from "@/lib/team/team";
import { musicTrackUrl } from "@/lib/music/library";
import { MAX_TEGELIJK, WachtrijFout, falReden, markeerMislukt, uploadNaarOpslag } from "@/lib/creaties/wachtrij";
import type { Creatie } from "@/lib/creaties/types";
import { canUseMotion } from "@/lib/studio/access";
import { controleerPlan } from "./plan";
import { tekenAnimatie, type Gebruik } from "./animatie";
import { maakVideo } from "./render";
import {
  MOTION_MUZIEK,
  formaatMaat,
  isMotionFormaat,
  isMotionLengte,
  motionCredits,
  type MotionInvoer,
  type MotionStap,
} from "./types";

fal.config({ credentials: process.env.FAL_KEY });

const STEM_MODEL = "fal-ai/elevenlabs/tts/eleven-v3";
/** Hugo V: de Nederlandse stem die Sam in alle tools wil. */
const HUGO = "rbqBOMK4BPTMGvIB7N8w";

const TIJDSLIMIET_MS = 45 * 60 * 1000;
// Het tekenen (Claude, met controlerondes) en het maken van de video duren elk minuten.
// Pas als een stap langer stilstaat dan een serververzoek kán duren (800 s), is hij echt
// gestorven en mag een volgende opvraging hem overnemen.
const VASTGELOPEN_MS = 14 * 60 * 1000;
const MAX_POGINGEN = 2;
/** Zoveel tijd krijgt het maken van de video binnen één verzoek. */
const VIDEO_BUDGET_MS = (process.env.VERCEL ? 700 : 1500) * 1000;

interface Voortgang {
  stap: MotionStap;
  /** Wanneer deze stap begon; om vastgelopen stappen te herkennen. */
  sinds: string;
  /** Het verzoek bij fal voor de stem. */
  stem?: string;
  /** De stem op onze eigen opslag. */
  stemUrl?: string;
  /** Het werkbestand op onze opslag: de code van de animatie en de woordtijden. */
  werk?: string;
  /** Hoe vaak de lopende stap opnieuw is gestart na vastlopen. */
  pogingen?: number;
  /** Wat het ons kostte (Claude), en hoe lang de video duurde om te maken. Alleen voor beheer. */
  gebruik?: Gebruik & { videoSec?: number; renderSec?: number };
}

interface Werkbestand {
  code: string;
  woorden: WhisperWord[];
  script: [string, string][];
}

type RijInvoer = MotionInvoer & { voortgang?: Voortgang };
const rij = (c: Creatie) => c.invoer as unknown as RijInvoer;

function tekst(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}
function kleur(v: unknown, standaard: string): string {
  const k = tekst(v, 7);
  return /^#[0-9a-f]{6}$/i.test(k) ? k.toLowerCase() : standaard;
}

/** Leest en controleert de invoer van het maakscherm. Gooit met een melding voor op het scherm. */
export function leesMotionInvoer(ruw: Record<string, unknown>): MotionInvoer {
  const bedrijf = tekst(ruw.bedrijf, 40);
  if (!bedrijf) throw new Error("Vul eerst de naam van je bedrijf in.");
  const lengte = isMotionLengte(ruw.lengte) ? ruw.lengte : 30;
  const muziek = MOTION_MUZIEK.some((m) => m.slug === ruw.muziek) ? (ruw.muziek as string) : MOTION_MUZIEK[0].slug;
  return {
    onderwerp: typeof ruw.onderwerp === "string" ? ruw.onderwerp.trim().slice(0, 4000) : "",
    bedrijf,
    website: tekst(ruw.website, 60).replace(/^https?:\/\//, "").replace(/\/$/, ""),
    kleur: kleur(ruw.kleur, "#1c72ed"),
    kleur2: kleur(ruw.kleur2, "#ffc21a"),
    formaat: isMotionFormaat(ruw.formaat) ? ruw.formaat : "16:9",
    lengte,
    muziek,
    plan: controleerPlan(ruw.plan, lengte),
  };
}

/** Het script zoals de kern het leest: per scene wat de stem zegt, 'eind' als laatste. */
function scriptVan(i: MotionInvoer): [string, string][] {
  return [...i.plan.scenes.map((s, k): [string, string] => [`s${k + 1}`, s.tekst]), ["eind", i.plan.eind.tekst]];
}

export async function startMotion(userId: string, ruw: Record<string, unknown>, ouderId?: string | null): Promise<Creatie> {
  let invoer: MotionInvoer;
  try {
    invoer = leesMotionInvoer(ruw);
  } catch (e) {
    throw new WachtrijFout(e instanceof Error ? e.message : String(e), 400);
  }

  const db = createServiceClient();
  // De studio is nog niet voor iedereen open; de knop verbergen alleen is geen slot.
  const { data: wie } = await db.auth.admin.getUserById(userId);
  if (!canUseMotion(wie?.user?.email)) throw new WachtrijFout("Deze studio is nog niet beschikbaar voor jouw account.", 403);
  const { count } = await db.from("creaties").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "bezig");
  if ((count ?? 0) >= MAX_TEGELIJK) {
    throw new WachtrijFout(`Je hebt al ${MAX_TEGELIJK} dingen in de maak. Wacht tot er één klaar is.`, 429);
  }

  const { ok, betaald, betalerId } = await betaal(userId, motionCredits(invoer.lengte), "Nieuwe app: motion graphics");
  if (!ok) throw new WachtrijFout("Niet genoeg credits.", 402);

  const voortgang: Voortgang = { stap: "stem", sinds: new Date().toISOString() };
  const { data: nieuw, error } = await db
    .from("creaties")
    .insert({
      user_id: userId,
      soort: "video",
      status: "bezig",
      maker: "motion",
      model: "motion",
      prompt: `Motion graphics: ${invoer.plan.titel || invoer.bedrijf}`,
      invoer: { ...invoer, voortgang },
      credits: betaald,
      fal_endpoint: "motion",
      ouder_id: ouderId ?? null,
      ...(betalerId !== userId ? { betaald_door: betalerId } : {}),
    })
    .select("*")
    .single();
  if (error || !nieuw) {
    await betaalTerug({ user_id: userId, betaald_door: betalerId, credits: betaald }, "Terug: motion graphics niet gestart");
    throw new WachtrijFout("Kon de opdracht niet opslaan. Probeer het opnieuw.", 500);
  }

  try {
    // Eén opname voor de hele video: per scene inspreken geeft hoorbare naden en een
    // wisselend tempo. De scenes worden daarna op de woordtijden gelegd.
    const { request_id } = await fal.queue.submit(STEM_MODEL, {
      input: { text: scriptVan(invoer).map(([, t]) => t).join(" "), voice: HUGO, language_code: "nl", stability: 0.5, similarity_boost: 0.75, speed: 1 } as never,
    });
    return await werkVoortgangBij(nieuw as Creatie, { ...voortgang, stem: request_id });
  } catch (e) {
    const reden = falReden(e);
    console.error("[motion] stem insturen mislukt:", reden);
    return (await markeerMislukt(nieuw as Creatie, `Insturen mislukt: ${reden}`)) ?? (nieuw as Creatie);
  }
}

async function werkVoortgangBij(c: Creatie, voortgang: Voortgang): Promise<Creatie> {
  const invoer = { ...rij(c), voortgang };
  const { data } = await createServiceClient().from("creaties").update({ invoer }).eq("id", c.id).select("*").single();
  return (data as Creatie | null) ?? { ...c, invoer };
}

/** Neemt een stap over, alleen als de rij nog op `van` staat. Null als een ander hem al had. */
async function claim(c: Creatie, van: Voortgang, naar: Voortgang): Promise<Creatie | null> {
  const invoer = { ...rij(c), voortgang: naar };
  const { data } = await createServiceClient()
    .from("creaties")
    .update({ invoer })
    .eq("id", c.id)
    .eq("status", "bezig")
    .eq("invoer->voortgang->>stap", van.stap)
    .eq("invoer->voortgang->>sinds", van.sinds)
    .select("*")
    .maybeSingle();
  return data as Creatie | null;
}

/** Lang werk na het antwoord laten doorlopen; zonder verzoek om ons heen gewoon los starten. */
function opAchtergrond(werk: () => Promise<void>) {
  try {
    after(werk);
  } catch {
    void werk();
  }
}

/** Laat een motion graphics-video een stap verder lopen als dat kan. */
export async function verversMotion(c: Creatie): Promise<Creatie> {
  if (c.status !== "bezig") return c;
  const v = rij(c).voortgang;
  if (!v) return (await markeerMislukt(c, "De opdracht is niet goed aangekomen.")) ?? c;
  if (Date.now() - new Date(c.created_at).getTime() > TIJDSLIMIET_MS) return (await markeerMislukt(c, "Het duurde te lang.")) ?? c;
  const stapLeeftijd = Date.now() - new Date(v.sinds).getTime();
  zetKostenContext(c.user_id, "Nieuwe app: motion graphics");

  try {
    if (v.stap === "stem") {
      if (!v.stem) return stapLeeftijd > 2 * 60 * 1000 ? ((await markeerMislukt(c, "De opdracht is niet goed aangekomen.")) ?? c) : c;
      const st = (await fal.queue.status(STEM_MODEL, { requestId: v.stem, logs: false })) as { status: string };
      if (st.status !== "COMPLETED") return c;
      const naar: Voortgang = { ...v, stap: "animatie", sinds: new Date().toISOString() };
      const gewonnen = await claim(c, v, naar);
      if (!gewonnen) return c;
      opAchtergrond(() => voerAnimatieUit(gewonnen, naar));
      return gewonnen;
    }

    if (v.stap === "wacht-video") {
      const naar: Voortgang = { ...v, stap: "video", sinds: new Date().toISOString() };
      const gewonnen = await claim(c, v, naar);
      if (!gewonnen) return c;
      opAchtergrond(() => voerVideoUit(gewonnen, naar));
      return gewonnen;
    }

    // 'animatie' en 'video' lopen in een eerder verzoek. Staat zo'n stap te lang stil, dan
    // is dat verzoek gestorven: één keer opnieuw, daarna opgeven (met credits terug).
    if ((v.stap === "animatie" || v.stap === "video") && stapLeeftijd > VASTGELOPEN_MS) {
      if ((v.pogingen ?? 0) + 1 >= MAX_POGINGEN) return (await markeerMislukt(c, "Het maken liep vast. Probeer het opnieuw.")) ?? c;
      const naar: Voortgang = { ...v, sinds: new Date().toISOString(), pogingen: (v.pogingen ?? 0) + 1 };
      const gewonnen = await claim(c, v, naar);
      if (!gewonnen) return c;
      opAchtergrond(() => (v.stap === "animatie" ? voerAnimatieUit(gewonnen, naar) : voerVideoUit(gewonnen, naar)));
      return gewonnen;
    }
    return c;
  } catch (e) {
    const reden = falReden(e);
    if (/weigerde|geen resultaat|422|content/i.test(reden)) return (await markeerMislukt(c, reden)) ?? c;
    console.error("[motion] verder zetten mislukt, later opnieuw:", reden);
    return c;
  }
}

function paginaVan(i: MotionInvoer, woorden: WhisperWord[]) {
  const { w, h } = formaatMaat(i.formaat);
  return { w, h, woorden, script: scriptVan(i), merk: { naam: i.bedrijf, website: i.website, kleur: i.kleur, kleur2: i.kleur2 } };
}

async function haal(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ophalen mislukt (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function voerAnimatieUit(c: Creatie, v: Voortgang): Promise<void> {
  const r = rij(c);
  try {
    // De stem naar onze eigen opslag: de link van fal verloopt, en de video-stap (en later
    // een aanpassing) heeft hem weer nodig.
    let stemUrl = v.stemUrl;
    let stem: Buffer;
    if (stemUrl) stem = await haal(stemUrl);
    else {
      const { data } = await fal.queue.result(STEM_MODEL, { requestId: v.stem! });
      const tijdelijk = (data as { audio?: { url?: string } }).audio?.url;
      if (!tijdelijk) throw new Error("De voice-over kwam niet terug.");
      stem = await haal(tijdelijk);
      stemUrl = await uploadNaarOpslag(c.user_id, stem, "mp3", "audio/mpeg");
    }
    const { words } = await transcribeWords(stem, { language: "nl" });
    if (words.length < 5) throw new Error("De woordtijden van de voice-over konden niet worden gemeten.");

    const uitkomst = await tekenAnimatie({ pagina: paginaVan(r, words), plan: r.plan, onderwerp: r.onderwerp });
    if (uitkomst.rest.length) console.warn("[motion] schoonheidsfouten na controle:", uitkomst.rest.slice(0, 5));

    const werk: Werkbestand = { code: uitkomst.code, woorden: words, script: scriptVan(r) };
    const werkUrl = await uploadNaarOpslag(c.user_id, Buffer.from(JSON.stringify(werk)), "json", "application/json");
    const naar: Voortgang = { ...v, stap: "wacht-video", sinds: new Date().toISOString(), stemUrl, werk: werkUrl, pogingen: 0, gebruik: uitkomst.gebruik };
    const verder = await claim(c, v, naar);
    // Lokaal is er geen volgend verzoek nodig om door te gaan als het scherm dicht is;
    // op de server pakt de eerstvolgende opvraging (bibliotheek, teller in het menu) hem op.
    if (verder && !process.env.VERCEL) {
      const video: Voortgang = { ...naar, stap: "video", sinds: new Date().toISOString() };
      const gewonnen = await claim(verder, naar, video);
      if (gewonnen) await voerVideoUit(gewonnen, video);
    }
  } catch (e) {
    const reden = e instanceof Error ? e.message : String(e);
    console.error("[motion] animatie mislukt:", reden);
    await markeerMislukt(c, `Animatie mislukt: ${reden}`);
  }
}

async function voerVideoUit(c: Creatie, v: Voortgang): Promise<void> {
  const r = rij(c);
  try {
    if (!v.werk || !v.stemUrl) throw new Error("De animatie is niet bewaard.");
    const [werk, stem] = await Promise.all([haal(v.werk).then((b) => JSON.parse(b.toString("utf8")) as Werkbestand), haal(v.stemUrl)]);
    const { mp4, seconden, renderMs } = await maakVideo({
      ...paginaVan(r, werk.woorden),
      code: werk.code,
      stem,
      muziekUrl: r.muziek ? musicTrackUrl(r.muziek) : undefined,
      deadline: Date.now() + VIDEO_BUDGET_MS,
    });
    const url = await uploadNaarOpslag(c.user_id, mp4, "mp4", "video/mp4");
    const invoer = { ...r, voortgang: { ...v, gebruik: { ...(v.gebruik ?? { usd: 0, rondes: 0 }), videoSec: Math.round(seconden), renderSec: Math.round(renderMs / 1000) } } };
    await createServiceClient()
      .from("creaties")
      .update({ status: "klaar", url, invoer, klaar_op: new Date().toISOString() })
      .eq("id", c.id)
      .eq("status", "bezig");
  } catch (e) {
    const reden = e instanceof Error ? e.message : String(e);
    console.error("[motion] video maken mislukt:", reden);
    await markeerMislukt(c, `Video maken mislukt: ${reden}`);
  }
}
