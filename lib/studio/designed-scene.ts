// Datamodel voor "ontworpen" (niet-AI) studio-scènes: vormgegeven tekstscènes in
// de huisstijl. Twee soorten:
//   - "cta"     : effen huisstijl-eindscène met call-to-action + contact/logo
//   - "bullets" : presentatie-/opsommingsscène met titel + bullets (met iconen)
//
// Deze scènes worden deterministisch als SVG gerenderd (DesignedSceneStage) en
// frame-voor-frame geëxporteerd naar een korte MP4-clip, net als de explainer.
// Geen AI-beeld: de inhoud (titel, bullets, gekozen iconen) wordt in de
// script-/planningsstap door de AI bepaald, de vormgeving staat vast in de huisstijl.

import { contrastText, shade } from "@/lib/infographics/colors";

export type DesignedSceneKind = "cta" | "bullets";

export type DesignedFormat = "16:9" | "9:16";

/** Vaste, video-gelijke afmetingen per formaat (matcht de studio-clips). */
export const DESIGNED_SIZES: Record<DesignedFormat, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

export interface DesignedTheme {
  background: string; // basis-achtergrondkleur (fallback / body)
  gradientFrom: string; // gradient-stop 1 (huisstijl)
  gradientTo: string; // gradient-stop 2 (huisstijl-combinatie)
  blobA: string; // decoratief kleurvlak 1
  blobB: string; // decoratief kleurvlak 2
  primary: string; // titels, badges
  secondary: string;
  accent: string; // accenten, knop
  text: string; // afgeleid: leesbaar op de achtergrond
  textMuted: string; // afgeleid: zachter
  onPrimary: string; // tekst op primary-badges
  onAccent: string; // tekst op de accent-knop
}

export interface BulletItem {
  text: string;
  icon?: string; // keyword uit components/explainer/icons.tsx (ICON_NAMES)
  revealAt?: number; // seconden t.o.v. scènebegin; gezet door align-voice (sync met stem)
}

export interface DesignedCtaContent {
  cta?: string; // bv. "Neem vandaag nog contact op"
  website?: string;
  email?: string;
  phone?: string;
}

export interface DesignedScene {
  kind: DesignedSceneKind;
  format: DesignedFormat;
  title: string;
  subtitle?: string;
  bullets?: BulletItem[]; // voor "bullets"
  contact?: DesignedCtaContent; // voor "cta"
  logoUrl?: string | null;
  theme: DesignedTheme;
  durationSec: number;
}

/** Meng twee hex-kleuren (t=0..1). */
function blendHex(a: string, b: string, t = 0.5): string {
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const h = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${h(r1 + (r2 - r1) * t)}${h(g1 + (g2 - g1) * t)}${h(b1 + (b2 - b1) * t)}`;
}

// Basistinten voor merkkleuren die als woord in de brand kit staan. Het
// website-onderzoek en het formulier leveren soms "dieppaars" of "navy blue"
// i.p.v. een hexcode; shade() las dat als zwart, waardoor de eindscène van o.a.
// InnerVersa zwart werd in plaats van paars/geel.
const KLEURNAMEN: Record<string, string> = {
  paars: "#7c3aed", purple: "#7c3aed", violet: "#8b5cf6", lila: "#a78bfa", lilac: "#a78bfa",
  blauw: "#2563eb", blue: "#2563eb", navy: "#1e3a8a", marine: "#1e3a8a", marineblauw: "#1e3a8a",
  lichtblauw: "#60a5fa", hemelsblauw: "#38bdf8", turquoise: "#14b8a6", turkoois: "#14b8a6",
  cyaan: "#06b6d4", cyan: "#06b6d4", petrol: "#0f766e", teal: "#0d9488", aqua: "#22d3ee",
  groen: "#16a34a", green: "#16a34a", mint: "#34d399", olijf: "#65a30d", olive: "#65a30d",
  lime: "#84cc16", limoen: "#84cc16", smaragd: "#059669", emerald: "#059669",
  geel: "#facc15", yellow: "#facc15", goud: "#d4a017", gold: "#d4a017", golden: "#d4a017",
  oranje: "#f97316", orange: "#f97316", amber: "#f59e0b", oker: "#ca8a04",
  rood: "#dc2626", red: "#dc2626", bordeaux: "#7f1d1d", wijnrood: "#7f1d1d", burgundy: "#7f1d1d",
  roze: "#ec4899", pink: "#ec4899", magenta: "#d946ef", fuchsia: "#d946ef", koraal: "#fb7185", coral: "#fb7185",
  bruin: "#92400e", brown: "#92400e", beige: "#e7d8b8", creme: "#f5efe0", crème: "#f5efe0", cream: "#f5efe0",
  zand: "#e2c799", sand: "#e2c799", taupe: "#8b7d6b",
  zwart: "#111111", black: "#111111", wit: "#ffffff", white: "#ffffff",
  grijs: "#6b7280", gray: "#6b7280", grey: "#6b7280", antraciet: "#2f343b", zilver: "#c0c4cc", silver: "#c0c4cc",
};

// Voorvoegsels die de basistint donkerder (<0) of lichter (>0) maken.
const KLEURTOON: [string, number][] = [
  ["diep", -0.35], ["donker", -0.4], ["dark", -0.4], ["deep", -0.35],
  ["licht", 0.35], ["light", 0.35], ["pastel", 0.5], ["zacht", 0.25], ["soft", 0.25],
  ["fel", 0], ["bright", 0], ["helder", 0],
];

/**
 * Maakt van een merkkleur (hexcode, "rgb(…)" of een kleurnaam als "dieppaars",
 * "donker blauw", "navy blue") een #rrggbb-code. Onbekend → null, zodat de
 * aanroeper op een standaardkleur terugvalt in plaats van op zwart.
 */
export function resolveBrandColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  const hex = raw.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split("").map(c => c + c).join("") : hex[1];
    return `#${h}`;
  }
  const rgb = raw.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
  if (rgb) {
    const c = (n: string) => Math.min(255, Number(n)).toString(16).padStart(2, "0");
    return `#${c(rgb[1])}${c(rgb[2])}${c(rgb[3])}`;
  }
  // Losse woorden én aaneengeschreven samenstellingen ("dieppaars") afgaan.
  let rest = raw.replace(/[^a-zà-ÿ\s-]/g, " ").replace(/[\s-]+/g, "");
  let tone = 0;
  for (let changed = true; changed;) {
    changed = false;
    for (const [prefix, amt] of KLEURTOON) {
      if (rest.startsWith(prefix) && rest.length > prefix.length) {
        rest = rest.slice(prefix.length);
        tone += amt;
        changed = true;
      }
    }
  }
  let base = KLEURNAMEN[rest];
  if (!base) {
    // "navyblue", "goudgeel": pak de langste bekende kleur die erin voorkomt; bij
    // gelijke lengte de eerste — die is in beide talen de meest specifieke.
    const hit = Object.keys(KLEURNAMEN)
      .filter(k => rest.includes(k))
      .sort((a, b) => b.length - a.length || rest.indexOf(a) - rest.indexOf(b))[0];
    base = hit ? KLEURNAMEN[hit] : "";
  }
  if (!base) return null;
  return tone === 0 ? base : shade(base, Math.max(-0.8, Math.min(0.8, tone)));
}

/**
 * Bouwt een huisstijl-thema met een UNIEKE achtergrond die de merkkleuren
 * combineert: een diagonale gradient van een iets donkerder primary naar een
 * donkere mix van primary + accent, met decoratieve kleurvlakken in accent en
 * secondary. Tekstkleur contrasteert automatisch met het primaire veld.
 */
export function buildDesignedTheme(colors: {
  primary?: string | null;
  secondary?: string | null;
  accent?: string | null;
  background?: string | null;
}): DesignedTheme {
  const primary = resolveBrandColor(colors.primary) || "#2563eb";
  const secondary = resolveBrandColor(colors.secondary) || shade(primary, 0.4);
  const accent = resolveBrandColor(colors.accent) || shade(primary, -0.2);

  const gradientFrom = shade(primary, -0.06);
  const gradientTo = shade(blendHex(primary, accent, 0.5), -0.16);

  const text = contrastText(primary);
  const textMuted = text === "#ffffff" ? "rgba(255,255,255,0.74)" : "rgba(15,23,42,0.66)";
  return {
    background: gradientFrom,
    gradientFrom,
    gradientTo,
    blobA: accent,
    blobB: secondary,
    primary,
    secondary,
    accent,
    text,
    textMuted,
    onPrimary: contrastText(primary),
    onAccent: contrastText(accent),
  };
}

/** Cubic ease-out, voor zachte in-animaties. */
export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

/**
 * Gestaffelde voortgang voor item i van n: ieder item start iets later, zodat
 * bullets netjes na elkaar inkomen. Geeft 0..1 terug (al ge-eased).
 */
export function stagger(progress: number, i: number, n: number): number {
  const span = 0.55; // deel van de tijd dat het laatste item nog beweegt
  const step = n > 1 ? (1 - span) / (n - 1) : 0;
  const local = (progress - i * step) / span;
  return easeOut(local);
}
