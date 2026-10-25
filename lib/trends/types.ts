// DE TRENDS-STUDIO — wat er nu viral gaat, en hoe je het namaakt.
//
// Elke trend is anders gemaakt (Sam, 24-10-2026): de goal van Özil is een echte opname
// waarvan je de beweging overneemt, een "actiefiguur van jezelf" is één bewerkt beeld, een
// AI-glas-fruit-snijvideo is pure tekst. Daarom kiest de speurtocht per trend een METHODE
// uit de bouwstenen hieronder, en schrijft hij de opdracht die daarbij hoort.
//
// Client-veilig: het scherm rekent er de prijs vooraf mee uit. De opdracht zelf blijft op
// de server (lib/trends/opdracht.ts).

import { CREDIT_COSTS } from "@/lib/credit-costs";
import { videoModel } from "@/lib/video-modellen";
import { lipsyncCredits } from "@/lib/lipsync";

export const METHODES = ["foto", "tekst-foto", "foto-video", "video-effect", "tekst-video", "beweging", "pratend"] as const;
export type Methode = (typeof METHODES)[number];

export const TREND_FORMATEN = ["9:16", "1:1", "16:9"] as const;
export type TrendFormaat = (typeof TREND_FORMATEN)[number];

/**
 * Beweging overnemen uit de trendvideo: Wan 2.2 Animate Replace. Die houdt de originele
 * video (decor, tegenstander, bal, camera) en vervangt alleen de persoon — zoals Higgsfield
 * Genjutsu. Eerst gebruikten we Kling Motion Control; dat bouwt de hele scène opnieuw op uit
 * de foto en gaf bij Sams voetbalproef (25-10-2026) springende decors, een verdwenen bal en
 * geen tegenstander. $0,08 per seconde bij 720p en 16 beelden per seconde.
 */
export const BEWEGING_MODEL = "fal-ai/wan/v2.2-14b/animate/replace";
export const BEWEGING_USD_PER_SEC = 0.08;
/** Langer dan dit knippen we de trendvideo af: daarboven wordt het te duur en te traag. */
export const MAX_CLIP_SEC = 15;
export const TEKST_VIDEO_MODEL = "fal-ai/kling-video/v2.5-turbo/pro/text-to-video";
/** Het videomodel bij foto → video: het beste in de beweging van mensen. */
export const TREND_VIDEOMODEL = "kling-2-5";

export interface MethodeInfo {
  naam: string;
  /** Voor Sam en de speurtocht: wanneer je deze methode kiest. */
  wanneer: string;
  /** Levert een beeld of een video op. */
  soort: "beeld" | "video";
  /** Heeft de trendvideo zelf nodig (beweging of geluid). */
  clipNodig: boolean;
}

export const METHODE_INFO: Record<Methode, MethodeInfo> = {
  foto: { naam: "Foto bewerken", wanneer: "Een beeldtrend met je eigen foto (actiefiguur, Ghibli-stijl, jij als …)", soort: "beeld", clipNodig: false },
  "tekst-foto": { naam: "Beeld uit tekst", wanneer: "Een beeldtrend zonder foto (meme-sjabloon, poster, AI-kunstje)", soort: "beeld", clipNodig: false },
  "foto-video": { naam: "Foto → scène → video", wanneer: "Jij in een bekend moment of decor dat daarna beweegt (op beschrijving)", soort: "video", clipNodig: false },
  "video-effect": { naam: "Video-effect op je foto", wanneer: "Je foto direct laten bewegen met een effect (inzoomen, transformatie)", soort: "video", clipNodig: false },
  "tekst-video": { naam: "Video uit tekst", wanneer: "Een AI-videotrend zonder foto (ASMR, brainrot-personages, absurde clips)", soort: "video", clipNodig: false },
  beweging: { naam: "Persoon vervangen in de trendvideo", wanneer: "Een dansje, goal, juichgebaar of challenge: de originele video blijft, de klant komt in de plaats van de persoon", soort: "video", clipNodig: true },
  pratend: { naam: "Geluid playbacken", wanneer: "Een audio-meme of zin die iedereen nazegt: de foto van de klant praat/zingt het geluid", soort: "video", clipNodig: true },
};

export function isMethode(m: unknown): m is Methode {
  return (METHODES as readonly string[]).includes(m as string);
}

export interface TrendVelden {
  fotos: { label: string }[];
  tekst: { label: string; placeholder: string; verplicht?: boolean } | null;
}

export interface TrendOpdracht {
  /** Nano Banana Pro: hoe het beeld/de scène eruitziet. {tekst} = het tekstveld van de klant. */
  scenePrompt?: string;
  /** Kling: wat er beweegt. */
  bewegingPrompt?: string;
  formaat?: TrendFormaat;
  /** Bij 'beweging': de trendvideo op 16 beelden per seconde (zo rekent Wan; 30 fps kost bijna het dubbele). */
  clip16?: string;
}

/** Een plek waar de trend te zien is, met (als het lukte) een beeld en een speler erbij. */
export interface BronLink {
  url: string;
  titel?: string;
  /** Stilstaand voorbeeld, op onze opslag (omslag van de video, hoofdbeeld van een artikel, of een screenshot van Sam). */
  beeld?: string;
  /** Speler om de originele video in de pagina af te spelen (TikTok, YouTube, Instagram). */
  embed?: string;
  /** Bij een TikTok: hoe viral hij ging (zoals TikTok het telde op `gecontroleerd`). */
  tiktok?: { maker: string; weergaven: number; likes: number; reacties: number; gedeeld: number; gecontroleerd: string };
}

/** 5900000 → "5,9 mln", 655800 → "656K". */
export function telling(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} mln`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/** Het beeld dat de tegel toont als er nog geen eigen voorbeeld of trendvideo is. */
export function eersteBeeld(t: { bron_links: BronLink[] }): string | null {
  // De best bekeken TikTok eerst; daarna wat er verder een beeld heeft.
  const opVolgorde = [...t.bron_links].sort((a, b) => (b.tiktok?.weergaven ?? -1) - (a.tiktok?.weergaven ?? -1));
  return opVolgorde.find((l) => l.beeld)?.beeld ?? null;
}

/** Wat de browser van een trend mag zien. */
export interface PubliekeTrend {
  id: string;
  titel: string;
  uitleg: string;
  icoon: string;
  methode: Methode;
  velden: TrendVelden;
  bron_links: BronLink[];
  voorbeeldclip: string | null;
  voorbeeld_url: string | null;
  voorbeeld_soort: string | null;
  gezicht: boolean;
  hotness: number;
  status: string;
  live_op: string | null;
  created_at: string;
  credits: number;
}

/** Alles, voor de server en de beheerpagina. */
export interface Trend extends Omit<PubliekeTrend, "credits"> {
  waarom_viral: string | null;
  origineel: string | null;
  opdracht: TrendOpdracht;
  geluid: string | null;
  clip_sec: number | null;
  bron: string;
  updated_at: string;
  /** Zie lib/trends/proef.ts en migratie 116. */
  proef?: { pogingen: { creatieId: string; gestart: string; oordeel?: string; score?: number; opmerking?: string }[] };
}

export const PUBLIEKE_KOLOMMEN =
  "id, titel, uitleg, icoon, methode, velden, bron_links, voorbeeldclip, voorbeeld_url, voorbeeld_soort, gezicht, hotness, status, live_op, created_at, opdracht, clip_sec";

const BEELD_PRO = CREDIT_COSTS.IMAGE_GENERATION_PRO;

/**
 * Credits voor de beweging uit de trendvideo. Zelfde rekenregel als de Filmstudio:
 * 1 credit ≈ €0,098 omzet en minstens 40% marge, dus ~$0,059 inkoop per credit.
 */
export function bewegingCredits(sec: number): number {
  const s = Math.min(MAX_CLIP_SEC, Math.max(1, sec || 5));
  return Math.ceil((s * BEWEGING_USD_PER_SEC) / 0.059);
}

/** Begint de trend met een bewerkt beeld (scène) vóór de video? */
export function heeftScene(methode: Methode, opdracht: TrendOpdracht): boolean {
  if (methode === "foto" || methode === "tekst-foto" || methode === "foto-video") return true;
  if (methode === "beweging" || methode === "pratend") return !!opdracht.scenePrompt?.trim();
  return false;
}

export function trendCredits(t: { methode: Methode; opdracht: TrendOpdracht; clip_sec: number | null }): number {
  const scene = heeftScene(t.methode, t.opdracht) ? BEELD_PRO : 0;
  switch (t.methode) {
    case "foto":
    case "tekst-foto":
      return BEELD_PRO;
    case "foto-video":
      return scene + videoModel(TREND_VIDEOMODEL).credits;
    case "video-effect":
    case "tekst-video":
      return videoModel(TREND_VIDEOMODEL).credits;
    case "beweging":
      return scene + bewegingCredits(Number(t.clip_sec) || 5);
    case "pratend":
      return scene + lipsyncCredits(Number(t.clip_sec) || 5);
  }
}

/** Kan deze trend live? Geeft de reden als het (nog) niet kan. */
export function nogNodig(t: { methode: Methode; opdracht: TrendOpdracht; voorbeeldclip: string | null; geluid: string | null; velden: TrendVelden }): string | null {
  const o = t.opdracht;
  if (heeftScene(t.methode, o) && !o.scenePrompt?.trim()) return "De beeldopdracht (scène) ontbreekt.";
  if ((t.methode === "foto-video" || t.methode === "video-effect" || t.methode === "tekst-video") && !o.bewegingPrompt?.trim())
    return "De bewegingsopdracht ontbreekt.";
  if (t.methode === "beweging" && !t.voorbeeldclip) return "Upload eerst de trendvideo: daar komt de beweging uit.";
  if (t.methode === "pratend" && !t.geluid) return "Upload eerst de trendvideo of het geluid: dat gaat de foto playbacken.";
  const zonderFoto = t.methode === "tekst-foto" || t.methode === "tekst-video";
  if (!zonderFoto && t.velden.fotos.length === 0) return "Deze methode heeft een foto van de klant nodig.";
  if (zonderFoto && !t.velden.tekst) return "Zonder foto is een tekstveld nodig.";
  return null;
}

/** Komt de trend nog als 'nu viral' in beeld, of is het inmiddels een klassieker? */
export function isVers(t: { live_op: string | null; created_at: string }, nu = Date.now()): boolean {
  return nu - new Date(t.live_op ?? t.created_at).getTime() < 14 * 24 * 60 * 60 * 1000;
}

/** Wat de browser van een trend mag zien: de verborgen opdracht eraf, de prijs erbij. */
export function publiek(t: Trend | (PubliekeTrend & { opdracht?: TrendOpdracht; clip_sec?: number | null })): PubliekeTrend {
  const { opdracht, clip_sec, ...rest } = t as Trend;
  const r = rest as unknown as Record<string, unknown>;
  delete r.waarom_viral;
  delete r.origineel;
  delete r.geluid;
  delete r.bron;
  delete r.updated_at;
  return { ...(r as unknown as PubliekeTrend), credits: trendCredits({ methode: t.methode, opdracht: opdracht ?? {}, clip_sec: clip_sec ?? null }) };
}

/** Leest en schoont velden op (van de speurtocht of de beheerpagina). */
export function leesVelden(ruw: unknown): TrendVelden {
  const v = (ruw ?? {}) as { fotos?: unknown; tekst?: unknown };
  const fotos = (Array.isArray(v.fotos) ? v.fotos : [])
    .map((f) => String((f as { label?: unknown })?.label ?? "").trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 2)
    .map((label) => ({ label }));
  const t = v.tekst as { label?: unknown; placeholder?: unknown; verplicht?: unknown } | null | undefined;
  const label = String(t?.label ?? "").trim().slice(0, 80);
  return {
    fotos,
    tekst: label ? { label, placeholder: String(t?.placeholder ?? "").trim().slice(0, 120), verplicht: t?.verplicht === true } : null,
  };
}

export function leesOpdracht(ruw: unknown): TrendOpdracht {
  const o = (ruw ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 2000) : "");
  const formaat = (TREND_FORMATEN as readonly string[]).includes(o.formaat as string) ? (o.formaat as TrendFormaat) : "9:16";
  return {
    ...(s(o.scenePrompt) ? { scenePrompt: s(o.scenePrompt) } : {}),
    ...(s(o.bewegingPrompt) ? { bewegingPrompt: s(o.bewegingPrompt) } : {}),
    ...(/^https:\/\//.test(s(o.clip16)) ? { clip16: s(o.clip16) } : {}),
    formaat,
  };
}

/** Woorden die iets zeggen, om dubbele trends onder een net iets andere naam te herkennen. */
function kernwoorden(titel: string): Set<string> {
  return new Set(titel.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !["de", "het", "een", "van", "jij", "als", "the", "and", "met", "trend"].includes(w)));
}

/** Twee titels over dezelfde trend? ("Pray For Me slow-mo-opkomst" ↔ "Pray For Me: de slow-mo entree") */
export function lijktOp(a: string, b: string): boolean {
  const x = kernwoorden(a);
  const y = kernwoorden(b);
  if (!x.size || !y.size) return false;
  const samen = [...x].filter((w) => y.has(w)).length;
  return samen / Math.min(x.size, y.size) >= 0.6;
}

/** Een voorbeeldinvulling voor het tekstveld, uit de placeholder ("bv. rood, wit" → "rood"). */
export function voorbeeldTekst(t: Pick<Trend, "velden">): string {
  const p = t.velden.tekst?.placeholder?.replace(/^(bv\.|bijv\.|bijvoorbeeld|b\.v\.)\s*/i, "").split(/[,;]| of /)[0]?.trim() ?? "";
  return t.velden.tekst?.verplicht ? p || "iets leuks" : p;
}
