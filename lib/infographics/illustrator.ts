import type { OverheidKleuren } from "@/lib/infographics/overheid-scene";

// DE ILLUSTRATOR.
//
// De eerste versie van de overheidsmodus tekende 27 pictogrammen: een huisje, een
// muntje, een poppetje. Bruikbaar, maar het haalde het niveau van de
// Rijksoverheid-explainers niet. Daar zie je hele figuren met haar en kleding,
// handen die vanaf de rand het beeld in komen, een lint van munten dat over het
// scherm loopt, een schatkist met het rijkswapen.
//
// Dat zijn geen pictogrammen maar TEKENINGEN, en het verschil zit in twee dingen:
//
//  1. Ze zijn samengesteld. Een figuur is geen vast vormpje maar hoofd + haar +
//     romp + armen + benen, elk met een eigen kleur en houding. Daardoor kun je
//     dezelfde persoon in tien scenes anders laten staan zonder tien tekeningen.
//  2. Ze hebben een grondvlak. Een tekening staat ergens op — een blauwe balk,
//     een grasrand — en dat maakt het verschil tussen "een icoon" en "een beeld".
//
// Alles hieronder is opgebouwd uit rechthoeken, cirkels, driehoeken en paden.
// Geen enkel getekend detail komt uit een model, dus er kan ook niets vervormen.
// Coördinaten staan op een vak van 100×100 met de oorsprong linksboven, tenzij
// anders vermeld.

// ── Bouwstenen ─────────────────────────────────────────────────────────────

export const r = (x: number, y: number, w: number, h: number, fill: string, rx = 0) =>
  `<rect x="${nf(x)}" y="${nf(y)}" width="${nf(w)}" height="${nf(h)}" rx="${nf(rx)}" fill="${fill}"/>`;
export const c = (cx: number, cy: number, rr: number, fill: string) =>
  `<circle cx="${nf(cx)}" cy="${nf(cy)}" r="${nf(rr)}" fill="${fill}"/>`;
export const el = (cx: number, cy: number, rx: number, ry: number, fill: string) =>
  `<ellipse cx="${nf(cx)}" cy="${nf(cy)}" rx="${nf(rx)}" ry="${nf(ry)}" fill="${fill}"/>`;
export const p = (d: string, fill: string) => `<path d="${d}" fill="${fill}"/>`;
export const g = (inhoud: string, transform?: string, opacity?: number) =>
  `<g${transform ? ` transform="${transform}"` : ""}${opacity != null ? ` opacity="${nf(opacity)}"` : ""}>${inhoud}</g>`;

/** Kort getal: houdt de SVG-string leesbaar en klein. */
function nf(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Huidtinten. De referentievideo laat bewust verschillende mensen zien; met één
 * tint krijg je een tekening die dat niet doet. De volgorde is stabiel, zodat
 * "persoon 2" in elke scene dezelfde tint houdt.
 */
export const HUIDTINTEN = ["#f2c9ae", "#e0a888", "#b97a56", "#6f4630"];

/** Haarkleuren, in dezelfde geest. */
export const HAARKLEUREN = ["#2b2118", "#5a3a22", "#b07b3e", "#8a8a8a"];

export interface TekenOpties {
  /** Index in HUIDTINTEN (wordt omgeslagen als hij te groot is). */
  huid?: number;
  /** Index in HAARKLEUREN. */
  haar?: number;
  /** Kledingkleur; standaard de steunkleur van het palet. */
  kleding?: string;
  /** Variant van de tekening (bijv. haarstijl of gebouwtype). */
  variant?: number;
  /** Voortgang 0-1 voor tekeningen die zelf bewegen. */
  t?: number;
}

const huidVan = (o?: TekenOpties) => HUIDTINTEN[(o?.huid ?? 0) % HUIDTINTEN.length];
const haarVan = (o?: TekenOpties) => HAARKLEUREN[(o?.haar ?? 0) % HAARKLEUREN.length];

export type Tekening = (k: OverheidKleuren, o?: TekenOpties) => string;

// ── Mensen ─────────────────────────────────────────────────────────────────

/**
 * Een staande figuur, ten voeten uit.
 *
 * Opgebouwd zoals een tekenaar het zou doen: benen, romp, armen, hoofd, haar.
 * De armen zijn losse vormen met een eigen hoek, zodat dezelfde figuur kan staan,
 * wijzen of iets aanreiken zonder een tweede tekening.
 */
export const figuur: Tekening = (k, o) => {
  const huid = huidVan(o);
  const kleding = o?.kleding ?? k.blauw;
  const broek = k.donker;
  const variant = o?.variant ?? 0;
  // variant 0 = armen omlaag, 1 = één arm wijst opzij, 2 = beide armen open.
  // Armen draaien om de SCHOUDER, niet om hun eigen hoek: daardoor blijven ze
  // aan het lichaam vastzitten in plaats van ernaast te zweven. De hand rekenen
  // we uit het uiteinde van de arm, zodat hij altijd op de goede plek zit.
  const ARMLENGTE = 30;
  const schouderL = { x: 39, y: 44 };
  const schouderR = { x: 61, y: 44 };
  const arm = (sch: { x: number; y: number }, hoek: number) =>
    g(r(-4.5, 0, 9, ARMLENGTE, kleding, 4.5), `translate(${sch.x}, ${sch.y}) rotate(${hoek})`);
  const handAan = (sch: { x: number; y: number }, hoek: number) => {
    const rad = (hoek * Math.PI) / 180;
    return c(sch.x - Math.sin(rad) * ARMLENGTE, sch.y + Math.cos(rad) * ARMLENGTE, 4.6, huid);
  };
  const hoekL = variant === 2 ? 42 : 10;
  const hoekR = variant === 1 ? -118 : variant === 2 ? -42 : -10;
  const linkerArm = arm(schouderL, hoekL);
  const rechterArm = arm(schouderR, hoekR);
  const hand = handAan(schouderL, hoekL) + handAan(schouderR, hoekR);
  const haarVorm =
    variant % 2 === 0
      ? // Kort haar: kapje over de bovenkant van het hoofd.
        p("M36 18 a14 14 0 0 1 28 0 L64 24 a14 10 0 0 0 -28 0 Z", haarVan(o))
      : // Knot: kapje plus bolletje erboven, zoals de docent in de referentie.
        p("M36 18 a14 14 0 0 1 28 0 L64 26 a14 12 0 0 0 -28 0 Z", haarVan(o)) + c(50, 4, 6, haarVan(o));

  return [
    // Benen
    r(40, 68, 8, 26, broek, 3),
    r(52, 68, 8, 26, broek, 3),
    r(38, 92, 12, 5, k.donker, 2),
    r(50, 92, 12, 5, k.donker, 2),
    // Romp
    p("M38 42 a12 10 0 0 1 24 0 L64 72 L36 72 Z", kleding),
    linkerArm,
    rechterArm,
    hand,
    // Hoofd en hals
    r(46, 26, 8, 8, huid),
    c(50, 20, 13, huid),
    haarVorm,
    // Ogen: twee stippen. Zonder gezicht leest een figuur als een pictogram;
    // met twee stippen als iemand — meer is in deze stijl niet nodig.
    c(45, 20, 1.7, "#2b2118"),
    c(55, 20, 1.7, "#2b2118"),
  ].join("");
};

/**
 * Een hand die vanaf de rand het beeld in komt, met mouw.
 *
 * Dit is hét handelsmerk van deze stijl: iets wordt aangereikt, vastgehouden of
 * aangewezen door een hand die half buiten beeld begint. Tekent van onder naar
 * boven binnen het vak; draai hem met een transform voor een andere richting.
 */
export const handVanRand: Tekening = (k, o) => {
  const huid = huidVan(o);
  const mouw = o?.kleding ?? k.blauw;
  // Vingers wijzen omhoog, pols onderaan; draai het geheel met een transform
  // voor een hand die van links, rechts of boven het beeld in komt.
  const vinger = (x: number, top: number) => r(x, top, 9, 78 - top, huid, 4.5);
  return [
    // Mouw loopt door tot buiten het vak, met een omslag als manchet.
    r(30, 84, 40, 22, mouw, 2),
    r(29, 78, 42, 9, mouw, 4),
    // Pols en handpalm.
    r(32, 62, 36, 22, huid, 6),
    r(30, 40, 40, 34, huid, 12),
    // Vier vingers, de middelste het langst — dat leest meteen als een hand.
    vinger(31, 26),
    vinger(41, 18),
    vinger(51, 22),
    vinger(61, 32),
    // Duim: opzij, iets gedraaid.
    g(r(0, 0, 10, 26, huid, 5), "translate(22, 46) rotate(-28)"),
  ].join("");
};

// ── Gebouwen ───────────────────────────────────────────────────────────────

export const rijtjeshuis: Tekening = (k, o) => {
  const gevel = o?.kleding ?? k.donker;
  return [
    p("M14 44 L50 16 L86 44 L86 92 L14 92 Z", gevel),
    r(22, 52, 16, 14, k.papier, 2),
    r(62, 52, 16, 14, k.papier, 2),
    r(42, 62, 16, 30, k.accent, 2),
    c(54, 78, 1.6, k.donker),
  ].join("");
};

export const kerk: Tekening = (k) =>
  [
    // Schip met puntdak links, toren met spits rechts — de silhouetkerk uit de
    // referentievideo. Ramen met een ronde bovenkant maken hem herkenbaar.
    p("M10 56 L34 36 L58 56 L58 92 L10 92 Z", k.blauw),
    p("M62 30 L74 8 L86 30 Z", k.blauw),
    r(62, 30, 24, 62, k.blauw),
    c(74, 46, 8, k.papier),
    p("M26 70 a8 10 0 0 1 16 0 L42 92 L26 92 Z", k.donker),
    p("M66 62 a5 7 0 0 1 10 0 L76 78 L66 78 Z", k.donker),
    r(4, 88, 92, 6, k.donker, 3),
  ].join("");

export const fabriek: Tekening = (k) =>
  [
    // Rookpluim, schoorsteen en een koeltoren met taille: dat leest als fabriek.
    el(40, 20, 16, 8, "#cfcfcf"),
    el(58, 14, 12, 6, "#dcdcdc"),
    el(26, 26, 10, 5, "#d8d8d8"),
    r(20, 34, 12, 58, k.blauw),
    p("M44 40 L40 62 L38 92 L74 92 L72 62 L68 40 Z", k.donker),
    r(44, 36, 24, 6, k.blauw, 2),
    r(78, 58, 12, 34, k.blauw),
    r(4, 90, 92, 6, k.donker, 3),
  ].join("");

export const kantoor: Tekening = (k) =>
  [
    r(18, 22, 64, 70, k.donker, 3),
    r(28, 34, 12, 12, k.papier), r(46, 34, 12, 12, k.papier), r(64, 34, 12, 12, k.papier),
    r(28, 54, 12, 12, k.papier), r(64, 54, 12, 12, k.papier),
    r(44, 62, 16, 30, k.accent, 2),
  ].join("");

export const stadhuis: Tekening = (k) =>
  [
    // Klassiek overheidsgebouw: trap, zuilen, fronton.
    p("M12 34 L50 12 L88 34 Z", k.donker),
    r(20, 34, 8, 46, k.papier), r(36, 34, 8, 46, k.papier),
    r(56, 34, 8, 46, k.papier), r(72, 34, 8, 46, k.papier),
    r(14, 80, 72, 6, k.donker),
    r(8, 86, 84, 6, k.blauw),
  ].join("");

// ── Objecten ───────────────────────────────────────────────────────────────

/** De schatkist van de rijksbegroting, met wapenschild. */
export const schatkist: Tekening = (k) =>
  [
    r(16, 30, 68, 20, "#9fb6cc", 3),
    r(16, 48, 68, 40, "#8fa9c2", 2),
    r(16, 44, 68, 12, k.donker),
    r(16, 42, 68, 3, k.accent),
    r(46, 40, 8, 18, "#c9d6e3", 2),
    // Vereenvoudigd wapenschild: schild met kroon.
    p("M50 60 L58 63 L58 72 a8 10 0 0 1 -8 8 a8 10 0 0 1 -8 -8 L42 63 Z", k.papier),
    p("M46 56 L50 52 L54 56 Z", k.papier),
  ].join("");

export const koffer: Tekening = (k) =>
  [
    r(36, 16, 28, 12, k.accent, 4),
    r(41, 21, 18, 5, k.vlak, 2),
    r(12, 26, 76, 56, k.accent, 8),
    r(12, 46, 76, 9, k.donker),
    r(44, 44, 12, 13, k.donker, 2),
  ].join("");

export const munt: Tekening = (k) =>
  [c(50, 50, 34, "#e0a10a"), c(50, 50, 29, k.accent), c(50, 50, 21, "#ffd75e")].join("") +
  `<text x="50" y="61" font-size="30" font-weight="800" text-anchor="middle" fill="#b57f06">€</text>`;

export const muntstapel: Tekening = (k) => {
  // Munten op hun kant, met een donkerder rand — zoals de stapels in de video.
  const rijen = [
    { y: 74, b: 62 }, { y: 60, b: 54 }, { y: 46, b: 46 }, { y: 32, b: 38 },
  ];
  return rijen
    .map((rij) =>
      [
        r(50 - rij.b / 2, rij.y, rij.b, 12, "#d99a09", 6),
        r(50 - rij.b / 2, rij.y, rij.b, 8, k.accent, 4),
      ].join("")
    )
    .join("");
};

export const document: Tekening = (k) =>
  [
    r(24, 12, 52, 76, k.papier, 3),
    p("M60 12 L76 28 L60 28 Z", "#c3cfdc"),
    r(34, 36, 30, 5, k.donker, 2),
    r(34, 48, 30, 5, k.blauw, 2),
    r(34, 60, 20, 5, k.blauw, 2),
  ].join("");

export const pasje: Tekening = (k) =>
  [
    // Nederlands rijbewijs: roze pasje, liggend, met pasfoto links.
    r(8, 28, 84, 46, k.roze, 6),
    r(8, 28, 84, 8, "#d979b6", 6),
    r(18, 42, 22, 24, k.papier, 2),
    c(29, 50, 6, "#b97a56"),
    p("M20 66 a9 9 0 0 1 18 0 Z", "#b97a56"),
    r(48, 44, 34, 5, k.papier, 2),
    r(48, 54, 34, 5, k.papier, 2),
    r(48, 64, 22, 5, k.papier, 2),
  ].join("");

export const envelop: Tekening = (k) =>
  [
    r(12, 28, 76, 46, k.blauw, 3),
    p("M12 30 L50 56 L88 30 L88 28 L12 28 Z", k.donker),
    r(22, 58, 30, 8, k.papier, 2),
  ].join("");

export const bord: Tekening = (k) =>
  [
    // Presentatiebord met een oplopende staafgrafiek erop: zo is in één oogopslag
    // te zien dat er iets uitgelegd wordt, in plaats van een leeg donker vlak.
    r(14, 10, 72, 62, k.donker, 6),
    r(22, 46, 10, 18, k.accent, 2),
    r(36, 36, 10, 28, k.mint, 2),
    r(50, 26, 10, 38, k.accent, 2),
    r(64, 18, 10, 46, k.mint, 2),
    r(20, 64, 60, 3, k.papier, 1.5),
    r(46, 72, 8, 18, k.donker),
    r(30, 90, 40, 5, k.donker, 2.5),
  ].join("");

export const laptop: Tekening = (k) =>
  [r(20, 22, 60, 40, k.donker, 4), r(25, 27, 50, 30, k.blauw), r(8, 64, 84, 8, k.donker, 4)].join("");

/** Silhouet van Nederland, sterk vereenvoudigd maar herkenbaar. */
export const kaartNederland: Tekening = (k, o) => {
  const land = o?.kleding ?? k.papier;
  // Nederland in grove lijnen, maar met de vormen waaraan je het herkent: de
  // noordkust met de bocht van het IJsselmeer, Zeeland als gerafelde punt
  // linksonder, en Limburg als smalle staart rechtsonder.
  // Met de klok mee vanaf Den Helder. De verhouding is belangrijker dan de
  // precieze kustlijn: hoger dan breed, een inham bovenin (IJsselmeer), een
  // gerafelde onderkant links (Zeeland) en een smalle staart rechtsonder (Limburg).
  const omtrek =
    "M28 24 L36 20 L40 32 L52 36 L57 24 L62 16 L74 12 L79 22 L75 32 L77 44 " +  // noordkust met IJsselmeerinham
    "L70 52 L74 62 L66 70 L68 80 L62 91 L55 87 L58 76 L49 78 L39 76 L31 73 " +  // oostgrens en Limburgse staart
    "L27 67 L19 65 L26 60 L17 57 L24 51 L22 40 Z";                              // Zeeland en westkust
  return [
    p(omtrek, land),
    // Waddeneilanden als losse streepjes boven de noordkust.
    g(el(0, 0, 5, 1.7, land), "translate(36, 20) rotate(-20)"),
    g(el(0, 0, 4.2, 1.6, land), "translate(47, 15) rotate(-12)"),
    g(el(0, 0, 3.6, 1.5, land), "translate(57, 13) rotate(-6)"),
  ].join("");
};

// ── Decor: de dingen die er een beeld van maken ────────────────────────────

/** De blauwe grondbalk waar in de referentievideo alles op staat. */
export function grondbalk(k: OverheidKleuren, x: number, y: number, breedte: number, dikte = 14): string {
  return r(x, y, breedte, dikte, k.blauw, dikte / 2);
}

/** De witte boog achter het onderwerp. */
export function boog(k: OverheidKleuren, cx: number, basis: number, straal: number, opacity = 1): string {
  return `<path d="M${nf(cx - straal)} ${nf(basis)} a${nf(straal)} ${nf(straal)} 0 0 1 ${nf(straal * 2)} 0 Z" fill="${k.paneel}" opacity="${nf(opacity)}"/>`;
}

/**
 * Het muntlint: een golvende band met munten erop, die over het beeld loopt.
 *
 * Dit is de meest herkenbare beweging uit de referentievideo. De band is één
 * dik pad; de munten worden erlangs verdeeld met een eigen voortgang, zodat ze
 * over het lint lijken te stromen zonder dat er iets vervormt.
 */
export function muntlint(
  k: OverheidKleuren,
  opts: { x1: number; y1: number; x2: number; y2: number; golf?: number; dikte?: number; munten?: number; t?: number; zichtbaar?: number }
): string {
  const { x1, y1, x2, y2 } = opts;
  const golf = opts.golf ?? Math.min(90, Math.abs(x2 - x1) * 0.22);
  const dikte = opts.dikte ?? 26;
  const aantal = opts.munten ?? 6;
  const zichtbaar = Math.max(0, Math.min(1, opts.zichtbaar ?? 1));
  const t = opts.t ?? 0;

  // Eén kubische bocht: eerst omlaag, dan omhoog — de S-vorm uit de video.
  const c1x = x1 + (x2 - x1) * 0.33, c1y = y1 + golf;
  const c2x = x1 + (x2 - x1) * 0.66, c2y = y2 - golf;
  const pad = `M${nf(x1)} ${nf(y1)} C${nf(c1x)} ${nf(c1y)}, ${nf(c2x)} ${nf(c2y)}, ${nf(x2)} ${nf(y2)}`;

  // Positie op een kubische bezier, om de munten netjes op de band te zetten.
  const punt = (u: number) => {
    const m = 1 - u;
    return {
      x: m * m * m * x1 + 3 * m * m * u * c1x + 3 * m * u * u * c2x + u * u * u * x2,
      y: m * m * m * y1 + 3 * m * m * u * c1y + 3 * m * u * u * c2y + u * u * u * y2,
    };
  };

  const band =
    `<path d="${pad}" fill="none" stroke="${k.accent}" stroke-width="${nf(dikte)}" stroke-linecap="round" ` +
    `pathLength="1" stroke-dasharray="1" stroke-dashoffset="${nf(1 - zichtbaar)}"/>`;

  const munten: string[] = [];
  for (let i = 0; i < aantal; i++) {
    // De munten schuiven langzaam op; wie voorbij het eind gaat, komt vooraan terug.
    const u = ((i / aantal + t * 0.12) % 1);
    if (u > zichtbaar) continue;
    const q = punt(u);
    munten.push(c(q.x, q.y, dikte * 0.3, "#ffd75e"));
    munten.push(c(q.x, q.y, dikte * 0.18, "#e8b21c"));
  }
  return band + munten.join("");
}

/** Wolk voor een lucht-band bovenin, als een scene buiten speelt. */
export const wolk: Tekening = (k) =>
  [c(32, 60, 20, k.paneel), c(52, 52, 26, k.paneel), c(74, 62, 18, k.paneel), r(30, 60, 46, 20, k.paneel, 10)].join("");

export const boom: Tekening = (k) =>
  [r(46, 58, 8, 36, "#8a6a4a", 2), c(50, 42, 26, k.mint), c(32, 52, 16, k.mint), c(68, 52, 16, k.mint)].join("");


// ── Basisvormen ────────────────────────────────────────────────────────────
//
// Eenvoudige pictogrammen voor begrippen die geen tekening met diepte nodig
// hebben (een vinkje, een klok, een schild). Ze stonden eerst los in
// overheid-scene.ts, buiten het register om — waardoor ze geen maat hadden en in
// een tafereel allemaal even groot werden getekend.

export const BASIS_TEKENINGEN: Record<string, Tekening> = {
  formulier: (k) => [
    r(22, 12, 56, 76, k.papier, 4),
    r(32, 26, 36, 6, k.donker),
    c(35, 46, 5, k.blauw),
    r(45, 43, 24, 6, k.donker),
    c(35, 64, 5, k.blauw),
    r(45, 61, 24, 6, k.donker),
  ].join(""),
  // ── geld ──
  portemonnee: (k) => [r(14, 28, 72, 48, k.donker, 8), r(56, 44, 30, 16, k.accent, 6), c(66, 52, 5, k.donker)].join(""),
  // ── wonen en gebouwen ──
  rijtjeshuizen: (k) => [
    // Rijtjeshuizen: identieke smalle gevels tegen elkaar, met puntdaken.
    p("M8 40 L26 22 L44 40 L44 86 L8 86 Z", k.donker),
    p("M32 40 L50 22 L68 40 L68 86 L32 86 Z", k.blauw),
    p("M56 40 L74 22 L92 40 L92 86 L56 86 Z", k.donker),
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
    p("M34 58 a16 16 0 0 1 32 0 Z", k.blauw),
    r(6, 58, 88, 12, k.donker, 4),
    r(14, 70, 72, 16, k.blauw, 3),
  ].join(""),
  // ── mensen ──
  hart: (k) => [p("M50 84 C10 56 16 24 40 24 C48 24 50 32 50 32 C50 32 52 24 60 24 C84 24 90 56 50 84 Z", k.roze)].join(""),
  kruis: (k) => [c(50, 50, 36, k.papier), r(42, 26, 16, 48, k.roze, 3), r(26, 42, 48, 16, k.roze, 3)].join(""),
  boek: (k) => [
    r(16, 24, 68, 56, k.blauw, 4),
    r(46, 24, 8, 56, k.donker),
    r(24, 36, 18, 5, k.paneel), r(58, 36, 18, 5, k.paneel),
    r(24, 48, 18, 5, k.paneel), r(58, 48, 18, 5, k.paneel),
  ].join(""),
  schild: (k) => [
    p("M50 12 L84 24 L84 52 C84 72 68 84 50 90 C32 84 16 72 16 52 L16 24 Z", k.blauw),
    p("M36 50 L46 60 L66 38 L72 44 L46 72 L30 56 Z", k.paneel),
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
  vinkje: (k) => [c(50, 50, 36, k.mint), p("M32 50 L44 62 L70 36 L78 44 L44 78 L24 58 Z", k.paneel)].join(""),
  waarschuwing: (k) => [p("M50 12 L92 84 L8 84 Z", k.accent), r(45, 36, 10, 26, k.donker, 4), c(50, 72, 6, k.donker)].join(""),
  fiets: (k) => [
    `<circle cx="26" cy="66" r="18" fill="none" stroke="${k.donker}" stroke-width="6"/>`,
    `<circle cx="74" cy="66" r="18" fill="none" stroke="${k.donker}" stroke-width="6"/>`,
    p("M26 66 L44 40 L64 40 L74 66 L44 66 Z", k.blauw),
    r(40, 32, 22, 6, k.donker, 3),
  ].join(""),
  auto: (k) => [
    p("M14 62 L22 40 L78 40 L86 62 Z", k.blauw),
    r(10, 60, 80, 16, k.donker, 6),
    c(28, 78, 8, k.donker), c(72, 78, 8, k.donker),
    r(38, 80, 24, 8, k.accent, 2),
  ].join(""),
  // Neutrale terugval, zodat een onbekend icoon nooit een gat achterlaat.
  vlak: (k) => [c(50, 50, 32, k.blauw)].join(""),
};

// ── Register ───────────────────────────────────────────────────────────────
//
// De AI kiest een tekening op naam. Deze namen zijn dus een contract: verander
// er geen zonder de omschrijvingen in overheid-scene.ts mee te nemen.

export const TEKENINGEN: Record<string, Tekening> = {
  ...BASIS_TEKENINGEN,
  figuur,
  hand: handVanRand,
  rijtjeshuis,
  kerk,
  fabriek,
  kantoor,
  stadhuis,
  schatkist,
  koffer,
  munt,
  muntstapel,
  document,
  pasje,
  envelop,
  bord,
  laptop,
  kaart: kaartNederland,
  boom,
  wolk,
};
