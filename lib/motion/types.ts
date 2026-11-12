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

// Tot een minuut wordt de video in één keer getekend. Langer (Sam, 12-11-2026: "ook echt
// langere video's van 10 minuten") gaat in hoofdstukken van ongeveer een halve minuut, die
// los van elkaar worden getekend en gemaakt en daarna aan elkaar gezet: één stuk code van
// tien minuten past in geen enkel antwoord en in geen enkel serververzoek.
export const MOTION_LENGTES = [
  { sec: 30, naam: "±30 seconden", uitleg: "Eén boodschap, kort en krachtig" },
  { sec: 45, naam: "±45 seconden", uitleg: "Probleem, oplossing en hoe het werkt" },
  { sec: 60, naam: "±1 minuut", uitleg: "Een complete uitlegvideo" },
  { sec: 120, naam: "±2 minuten", uitleg: "Uitleg met ruimte voor voorbeelden" },
  { sec: 180, naam: "±3 minuten", uitleg: "Een product of dienst van begin tot eind" },
  { sec: 300, naam: "±5 minuten", uitleg: "Instructie, training of onboarding" },
  { sec: 600, naam: "±10 minuten", uitleg: "Een complete les of presentatie" },
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

/** Zoveel scenes mag een plan hooguit hebben: een scene duurt zelden korter dan 7 seconden. */
export function maxScenes(lengte: number): number {
  return lengte <= 60 ? 8 : Math.ceil(lengte / 7);
}

/** "±45 seconden" of "±3 minuten", voor in een zin. */
export function duurTekst(sec: number): string {
  return MOTION_LENGTES.find((l) => l.sec === sec)?.naam ?? (sec < 90 ? `±${sec} seconden` : `±${Math.round(sec / 60)} minuten`);
}

// ── Hoofdstukken ─────────────────────────────────────────────────────────────
/** Een hoofdstuk: de scenes `van` tot `tot` (tot telt niet mee), als nummers in plan.scenes. */
export interface Hoofdstuk {
  van: number;
  tot: number;
}
/** Zoveel woorden heeft een hoofdstuk ongeveer: ruim een halve minuut. */
const WOORDEN_PER_HOOFDSTUK = 85;
const telw = (t: string) => t.split(/\s+/).filter(Boolean).length;

/**
 * Verdeelt de scenes over hoofdstukken. Een korte video is één hoofdstuk (dan verandert er
 * niets aan hoe hij altijd werd gemaakt). De eindkaart hoort bij het laatste hoofdstuk.
 */
export function hoofdstukken(plan: MotionPlan): Hoofdstuk[] {
  const n = plan.scenes.length;
  const woorden = plan.scenes.map((s) => telw(s.tekst));
  const totaal = woorden.reduce((a, b) => a + b, 0) + telw(plan.eind.tekst);
  if (n <= 8 && totaal <= maxWoorden(60) * 1.25) return [{ van: 0, tot: n }];
  // Gelijke porties: eerst bepalen hoeveel hoofdstukken, dan knippen waar de lopende som
  // de volgende grens passeert. Zo blijft er geen hoofdstuk van één scene over.
  const aantal = Math.max(2, Math.round(totaal / WOORDEN_PER_HOOFDSTUK));
  const uit: Hoofdstuk[] = [];
  let van = 0, som = 0;
  for (let i = 0; i < n; i++) {
    som += woorden[i];
    const grens = (totaal * (uit.length + 1)) / aantal;
    const rest = n - (i + 1);
    // Knippen als de grens is bereikt of het hoofdstuk vol zit (6 scenes), maar altijd
    // minstens één scene overlaten voor elk hoofdstuk dat nog komt.
    if (uit.length < aantal - 1 && rest >= 1 && (som >= grens || i + 1 - van >= 6)) {
      uit.push({ van, tot: i + 1 });
      van = i + 1;
    }
  }
  uit.push({ van, tot: n });
  return uit;
}

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
  /** De tekenstijl (id uit lib/motion/stijlen.ts); leeg of afwezig = de standaardstijl. */
  stijl?: string;
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
//
// Op 12-11-2026 nog eens goedkoper: het ontwerp met minder denkwerk (zie animatie.ts). De
// kosten lopen vrijwel recht op met de lengte, want een lange video is een rij hoofdstukken
// van elk ruim een halve minuut: een vast deel per video plus een bedrag per seconde.
// Gemeten 12-11-2026: $0,39 (35 s), $0,95 en $0,84 (2 minuten, 4 en 3 hoofdstukken) en
// $4,53 (10 minuten 40, 18 hoofdstukken). De formule zit daar een kwart tot de helft boven:
// speling voor voorbeelden van de klant en een hoofdstuk dat over moet.
const INKOOP_VAST_USD = 0.15;
const INKOOP_PER_SEC_USD = 0.01;

/** Wat een video van deze lengte ons aan Claude kost (dollars), met speling. */
export function motionInkoopUsd(lengte: number): number {
  return INKOOP_VAST_USD + INKOOP_PER_SEC_USD * lengte;
}

export function motionCredits(lengte: MotionLengte): number {
  // Stem: ±15 tekens per seconde.
  const stem = ((lengte * 15) / 1000) * INKOOP_USD.stemPer1000;
  return creditsVoorInkoop(motionInkoopUsd(lengte) + stem);
}

export type MotionStap = "stem" | "wacht-animatie" | "animatie" | "wacht-video" | "video";

export const MOTION_STAP_LABEL: Record<MotionStap, string> = {
  stem: "Stap 1 van 3: voice-over inspreken…",
  "wacht-animatie": "Stap 2 van 3: animatie tekenen en controleren…",
  animatie: "Stap 2 van 3: animatie tekenen en controleren…",
  "wacht-video": "Stap 3 van 3: video maken…",
  video: "Stap 3 van 3: video maken…",
};
