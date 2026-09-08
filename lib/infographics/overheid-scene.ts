import { storyCanvasSize } from "@/lib/infographics/canvas-size";
import { TEKENINGEN, type TekenOpties } from "@/lib/infographics/illustrator";
import { bouwTafereel } from "@/lib/infographics/tafereel";
import type { InfographicFormat } from "@/lib/types";

// DE OVERHEIDSSTIJL BEWEEGT ZONDER AI.
//
// Een beeldmodel levert één platte PNG. Seedance moet daar zelf uit afleiden wat
// een los element is, en bij een diagram bestaat dat niet: een paneel is geen
// object maar pixels. Het model kan dus niet schuiven, alleen hertekenen — en dat
// zie je terug als vervormende letters en wiebelende randen. Geen enkele
// promptaanscherping lost dat op, want het probleem zit in de informatie.
//
// Daarom tekent de app deze scenes zelf. De AI levert alleen nog een OPBOUW
// (welk sjabloon, welke iconen, welke labels) en de rest is gewone SVG met een
// tijdlijn eroverheen: elementen schuiven in op het moment dat de voice-over ze
// noemt. Voordelen die je er gratis bij krijgt: haarscherpe echte typografie in
// plaats van getekende letters, geen spelfouten meer, geen beeldcredits, en een
// preview die per definitie gelijk is aan de export omdat beide dezelfde SVG
// bouwen.

// ── Datamodel ──────────────────────────────────────────────────────────────

/** De sjablonen waaruit de regie kiest. Bewust weinig: elk moet goed zijn. */
export type OverheidTemplate =
  | "centraal"      // één groot onderwerp in beeld, met label
  | "rij"           // 2 tot 4 gelijkwaardige items naast elkaar
  | "stroom"        // bron → doel(en), met een lopende verbinding ertussen
  | "vergelijking"  // twee helften naast elkaar (oud/nieuw, voor/na)
  | "groei"         // staven die groeien, met waarden
  | "tafereel";     // het onderwerp groot op een grondbalk, met bijfiguren

export interface OverheidElement {
  /** Sleutel uit ICONEN. Onbekend = neutrale vorm. */
  icoon: string;
  /** Korte tekst onder of naast het element. Mag leeg. */
  label: string;
  /** Getal bij het element (alleen bij "groei"), 0-100 als verhouding. */
  waarde?: number | null;
  // ── Alleen voor het sjabloon "tafereel" ──
  /** Dieptevlak: achter (klein, verder weg), midden, voor (groot, dichtbij). */
  vlak?: "achter" | "midden" | "voor" | null;
  /** Horizontale plek in beeld, 0 (links) tot 1 (rechts). */
  x?: number | null;
  /** Dit element houdt dat asset vast, bijv. een figuur met een document. */
  houdt?: string | null;
}

export interface OverheidLayout {
  template: OverheidTemplate;
  /** Korte kop boven de scene. Mag leeg zijn. */
  titel?: string | null;
  elementen: OverheidElement[];
  /** Speelt het tafereel buiten? Dan lucht met wolken bovenin. */
  buiten?: boolean;
}

export interface OverheidKleuren {
  /** Achtergrond van de hele scene. */
  vlak: string;
  /** Panelen en kaders. */
  paneel: string;
  /**
   * "Papier" binnen een icoon: documenten, kaarten, wijzerplaten. Bewust NIET
   * wit — een wit document op een wit paneel is onzichtbaar, en dat was precies
   * wat er gebeurde: van het formulier zag je alleen de gekleurde regeltjes.
   */
  papier: string;
  /** Hoofdkleur: donker, voor tekst en zware vormen. */
  donker: string;
  /** Steunkleur: helder blauw. */
  blauw: string;
  /** Accent: warm geel/oker. */
  accent: string;
  /** Zachte steunkleuren voor afwisseling. */
  mint: string;
  roze: string;
}

export const STANDAARD_KLEUREN: OverheidKleuren = {
  vlak: "#ebebeb",
  paneel: "#ffffff",
  papier: "#dfe6ee",
  donker: "#154273",
  blauw: "#007bc7",
  accent: "#f9b000",
  mint: "#7ddec4",
  roze: "#e491c8",
};

/**
 * Huisstijlkleuren erin verwerken zonder het karakter te slopen: de merkkleur
 * neemt de plek van "donker" in en het accent die van "accent". De zachte
 * steunkleuren blijven, anders wordt het beeld eentonig.
 */
export function kleurenUitHuisstijl(primair?: string | null, accent?: string | null): OverheidKleuren {
  const hex = (c?: string | null) => (c && /^#[0-9a-fA-F]{6}$/.test(c.trim()) ? c.trim() : null);
  return {
    ...STANDAARD_KLEUREN,
    donker: hex(primair) ?? STANDAARD_KLEUREN.donker,
    accent: hex(accent) ?? STANDAARD_KLEUREN.accent,
  };
}

// ── Tijdlijn ───────────────────────────────────────────────────────────────

/** Zachte ease-out, zodat elementen niet mechanisch inschuiven. */
export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

const normaliseerWoord = (w: string) =>
  w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/**
 * Bepaalt per element wanneer het in beeld komt: op het moment dat de
 * voice-over zijn label uitspreekt.
 *
 * De stem wordt uit precies deze tekst gegenereerd, dus de positie van een woord
 * in de zin is een betrouwbare schatting van het moment waarop het klinkt. Staat
 * het label niet letterlijk in de tekst, dan valt het element terug op een
 * gelijkmatige verdeling — beter iets te vroeg dan willekeurig.
 *
 * Er zit bewust een kleine voorsprong (LEAD) in: een element dat exact op het
 * woord begint te bewegen, staat er pas ná het woord. Nu valt het aankomen samen
 * met het uitspreken.
 */
const LEAD = 0.35;
const MIN_GAT = 0.45;

export function elementTijden(labels: string[], voiceover: string, duur: number): number[] {
  const n = labels.length;
  if (n === 0) return [];
  const woorden = (voiceover || "").trim().split(/\s+/).filter(Boolean);
  const genormaliseerd = woorden.map(normaliseerWoord);
  const veilig = Math.max(1.2, duur);

  const ruw = labels.map((label, i) => {
    const val = (label || "").trim();
    // Gelijkmatige verdeling over de eerste twee derde van de scene.
    const terugval = 0.5 + (i * (veilig * 0.66)) / Math.max(1, n);
    if (!val || woorden.length === 0) return terugval;
    // We zoeken op het langste woord van het label: "sociale zekerheid" vindt
    // eerder een treffer op "zekerheid" dan op het algemene "sociale".
    const delen = val.split(/\s+/).map(normaliseerWoord).filter(Boolean).sort((a, b) => b.length - a.length);
    for (const deel of delen) {
      if (deel.length < 4) continue;
      const idx = genormaliseerd.findIndex((w) => w.includes(deel) || deel.includes(w));
      if (idx >= 0) {
        const aandeel = idx / Math.max(1, woorden.length);
        return Math.max(0, aandeel * veilig - LEAD);
      }
    }
    return terugval;
  });

  // Twee elementen die praktisch tegelijk verschijnen lezen als één sprong.
  // Ze houden hun volgorde, maar krijgen minimaal MIN_GAT ruimte.
  const tijden = [...ruw];
  for (let i = 1; i < tijden.length; i++) {
    if (tijden[i] < tijden[i - 1] + MIN_GAT) tijden[i] = tijden[i - 1] + MIN_GAT;
  }
  // Alles moet binnen de scene vallen, met wat lucht aan het eind.
  const laatste = tijden[tijden.length - 1];
  const ruimte = veilig - 0.4;
  if (laatste > ruimte) {
    const factor = ruimte / Math.max(0.01, laatste);
    for (let i = 0; i < tijden.length; i++) tijden[i] *= factor;
  }
  return tijden.map((t) => Math.max(0, t));
}

/** Hoe ver een element op tijdstip t is: 0 = nog niet, 1 = volledig in beeld. */
const VERSCHIJN_DUUR = 0.55;
export function verschijning(t: number, at: number): number {
  return easeOut((t - at) / VERSCHIJN_DUUR);
}

/**
 * Korte nadruk op het moment dat de stem het element noemt: een klein zetje in
 * grootte, vlak na het verschijnen. Geeft 0 buiten dat venster.
 */
export function nadruk(t: number, at: number): number {
  const d = t - at - VERSCHIJN_DUUR;
  if (d < 0 || d > 0.45) return 0;
  return Math.sin((d / 0.45) * Math.PI);
}

// ── Iconen ─────────────────────────────────────────────────────────────────
//
// Bewust opgebouwd uit rechthoeken, cirkels en driehoeken in plaats van
// handgeschreven bezierpaden: dat past bij de vlakke stijl, is leesbaar op elk
// formaat, en je kunt het lezen en aanpassen zonder een tekenprogramma.
// Elk icoon tekent binnen een vak van 100×100 met de oorsprong linksboven.

type IcoonTekenaar = (k: OverheidKleuren) => string;

const r = (x: number, y: number, w: number, h: number, fill: string, rx = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const c = (cx: number, cy: number, rr: number, fill: string) =>
  `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${fill}"/>`;
const pad = (d: string, fill: string) => `<path d="${d}" fill="${fill}"/>`;

export const ICONEN: Record<string, IcoonTekenaar> = {
  // ── documenten en post ──
  koffer: (k) => [
    r(36, 18, 28, 12, k.accent, 4),
    r(41, 23, 18, 5, k.vlak, 2),
    r(14, 28, 72, 54, k.accent, 8),
    r(14, 46, 72, 8, k.donker),
    r(45, 44, 10, 12, k.donker, 2),
  ].join(""),
  document: (k) => [
    r(24, 12, 52, 76, k.papier, 4),
    pad("M60 12 L76 28 L60 28 Z", k.mint),
    r(34, 34, 32, 5, k.donker),
    r(34, 46, 32, 5, k.blauw),
    r(34, 58, 22, 5, k.blauw),
  ].join(""),
  envelop: (k) => [
    r(14, 26, 72, 48, k.blauw, 4),
    pad("M14 30 L50 56 L86 30 L86 26 L14 26 Z", k.donker),
    r(24, 58, 30, 8, k.paneel, 2),
  ].join(""),
  pasje: (k) => [
    // Nederlands rijbewijs: roze pasje in liggend creditcardformaat.
    r(10, 28, 80, 46, k.roze, 6),
    c(31, 46, 9, k.paneel),
    pad("M22 62 a9 9 0 0 1 18 0 Z", k.paneel),
    r(48, 40, 32, 5, k.paneel),
    r(48, 50, 32, 5, k.paneel),
    r(48, 60, 20, 5, k.paneel),
  ].join(""),
  formulier: (k) => [
    r(22, 12, 56, 76, k.papier, 4),
    r(32, 26, 36, 6, k.donker),
    c(35, 46, 5, k.blauw),
    r(45, 43, 24, 6, k.donker),
    c(35, 64, 5, k.blauw),
    r(45, 61, 24, 6, k.donker),
  ].join(""),
  // ── geld ──
  munt: (k) => [c(50, 50, 34, k.accent), c(50, 50, 26, k.papier), r(44, 32, 12, 36, k.accent)].join("") +
    `<text x="50" y="63" font-size="34" font-weight="700" text-anchor="middle" fill="${k.accent}">€</text>`,
  stapel: (k) => [
    r(20, 62, 60, 14, k.accent, 7),
    r(24, 46, 52, 14, k.accent, 7),
    r(30, 30, 40, 14, k.accent, 7),
    r(36, 14, 28, 14, k.accent, 7),
  ].join(""),
  portemonnee: (k) => [r(14, 28, 72, 48, k.donker, 8), r(56, 44, 30, 16, k.accent, 6), c(66, 52, 5, k.donker)].join(""),
  // ── wonen en gebouwen ──
  huis: (k) => [
    pad("M50 12 L88 44 L78 44 L78 86 L22 86 L22 44 L12 44 Z", k.donker),
    r(34, 56, 14, 30, k.accent),
    r(56, 56, 14, 14, k.blauw),
  ].join(""),
  rijtjeshuizen: (k) => [
    // Rijtjeshuizen: identieke smalle gevels tegen elkaar, met puntdaken.
    pad("M8 40 L26 22 L44 40 L44 86 L8 86 Z", k.donker),
    pad("M32 40 L50 22 L68 40 L68 86 L32 86 Z", k.blauw),
    pad("M56 40 L74 22 L92 40 L92 86 L56 86 Z", k.donker),
    r(16, 52, 10, 12, k.paneel), r(40, 52, 10, 12, k.paneel), r(64, 52, 10, 12, k.paneel),
    r(18, 70, 8, 16, k.accent), r(42, 70, 8, 16, k.accent), r(66, 70, 8, 16, k.accent),
  ].join(""),
  gebouw: (k) => [
    r(18, 24, 64, 62, k.donker, 3),
    r(28, 36, 12, 12, k.paneel), r(46, 36, 12, 12, k.paneel), r(64, 36, 12, 12, k.paneel),
    r(28, 56, 12, 12, k.paneel), r(64, 56, 12, 12, k.paneel),
    r(44, 58, 16, 28, k.accent, 2),
  ].join(""),
  loket: (k) => [
    // Balie met een medewerker erachter: hoofd, schouders, en een blad ervoor.
    r(10, 16, 80, 44, k.papier, 4),
    c(50, 34, 11, k.donker),
    pad("M34 58 a16 16 0 0 1 32 0 Z", k.blauw),
    r(6, 58, 88, 12, k.donker, 4),
    r(14, 70, 72, 16, k.blauw, 3),
  ].join(""),
  // ── mensen ──
  persoon: (k) => [c(50, 30, 16, k.donker), pad("M22 86 a28 28 0 0 1 56 0 Z", k.blauw)].join(""),
  groep: (k) => [
    c(30, 34, 13, k.donker), pad("M8 82 a22 22 0 0 1 44 0 Z", k.blauw),
    c(70, 34, 13, k.accent), pad("M48 82 a22 22 0 0 1 44 0 Z", k.mint),
  ].join(""),
  handen: (k) => [
    pad("M20 86 L20 50 a8 8 0 0 1 16 0 L36 40 a8 8 0 0 1 16 0 L52 44 a8 8 0 0 1 16 0 L68 86 Z", k.accent),
  ].join(""),
  // ── zorg, onderwijs, zekerheid ──
  hart: (k) => [pad("M50 84 C10 56 16 24 40 24 C48 24 50 32 50 32 C50 32 52 24 60 24 C84 24 90 56 50 84 Z", k.roze)].join(""),
  kruis: (k) => [c(50, 50, 36, k.papier), r(42, 26, 16, 48, k.roze, 3), r(26, 42, 48, 16, k.roze, 3)].join(""),
  boek: (k) => [
    r(16, 24, 68, 56, k.blauw, 4),
    r(46, 24, 8, 56, k.donker),
    r(24, 36, 18, 5, k.paneel), r(58, 36, 18, 5, k.paneel),
    r(24, 48, 18, 5, k.paneel), r(58, 48, 18, 5, k.paneel),
  ].join(""),
  schild: (k) => [
    pad("M50 12 L84 24 L84 52 C84 72 68 84 50 90 C32 84 16 72 16 52 L16 24 Z", k.blauw),
    pad("M36 50 L46 60 L66 38 L72 44 L46 72 L30 56 Z", k.paneel),
  ].join(""),
  // ── tijd en proces ──
  klok: (k) => [c(50, 50, 36, k.papier), r(47, 24, 6, 28, k.donker, 3), r(50, 47, 22, 6, k.blauw, 3),
    `<circle cx="50" cy="50" r="36" fill="none" stroke="${k.donker}" stroke-width="6"/>`].join(""),
  kalender: (k) => [
    r(14, 22, 72, 64, k.papier, 6),
    r(14, 22, 72, 18, k.donker, 6),
    r(28, 14, 8, 16, k.donker, 3), r(64, 14, 8, 16, k.donker, 3),
    r(26, 50, 14, 12, k.blauw, 2), r(46, 50, 14, 12, k.accent, 2), r(66, 50, 12, 12, k.blauw, 2),
  ].join(""),
  vinkje: (k) => [c(50, 50, 36, k.mint), pad("M32 50 L44 62 L70 36 L78 44 L44 78 L24 58 Z", k.paneel)].join(""),
  waarschuwing: (k) => [pad("M50 12 L92 84 L8 84 Z", k.accent), r(45, 36, 10, 26, k.donker, 4), c(50, 72, 6, k.donker)].join(""),
  laptop: (k) => [r(20, 24, 60, 40, k.donker, 4), r(26, 30, 48, 28, k.blauw), r(10, 66, 80, 8, k.donker, 4)].join(""),
  // ── verkeer ──
  fiets: (k) => [
    `<circle cx="26" cy="66" r="18" fill="none" stroke="${k.donker}" stroke-width="6"/>`,
    `<circle cx="74" cy="66" r="18" fill="none" stroke="${k.donker}" stroke-width="6"/>`,
    pad("M26 66 L44 40 L64 40 L74 66 L44 66 Z", k.blauw),
    r(40, 32, 22, 6, k.donker, 3),
  ].join(""),
  auto: (k) => [
    pad("M14 62 L22 40 L78 40 L86 62 Z", k.blauw),
    r(10, 60, 80, 16, k.donker, 6),
    c(28, 78, 8, k.donker), c(72, 78, 8, k.donker),
    r(38, 80, 24, 8, k.accent, 2),
  ].join(""),
  // Neutrale terugval, zodat een onbekend icoon nooit een gat achterlaat.
  vlak: (k) => [c(50, 50, 32, k.blauw)].join(""),
};

// De illustrator (lib/infographics/illustrator.ts) tekent rijker dan de
// pictogrammen hierboven: hele figuren, gebouwen met diepte, een schatkist. Waar
// hij een betere tekening heeft, wint die. De oude sleutels blijven bestaan —
// bestaande projecten verwijzen ernaar en de AI kent ze uit zijn keuzelijst.
export const ICONEN_COMPLEET: Record<string, (k: OverheidKleuren, o?: TekenOpties) => string> = {
  ...ICONEN,
  ...TEKENINGEN,
  persoon: (k, o) => TEKENINGEN.figuur(k, o),
  handen: (k, o) => TEKENINGEN.hand(k, o),
  huis: (k, o) => TEKENINGEN.rijtjeshuis(k, o),
  stapel: (k, o) => TEKENINGEN.muntstapel(k, o),
  // Een groep is twee figuren naast elkaar, met verschillende huid en kleding —
  // één tekening tweemaal neerzetten leest als een kloon.
  groep: (k) =>
    `<g transform="translate(-14, 8) scale(0.78)">${TEKENINGEN.figuur(k, { huid: 0, haar: 0, kleding: k.blauw })}</g>` +
    `<g transform="translate(38, 8) scale(0.78)">${TEKENINGEN.figuur(k, { huid: 3, haar: 1, kleding: k.roze, variant: 1 })}</g>`,
};

export const ICOON_SLEUTELS = Object.keys(ICONEN_COMPLEET);

/**
 * Waar elk icoon voor staat, in gewone taal.
 *
 * De regie kreeg eerst alleen de kale sleutels te zien en koos daardoor "vlak"
 * voor een rijbewijs — terwijl "pasje" precies dat is. Een sleutel zonder
 * betekenis is voor een taalmodel net zo leeg als voor een mens.
 */
export const ICOON_OMSCHRIJVING: Record<string, string> = {
  koffer: "koffer, aktetas, begroting, Prinsjesdag",
  document: "document, rapport, brief, aanvraag, formulier op papier",
  envelop: "post, brief, blauwe envelop van de Belastingdienst",
  pasje: "rijbewijs, identiteitskaart, pasje, legitimatie",
  formulier: "formulier, checklist, regels, controle, administratie",
  munt: "euro, geld, bedrag, kosten",
  stapel: "stapel geld, budget, uitkering, bijstand, subsidie",
  portemonnee: "portemonnee, inkomen, koopkracht",
  huis: "huis, woning, wonen, hypotheek",
  rijtjeshuizen: "woonwijk, straat, buurt, woningmarkt",
  gebouw: "instantie, kantoor, organisatie, ministerie",
  loket: "gemeente, loket, balie, hulp aanvragen, dienstverlening",
  persoon: "één persoon, burger, inwoner, medewerker",
  groep: "groep mensen, jongeren, gezinnen, iedereen, samenleving",
  handen: "helpen, ondersteunen, mantelzorg, vertrouwen, samenwerken",
  hart: "zorg, gezondheid, welzijn, aandacht",
  kruis: "zorg, ziekenhuis, medisch, huisarts",
  boek: "onderwijs, school, studie, kennis, wet",
  schild: "zekerheid, bescherming, veiligheid, garantie, vertrouwen",
  klok: "tijd, wachttijd, termijn, duur, sneller",
  kalender: "datum, jaar, periode, ingangsdatum, planning",
  vinkje: "goedgekeurd, klaar, voldoet, akkoord",
  waarschuwing: "let op, probleem, risico, uitzondering",
  laptop: "online, digitaal aanvragen, website, DigiD",
  fiets: "fiets, vervoer, dagelijks leven",
  auto: "auto, vervoer, rijden",
  vlak: "neutrale vorm, als niets anders past",
  // De rijkere tekeningen uit de illustrator.
  figuur: "één persoon ten voeten uit, met gezicht en kleding",
  hand: "hand die vanaf de rand het beeld in komt, iets aanreikt of aanwijst",
  schatkist: "de schatkist van de rijksbegroting, met wapenschild",
  kerk: "kerk, monument, historisch gebouw",
  fabriek: "industrie, uitstoot, bedrijven, energie",
  kantoor: "kantoor, bedrijf, werkgever",
  stadhuis: "overheid, ministerie, rechtspraak, instituut",
  bord: "presentatie, uitleg, cijfers op een bord",
  kaart: "Nederland, het hele land, landelijk",
  boom: "natuur, groen, buiten, leefomgeving",
  wolk: "lucht, weer, buiten (alleen als decor)",
  rijtjeshuis: "één huis, woning, koopwoning",
  muntstapel: "stapel munten, bedrag, budget",
};

/** De iconenlijst zoals de AI hem moet zien: sleutel plus waar hij voor staat. */
export function icoonKeuzelijst(): string[] {
  return ICOON_SLEUTELS.map((k) => `${k} (${ICOON_OMSCHRIJVING[k] ?? k})`);
}

function tekenIcoon(sleutel: string, k: OverheidKleuren, x: number, y: number, maat: number, o?: TekenOpties): string {
  const tekenaar = ICONEN_COMPLEET[sleutel] ?? ICONEN.vlak;
  const s = maat / 100;
  return `<g transform="translate(${x}, ${y}) scale(${s})">${tekenaar(k, o)}</g>`;
}

// ── Tekst ──────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function tekst(
  inhoud: string,
  x: number,
  y: number,
  grootte: number,
  kleur: string,
  opts: { anchor?: string; gewicht?: number; font?: string } = {}
): string {
  if (!inhoud.trim()) return "";
  return (
    `<text x="${x}" y="${y}" font-family="${opts.font ?? "Inter"}" font-size="${grootte}" ` +
    `font-weight="${opts.gewicht ?? 700}" fill="${kleur}" text-anchor="${opts.anchor ?? "middle"}">${esc(inhoud)}</text>`
  );
}

/** Breekt een label over maximaal twee regels, zodat het onder het icoon past. */
function regels(label: string, maxTekens: number): string[] {
  const woorden = label.trim().split(/\s+/).filter(Boolean);
  if (woorden.length === 0) return [];
  const uit: string[] = [];
  let huidig = "";
  for (const w of woorden) {
    if (huidig && (huidig + " " + w).length > maxTekens) {
      uit.push(huidig);
      huidig = w;
      if (uit.length === 1 && woorden.indexOf(w) < woorden.length - 1) continue;
    } else huidig = huidig ? `${huidig} ${w}` : w;
  }
  if (huidig) uit.push(huidig);
  return uit.slice(0, 2);
}

// ── De sjablonen ───────────────────────────────────────────────────────────

interface TekenContext {
  W: number;
  H: number;
  k: OverheidKleuren;
  t: number;
  tijden: number[];
  font: string;
}

/** Eén element: paneel, icoon en label, met verschijn- en nadrukanimatie. */
function elementBlok(
  el: OverheidElement,
  ctx: TekenContext,
  i: number,
  x: number,
  y: number,
  breedte: number,
  hoogte: number,
  metPaneel: boolean
): string {
  const at = ctx.tijden[i] ?? 0;
  // Het PANEEL komt vroeg, de INHOUD op het woord. Anders kijk je het eerste deel
  // van de scene naar een leeg grijs vlak: een label als "zekerheid" valt pas aan
  // het eind van de zin, en dan staat er tot die tijd niets. Zo bouwt het kader
  // zich meteen op en vult het zich terwijl de stem vertelt — precies zoals een
  // motion-graphics uitleg werkt.
  const paneelAt = Math.min(0.2 + i * 0.18, at);
  const pe = verschijning(ctx.t, paneelAt);
  if (pe <= 0) return "";
  const e = verschijning(ctx.t, at);
  const n = nadruk(ctx.t, at);
  const schaal = 0.94 + 0.06 * pe + 0.05 * n;
  const omhoog = (1 - pe) * hoogte * 0.12;
  const cx = x + breedte / 2;
  const cy = y + hoogte / 2;

  // Het icoon vult de ruimte die het label overlaat. Eerder was het een vaste
  // fractie van de hoogte, waardoor het in een laag paneel tot een stipje kromp.
  const labelRegels = regels(el.label ?? "", 16);
  const labelGrootte = Math.max(20, Math.min(42, breedte * 0.115));
  const rand = Math.min(breedte, hoogte) * 0.1;
  const labelHoogte = labelRegels.length ? labelRegels.length * labelGrootte * 1.2 : 0;
  const beschikbaar = Math.max(20, hoogte - labelHoogte - rand * 2);
  const icoonMaat = Math.min(breedte * 0.62, beschikbaar * 0.95);
  const icoonY = y + rand + (beschikbaar - icoonMaat) / 2;
  // Basislijn van de eerste labelregel: het blok labels hangt onderaan.
  const labelY = y + hoogte - rand - labelHoogte + labelGrootte;

  const paneel = metPaneel
    ? `<rect x="${x}" y="${y}" width="${breedte}" height="${hoogte}" rx="${Math.min(28, breedte * 0.08)}" fill="${ctx.k.paneel}" opacity="${pe.toFixed(3)}"/>`
    : "";
  // De inhoud schuift een klein stukje op vanuit onder, op zijn eigen moment.
  const inhoud = (binnen: string) =>
    e <= 0 ? "" : `<g opacity="${e.toFixed(3)}" transform="translate(0, ${((1 - e) * hoogte * 0.06).toFixed(1)})">${binnen}</g>`;

  // Een breed, laag paneel vraagt om icoon NAAST de tekst. Met de staande opbouw
  // (icoon boven label) bleef daar bijna geen hoogte over voor het icoon en werd
  // het een stipje in een verder lege balk.
  const liggend = breedte > hoogte * 1.6 && labelRegels.length > 0;
  if (liggend) {
    const maat = Math.min(hoogte - rand * 2, breedte * 0.3);
    const icoonX = x + rand * 1.4;
    const tekstX = icoonX + maat + rand * 1.2;
    const blokHoogte = labelRegels.length * labelGrootte * 1.2;
    const eersteY = cy - blokHoogte / 2 + labelGrootte * 0.85;
    return (
      `<g transform="translate(${cx}, ${cy + omhoog}) scale(${schaal.toFixed(3)}) translate(${-cx}, ${-cy})">` +
      paneel +
      inhoud(
        tekenIcoon(el.icoon, ctx.k, icoonX, cy - maat / 2, maat) +
          labelRegels
            .map((rg, li) =>
              tekst(rg, tekstX, eersteY + li * labelGrootte * 1.2, labelGrootte, ctx.k.donker, { font: ctx.font, anchor: "start" })
            )
            .join("")
      ) +
      `</g>`
    );
  }

  const icoon = tekenIcoon(el.icoon, ctx.k, cx - icoonMaat / 2, icoonY, icoonMaat);
  const labels = labelRegels
    .map((rg, li) => tekst(rg, cx, labelY + li * labelGrootte * 1.2, labelGrootte, ctx.k.donker, { font: ctx.font }))
    .join("");

  return (
    `<g transform="translate(${cx}, ${cy + omhoog}) scale(${schaal.toFixed(3)}) translate(${-cx}, ${-cy})">` +
    `${paneel}${inhoud(icoon + labels)}</g>`
  );
}

/** Pijl van links naar rechts die zichzelf tekent zodra hij aan de beurt is. */
function pijl(ctx: TekenContext, x1: number, x2: number, y: number, at: number): string {
  const e = verschijning(ctx.t, at);
  if (e <= 0) return "";
  const lengte = (x2 - x1) * e;
  const punt = x1 + lengte;
  const dikte = Math.max(8, ctx.H * 0.014);
  return (
    `<g opacity="${Math.min(1, e * 1.4).toFixed(3)}">` +
    `<rect x="${x1}" y="${y - dikte / 2}" width="${Math.max(0, lengte - dikte * 1.6)}" height="${dikte}" rx="${dikte / 2}" fill="${ctx.k.blauw}"/>` +
    `<path d="M${punt - dikte * 1.8} ${y - dikte * 1.5} L${punt} ${y} L${punt - dikte * 1.8} ${y + dikte * 1.5} Z" fill="${ctx.k.blauw}"/>` +
    `</g>`
  );
}

function sjabloonRij(ctx: TekenContext, layout: OverheidLayout, metPaneel = true): string {
  const els = layout.elementen.slice(0, 4);
  const n = Math.max(1, els.length);
  const marge = ctx.W * 0.07;
  const tussen = ctx.W * 0.03;
  const totaal = ctx.W - marge * 2 - tussen * (n - 1);
  const breedte = totaal / n;
  const hoogte = Math.min(ctx.H * 0.56, breedte * 1.25);
  const y = ctx.H * 0.5 - hoogte / 2 + ctx.H * 0.04;
  return els
    .map((el, i) => elementBlok(el, ctx, i, marge + i * (breedte + tussen), y, breedte, hoogte, metPaneel))
    .join("");
}

function sjabloonCentraal(ctx: TekenContext, layout: OverheidLayout): string {
  const el = layout.elementen[0];
  if (!el) return "";
  const at = ctx.tijden[0] ?? 0;
  // De boog is het kader van deze scene en komt dus meteen, niet pas op het woord.
  const e = verschijning(ctx.t, Math.min(0.25, at));
  if (e <= 0) return "";
  // De witte boog uit de voorbeeldvideo, als achtergrond van het onderwerp. De
  // straal volgt de hoogte, want met een breedte-gebaseerde straal liep de boog
  // in liggend formaat dwars door de titel heen.
  const boogBasis = ctx.H * 0.78;
  const boogR = Math.min(ctx.W * 0.26, ctx.H * 0.34);
  const boog =
    `<path d="M${ctx.W / 2 - boogR} ${boogBasis} a${boogR} ${boogR} 0 0 1 ${boogR * 2} 0 Z" fill="${ctx.k.paneel}" opacity="${(e * 0.95).toFixed(3)}"/>`;
  // Het onderwerp staat in de boog, het label eronder op het grijze vlak.
  const breedte = boogR * 1.5;
  const hoogte = ctx.H * 0.56;
  return boog + elementBlok(el, ctx, 0, ctx.W / 2 - breedte / 2, boogBasis - boogR * 0.95, breedte, hoogte, false);
}

function sjabloonStroom(ctx: TekenContext, layout: OverheidLayout): string {
  const els = layout.elementen.slice(0, 3);
  if (els.length === 0) return "";
  const bron = els[0];
  const doelen = els.slice(1);
  const blokB = ctx.W * 0.26;
  const blokH = ctx.H * 0.44;
  const y = ctx.H * 0.5 - blokH / 2 + ctx.H * 0.03;
  const links = ctx.W * 0.06;
  const rechtsX = ctx.W * 0.58;

  let uit = elementBlok(bron, ctx, 0, links, y, blokB, blokH, true);
  // De verbinding komt tussen bron en eerste doel in beeld.
  const pijlAt = ((ctx.tijden[0] ?? 0) + (ctx.tijden[1] ?? 0.8)) / 2;
  uit += pijl(ctx, links + blokB + ctx.W * 0.02, rechtsX - ctx.W * 0.02, ctx.H * 0.5, pijlAt);

  const dH = doelen.length > 1 ? blokH * 0.46 : blokH;
  doelen.forEach((el, i) => {
    const dy = doelen.length > 1 ? y + i * (dH + ctx.H * 0.05) : y;
    uit += elementBlok(el, ctx, i + 1, rechtsX, dy, ctx.W * 0.34, dH, true);
  });
  return uit;
}

function sjabloonVergelijking(ctx: TekenContext, layout: OverheidLayout): string {
  const els = layout.elementen.slice(0, 2);
  if (els.length === 0) return "";
  const breedte = ctx.W * 0.4;
  const hoogte = ctx.H * 0.56;
  const y = ctx.H * 0.5 - hoogte / 2 + ctx.H * 0.04;
  const scheiding =
    verschijning(ctx.t, ctx.tijden[0] ?? 0) > 0.6
      ? `<rect x="${ctx.W / 2 - 2}" y="${ctx.H * 0.18}" width="4" height="${ctx.H * 0.64}" fill="${ctx.k.donker}" opacity="0.18"/>`
      : "";
  return (
    scheiding +
    els.map((el, i) => elementBlok(el, ctx, i, i === 0 ? ctx.W * 0.06 : ctx.W * 0.54, y, breedte, hoogte, true)).join("")
  );
}

function sjabloonGroei(ctx: TekenContext, layout: OverheidLayout): string {
  const els = layout.elementen.slice(0, 4);
  const n = Math.max(1, els.length);
  const marge = ctx.W * 0.1;
  const tussen = ctx.W * 0.04;
  const breedte = (ctx.W - marge * 2 - tussen * (n - 1)) / n;
  const basis = ctx.H * 0.78;
  const maxH = ctx.H * 0.5;
  const waarden = els.map((e) => Math.max(5, Math.min(100, e.waarde ?? 60)));
  const grootste = Math.max(...waarden, 1);

  const grond = `<rect x="${marge - 20}" y="${basis}" width="${ctx.W - (marge - 20) * 2}" height="6" rx="3" fill="${ctx.k.donker}" opacity="0.25"/>`;
  const staven = els
    .map((el, i) => {
      const at = ctx.tijden[i] ?? 0;
      const e = verschijning(ctx.t, at);
      if (e <= 0) return "";
      const h = (waarden[i] / grootste) * maxH * e;
      const x = marge + i * (breedte + tussen);
      const kleur = i % 2 === 0 ? ctx.k.blauw : ctx.k.accent;
      const labelGrootte = Math.max(18, Math.min(34, breedte * 0.16));
      return (
        `<g opacity="${Math.min(1, e * 1.3).toFixed(3)}">` +
        `<rect x="${x}" y="${basis - h}" width="${breedte}" height="${h}" rx="${Math.min(16, breedte * 0.1)}" fill="${kleur}"/>` +
        tekst(String(el.waarde ?? ""), x + breedte / 2, basis - h - 18, labelGrootte, ctx.k.donker, { font: ctx.font }) +
        regels(el.label ?? "", 14)
          .map((rg, li) => tekst(rg, x + breedte / 2, basis + 40 + li * labelGrootte * 1.15, labelGrootte, ctx.k.donker, { font: ctx.font }))
          .join("") +
        `</g>`
      );
    })
    .join("");
  return grond + staven;
}

/**
 * Een tafereel: een echte scène in plaats van kaartjes naast elkaar.
 *
 * Het rekenwerk staat in lib/infographics/tafereel.ts — maatverhoudingen, diepte
 * en het vasthouden van objecten. Hier vertalen we alleen de scene-opbouw naar
 * wat die composer nodig heeft.
 */
function sjabloonTafereel(ctx: TekenContext, layout: OverheidLayout): string {
  const els = layout.elementen.slice(0, 4);
  if (els.length === 0) return "";

  // Zonder expliciete plek verdelen we de elementen over de breedte, met het
  // eerste (het onderwerp) in het midden en de rest eromheen.
  const standaardX = [0.5, 0.17, 0.83, 0.33];
  const geldstroom = els.some((e) =>
    ["munt", "stapel", "muntstapel", "schatkist", "portemonnee", "koffer"].includes(e.icoon)
  );

  return bouwTafereel(
    {
      geldstroom,
      buiten: layout.buiten ?? false,
      elementen: els.map((el, i) => ({
        asset: el.icoon,
        label: el.label,
        vlak: el.vlak ?? (i === 0 ? "midden" : i === 3 ? "voor" : "achter"),
        x: el.x ?? standaardX[i] ?? 0.5,
        houdt: el.houdt ?? null,
        // Het eerste element is het onderwerp van de scene.
        focus: i === 0 && (el.vlak ?? "midden") !== "achter",
        variant: i === 1 ? 1 : 0,
        huid: i,
        haar: i,
        // Kleding alleen aan mensen meegeven. Anders kreeg een huis de kledingkleur
        // van "persoon 2" en stond er een mintgroene woning in beeld.
        kleding: ["figuur", "persoon", "groep", "hand", "handen"].includes(el.icoon)
          ? (i === 1 ? ctx.k.mint : i === 2 ? ctx.k.roze : ctx.k.blauw)
          : undefined,
      })),
    },
    {
      W: ctx.W,
      H: ctx.H,
      k: ctx.k,
      t: ctx.t,
      tijden: ctx.tijden,
      verschijning,
      nadruk,
      label: (tekstInhoud, x, y, grootte) => tekst(tekstInhoud, x, y, grootte, ctx.k.donker, { font: ctx.font }),
    }
  );
}

/** Label onder een tekening, over maximaal twee regels. */
function tekstRegels(label: string, x: number, y: number, grootte: number, ctx: TekenContext): string {
  return regels(label ?? "", 18)
    .map((rg, li) => tekst(rg, x, y + li * grootte * 1.2, grootte, ctx.k.donker, { font: ctx.font }))
    .join("");
}

// ── De scene ───────────────────────────────────────────────────────────────

export interface BouwOpties {
  format: InfographicFormat;
  kleuren?: OverheidKleuren;
  /** Tijd binnen deze scene, in seconden. */
  t: number;
  /** Totale duur van de scene, voor de tijdlijn van de elementen. */
  duur: number;
  /** Voice-over van de scene; bepaalt wanneer welk element verschijnt. */
  voiceover?: string;
  /** Lettertype uit de huisstijl (moet in de export beschikbaar zijn). */
  font?: string;
  /** Merklogo als URL of data-URI, rechtsboven. */
  logoUrl?: string | null;
  /**
   * Meeschalen met de container (browser) in plaats van een vaste pixelmaat.
   *
   * Met een harde width/height rendert de browser de SVG op ware grootte en zie
   * je alleen de linkerbovenhoek — precies wat er in de editor misging. De
   * export wil juist wél een vaste maat, want resvg rastert op pixels.
   */
  schaalbaar?: boolean;
}

/**
 * Bouwt de complete scene als SVG-string. Zowel de preview in de browser als de
 * frame-voor-frame export gebruiken deze functie, zodat wat je ziet exact is wat
 * je exporteert.
 */
export function bouwOverheidSvg(layout: OverheidLayout, opts: BouwOpties): string {
  const { width: W, height: H } = storyCanvasSize(opts.format);
  const k = opts.kleuren ?? STANDAARD_KLEUREN;
  const font = opts.font ?? "Inter";
  const labels = layout.elementen.map((e) => e.label ?? "");
  const tijden = elementTijden(labels, opts.voiceover ?? "", opts.duur);
  const ctx: TekenContext = { W, H, k, t: opts.t, tijden, font };

  const titel = (layout.titel ?? "").trim();
  const titelGrootte = Math.max(34, W * 0.032);
  const titelE = easeOut((opts.t - 0.15) / 0.5);
  const titelBlok = titel
    ? `<g opacity="${titelE.toFixed(3)}" transform="translate(0, ${((1 - titelE) * -20).toFixed(1)})">` +
      tekst(titel, W / 2, H * 0.13, titelGrootte, k.donker, { font, gewicht: 800 }) +
      `</g>`
    : "";

  let inhoud = "";
  switch (layout.template) {
    case "centraal": inhoud = sjabloonCentraal(ctx, layout); break;
    case "stroom": inhoud = sjabloonStroom(ctx, layout); break;
    case "vergelijking": inhoud = sjabloonVergelijking(ctx, layout); break;
    case "groei": inhoud = sjabloonGroei(ctx, layout); break;
    case "tafereel": inhoud = sjabloonTafereel(ctx, layout); break;
    case "rij":
    default: inhoud = sjabloonRij(ctx, layout); break;
  }

  const logo = opts.logoUrl
    ? `<image href="${opts.logoUrl}" x="${W - W * 0.19 - W * 0.04}" y="${H * 0.05}" width="${W * 0.19}" height="${H * 0.08}" preserveAspectRatio="xMaxYMin meet"/>`
    : "";

  const maat = opts.schaalbaar
    ? `width="100%" height="100%" preserveAspectRatio="xMidYMid meet"`
    : `width="${W}" height="${H}"`;
  return (
    `<svg viewBox="0 0 ${W} ${H}" ${maat} xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">` +
    // Titel ná de inhoud: in een tafereel steekt een gebouw zo hoog dat het
    // anders dwars door de kop heen liep.
    `<rect width="${W}" height="${H}" fill="${k.vlak}"/>${inhoud}${titelBlok}${logo}</svg>`
  );
}
