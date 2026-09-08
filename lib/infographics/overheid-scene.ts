import { storyCanvasSize } from "@/lib/infographics/canvas-size";
import { TEKENINGEN, type TekenOpties } from "@/lib/infographics/illustrator";
import { REGISTER, ASSET_SLEUTELS, assetVan, assetKeuzelijst } from "@/lib/infographics/asset-register";
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

// ── Tekeningen ─────────────────────────────────────────────────────────────
//
// Alles wat getekend kan worden staat in het asset-register: de code-tekeningen
// uit illustrator.ts en de losse SVG-bestanden uit lib/infographics/assets/.
// Deze module kiest alleen nog wat waar komt te staan.

export const ICOON_SLEUTELS = ASSET_SLEUTELS;

/**
 * De keuzelijst voor de AI: sleutel plus waar het voor staat.
 *
 * Stond eerst als aparte tabel in dit bestand, náást de maten in tafereel.ts en
 * de tekeningen in illustrator.ts. Drie lijsten die je alle drie moest bijwerken
 * bij één nieuw asset — en dat ging natuurlijk mis. Nu staat het in het register.
 */
export function icoonKeuzelijst(): string[] {
  return assetKeuzelijst();
}

function tekenIcoon(sleutel: string, k: OverheidKleuren, x: number, y: number, maat: number, o?: TekenOpties): string {
  const tekenaar = assetVan(sleutel)?.teken ?? assetVan("vlak")?.teken ?? (() => "");
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
