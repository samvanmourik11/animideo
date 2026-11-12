// DE REGIE van een motion graphics-video: één rij in de bibliotheek (maker 'motion') die
// vanzelf door drie stappen loopt, op dezelfde manier als de reclame (lib/reclame/regie.ts):
//
//   stem      — Hugo spreekt het script in (fal, ElevenLabs): een korte video in één keer,
//               een lange in een paar opnames die op een hoofdstukwissel zijn geknipt
//   animatie  — woordtijden meten, Claude tekent de animatie en controleert zijn eigen
//               proefbeelden (lib/motion/animatie.ts)
//   video     — de animatie beeld voor beeld omzetten naar een mp4 met stem en muziek
//
// Een lange video bestaat uit hoofdstukken (lib/motion/lang.ts). Animatie en video doen
// per serververzoek zoveel hoofdstukken als erin passen, bewaren wat af is en zetten de rij
// op 'wacht-animatie' of 'wacht-video'; de volgende opvraging gaat verder waar het bleef.
// Zo gaat ook een video van tien minuten nooit over de tijdslimiet van één verzoek heen,
// en kost een onderbreking hooguit de hoofdstukken waar net aan gewerkt werd.
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
import { deelWerk, scriptVan, stemBlokken, verdeel, type Deel, type PaginaBasis } from "./lang";
import { bereidFotos, bereidLogo, eigenOpslag, leesBeelden } from "./beelden";
import { tekenAnimatie, type Gebruik } from "./animatie";
import { FPS, maakStil, monteer, voegStemSamen } from "./render";
import {
  MOTION_MUZIEK,
  formaatMaat,
  motionFont,
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

/** Drie kwartier voor een korte video; een lange krijgt er per minuut video een kwartier bij. */
const tijdslimietMs = (lengte: number) => (45 + (lengte > 60 ? (lengte / 60) * 15 : 0)) * 60 * 1000;
/** Zoveel hoofdstukken tekent Claude tegelijk: elk heeft ook een eigen onzichtbare browser nodig. */
const TEGELIJK = process.env.VERCEL ? 3 : 6;
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
  /** Het verzoek bij fal voor de stem (rijen van vóór de lange video's). */
  stem?: string;
  /** De verzoeken bij fal voor de stem: één per opname. */
  stemmen?: string[];
  /** De al gemaakte hoofdstukken (video zonder geluid) op onze opslag, in volgorde. */
  stillen?: string[];
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
  woorden: WhisperWord[];
  /** De hoofdstukken en waar ze op de stem liggen. Een korte video heeft er één. */
  delen: Deel[];
  /** De code per hoofdstuk; leeg zolang het nog getekend moet worden. */
  codes: (string | null)[];
  /** Hoe vaak het tekenen van een hoofdstuk is mislukt. */
  mis: number[];
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
    onderwerp: typeof ruw.onderwerp === "string" ? ruw.onderwerp.trim().slice(0, 16000) : "",
    bedrijf,
    website: tekst(ruw.website, 60).replace(/^https?:\/\//, "").replace(/\/$/, ""),
    kleur: kleur(ruw.kleur, "#1c72ed"),
    kleur2: kleur(ruw.kleur2, "#ffc21a"),
    formaat: isMotionFormaat(ruw.formaat) ? ruw.formaat : "16:9",
    lengte,
    muziek,
    plan: controleerPlan(ruw.plan, lengte),
    huisstijlId: /^[0-9a-f-]{36}$/i.test(String(ruw.huisstijlId ?? "")) ? String(ruw.huisstijlId) : "",
    logo: eigenOpslag(ruw.logo) ? ruw.logo : "",
    font: motionFont(ruw.font),
    toon: tekst(ruw.toon, 600),
    nietDoen: tekst(ruw.nietDoen, 600),
    beelden: leesBeelden(ruw.beelden),
  };
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
      // Niet leeg laten: een oudere versie van de app (de live-site op dezelfde database,
      // zolang deze studio daar nog niet staat) kent maker 'motion' niet, ziet dan een rij
      // zonder fal-verzoek en keurt hem na twee minuten af. Zo gebeurd bij de eerste proef.
      fal_request_id: "motion",
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
    // Zo weinig mogelijk opnames: per scene inspreken geeft hoorbare naden en een
    // wisselend tempo. De scenes worden daarna op de woordtijden gelegd.
    const stemmen = await Promise.all(
      stemBlokken(invoer.plan).map(async (text) => {
        const { request_id } = await fal.queue.submit(STEM_MODEL, { input: { text, voice: HUGO, language_code: "nl", stability: 0.5, similarity_boost: 0.75, speed: 1 } as never });
        return request_id;
      }),
    );
    return await werkVoortgangBij(nieuw as Creatie, { ...voortgang, stemmen });
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
  if (Date.now() - new Date(c.created_at).getTime() > tijdslimietMs(rij(c).lengte)) return (await markeerMislukt(c, "Het duurde te lang.")) ?? c;
  const stapLeeftijd = Date.now() - new Date(v.sinds).getTime();
  zetKostenContext(c.user_id, "Nieuwe app: motion graphics");

  try {
    if (v.stap === "stem") {
      const ids = v.stemmen ?? (v.stem ? [v.stem] : []);
      if (!ids.length) return stapLeeftijd > 2 * 60 * 1000 ? ((await markeerMislukt(c, "De opdracht is niet goed aangekomen.")) ?? c) : c;
      const st = (await Promise.all(ids.map((requestId) => fal.queue.status(STEM_MODEL, { requestId, logs: false })))) as { status: string }[];
      if (st.some((x) => x.status !== "COMPLETED")) return c;
      const naar: Voortgang = { ...v, stap: "animatie", sinds: new Date().toISOString() };
      const gewonnen = await claim(c, v, naar);
      if (!gewonnen) return c;
      opAchtergrond(() => voerAnimatieUit(gewonnen, naar));
      return gewonnen;
    }

    if (v.stap === "wacht-animatie" || v.stap === "wacht-video") {
      const naar: Voortgang = { ...v, stap: v.stap === "wacht-animatie" ? "animatie" : "video", sinds: new Date().toISOString() };
      const gewonnen = await claim(c, v, naar);
      if (!gewonnen) return c;
      opAchtergrond(() => (naar.stap === "animatie" ? voerAnimatieUit(gewonnen, naar) : voerVideoUit(gewonnen, naar)));
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

/** Wat voor elke pagina van deze video gelijk is. Haalt het logo en de foto's op die in beeld komen. */
async function basisVan(i: MotionInvoer): Promise<PaginaBasis> {
  const { w, h } = formaatMaat(i.formaat);
  // Rijen van vóór de huisstijl hebben deze velden niet.
  const [logo, fotos] = await Promise.all([bereidLogo(i.logo ?? ""), bereidFotos(i.beelden ?? [])]);
  return { w, h, merk: { naam: i.bedrijf, website: i.website, kleur: i.kleur, kleur2: i.kleur2, font: motionFont(i.font), logo }, fotos };
}

async function haal(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ophalen mislukt (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

const bewaarWerk = (userId: string, werk: Werkbestand) => uploadNaarOpslag(userId, Buffer.from(JSON.stringify(werk)), "json", "application/json");

/** Het werkbestand lezen; een rij van vóór de hoofdstukken had één stuk code. */
async function leesWerk(url: string): Promise<Werkbestand> {
  const w = JSON.parse((await haal(url)).toString("utf8")) as Partial<Werkbestand> & { code?: string };
  if (w.delen && w.codes) return w as Werkbestand;
  return { woorden: w.woorden ?? [], delen: [{ van: 0, tot: 99, start: 0 }], codes: [w.code ?? null], mis: [0] };
}

/**
 * Zet de stap door naar `naar` en geeft de nieuwe stand terug, of null als een ander verzoek
 * de rij intussen heeft overgenomen (dan stoppen we: die ander maakt het af).
 */
async function verder(c: Creatie, v: Voortgang, naar: Voortgang): Promise<{ c: Creatie; v: Voortgang } | null> {
  const gewonnen = await claim(c, v, naar);
  return gewonnen ? { c: gewonnen, v: naar } : null;
}

async function voerAnimatieUit(c0: Creatie, v0: Voortgang): Promise<void> {
  let c = c0, v = v0;
  const r = rij(c);
  try {
    // ── Eerste keer: de stem ophalen, woordtijden meten, de hoofdstukken op de stem leggen ──
    let werk: Werkbestand;
    const basis = await basisVan(r);
    if (v.werk) werk = await leesWerk(v.werk);
    else {
      // De stem naar onze eigen opslag: de link van fal verloopt, en de video-stap (en later
      // een aanpassing) heeft hem weer nodig.
      const ids = v.stemmen ?? (v.stem ? [v.stem] : []);
      const blokken = await Promise.all(
        ids.map(async (requestId) => {
          const { data } = await fal.queue.result(STEM_MODEL, { requestId });
          const tijdelijk = (data as { audio?: { url?: string } }).audio?.url;
          if (!tijdelijk) throw new Error("De voice-over kwam niet terug.");
          return haal(tijdelijk);
        }),
      );
      const stem = await voegStemSamen(blokken);
      const stemUrl = await uploadNaarOpslag(c.user_id, stem, "mp3", "audio/mpeg");
      const { words } = await transcribeWords(stem, { language: "nl" });
      if (words.length < 5) throw new Error("De woordtijden van de voice-over konden niet worden gemeten.");
      const delen = await verdeel(basis, r.plan, words);
      werk = { woorden: words, delen, codes: delen.map(() => null), mis: delen.map(() => 0) };
      const stand = await verder(c, v, { ...v, stemUrl, werk: await bewaarWerk(c.user_id, werk), sinds: new Date().toISOString() });
      if (!stand) return;
      ({ c, v } = stand);
    }

    // ── Hoofdstukken tekenen, een paar tegelijk ──
    // Op de server één ronde per verzoek (een ronde duurt minuten); lokaal alles achter elkaar.
    for (;;) {
      const open = werk.codes.map((code, k) => (code ? -1 : k)).filter((k) => k >= 0).slice(0, TEGELIJK);
      if (!open.length) break;
      const uitkomsten = await Promise.allSettled(
        open.map((k) => {
          const d = deelWerk(basis, r.plan, werk.woorden, werk.delen, k);
          return tekenAnimatie({ pagina: d.pagina, plan: d.plan, plek: d.plek, onderwerp: r.onderwerp.slice(0, 3000), beelden: r.beelden ?? [], nietDoen: r.nietDoen });
        }),
      );
      const gebruik: Gebruik = { ...(v.gebruik ?? { usd: 0, rondes: 0, sec: 0 }) };
      uitkomsten.forEach((u, i) => {
        const k = open[i];
        if (u.status === "fulfilled") {
          werk.codes[k] = u.value.code;
          gebruik.usd += u.value.gebruik.usd;
          gebruik.rondes += u.value.gebruik.rondes;
          gebruik.sec = (gebruik.sec ?? 0) + (u.value.gebruik.sec ?? 0);
          if (u.value.rest.length) console.warn(`[motion] schoonheidsfouten na controle (hoofdstuk ${k + 1}):`, u.value.rest.slice(0, 5));
        } else {
          const reden = u.reason instanceof Error ? u.reason.message : String(u.reason);
          console.error(`[motion] hoofdstuk ${k + 1} mislukt:`, reden);
          // Eén herkansing per hoofdstuk; daarna is er iets mis dat opnieuw proberen niet oplost.
          if (++werk.mis[k] >= 2) throw new Error(werk.delen.length > 1 ? `Hoofdstuk ${k + 1}: ${reden}` : reden);
        }
      });
      const klaar = werk.codes.every(Boolean);
      const stand = await verder(c, v, {
        ...v,
        stap: klaar ? "wacht-video" : process.env.VERCEL ? "wacht-animatie" : "animatie",
        sinds: new Date().toISOString(),
        werk: await bewaarWerk(c.user_id, werk),
        pogingen: 0,
        gebruik,
      });
      if (!stand) return;
      ({ c, v } = stand);
      if (klaar || process.env.VERCEL) break;
    }

    // Lokaal is er geen volgend verzoek nodig om door te gaan als het scherm dicht is;
    // op de server pakt de eerstvolgende opvraging (bibliotheek, teller in het menu) hem op.
    if (v.stap === "wacht-video" && !process.env.VERCEL) {
      const stand = await verder(c, v, { ...v, stap: "video", sinds: new Date().toISOString() });
      if (stand) await voerVideoUit(stand.c, stand.v);
    }
  } catch (e) {
    const reden = e instanceof Error ? e.message : String(e);
    console.error("[motion] animatie mislukt:", reden);
    await markeerMislukt(c, `Animatie mislukt: ${reden}`);
  }
}

async function voerVideoUit(c0: Creatie, v0: Voortgang): Promise<void> {
  let c = c0, v = v0;
  const r = rij(c);
  const begin = Date.now();
  try {
    const stemUrl = v.stemUrl;
    if (!v.werk || !stemUrl) throw new Error("De animatie is niet bewaard.");
    const [werk, basis] = await Promise.all([leesWerk(v.werk), basisVan(r)]);
    const aantal = werk.delen.length;
    const stillen = [...(v.stillen ?? [])];
    const alAf = stillen.length;
    let renderMs = 0, langste = 0;

    // ── Hoofdstuk voor hoofdstuk, zolang het binnen dit verzoek past ──
    while (stillen.length < aantal) {
      const k = stillen.length;
      // Past het volgende hoofdstuk nog? Reken met het traagste tot nu toe, ruim genomen.
      if (k > alAf && Date.now() - begin + langste * 1.5 > VIDEO_BUDGET_MS) {
        const stand = await verder(c, v, { ...v, stap: "wacht-video", sinds: new Date().toISOString(), stillen });
        if (!stand) return;
        // Lokaal is er geen tijdslimiet per verzoek: meteen door.
        if (process.env.VERCEL) return;
        const door = await verder(stand.c, stand.v, { ...stand.v, stap: "video", sinds: new Date().toISOString() });
        if (door) await voerVideoUit(door.c, door.v);
        return;
      }
      const code = werk.codes[k];
      if (!code) throw new Error("De animatie is niet compleet.");
      const d = deelWerk(basis, r.plan, werk.woorden, werk.delen, k);
      const stil = await maakStil({ ...d.pagina, code }, { beelden: werk.delen[k].beelden, deadline: begin + VIDEO_BUDGET_MS, compact: aantal > 1 });
      renderMs += stil.renderMs;
      langste = Math.max(langste, stil.renderMs);
      stillen.push(`${await uploadNaarOpslag(c.user_id, stil.mp4, "mp4", "video/mp4")}#${stil.beelden}`);
      if (aantal > 1) {
        // Bewaren wat af is, en laten zien dat de stap nog leeft.
        const stand = await verder(c, v, { ...v, sinds: new Date().toISOString(), stillen });
        if (!stand) return;
        ({ c, v } = stand);
      }
    }

    // ── Aan elkaar zetten ──
    // Achter elk adres staat het aantal beelden van dat hoofdstuk.
    const beelden = stillen.reduce((n, s) => n + Number(s.split("#")[1]), 0);
    const [stem, ...delen] = await Promise.all([haal(stemUrl), ...stillen.map((s) => haal(s.split("#")[0]))]);
    const mp4 = await monteer(delen, beelden, stem, r.muziek ? musicTrackUrl(r.muziek) : undefined);
    const url = await uploadNaarOpslag(c.user_id, mp4, "mp4", "video/mp4");
    const eerder = v.gebruik ?? { usd: 0, rondes: 0 };
    const invoer = { ...r, voortgang: { ...v, stillen, gebruik: { ...eerder, videoSec: Math.round(beelden / FPS), renderSec: (eerder.renderSec ?? 0) + Math.round(renderMs / 1000) } } };
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
