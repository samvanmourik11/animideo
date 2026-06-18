import type { InfographicTheme } from "@/lib/types";

// Kleurhelpers voor de charts. Pure functies, geen DOM.

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Meng een kleur richting wit (amt>0) of zwart (amt<0), -1..1. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = parseHex(hex);
  const target = amt >= 0 ? 255 : 0;
  const a = Math.abs(amt);
  return toHex(r + (target - r) * a, g + (target - g) * a, b + (target - b) * a);
}

/** Zwart of wit, afhankelijk van welke beter contrasteert met de achtergrond. */
export function contrastText(bgHex: string): string {
  const [r, g, b] = parseHex(bgHex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0b1220" : "#ffffff";
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Distinct, altijd-zichtbare paletkleuren voor pie/segmenten. Eerste twee zijn
 * de merkkleuren (primary, accent); daarna roteren we de hue van de hoofdkleur
 * zodat de kleuren onderscheidend blijven en nooit samenvallen met een neutrale
 * achtergrond (zoals een witte `secondary`).
 */
export function categoryColors(theme: InfographicTheme, n: number): string[] {
  const [h, s0, l0] = rgbToHsl(...(((): [number, number, number] => {
    const hex = theme.primary.replace("#", "");
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const num = parseInt(full, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  })()));
  const s = Math.max(0.45, Math.min(0.8, s0));
  const l = Math.max(0.45, Math.min(0.62, l0));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) out.push(theme.primary);
    else if (i === 1) out.push(theme.accent);
    else out.push(hslToHex((h + (i - 1) * 57) % 360, s, l));
  }
  return out;
}

/** Een licht-transparante variant voor assen en rasterlijnen op de achtergrond. */
export function gridColor(theme: InfographicTheme): string {
  return shade(theme.textColor, -0.3);
}

/** Relatieve helderheid 0..1 van een kleur. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function isDark(hex: string): boolean {
  return luminance(hex) < 0.5;
}

/** Vulkleur voor een card: subtiel verhoogd t.o.v. de achtergrond. */
export function cardFill(theme: InfographicTheme): string {
  return isDark(theme.background) ? shade(theme.background, 0.07) : "#ffffff";
}

/** Randkleur voor een card. */
export function cardStroke(theme: InfographicTheme): string {
  return isDark(theme.background) ? shade(theme.background, 0.18) : shade(theme.background, -0.08);
}

/** Gedempte tekstkleur (labels, bijschriften). */
export function mutedText(theme: InfographicTheme): string {
  return isDark(theme.background) ? shade(theme.textColor, -0.28) : shade(theme.textColor, 0.35);
}

/** hex naar rgba-string met alpha. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Donkerder eindpunt voor een verticale gradient van een kleur. */
export function gradientEnd(hex: string): string {
  return shade(hex, -0.28);
}
