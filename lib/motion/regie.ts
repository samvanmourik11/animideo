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
import { MUSIC_TRACKS, musicTrackUrl } from "@/lib/music/library";
import { MAX_TEGELIJK, WachtrijFout, falReden, markeerMislukt, uploadNaarOpslag } from "@/lib/creaties/wachtrij";
import type { Creatie } from "@/lib/creaties/types";
import { canUseMotion } from "@/lib/studio/access";
import { controleerPlan } from "./plan";
import { deelWerk, herverdeel, sceneStarts, scriptVan, stemBlokken, verdeel, type Deel, type PaginaBasis } from "./lang";
import { vindStem } from "@/lib/stem/bibliotheek";
import { isTaalStem, taalStemmen } from "@/lib/stem/taalstemmen";
import { MOTION_STEM_HUGO, isMotionSoort, isMotionTaal, isMuziekVolume, isOndertitels, leesTaal, muziekWaarde } from "./types";
import { stijlVan } from "./stijlen";
import { bereidFotos, bereidLogo, eigenOpslag, leesBeelden } from "./beelden";
import { tekenAnimatie, type Gebruik } from "./animatie";
import { FOTO_CREDITS, MAX_FOTOS, MAX_PUNTEN, ZIN_CREDITS, aanpasCredits, leesPunten, leesZinnen, pasHoofdstukAan, planMetZinnen, puntenPerDeel, type AanpasPunt, type Aanpassing, type FotoWissel, type ZinWijziging } from "./aanpassen";
import type { Shot } from "@/lib/docu/sjablonen";
import { leesSpec, leesWijzigingen, pasShotsAan, schrijfSpec, type ShotWijziging } from "@/lib/docu/tijdlijn";

/** Een docu-tijdlijn aanpassen: alleen de video opnieuw maken, geen AI. */
const TIJDLIJN_CREDITS = 1;
import { canUseDocu } from "@/lib/studio/access";
import { tekenDocuHoofdstuk } from "@/lib/docu/sjablonen";
import { fotoCredit, type DocuFoto } from "@/lib/docu/types";
import { FPS, maakStil, monteer, voegStemSamen } from "./render";
import { paginaHtml } from "./pagina";
import { mailVideo } from "./mail";
import { randomUUID } from "node:crypto";
import {
  MOTION_MUZIEK,
  formaatMaat,
  motionFont,
  isMotionFormaat,
  isMotionLengte,
  motionCredits,
  extraFormaatCredits,
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
/**
 * Waar de video beeld voor beeld wordt gemaakt. Op de server (Vercel) is dat veel te traag
 * (1,4 s per beeld, gemeten 14-11-2026), dus standaard in de browser van de klant; de server
 * zet er daarna alleen stem en muziek onder. MOTION_RENDER=server voor de oude manier
 * (lokaal en in de proefscripts).
 */
const IN_BROWSER = process.env.MOTION_RENDER !== "server";
/** Zo lang wachten we op de browser van de klant voordat we opgeven (met credits terug). */
const BROWSER_WACHT_MS = 12 * 60 * 60 * 1000;

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
  /** Wanneer een browser de video is gaan maken (stap "browser"). */
  browserGestart?: string;
  /** Welke mails al zijn verstuurd (lib/motion/mail.ts). */
  gemaild?: ("afmaken" | "klaar")[];
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

type RijInvoer = MotionInvoer & { voortgang?: Voortgang; aanpassing?: Aanpassing };
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
  // Een verhaal of een les heeft geen afzender nodig; een bedrijfsvideo wel.
  const soort = isMotionSoort(ruw.soort) ? ruw.soort : "bedrijf";
  const bedrijf = tekst(ruw.bedrijf, 40);
  if (!bedrijf && soort === "bedrijf") throw new Error("Vul eerst de naam van je bedrijf in.");
  const taal = isMotionTaal(ruw.taal) ? ruw.taal : "nl";
  // Nederlands: een stem uit onze bibliotheek, anders Hugo. Andere talen: alleen de
  // moedertaalstemmen van die taal (lib/stem/taalstemmen.ts), anders de eerste daarvan.
  const gekozen = vindStem(ruw.stem);
  const stem =
    taal === "nl"
      ? gekozen && gekozen.id === ruw.stem ? gekozen.id : MOTION_STEM_HUGO
      : isTaalStem(taal, ruw.stem) ? (ruw.stem as string) : taalStemmen(taal)[0]?.id ?? MOTION_STEM_HUGO;
  const lengte = isMotionLengte(ruw.lengte) ? ruw.lengte : 30;
  // Elk nummer uit de muziekbibliotheek mag (Muziek 2.0), of geen muziek.
  const muziek = ruw.muziek === "" || MUSIC_TRACKS.some((t) => t.slug === ruw.muziek) ? (ruw.muziek as string) : MOTION_MUZIEK[0].slug;
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
    stijl: stijlVan(typeof ruw.stijl === "string" ? ruw.stijl : "")?.id ?? "",
    soort,
    taal,
    stem,
    ondertitels: isOndertitels(ruw.ondertitels) ? ruw.ondertitels : "uit",
    mail: ruw.mail === true,
    ...(eigenOpslag(ruw.muziekUrl) ? { muziekUrl: ruw.muziekUrl } : {}),
    muziekVolume: isMuziekVolume(ruw.muziekVolume) ? ruw.muziekVolume : "normaal",
  };
}

/**
 * Voor studio's die op deze machine draaien (de docu-studio, lib/docu/): een eigen maker in
 * de bibliotheek, een eigen prijs en eigen gegevens in de rij, en de invoer bijwerken nadat
 * hij is gelezen (foto's die niet uit de upload van de klant komen, een stem buiten de
 * bibliotheek).
 */
export interface StartOpties {
  maker?: string;
  /** Wat het kost; 0 = al betaald (de Short bij een docu). Standaard de motion-prijs. */
  credits?: number;
  omschrijving?: string;
  prompt?: string;
  pas?: (i: MotionInvoer) => MotionInvoer;
  extra?: Record<string, unknown>;
  /** Niet meetellen voor het maximum tegelijk: de Shorts die een docu zelf start. */
  buitenLimiet?: boolean;
}

export async function startMotion(userId: string, ruw: Record<string, unknown>, ouderId?: string | null, o: StartOpties = {}): Promise<Creatie> {
  let invoer: MotionInvoer;
  try {
    invoer = leesMotionInvoer(ruw);
    if (o.pas) invoer = o.pas(invoer);
  } catch (e) {
    throw new WachtrijFout(e instanceof Error ? e.message : String(e), 400);
  }

  const db = createServiceClient();
  // De studio is nog niet voor iedereen open; de knop verbergen alleen is geen slot.
  const { data: wie } = await db.auth.admin.getUserById(userId);
  if (!canUseMotion(wie?.user?.email)) throw new WachtrijFout("Deze studio is nog niet beschikbaar voor jouw account.", 403);
  const { count } = await db.from("creaties").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "bezig");
  if (!o.buitenLimiet && (count ?? 0) >= MAX_TEGELIJK) {
    throw new WachtrijFout(`Je hebt al ${MAX_TEGELIJK} dingen in de maak. Wacht tot er één klaar is.`, 429);
  }

  // Hetzelfde script in het andere formaat, vlak na de eerste video gestart: lagere prijs en
  // dezelfde stem (de opnames van de eerste video worden hergebruikt).
  let zus: { id: string; stemmen?: string[] } | null = null;
  if (!o.maker && typeof ruw.zusVan === "string" && /^[0-9a-f-]{36}$/i.test(ruw.zusVan)) {
    const { data: z } = await db.from("creaties").select("id, invoer, created_at").eq("id", ruw.zusVan).eq("user_id", userId).eq("maker", "motion").maybeSingle();
    const zi = z?.invoer as (MotionInvoer & { voortgang?: Voortgang }) | undefined;
    if (z && zi && Date.now() - new Date(z.created_at).getTime() < 30 * 60 * 1000 && zi.formaat !== invoer.formaat && zi.stem === invoer.stem && JSON.stringify(zi.plan) === JSON.stringify(invoer.plan)) {
      zus = { id: z.id, stemmen: zi.voortgang?.stemmen };
    }
  }
  const prijs = o.credits ?? (zus ? extraFormaatCredits(invoer.lengte) : motionCredits(invoer.lengte));
  const { ok, betaald, betalerId } = prijs > 0 ? await betaal(userId, prijs, o.omschrijving ?? "Nieuwe app: motion graphics") : { ok: true, betaald: 0, betalerId: userId };
  if (!ok) throw new WachtrijFout("Niet genoeg credits.", 402);

  const voortgang: Voortgang = { stap: "stem", sinds: new Date().toISOString() };
  const { data: nieuw, error } = await db
    .from("creaties")
    .insert({
      user_id: userId,
      soort: "video",
      status: "bezig",
      maker: o.maker ?? "motion",
      model: "motion",
      prompt: o.prompt ?? `Motion graphics: ${invoer.plan.titel || invoer.bedrijf}`,
      invoer: { ...invoer, ...o.extra, ...(zus ? { zusVan: zus.id } : {}), voortgang },
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
    if (betaald > 0) await betaalTerug({ user_id: userId, betaald_door: betalerId, credits: betaald }, "Terug: motion graphics niet gestart");
    throw new WachtrijFout("Kon de opdracht niet opslaan. Probeer het opnieuw.", 500);
  }

  try {
    // Zo weinig mogelijk opnames: per scene inspreken geeft hoorbare naden en een
    // wisselend tempo. De scenes worden daarna op de woordtijden gelegd.
    const stemmen = zus?.stemmen?.length ? zus.stemmen : await Promise.all(
      stemBlokken(invoer.plan).map(async (text) => {
        const { request_id } = await fal.queue.submit(STEM_MODEL, { input: { text, voice: invoer.stem || HUGO, language_code: invoer.taal ?? "nl", stability: 0.5, similarity_boost: 0.75, speed: 1 } as never });
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
  const stapLeeftijd = Date.now() - new Date(v.sinds).getTime();
  // De laatste stap wacht op de browser van de klant; die mag later terugkomen.
  if (v.stap === "browser") {
    return stapLeeftijd > BROWSER_WACHT_MS ? ((await markeerMislukt(c, "De video is niet afgemaakt: de Motion graphics-studio was niet open. Je credits zijn terug.")) ?? c) : c;
  }
  if (v.stap === "monteren") {
    return stapLeeftijd > VASTGELOPEN_MS ? ((await markeerMislukt(c, "Stem en muziek eronder zetten liep vast. Probeer het opnieuw.")) ?? c) : c;
  }
  if (Date.now() - new Date(c.created_at).getTime() > tijdslimietMs(rij(c).lengte)) return (await markeerMislukt(c, "Het duurde te lang.")) ?? c;
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
    if ((v.stap === "animatie" || v.stap === "video" || v.stap === "aanpassen") && stapLeeftijd > VASTGELOPEN_MS) {
      if ((v.pogingen ?? 0) + 1 >= MAX_POGINGEN) return (await markeerMislukt(c, "Het maken liep vast. Probeer het opnieuw.")) ?? c;
      const naar: Voortgang = { ...v, sinds: new Date().toISOString(), pogingen: (v.pogingen ?? 0) + 1 };
      const gewonnen = await claim(c, v, naar);
      if (!gewonnen) return c;
      opAchtergrond(() => (v.stap === "animatie" ? voerAnimatieUit(gewonnen, naar) : v.stap === "aanpassen" ? voerAanpassingUit(gewonnen, naar) : voerVideoUit(gewonnen, naar)));
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
  // Een docu (een YouTube-video) heeft geen merk linksboven: de kanaalnaam blijft alleen voor
  // het YouTube-pakket. Sam 14-11-2026: "YouTube-video's hebben nooit echt een logo linksboven".
  const docu = !!(i as MotionInvoer & { docu?: unknown }).docu;
  const [logo, fotos] = await Promise.all([docu ? null : bereidLogo(i.logo ?? ""), bereidFotos(i.beelden ?? [])]);
  return { w, h, merk: { naam: docu ? "" : i.bedrijf, website: docu ? "" : i.website, kleur: i.kleur, kleur2: i.kleur2, font: motionFont(i.font), logo }, fotos, stijl: i.stijl || null, ondertitels: i.ondertitels && i.ondertitels !== "uit" ? i.ondertitels : null };
}

/** Het nummer onder de video: een eigen upload, anders het gekozen nummer, anders niets. */
function muziekVan(r: MotionInvoer): string | undefined {
  if (r.muziekUrl) return r.muziekUrl;
  return r.muziek ? musicTrackUrl(r.muziek) : undefined;
}

async function haal(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ophalen mislukt (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

// Een docu heeft tientallen foto's. Ze allemaal in elke pagina en bij elk hoofdstuk aan Claude
// meegeven kost tokens en geheugen voor niets: per hoofdstuk alleen de foto's die daar
// genoemd worden (in het beeld van de scenes) of gebruikt (in de code).
const genoemd = (tekst: string) => new Set([...tekst.matchAll(/\bf\d+\b/g)].map((m) => m[0]));
function alleenFotos<T extends { fotos?: Record<string, unknown> }>(pagina: T, ids: Set<string>): T {
  return { ...pagina, fotos: Object.fromEntries(Object.entries(pagina.fotos ?? {}).filter(([id]) => ids.has(id))) };
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
      const { words } = await transcribeWords(stem, { language: r.taal ?? "nl" });
      if (words.length < 5) throw new Error("De woordtijden van de voice-over konden niet worden gemeten.");
      // Een aanpassing met gewijzigde zinnen: de oude tekening houden, op de nieuwe stem leggen.
      if (r.aanpassing?.werkVan) return await zinnenOpNieuweStem(c, v, basis, words, stemUrl);
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
          if (c.maker !== "docu") return tekenAnimatie({ pagina: d.pagina, plan: d.plan, plek: d.plek, onderwerp: r.onderwerp.slice(0, 6000), beelden: r.beelden ?? [], nietDoen: r.nietDoen, taal: r.taal, soort: r.soort });
          // Een docu tekent met vaste sjablonen (lib/docu/sjablonen.ts): een paar cent per
          // hoofdstuk in plaats van een eigen tekening door Claude.
          const ids = genoemd(d.plan.scenes.map((s) => s.beeld).join(" "));
          const taal = leesTaal(r.taal);
          const docuFotos = ((r as unknown as { docu?: { fotos?: DocuFoto[] } }).docu?.fotos ?? []).filter((f) => ids.has(f.id));
          return tekenDocuHoofdstuk({
            pagina: alleenFotos(d.pagina, ids),
            plan: d.plan,
            taal,
            eind: !d.plek || d.plek.laatste,
            fotos: Object.fromEntries(docuFotos.map((f) => [f.id, { wat: f.wat, vermelding: fotoCredit(f, taal) }])),
          });
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
        stap: klaar ? (IN_BROWSER ? "browser" : "wacht-video") : process.env.VERCEL ? "wacht-animatie" : "animatie",
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
      const pagina = c.maker === "docu" ? alleenFotos(d.pagina, genoemd(code)) : d.pagina;
      const stil = await maakStil({ ...pagina, code }, { beelden: werk.delen[k].beelden, deadline: begin + VIDEO_BUDGET_MS, compact: aantal > 1 });
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
    const mp4 = await monteer(delen, beelden, stem, muziekVan(r), muziekWaarde(r.muziekVolume));
    const url = await uploadNaarOpslag(c.user_id, mp4, "mp4", "video/mp4");
    const eerder = v.gebruik ?? { usd: 0, rondes: 0 };
    let invoer: Record<string, unknown> = { ...r, voortgang: { ...v, stillen, gebruik: { ...eerder, videoSec: Math.round(beelden / FPS), renderSec: (eerder.renderSec ?? 0) + Math.round(renderMs / 1000) } } };
    // Een docu krijgt er het YouTube-pakket bij (lib/docu/regie.ts). Mislukt dat, dan is de
    // video zelf er wel: het pakket meldt zijn eigen fout.
    if (c.maker === "docu" && !r.aanpassing) invoer = await (await import("@/lib/docu/regie")).voegPakketToe(c, invoer, { woorden: werk.woorden, basis });
    const { data: klaar } = await createServiceClient()
      .from("creaties")
      .update({ status: "klaar", url, invoer, klaar_op: new Date().toISOString() })
      .eq("id", c.id)
      .eq("status", "bezig")
      .select("*")
      .maybeSingle();
    if (klaar && r.mail) await mailVideo(klaar as Creatie, "klaar");
  } catch (e) {
    const reden = e instanceof Error ? e.message : String(e);
    console.error("[motion] video maken mislukt:", reden);
    await markeerMislukt(c, `Video maken mislukt: ${reden}`);
  }
}

// ── De video maken in de browser van de klant ──────────────────────────────────────────
//
// De studio haalt de opdracht op (per hoofdstuk de pagina en het aantal beelden), tekent
// in een afgeschermd venstertje beeld voor beeld, maakt er met de video-encoder van de
// browser een mp4 (zonder geluid) van, zet die rechtstreeks op onze opslag en meldt hem
// hier af. De server zet er stem en muziek onder (snel: het beeld wordt niet opnieuw
// gecodeerd).

export interface BrowserOpdracht {
  fps: number;
  w: number;
  h: number;
  /** Per hoofdstuk de pagina en (bij een lange video) het precieze aantal beelden. */
  delen: { html: string; beelden: number | null }[];
  /** Een eenmalige uploadplek op onze opslag. */
  upload: { pad: string; token: string };
  /** Zoveel bits per seconde voor de video-encoder. */
  bitrate: number;
}

export async function browserOpdracht(c: Creatie): Promise<BrowserOpdracht> {
  const v = rij(c).voortgang;
  if (c.status !== "bezig" || v?.stap !== "browser" || !v.werk) throw new Error("Deze video wacht niet op je browser.");
  const r = rij(c);
  const [werk, basis] = await Promise.all([leesWerk(v.werk), basisVan(r)]);
  const delen = await Promise.all(
    werk.delen.map(async (_, k) => {
      const code = werk.codes[k];
      if (!code) throw new Error("De animatie is niet compleet.");
      const d = deelWerk(basis, r.plan, werk.woorden, werk.delen, k);
      const pagina = c.maker === "docu" ? alleenFotos(d.pagina, genoemd(code)) : d.pagina;
      return { html: await paginaHtml({ ...pagina, code }, { browser: true }), beelden: werk.delen[k].beelden ?? null };
    }),
  );
  // Onthouden dat een browser bezig is: dan hoeft er geen "open de studio"-mail meer.
  if (!v.browserGestart) await werkVoortgangBij(c, { ...v, browserGestart: new Date().toISOString() }).catch(() => {});
  const pad = `${c.user_id}/creaties/${randomUUID()}.mp4`;
  const { data, error } = await createServiceClient().storage.from("scene-assets").createSignedUploadUrl(pad);
  if (error || !data) throw new Error(error?.message ?? "Geen uploadplek gekregen.");
  // Getekende vlakken laten zich goed samenpersen; een lange video iets zuiniger.
  // Gemeten 14-11-2026: 3,6 Mbit/s gaf 19 MB voor 41 s, zonder zichtbaar verlies. Een video
  // van tien minuten op de helft blijft zo rond de 110 MB.
  const bitrate = (basis.w * basis.h >= 1920 * 1080 ? 3_000_000 : 2_000_000) * (werk.delen.length > 2 ? 0.5 : 1);
  return { fps: FPS, w: basis.w, h: basis.h, delen, upload: { pad: data.path, token: data.token }, bitrate };
}

/** De browser is klaar: zijn video ophalen, stem en muziek eronder, en de rij op klaar. */
export async function browserKlaar(c0: Creatie, pad: string, beelden: number, renderSec: number): Promise<Creatie> {
  const v = rij(c0).voortgang;
  if (c0.status !== "bezig" || v?.stap !== "browser" || !v.stemUrl) throw new Error("Deze video wacht niet op je browser.");
  if (!pad.startsWith(`${c0.user_id}/creaties/`) || !pad.endsWith(".mp4") || pad.includes("..")) throw new Error("Onbekend bestand.");
  const r = rij(c0);
  // Niet meer beelden dan de langste lengte met ruime marge: een kapotte telling mag de
  // montage niet laten ontsporen.
  const max = Math.round(r.lengte * 2.2 * FPS) + 20 * FPS;
  if (!Number.isInteger(beelden) || beelden < FPS || beelden > max) throw new Error("Het aantal beelden klopt niet.");
  const naar: Voortgang = { ...v, stap: "monteren", sinds: new Date().toISOString() };
  const c = await claim(c0, v, naar);
  if (!c) throw new Error("Deze video wordt al afgemaakt.");
  try {
    const db = createServiceClient();
    const { data: blob, error } = await db.storage.from("scene-assets").download(pad);
    if (error || !blob) throw new Error(error?.message ?? "De video uit je browser is niet aangekomen.");
    const [stil, stem] = await Promise.all([blob.arrayBuffer().then((b) => Buffer.from(b)), haal(v.stemUrl)]);
    const mp4 = await monteer([stil], beelden, stem, muziekVan(r), muziekWaarde(r.muziekVolume));
    const url = await uploadNaarOpslag(c.user_id, mp4, "mp4", "video/mp4");
    await db.storage.from("scene-assets").remove([pad]).catch(() => {});
    const eerder = v.gebruik ?? { usd: 0, rondes: 0 };
    let invoer: Record<string, unknown> = { ...r, voortgang: { ...naar, gebruik: { ...eerder, videoSec: Math.round(beelden / FPS), renderSec: Math.round(renderSec) } } };
    // Een docu krijgt er het YouTube-pakket bij, net als bij het maken op de server.
    if (c.maker === "docu" && !r.aanpassing && v.werk) {
      const [werk, basis] = await Promise.all([leesWerk(v.werk), basisVan(r)]);
      invoer = await (await import("@/lib/docu/regie")).voegPakketToe(c, invoer, { woorden: werk.woorden, basis });
    }
    const { data } = await db
      .from("creaties")
      .update({ status: "klaar", url, invoer, klaar_op: new Date().toISOString() })
      .eq("id", c.id)
      .eq("status", "bezig")
      .select("*")
      .maybeSingle();
    if (data && r.mail) await mailVideo(data as Creatie, "klaar");
    return (data as Creatie | null) ?? c;
  } catch (e) {
    const reden = e instanceof Error ? e.message : String(e);
    console.error("[motion] afmaken na de browser mislukt:", reden);
    // Terug naar de browser-stap, zodat de studio het nog een keer kan doen. Was dit al de
    // tweede keer, of lukt terugzetten niet, dan opgeven (met credits terug).
    const terug = await claim(c, naar, { ...v, sinds: new Date().toISOString(), pogingen: (v.pogingen ?? 0) + 1 });
    if (!terug || (v.pogingen ?? 0) + 1 >= MAX_POGINGEN) await markeerMislukt(c, `Video maken mislukt: ${reden}`);
    throw e;
  }
}

// ── Een opgeleverde video aanpassen (lib/motion/aanpassen.ts) ─────────────────────────────

/**
 * Prijs, of meteen starten: een nieuwe rij met dezelfde stem en de aangepaste code, die
 * daarna net als een nieuwe video in de browser (of op de server) wordt gemaakt. De oude
 * video blijft staan. Gooit WachtrijFout met een melding voor het scherm.
 */
/** Wat de klant wil aanpassen: punten in het beeld, gesproken tekst, foto's. */
export interface AanpasVraag {
  punten?: unknown;
  zinnen?: unknown;
  fotos?: unknown;
}

/** In de code van een docu: bij de shots met deze foto de Commons-vermelding weghalen. */
function zonderVermelding(code: string, ids: Set<string>): string {
  const sleutel = "window.VIDEO = docuVideo(";
  const i = code.lastIndexOf(sleutel);
  if (i < 0 || !ids.size) return code;
  try {
    const spec = JSON.parse(code.slice(i + sleutel.length).replace(/\);\s*$/, "")) as { scenes: Shot[] };
    spec.scenes = spec.scenes.map((sh) => (sh.foto && ids.has(sh.foto) ? { ...sh, vermelding: "" } : sh));
    return `${code.slice(0, i)}${sleutel}${JSON.stringify(spec)});\n`;
  } catch {
    return code;
  }
}

export async function startAanpassing(userId: string, id: string, vraag: AanpasVraag, alleenPrijs: boolean): Promise<{ credits: number; creatie?: Creatie }> {
  const db = createServiceClient();
  const { data: orig } = await db.from("creaties").select("*").eq("id", id).eq("user_id", userId).in("maker", ["motion", "docu"]).maybeSingle();
  if (!orig || orig.status !== "klaar") throw new WachtrijFout("Deze video kan (nog) niet worden aangepast.", 404);
  const o = orig as Creatie;
  const r = rij(o);
  const v = r.voortgang;
  if (!v?.werk || !v.stemUrl) throw new WachtrijFout("Deze video is gemaakt voordat aanpassen kon. Maak hem opnieuw om hem aan te kunnen passen.", 409);

  let punten: AanpasPunt[], zinnen: ZinWijziging[], fotos: FotoWissel[];
  try {
    const ruwPunten = Array.isArray(vraag.punten) ? vraag.punten : [];
    zinnen = leesZinnen(vraag.zinnen, r.plan);
    const bestaand = new Set((r.beelden ?? []).filter((b) => b.doel === "tonen").map((b) => b.id));
    fotos = (Array.isArray(vraag.fotos) ? vraag.fotos : []).slice(0, MAX_FOTOS).map((f) => {
      const x = (f ?? {}) as Record<string, unknown>;
      if (typeof x.id !== "string" || !bestaand.has(x.id) || !eigenOpslag(x.url)) throw new Error("Een foto kwam niet goed door. Upload hem opnieuw.");
      return { id: x.id, url: x.url };
    });
    punten = ruwPunten.length ? leesPunten(ruwPunten) : [];
    if (!punten.length && !zinnen.length && !fotos.length) throw new Error("Klik eerst in de video op wat er anders moet, of wijzig een zin of foto.");
    if (punten.length + zinnen.length > MAX_PUNTEN) throw new Error(`Hooguit ${MAX_PUNTEN} wijzigingen per keer.`);
  } catch (e) {
    throw new WachtrijFout(e instanceof Error ? e.message : String(e), 400);
  }

  const werk = await leesWerk(v.werk);
  // Welke hoofdstukken Claude moet aanpassen: die met een punt, en die met een gewijzigde zin.
  const geraakt = new Set(puntenPerDeel(werk.delen, punten).keys());
  // De slotzin staat niet in een tekening (de eindkaart toont regel 1 en 2): alleen de stem.
  for (const z of zinnen.filter((x) => x.scene > 0)) {
    const i = z.scene - 1;
    const k = werk.delen.findIndex((d) => i >= d.van && i < d.tot);
    geraakt.add(k < 0 ? werk.delen.length - 1 : k);
  }
  const credits = (geraakt.size ? aanpasCredits(o.maker, geraakt.size) : 0) + zinnen.length * ZIN_CREDITS + fotos.length * FOTO_CREDITS;
  if (alleenPrijs) return { credits };

  const { data: wie } = await db.auth.admin.getUserById(userId);
  const mag = o.maker === "docu" ? canUseDocu(wie?.user?.email) : canUseMotion(wie?.user?.email);
  if (!mag) throw new WachtrijFout("Deze studio is nog niet beschikbaar voor jouw account.", 403);
  const { count } = await db.from("creaties").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "bezig");
  if ((count ?? 0) >= MAX_TEGELIJK) throw new WachtrijFout(`Je hebt al ${MAX_TEGELIJK} dingen in de maak. Wacht tot er één klaar is.`, 429);
  const { ok, betaald, betalerId } = await betaal(userId, credits, o.maker === "docu" ? "Nieuwe app: docu aanpassen" : "Nieuwe app: motion graphics aanpassen");
  if (!ok) throw new WachtrijFout("Niet genoeg credits.", 402);

  // Foto's: het adres in de invoer, en (docu) de Commons-vermelding uit de code.
  let nieuwR: MotionInvoer & Record<string, unknown> = { ...r };
  let werkUrl = v.werk;
  if (fotos.length) {
    const url = new Map(fotos.map((f) => [f.id, f.url]));
    nieuwR.beelden = (r.beelden ?? []).map((b) => (url.has(b.id) ? { ...b, url: url.get(b.id)!, uitleg: `${b.uitleg.split(" (")[0]} (eigen foto)` } : b));
    const docu = (r as unknown as { docu?: { fotos?: DocuFoto[] } }).docu;
    if (docu?.fotos) nieuwR = { ...nieuwR, docu: { ...docu, fotos: docu.fotos.map((f) => (url.has(f.id) ? { ...f, url: url.get(f.id)!, maker: "", licentie: "eigen foto", bron: "" } : f)) } };
    if (o.maker === "docu") {
      const ids = new Set(url.keys());
      werkUrl = await bewaarWerk(userId, { ...werk, codes: werk.codes.map((c) => (c ? zonderVermelding(c, ids) : c)) });
    }
  }

  const aanpassing: Aanpassing = { van: o.id, punten, ...(zinnen.length ? { zinnen, werkVan: werkUrl, planVan: r.plan } : {}), ...(fotos.length ? { fotos } : {}) };
  // Met gewijzigde zinnen begint het bij een nieuwe stem; anders meteen bij het aanpassen
  // (of, met alleen foto's, meteen bij de browser).
  const stap: MotionStap = zinnen.length ? "stem" : punten.length ? "aanpassen" : IN_BROWSER ? "browser" : "wacht-video";
  const voortgang: Voortgang = zinnen.length
    ? { stap, sinds: new Date().toISOString(), gebruik: { usd: 0, rondes: 0 } }
    : { stap, sinds: new Date().toISOString(), werk: werkUrl, stemUrl: v.stemUrl, gebruik: { usd: 0, rondes: 0 } };
  if (zinnen.length) nieuwR.plan = planMetZinnen(r.plan, zinnen);
  const { data: nieuw, error } = await db
    .from("creaties")
    .insert({
      user_id: userId,
      soort: "video",
      status: "bezig",
      maker: o.maker,
      model: "motion",
      prompt: `Aangepast: ${(o.prompt ?? "").replace(/^Aangepast: /, "")}`.slice(0, 500),
      invoer: { ...nieuwR, aanpassing, voortgang },
      credits: betaald,
      fal_endpoint: "motion",
      fal_request_id: "motion",
      ouder_id: o.id,
      ...(betalerId !== userId ? { betaald_door: betalerId } : {}),
    })
    .select("*")
    .single();
  if (error || !nieuw) {
    if (betaald > 0) await betaalTerug({ user_id: userId, betaald_door: betalerId, credits: betaald }, "Terug: aanpassing niet gestart");
    throw new WachtrijFout("Kon de aanpassing niet opslaan. Probeer het opnieuw.", 500);
  }
  if (zinnen.length) {
    // De hele tekst opnieuw inspreken (per scene inspreken geeft hoorbare naden).
    try {
      const plan = nieuwR.plan;
      const stemmen = await Promise.all(
        stemBlokken(plan).map(async (text) => {
          const { request_id } = await fal.queue.submit(STEM_MODEL, { input: { text, voice: r.stem || HUGO, language_code: r.taal ?? "nl", stability: 0.5, similarity_boost: 0.75, speed: 1 } as never });
          return request_id;
        }),
      );
      return { credits, creatie: await werkVoortgangBij(nieuw as Creatie, { ...voortgang, stemmen }) };
    } catch (e) {
      const reden = falReden(e);
      return { credits, creatie: (await markeerMislukt(nieuw as Creatie, `Insturen mislukt: ${reden}`)) ?? (nieuw as Creatie) };
    }
  }
  if (punten.length) opAchtergrond(() => voerAanpassingUit(nieuw as Creatie, voortgang));
  return { credits, creatie: nieuw as Creatie };
}

/** De tijdlijn van een klare docu: per hoofdstuk de scenes met hun vaste beeld en tekst. */
export async function docuTijdlijn(userId: string, id: string) {
  const { data: c } = await createServiceClient().from("creaties").select("*").eq("id", id).eq("user_id", userId).eq("maker", "docu").maybeSingle();
  if (!c || c.status !== "klaar") throw new WachtrijFout("Deze docu is (nog) niet klaar.", 404);
  const r = rij(c as Creatie);
  if (!r.voortgang?.werk) throw new WachtrijFout("Deze docu is gemaakt voordat de tijdlijn bestond.", 409);
  const werk = await leesWerk(r.voortgang.werk);
  const fotos = ((r as unknown as { docu?: { fotos?: DocuFoto[] } }).docu?.fotos ?? []).map((f) => ({ id: f.id, url: f.url, wat: f.wat }));
  const delen = werk.delen.map((d, k) => {
    const spec = werk.codes[k] ? leesSpec(werk.codes[k]!) : null;
    return {
      deel: k,
      scenes: (spec?.scenes ?? []).map((sh, i) => ({ ...sh, tekst: r.plan.scenes[d.van + i]?.tekst ?? "" })),
    };
  });
  return { delen, fotos };
}

/** De tijdlijn aanpassen: nieuwe rij, zelfde stem, andere keuzes; zonder AI, meteen naar de browser. */
export async function startTijdlijn(userId: string, id: string, ruw: unknown): Promise<Creatie> {
  const db = createServiceClient();
  const { data: orig } = await db.from("creaties").select("*").eq("id", id).eq("user_id", userId).eq("maker", "docu").maybeSingle();
  if (!orig || orig.status !== "klaar") throw new WachtrijFout("Deze docu is (nog) niet klaar.", 404);
  const o = orig as Creatie;
  const r = rij(o);
  const v = r.voortgang;
  if (!v?.werk || !v.stemUrl) throw new WachtrijFout("Deze docu is gemaakt voordat de tijdlijn bestond.", 409);
  const { data: wie } = await db.auth.admin.getUserById(userId);
  if (!canUseDocu(wie?.user?.email)) throw new WachtrijFout("Deze studio is nog niet beschikbaar voor jouw account.", 403);
  const docuFotos = (r as unknown as { docu?: { fotos?: DocuFoto[] } }).docu?.fotos ?? [];
  let ws: ShotWijziging[];
  try {
    ws = leesWijzigingen(ruw, new Set(docuFotos.map((f) => f.id)));
  } catch (e) {
    throw new WachtrijFout(e instanceof Error ? e.message : String(e), 400);
  }
  const werk = await leesWerk(v.werk);
  const taal = leesTaal(r.taal);
  const vermelding = (fid: string) => {
    const f = docuFotos.find((x) => x.id === fid);
    return f ? (f.licentie === "eigen foto" ? "" : fotoCredit(f, taal)) : "";
  };
  const codes = werk.codes.map((code, k) => {
    const hier = ws.filter((w) => w.deel === k);
    if (!code || !hier.length) return code;
    const spec = leesSpec(code);
    return spec ? schrijfSpec(code, pasShotsAan(spec, hier, vermelding)) : code;
  });
  const { count } = await db.from("creaties").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "bezig");
  if ((count ?? 0) >= MAX_TEGELIJK) throw new WachtrijFout(`Je hebt al ${MAX_TEGELIJK} dingen in de maak. Wacht tot er één klaar is.`, 429);
  const { ok, betaald, betalerId } = await betaal(userId, TIJDLIJN_CREDITS, "Nieuwe app: docu tijdlijn");
  if (!ok) throw new WachtrijFout("Niet genoeg credits.", 402);
  const werkUrl = await bewaarWerk(userId, { ...werk, codes });
  const voortgang: Voortgang = { stap: IN_BROWSER ? "browser" : "wacht-video", sinds: new Date().toISOString(), werk: werkUrl, stemUrl: v.stemUrl, gebruik: { usd: 0, rondes: 0 } };
  const aanpassing: Aanpassing = { van: o.id, punten: [] };
  const { data: nieuw, error } = await db
    .from("creaties")
    .insert({
      user_id: userId,
      soort: "video",
      status: "bezig",
      maker: "docu",
      model: "motion",
      prompt: `Aangepast: ${(o.prompt ?? "").replace(/^Aangepast: /, "")}`.slice(0, 500),
      invoer: { ...r, aanpassing, voortgang },
      credits: betaald,
      fal_endpoint: "motion",
      fal_request_id: "motion",
      ouder_id: o.id,
      ...(betalerId !== userId ? { betaald_door: betalerId } : {}),
    })
    .select("*")
    .single();
  if (error || !nieuw) {
    if (betaald > 0) await betaalTerug({ user_id: userId, betaald_door: betalerId, credits: betaald }, "Terug: tijdlijn niet gestart");
    throw new WachtrijFout("Kon de wijziging niet opslaan. Probeer het opnieuw.", 500);
  }
  return nieuw as Creatie;
}

async function voerAanpassingUit(c: Creatie, v: Voortgang): Promise<void> {
  const r = rij(c);
  try {
    if (!v.werk || !r.aanpassing) throw new Error("De aanpassing is niet goed aangekomen.");
    zetKostenContext(c.user_id, "Nieuwe app: video aanpassen");
    const [werk, basis] = await Promise.all([leesWerk(v.werk), basisVan(r)]);
    const groepen = puntenPerDeel(werk.delen, r.aanpassing.punten);
    const taal = leesTaal(r.taal);
    let usd = 0;
    await Promise.all(
      [...groepen].map(async ([k, punten]) => {
        const code = werk.codes[k];
        if (!code) throw new Error("De animatie is niet compleet.");
        const d = deelWerk(basis, r.plan, werk.woorden, werk.delen, k);
        const pagina = c.maker === "docu" ? alleenFotos(d.pagina, genoemd(code)) : d.pagina;
        const u = await pasHoofdstukAan({ pagina, plan: d.plan, code, punten, docu: c.maker === "docu", taal });
        werk.codes[k] = u.code;
        usd += u.usd;
      }),
    );
    console.log(`[motion] aanpassing ${c.id}: ${groepen.size} hoofdstuk(ken), $${usd.toFixed(3)}`);
    const stand = await verder(c, v, {
      ...v,
      stap: IN_BROWSER ? "browser" : "wacht-video",
      sinds: new Date().toISOString(),
      werk: await bewaarWerk(c.user_id, werk),
      stillen: undefined,
      pogingen: 0,
      gebruik: { usd, rondes: 1 },
    });
    if (stand && !IN_BROWSER && !process.env.VERCEL) {
      const door = await verder(stand.c, stand.v, { ...stand.v, stap: "video", sinds: new Date().toISOString() });
      if (door) await voerVideoUit(door.c, door.v);
    }
  } catch (e) {
    const reden = e instanceof Error ? e.message : String(e);
    console.error("[motion] aanpassen mislukt:", reden);
    await markeerMislukt(c, `Aanpassen mislukt: ${reden}`);
  }
}

/**
 * Na de nieuwe stem van een aanpassing met gewijzigde zinnen: de hoofdstukken van de oude
 * video op de nieuwe tijden, de oude code, en per gewijzigde scene een opdracht aan Claude om
 * tekst in beeld en timing op de nieuwe zin aan te passen. Punten van de klant schuiven mee.
 */
async function zinnenOpNieuweStem(c: Creatie, v: Voortgang, basis: PaginaBasis, woorden: WhisperWord[], stemUrl: string): Promise<void> {
  const r = rij(c);
  const a = r.aanpassing!;
  const oud = await leesWerk(a.werkVan!);
  const [nieuw, vroeger] = await Promise.all([sceneStarts(basis, r.plan, woorden), sceneStarts(basis, a.planVan ?? r.plan, oud.woorden)]);
  const delen = herverdeel(oud.delen, nieuw);
  const laatste = woorden[woorden.length - 1]?.end ?? nieuw[nieuw.length - 1] + 3;
  // Een punt van de klant ligt in een scene; in de nieuwe video op dezelfde plek in die scene.
  const schuif = (t: number) => {
    let j = 0;
    vroeger.forEach((s, i) => { if (s <= t) j = i; });
    return Math.max(0, +(nieuw[j] + (t - vroeger[j])).toFixed(2));
  };
  const punten: AanpasPunt[] = a.punten.map((p) => ({ ...p, t: schuif(p.t) }));
  for (const z of (a.zinnen ?? []).filter((x) => x.scene > 0)) {
    const j = z.scene - 1;
    const eind = j + 1 < nieuw.length ? nieuw[j + 1] : laatste;
    const was = a.planVan?.scenes[j]?.tekst ?? "";
    punten.push({
      t: +((nieuw[j] + eind) / 2).toFixed(2),
      x: 0.5,
      y: 0.5,
      vorm: "scene",
      tekst: `De verteller zegt in deze scene nu iets anders. Was: "${was}". Nu: "${z.tekst}". Pas tekst, getallen en namen in beeld aan op de nieuwe zin, en laat dingen verschijnen op de woorden uit de nieuwe zin (gebruik wt met woorden die nu in de woordtijden staan). Laat de rest van de tekening zoals hij is.`,
    });
  }
  const werk: Werkbestand = { woorden, delen, codes: oud.codes, mis: oud.codes.map(() => 0) };
  const werkUrl = await bewaarWerk(c.user_id, werk);
  const naar: Voortgang = { ...v, stap: punten.length ? "aanpassen" : IN_BROWSER ? "browser" : "wacht-video", sinds: new Date().toISOString(), stemUrl, werk: werkUrl, pogingen: 0 };
  const { data } = await createServiceClient()
    .from("creaties")
    .update({ invoer: { ...r, aanpassing: { ...a, punten }, voortgang: naar } })
    .eq("id", c.id)
    .eq("status", "bezig")
    .eq("invoer->voortgang->>stap", v.stap)
    .eq("invoer->voortgang->>sinds", v.sinds)
    .select("*")
    .maybeSingle();
  if (data && punten.length) await voerAanpassingUit(data as Creatie, naar);
}

/** Alleen voor het proefscript van het aanpassen (scripts/aanpassen-proef.test.ts). */
export const voorProef = { basisVan, leesWerk, alleenFotos, genoemd };

/**
 * Voor de cron (app/api/cron/motion): video's die bezig zijn een stap verder zetten, ook als
 * niemand de studio open heeft, en een mail sturen als een video op de browser wacht terwijl
 * er na twee minuten nog geen browser aan begonnen is.
 */
export async function motionOnderhoud(): Promise<{ bekeken: number; gemaild: number }> {
  const db = createServiceClient();
  const { data } = await db.from("creaties").select("*").in("maker", ["motion", "docu"]).eq("status", "bezig").order("created_at").limit(40);
  let gemaild = 0;
  for (const c0 of (data ?? []) as Creatie[]) {
    const c = await verversMotion(c0).catch(() => c0);
    const r = rij(c), v = r.voortgang;
    if (!r.mail || !v || v.stap !== "browser" || v.browserGestart || v.gemaild?.includes("afmaken")) continue;
    if (Date.now() - new Date(v.sinds).getTime() < 2 * 60 * 1000) continue;
    // Eerst vastleggen (met de claim op stap en tijd), dan mailen: nooit twee keer.
    const gewonnen = await claim(c, v, { ...v, gemaild: [...(v.gemaild ?? []), "afmaken"] });
    if (gewonnen && (await mailVideo(gewonnen, "afmaken"))) gemaild++;
  }
  return { bekeken: data?.length ?? 0, gemaild };
}
