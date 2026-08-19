// ── Tekststijlen en teksteffecten ────────────────────────────────────────────
//
// Canva's tekstpaneel in twee lagen:
//
//   1. Tekstsoorten — koptekst, subtitel, platte tekst. Eén klik en de tekst
//      staat er in een maat die klopt met het beeld.
//   2. Effecten — schaduw, lift, holle letters, echo, neon, achtergrond. Dit
//      zijn geen nieuwe velden maar combinaties van wat TextStyle al kan; ze
//      zetten precies die knoppen die een vormgever ook zou verzetten.
//
// Alles is puur en zonder model: hetzelfde effect geeft altijd hetzelfde beeld.
// Lettergroottes staan in px op compositieschaal (1920 breed) en schalen dus
// vanzelf mee met 9:16 of 1:1, omdat het document zijn eigen breedte kent.

import { DEFAULT_TEXT_STYLE, type TextStyle } from "./timeline";

// ── Lettertypen ──────────────────────────────────────────────────────────────
//
// Bewust alleen letters die overal zijn: de server-render draait in Chromium op
// Linux, en een lettertype dat daar ontbreekt levert stilzwijgend een andere
// video op dan je in de preview zag. Elke regel hier heeft een reeks
// alternatieven, zodat het altijd op iets bekends uitkomt.

export interface Lettertype {
  id: string;
  label: string;
  /** CSS font-family-lijst; de compositor geeft dit door aan Pixi. */
  stack: string;
  /** Waar het goed voor is, in gewone taal. */
  hint: string;
}

export const LETTERTYPEN: Lettertype[] = [
  { id: "systeem", label: "Modern", stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", hint: "Rustig en zakelijk" },
  { id: "grotesk", label: "Grotesk", stack: "'Helvetica Neue', Helvetica, Arial, sans-serif", hint: "Strak, neutraal" },
  { id: "rond", label: "Rond", stack: "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif", hint: "Vriendelijk" },
  { id: "smal", label: "Smal", stack: "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif", hint: "Veel tekst op één regel" },
  { id: "klassiek", label: "Klassiek", stack: "Georgia, 'Times New Roman', serif", hint: "Vertrouwd, redactioneel" },
  { id: "statig", label: "Statig", stack: "'Palatino Linotype', 'Book Antiqua', Palatino, serif", hint: "Chic" },
  { id: "typemachine", label: "Typemachine", stack: "'Courier New', Courier, monospace", hint: "Techniek, cijfers, code" },
  { id: "handschrift", label: "Handschrift", stack: "'Comic Sans MS', 'Bradley Hand', cursive", hint: "Persoonlijk, luchtig" },
];

export function lettertypeStack(id: string): string {
  return LETTERTYPEN.find((l) => l.id === id)?.stack ?? LETTERTYPEN[0].stack;
}

/** Van een opgeslagen stack terug naar de knop die actief moet staan. */
export function lettertypeVanStack(stack: string): string {
  return LETTERTYPEN.find((l) => l.stack === stack)?.id ?? "systeem";
}

// ── Tekstsoorten ─────────────────────────────────────────────────────────────

export interface TekstSoort {
  id: string;
  label: string;
  /** Wat er in het vak staat als je nog niets hebt getypt. */
  voorbeeld: string;
  stijl: Partial<TextStyle>;
}

export const TEKST_SOORTEN: TekstSoort[] = [
  {
    id: "koptekst",
    label: "Koptekst toevoegen",
    voorbeeld: "Koptekst",
    stijl: { fontSize: 120, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 },
  },
  {
    id: "subtitel",
    label: "Een subtitel toevoegen",
    voorbeeld: "Subtitel",
    stijl: { fontSize: 72, fontWeight: 600, lineHeight: 1.15 },
  },
  {
    id: "platte-tekst",
    label: "Platte tekst toevoegen",
    voorbeeld: "Een stuk tekst",
    stijl: { fontSize: 44, fontWeight: 400, lineHeight: 1.35 },
  },
  {
    id: "ondertitel",
    label: "Ondertiteling",
    voorbeeld: "Wat er gezegd wordt",
    stijl: { fontSize: 56, fontWeight: 700, lineHeight: 1.2, background: "#000000cc" },
  },
];

// ── Effecten ─────────────────────────────────────────────────────────────────
//
// Elk effect is een functie van (stijl, kleur) naar een nieuwe stijl. Ze raken
// alleen hun eigen velden aan, zodat je van effect kunt wisselen zonder je
// lettertype of grootte kwijt te raken.

export type TekstEffectId =
  | "geen" | "schaduw" | "lift" | "hol" | "echo" | "neon" | "achtergrond" | "contour";

export interface TekstEffect {
  id: TekstEffectId;
  label: string;
  toepassen: (stijl: TextStyle) => TextStyle;
}

/** Alle velden die een effect kan zetten, terug op nul. */
function schoon(s: TextStyle): TextStyle {
  const { stroke: _stroke, shadow: _shadow, background: _background, ...rest } = s;
  return { ...rest };
}

/**
 * Zwart of wit, wat het beste afsteekt. Een neon-effect in dezelfde kleur als
 * de letter is onzichtbaar, en een zwarte schaduw onder zwarte tekst ook.
 */
function contrastKleur(hex: string): string {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!m) return "#000000";
  const n = parseInt(m[1], 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.55 ? "#000000" : "#ffffff";
}

export const TEKST_EFFECTEN: TekstEffect[] = [
  { id: "geen", label: "Geen", toepassen: (s) => schoon(s) },
  {
    id: "schaduw",
    label: "Schaduw",
    toepassen: (s) => ({
      ...schoon(s),
      shadow: { color: "#00000099", blur: Math.max(4, s.fontSize * 0.08), x: s.fontSize * 0.04, y: s.fontSize * 0.06 },
    }),
  },
  {
    id: "lift",
    label: "Lift",
    // Zachte, brede schaduw recht onder de letter: de tekst lijkt los van het
    // beeld te zweven zonder dat je de schaduw als schaduw herkent.
    toepassen: (s) => ({
      ...schoon(s),
      shadow: { color: "#00000066", blur: Math.max(10, s.fontSize * 0.3), x: 0, y: s.fontSize * 0.05 },
    }),
  },
  {
    id: "hol",
    label: "Holle letters",
    // Geen vulling: alleen de omtrek. Werkt op druk beeld waar een dichte letter
    // te veel zou wegdrukken.
    toepassen: (s) => ({
      ...schoon(s),
      color: "#00000000",
      stroke: { color: s.color === "#00000000" ? "#ffffff" : s.color, width: Math.max(2, s.fontSize * 0.045) },
    }),
  },
  {
    id: "echo",
    label: "Echo",
    // Een harde kopie schuin achter de letter, precies zoals je hem met de hand
    // zou plakken: geen vervaging, wel verschuiving.
    toepassen: (s) => ({
      ...schoon(s),
      shadow: { color: `${contrastKleur(s.color)}80`, blur: 0, x: s.fontSize * 0.06, y: s.fontSize * 0.06 },
    }),
  },
  {
    id: "neon",
    label: "Neon",
    toepassen: (s) => ({
      ...schoon(s),
      shadow: { color: s.color, blur: Math.max(12, s.fontSize * 0.45), x: 0, y: 0 },
      stroke: { color: s.color, width: Math.max(1, s.fontSize * 0.012) },
    }),
  },
  {
    id: "achtergrond",
    label: "Achtergrond",
    toepassen: (s) => ({ ...schoon(s), background: `${contrastKleur(s.color)}cc` }),
  },
  {
    id: "contour",
    label: "Contour",
    toepassen: (s) => ({
      ...schoon(s),
      stroke: { color: contrastKleur(s.color), width: Math.max(2, s.fontSize * 0.06) },
    }),
  },
];

export function pasEffectToe(stijl: TextStyle, effect: TekstEffectId): TextStyle {
  const e = TEKST_EFFECTEN.find((x) => x.id === effect) ?? TEKST_EFFECTEN[0];
  return e.toepassen(stijl);
}

/**
 * Welk effect er nu op staat. Niet opgeslagen maar afgeleid: dan kan het nooit
 * uit de pas lopen met de stijl zelf, ook niet als de AI of een oud project de
 * velden rechtstreeks heeft gezet.
 */
export function huidigEffect(s: TextStyle): TekstEffectId {
  if (s.color === "#00000000") return "hol";
  if (s.background) return "achtergrond";
  if (s.shadow) {
    if (s.shadow.blur === 0) return "echo";
    if (s.shadow.x === 0 && s.shadow.y === 0) return "neon";
    if (s.shadow.blur > s.fontSize * 0.2) return "lift";
    return "schaduw";
  }
  if (s.stroke && s.stroke.width > 0) return "contour";
  return "geen";
}

// ── Kant-en-klare tekstsjablonen ─────────────────────────────────────────────
//
// Canva's lettertypecombinaties: één klik en je hebt een verzorgd kopje. Hier
// als lettertype + kleur + effect in één, met een naam die zegt waar het voor is.

export interface TekstSjabloon {
  id: string;
  label: string;
  tekst: string;
  stijl: TextStyle;
}

function sjabloon(over: Partial<TextStyle>): TextStyle {
  return { ...DEFAULT_TEXT_STYLE, ...over };
}

export const TEKST_SJABLONEN: TekstSjabloon[] = [
  {
    id: "aanbieding",
    label: "Aanbieding",
    tekst: "NU 20% KORTING",
    stijl: sjabloon({
      fontFamily: lettertypeStack("grotesk"), fontSize: 110, fontWeight: 800,
      color: "#facc15", letterSpacing: 2,
      stroke: { color: "#111827", width: 8 },
      shadow: { color: "#00000099", blur: 0, x: 7, y: 7 },
    }),
  },
  {
    id: "kop-neon",
    label: "Neon",
    tekst: "NIEUW",
    stijl: sjabloon({
      fontFamily: lettertypeStack("grotesk"), fontSize: 120, fontWeight: 800,
      color: "#22d3ee", letterSpacing: 6,
      shadow: { color: "#22d3ee", blur: 54, x: 0, y: 0 },
    }),
  },
  {
    id: "kop-elegant",
    label: "Elegant",
    tekst: "Onze verhalen",
    stijl: sjabloon({
      fontFamily: lettertypeStack("klassiek"), fontSize: 96, fontWeight: 400,
      color: "#ffffff", letterSpacing: 3,
      shadow: { color: "#00000066", blur: 26, x: 0, y: 5 },
    }),
  },
  {
    id: "label",
    label: "Labeltje",
    tekst: "Tip",
    stijl: sjabloon({
      fontFamily: lettertypeStack("rond"), fontSize: 52, fontWeight: 700,
      color: "#0f172a", background: "#fde047ee", letterSpacing: 1,
    }),
  },
  {
    id: "ondertitel",
    label: "Ondertiteling",
    tekst: "Wat er gezegd wordt",
    stijl: sjabloon({
      fontFamily: lettertypeStack("systeem"), fontSize: 56, fontWeight: 700,
      color: "#ffffff", background: "#000000cc", lineHeight: 1.2,
    }),
  },
  {
    id: "hol",
    label: "Hol",
    tekst: "OPEN",
    stijl: sjabloon({
      fontFamily: lettertypeStack("grotesk"), fontSize: 130, fontWeight: 800,
      color: "#00000000", letterSpacing: 8,
      stroke: { color: "#ffffff", width: 6 },
    }),
  },
  {
    id: "citaat",
    label: "Citaat",
    tekst: "“Zo simpel is het”",
    stijl: sjabloon({
      fontFamily: lettertypeStack("statig"), fontSize: 76, fontWeight: 400,
      color: "#f8fafc", lineHeight: 1.3,
      shadow: { color: "#00000088", blur: 30, x: 0, y: 4 },
    }),
  },
  {
    id: "techniek",
    label: "Techniek",
    tekst: "STAP 01",
    stijl: sjabloon({
      fontFamily: lettertypeStack("typemachine"), fontSize: 64, fontWeight: 700,
      color: "#4ade80", letterSpacing: 6,
      stroke: { color: "#052e16", width: 4 },
    }),
  },
];
