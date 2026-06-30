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
  const primary = colors.primary || "#2563eb";
  const secondary = colors.secondary || shade(primary, 0.4);
  const accent = colors.accent || shade(primary, -0.2);

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
