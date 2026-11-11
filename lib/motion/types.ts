// MOTION GRAPHICS-STUDIO — wat de klant ziet en kiest. Client-veilig: het maakscherm
// rekent er de prijs mee uit.
//
// Het idee (Sam, 11-11-2026): de uitlegvideo's die Claude Code voor ons eigen werk maakt
// (Lichtveld, Bureau VRIS) zijn volledig in code getekend, zonder AI-beelden. Dat kost
// geen fal-credits voor beeld en ziet er strakker uit dan gegenereerde clips. Deze studio
// doet hetzelfde in de app: Claude schrijft het script, Hugo spreekt het in, Claude tekent
// de animatie op de woordtijden van de stem, bekijkt zijn eigen proefbeelden en verbetert
// ze, en de app maakt er een video van.
//
// Hoe het loopt (lib/motion/regie.ts): stem → animatie → video. Eén item in de bibliotheek
// dat vanzelf door de stappen loopt.

import { creditsVoorInkoop, INKOOP_USD } from "@/lib/credit-costs";

export const MOTION_FORMATEN = [
  { id: "16:9", naam: "Liggend", uitleg: "Website, YouTube, presentatie", w: 1920, h: 1080 },
  { id: "9:16", naam: "Staand", uitleg: "Reels, TikTok, Stories", w: 1080, h: 1920 },
] as const;
export type MotionFormaat = (typeof MOTION_FORMATEN)[number]["id"];

export function isMotionFormaat(v: unknown): v is MotionFormaat {
  return MOTION_FORMATEN.some((f) => f.id === v);
}
export function formaatMaat(f: MotionFormaat): { w: number; h: number } {
  const m = MOTION_FORMATEN.find((x) => x.id === f)!;
  return { w: m.w, h: m.h };
}

// Langer dan een minuut past (nog) niet zeker binnen de tijd die de server krijgt om de
// video beeld voor beeld te maken; eerst op de live-server meten, dan pas oprekken.
export const MOTION_LENGTES = [
  { sec: 30, naam: "±30 seconden", uitleg: "Eén boodschap, kort en krachtig" },
  { sec: 45, naam: "±45 seconden", uitleg: "Probleem, oplossing en hoe het werkt" },
  { sec: 60, naam: "±60 seconden", uitleg: "Een complete uitlegvideo" },
] as const;
export type MotionLengte = (typeof MOTION_LENGTES)[number]["sec"];

export function isMotionLengte(v: unknown): v is MotionLengte {
  return MOTION_LENGTES.some((l) => l.sec === v);
}

/** Hugo spreekt in een rustige uitlegvideo zo'n 2,5 woorden per seconde. */
export const WOORDEN_PER_SEC = 2.5;
export function maxWoorden(sec: number): number {
  return Math.round(sec * WOORDEN_PER_SEC);
}

export interface MotionScene {
  /** Wat de stem zegt in deze scene. */
  tekst: string;
  /** Wat er te zien is, in gewoon Nederlands: dit leest de klant, en Claude tekent het. */
  beeld: string;
  /** Korte titel rechtsboven ("01  Het probleem"); mag leeg. */
  kop: string;
}

export interface MotionPlan {
  titel: string;
  scenes: MotionScene[];
  eind: {
    /** Wat de stem zegt op de eindkaart; noemt de bedrijfsnaam. */
    tekst: string;
    /** Twee korte regels boven het logo. */
    regel1: string;
    regel2: string;
    /** De tekst op de knop ("Vraag een offerte aan"). */
    knop: string;
  };
}

export const MAX_SCENES = 8;

// ── Huisstijl ────────────────────────────────────────────────────────────────
// Een bedrijf wil dat elke video er hetzelfde uitziet: zelfde logo, kleuren, lettertype en
// toon. Dat ligt vast in een Huisstijl (tabel brand_kits, de pagina /brand); de studio leest
// hem in en de klant hoeft het maar één keer in te stellen.

/**
 * De lettertypes waaruit de klant kiest. Alleen lettertypes van Google Fonts die er in de
 * diktes 500 t/m 800 zijn: de video gebruikt ze alle vier, en Google weigert het hele
 * lettertype als er één dikte niet bestaat.
 */
export const MOTION_FONTS = [
  "Plus Jakarta Sans",
  "Inter",
  "Outfit",
  "Poppins",
  "Montserrat",
  "Manrope",
  "DM Sans",
  "Nunito",
  "Raleway",
  "Work Sans",
  "Rubik",
  "Sora",
  "Lexend",
  "Figtree",
  "Urbanist",
  "Playfair Display",
  "Roboto Slab",
  "Bitter",
] as const;
export const STANDAARD_FONT = MOTION_FONTS[0];

/** Het lettertype uit een huisstijl ("Montserrat, sans-serif") terugvinden in onze lijst. */
export function motionFont(v: unknown): string {
  if (typeof v !== "string") return STANDAARD_FONT;
  const eerste = v.split(",")[0].replace(/['"]/g, "").trim().toLowerCase();
  return MOTION_FONTS.find((f) => f.toLowerCase() === eerste) ?? STANDAARD_FONT;
}

// ── Voorbeelden en foto's ────────────────────────────────────────────────────
// De klant geeft beelden mee en zegt erbij waarvoor: zonder dat doel weet de tekenaar niet
// of een foto van een bestelbus betekent "teken onze bus zo" of "zet deze foto in beeld".
export const MOTION_DOELEN = [
  { id: "natekenen", naam: "Teken dit na", uitleg: "Je product, apparaat, bus, pand of app-scherm: wij tekenen het na in de stijl van de video." },
  { id: "uitleg", naam: "Leg dit uit", uitleg: "Een schema, grafiek of stappenplan dat de video moet uitleggen." },
  { id: "stijl", naam: "Neem deze stijl over", uitleg: "Een voorbeeld van de sfeer, vormen en kleuren die je mooi vindt." },
  { id: "tonen", naam: "Zet deze foto in beeld", uitleg: "De foto zelf komt in de video, bijvoorbeeld je team of een echt product." },
] as const;
export type MotionDoel = (typeof MOTION_DOELEN)[number]["id"];
export function isMotionDoel(v: unknown): v is MotionDoel {
  return MOTION_DOELEN.some((d) => d.id === v);
}

export const MAX_BEELDEN = 6;

export interface MotionBeeld {
  /** f1, f2, ...: zo heet het beeld in de opdracht en in de code. */
  id: string;
  url: string;
  doel: MotionDoel;
  /** Wat het is en waar het voor dient, in de woorden van de klant. */
  uitleg: string;
  /** Hoort bij de huisstijl: komt bij elke volgende video vanzelf weer mee. */
  vast?: boolean;
}

/** Wat de klant aanleverde: zo staat het in de rij, en zo start "Nog eens" hem opnieuw. */
export interface MotionInvoer {
  onderwerp: string;
  bedrijf: string;
  website: string;
  kleur: string;
  kleur2: string;
  formaat: MotionFormaat;
  lengte: MotionLengte;
  muziek: string;
  plan: MotionPlan;
  /** De gekozen huisstijl (brand_kits.id), of leeg. Alleen om hem bij "Nog eens" terug te vinden. */
  huisstijlId: string;
  /** Het logo van de klant (adres op onze eigen opslag), of leeg: dan de eerste letter als merkteken. */
  logo: string;
  font: string;
  /** Schrijfstijl en wat er niet in mag, uit de huisstijl. */
  toon: string;
  nietDoen: string;
  beelden: MotionBeeld[];
}

/** De muziek waaruit de klant kiest (slugs uit lib/music/library.ts). */
export const MOTION_MUZIEK = [
  { slug: "upbeat-corporate-vlog", naam: "Zakelijk & fris" },
  { slug: "inspirerend-corporate-simpel", naam: "Rustig & inspirerend" },
  { slug: "vrolijk-positief-motiverend", naam: "Vrolijk" },
  { slug: "electro-lifestyle", naam: "Modern & elektronisch" },
  { slug: "", naam: "Geen muziek" },
] as const;

// ── Prijs ────────────────────────────────────────────────────────────────────
// Geen beeldmodel, dus geen fal-kosten voor beeld. Wat het ons kost is Claude (het ontwerp
// van de animatie plus één of twee controlerondes met proefbeelden), de stem en Whisper.
// Eerst kostte een video $1,91 tot $2,09: elke controleronde schreef de complete code
// opnieuw. Sinds 11-11-2026 (Sam: "waarom is dit zo duur?") geeft een controleronde alleen
// de wijzigingen terug en doet een goedkoper model het nakijken. Gemeten daarna: $0,95 en
// $0,95 (twee video's van 35 s) en $1,01 (42 s); het ontwerp is ±$0,83, de controle ±$0,14.
// De bedragen hieronder hebben speling voor voorbeelden van de klant en een herkansing. Een
// video van een volle minuut is nog niet gemeten. De echte kosten per video staan in de rij
// (voortgang.gebruik); bijstellen zodra er meer zijn.
export const MOTION_INKOOP_USD: Record<MotionLengte, number> = {
  30: 1.1,
  45: 1.25,
  60: 1.4,
};

export function motionCredits(lengte: MotionLengte): number {
  // Stem: ±15 tekens per seconde.
  const stem = ((lengte * 15) / 1000) * INKOOP_USD.stemPer1000;
  return creditsVoorInkoop(MOTION_INKOOP_USD[lengte] + stem);
}

export type MotionStap = "stem" | "animatie" | "wacht-video" | "video";

export const MOTION_STAP_LABEL: Record<MotionStap, string> = {
  stem: "Stap 1 van 3: voice-over inspreken…",
  animatie: "Stap 2 van 3: animatie tekenen en controleren…",
  "wacht-video": "Stap 3 van 3: video maken…",
  video: "Stap 3 van 3: video maken…",
};
