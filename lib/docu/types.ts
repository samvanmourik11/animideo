// DOCU-STUDIO — faceless documentaires voor YouTube, zoals onze eigen KRONIK-video's
// (Vitesse, BHS, Schlecker). Client-veilig: het scherm rekent er de prijs mee uit.
//
// Het idee (Sam, 13-11-2026): "kan dat onderdeel worden van de app, dat je zulke faceless
// content kan maken?" Een aparte studio, maar op de machine van de Motion graphics-studio
// (lib/motion/): stem, animatie in code en montage zijn hetzelfde. Wat de docu-studio
// erbij doet:
//   1. onderzoek op internet met bronnen, en een automatische feitencontrole (Sam: "de klant
//      hoeft de feiten niet te controleren, dat doe jij");
//   2. vrije foto's van Wikimedia Commons (geen nieuwsbeelden van YouTube: een auteursrecht-
//      claim komt dan bij ons terecht), met de maker en de licentie erbij;
//   3. het YouTube-pakket: thumbnail, beschrijving met hoofdstuktijden en bronnen, en een Short.

import { creditsVoorInkoop, INKOOP_USD } from "@/lib/credit-costs";
import { type MotionLengte, type MotionPlan, type MotionStap } from "@/lib/motion/types";

export const DOCU_LENGTES = [
  { sec: 180, naam: "±3 minuten", uitleg: "Kort verhaal, één wending" },
  { sec: 300, naam: "±5 minuten", uitleg: "Opkomst en ondergang in vogelvlucht" },
  { sec: 600, naam: "±10 minuten", uitleg: "Volledige documentaire, zoals KRONIK" },
] as const satisfies readonly { sec: MotionLengte; naam: string; uitleg: string }[];
export type DocuLengte = (typeof DOCU_LENGTES)[number]["sec"];
export const isDocuLengte = (v: unknown): v is DocuLengte => DOCU_LENGTES.some((l) => l.sec === v);

/**
 * De Engelse verteller van onze eigen KRONIK- en ADDED TIME-video's (Russell, ElevenLabs).
 * Hij staat niet in de stemmenbibliotheek (die is Nederlands); in deze studio is hij de
 * standaard voor Engels, net als Hugo voor Nederlands.
 */
export const DOCU_STEM_EN = "NYC9WEgkq1u4jiqBseQ9";

/** Muziek die bij een docu past (slugs uit lib/music/library.ts): spanning, geen vrolijke reclamemuziek. */
export const DOCU_MUZIEK = [
  { slug: "piano-drama", naam: "Ingetogen piano" },
  { slug: "episch-dramatisch", naam: "Episch & dramatisch" },
  { slug: "filmisch-orkest", naam: "Filmisch orkest" },
  { slug: "drama-romantisch", naam: "Melancholisch" },
  { slug: "dramatische-trailer", naam: "Spannend" },
  { slug: "", naam: "Geen muziek" },
] as const;
export const docuMuziek = (v: unknown): string => (DOCU_MUZIEK.some((m) => m.slug === v) ? (v as string) : DOCU_MUZIEK[0].slug);

/** Een feit uit het onderzoek, met de bron waar het staat. */
export interface DocuFeit {
  id: string;
  feit: string;
  /** Naam van de bron ("BBC News, 2016"). */
  bron: string;
  url: string;
}

/** Wat de feitencontrole deed. De klant hoeft niets te doen; dit is ter informatie. */
export interface DocuControle {
  /** Hoeveel uitspraken in het script zijn nagelopen. */
  gecontroleerd: number;
  /** Zinnen die zijn verbeterd of weggelaten, met de reden. Scene 0 is de eindkaart. */
  verbeterd: { scene: number; was: string; nu: string; reden: string }[];
}

/** Een vrije foto van Wikimedia Commons, bewaard op onze eigen opslag. */
export interface DocuFoto {
  /** f1, f2, ...: zo heet de foto in het script en in de code. */
  id: string;
  url: string;
  /** Bij welke scene hij hoort (vanaf 1). */
  scene: number;
  /** Wat er op de foto staat. */
  wat: string;
  maker: string;
  licentie: string;
  /** De pagina van de foto op Commons. */
  bron: string;
  w: number;
  h: number;
}

/** "Foto: Jan Jansen / Wikimedia Commons, CC BY-SA 4.0": verplicht bij CC BY, netjes bij de rest. */
export function fotoCredit(f: Pick<DocuFoto, "maker" | "licentie">, taal: "nl" | "en" = "nl"): string {
  const wie = f.maker && !/^(unknown|onbekend)/i.test(f.maker) ? `${f.maker} / ` : "";
  return `${taal === "en" ? "Photo" : "Foto"}: ${wie}Wikimedia Commons, ${f.licentie}`;
}

/** Wat het scherm na het onderzoek terugkrijgt. */
export interface DocuOnderzoek {
  plan: MotionPlan;
  feiten: DocuFeit[];
  controle: DocuControle;
  /** Per scene een zoekterm voor een foto (Engels), of leeg. */
  fotoZoek: string[];
  /** Wat het onderzoek ons kostte (dollars), voor het logboek. */
  usd: number;
  usdPerStap?: { zoeken: number; script: number; controle: number };
}

/** Het YouTube-pakket naast de video. */
export interface DocuExtras {
  thumbnail?: string;
  /** De beschrijving voor onder de video: intro, hoofdstukken met tijden, bronnen, foto's. */
  beschrijving?: string;
  /** Drie titelvoorstellen voor YouTube. */
  titels?: string[];
  /** De Short (een eigen rij in de bibliotheek, staand). */
  shortId?: string;
  /** Wat er misging bij een extra; de video zelf is dan wel klaar. */
  fout?: string;
}

/** Wat bij een docu in de rij staat, naast alles van de motion-machine. */
export interface DocuInvoer {
  onderwerp: string;
  feiten: DocuFeit[];
  controle: DocuControle;
  fotos: DocuFoto[];
  extras?: DocuExtras;
  /** Maak er ook een Short bij. */
  short: boolean;
}

// ── Prijs ────────────────────────────────────────────────────────────────────
// Sinds de vaste sjablonen (14-11-2026) tekent Claude niet meer zelf; een goedkoop model
// kiest per scene een sjabloon. Gemeten op V&D (3 minuten, Engels):
//   onderzoek + feitencontrole $1,22 (zoeken $0,36, script $0,44, controle $0,42);
//   foto's kiezen $0,004; sjablonen kiezen $0,04; titels/beschrijving $0,015; Short-script $0,02.
// Hieronder met speling: het onderzoek van een lange docu zoekt meer, en de Short is een
// motion-video van 45 s die Claude wel zelf tekent (±$0,60 met stem).
const ONDERZOEK_USD = 1.6;
const PER_SEC_USD = 0.0005; // sjablonen kiezen, ruim
const VAST_USD = 0.1; // foto's, pakket
const SHORT_SEC = 45;
const SHORT_USD = 0.15 + 0.01 * SHORT_SEC + ((SHORT_SEC * 15) / 1000) * INKOOP_USD.stemPer1000;

export function docuCredits(lengte: DocuLengte, short = true): number {
  // Stem: ±15 tekens per seconde.
  const stem = ((lengte * 15) / 1000) * INKOOP_USD.stemPer1000;
  return creditsVoorInkoop(ONDERZOEK_USD + VAST_USD + PER_SEC_USD * lengte + stem + (short ? SHORT_USD : 0));
}

export type DocuStap = MotionStap | "extras";

export const DOCU_STAP_LABEL: Record<DocuStap, string> = {
  stem: "Stap 1 van 4: voice-over inspreken…",
  "wacht-animatie": "Stap 2 van 4: beelden tekenen en controleren…",
  animatie: "Stap 2 van 4: beelden tekenen en controleren…",
  "wacht-video": "Stap 3 van 4: video maken…",
  video: "Stap 3 van 4: video maken…",
  extras: "Stap 4 van 4: thumbnail, beschrijving en Short…",
  browser: "Video maken in je browser. Open de Docu-studio en houd dat tabblad open.",
  monteren: "Stem en muziek eronder…",
  aanpassen: "Je aanpassingen worden verwerkt…",
};
