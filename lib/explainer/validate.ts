import type { ExplainerScene, ExplainerSpec, ExplainerStyle, ExplainerTemplate, Illustration } from "./spec";
import { EXPLAINER_ICONS, EXPLAINER_ILLUSTRATIONS, EXPLAINER_STYLES, EXPLAINER_TEMPLATES } from "./schema";
import { matchIcon, matchIllustration } from "./icon-match";

// Coerce de ruwe model-output naar een veilige ExplainerSpec. Onbekende enums
// vallen terug, lengtes/duren worden geklemd. Gooit alleen als er geen bruikbare
// scenes zijn.

const TEMPLATES = new Set<string>(EXPLAINER_TEMPLATES);
const ILLOS = new Set<string>(EXPLAINER_ILLUSTRATIONS);
const ICONS = new Set<string>(EXPLAINER_ICONS);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function hex(v: unknown, fallback: string): string {
  return typeof v === "string" && /^#?[0-9a-fA-F]{3,8}$/.test(v.trim())
    ? (v.trim().startsWith("#") ? v.trim() : "#" + v.trim())
    : fallback;
}
function num(v: unknown, lo: number, hi: number, def: number): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, n));
}

/** Normaliseer één ruwe scene naar een veilige ExplainerScene (of null als leeg). */
export function normalizeScene(raw: unknown, i: number): ExplainerScene | null {
  const s = isObj(raw) ? raw : {};
  const narration = str(s.narration, 400);
  const template = (TEMPLATES.has(String(s.template)) ? s.template : "deviceMetrics") as ExplainerTemplate;
  const aiCenter = (ILLOS.has(String(s.center)) ? (s.center as Illustration) : null);
  const callouts = arr(s.callouts)
    .filter(isObj)
    .map((c) => {
      const label = str(c.label, 40);
      const aiIcon = ICONS.has(String(c.icon)) ? String(c.icon) : null;
      // Controle: het label bepaalt het icoon; AI-keuze alleen als terugval.
      return { icon: matchIcon(label) ?? aiIcon ?? "check", label };
    })
    .filter((c) => c.label.length > 0)
    .slice(0, 6);
  const data = arr(s.data)
    .filter(isObj)
    .map((d) => ({ label: str(d.label, 24), value: typeof d.value === "number" ? d.value : parseFloat(String(d.value)) }))
    .filter((d) => d.label.length > 0 && Number.isFinite(d.value))
    .slice(0, 8);
  const title = str(s.title, 80);
  if (!narration && !title) return null;
  const isText = template === "title" || template === "outro";
  // Controle: de centrale illustratie wordt gematcht op de scene-tekst (titel +
  // voice-over + labels); AI-keuze alleen als terugval, anders een neutrale monitor.
  const matched = matchIllustration(`${title} ${narration} ${callouts.map((c) => c.label).join(" ")}`) as Illustration | null;
  const center: Illustration = isText ? "none" : (matched ?? aiCenter ?? "monitor");
  return {
    id: str(s.id, 40) || `scene-${i}`,
    template,
    narration,
    ...(title ? { title } : {}),
    ...(str(s.subtitle, 80) ? { subtitle: str(s.subtitle, 80) } : {}),
    center,
    callouts: isText ? [] : callouts,
    ...(data.length ? { data } : {}),
    bg: hex(s.bg, i % 2 === 0 ? "#E8821E" : "#5BC2F0"),
    durationSec: num(s.durationSec, 3, 8, 5),
  };
}

export function validateExplainerSpec(
  raw: unknown,
  opts: { fallbackTitle: string; fallbackFormat: "16:9" | "9:16" }
): ExplainerSpec {
  const r = isObj(raw) ? raw : {};
  const theme = isObj(r.theme) ? r.theme : {};
  const t = {
    primary: hex(theme.primary, "#15357A"),
    accent: hex(theme.accent, "#F5A623"),
    ink: hex(theme.ink, "#15357A"),
    onColor: hex(theme.onColor, "#FFFFFF"),
  };

  const scenes: ExplainerScene[] = arr(r.scenes)
    .map((s, i) => normalizeScene(s, i))
    .filter((x): x is ExplainerScene => x !== null)
    .slice(0, 9);

  if (scenes.length < 2) throw new Error("Te weinig bruikbare scenes gegenereerd");

  // Eerste scene als title, laatste als outro afdwingen voor een nette opbouw.
  scenes[0].template = "title";
  scenes[0].center = "none";
  scenes[0].callouts = [];
  const last = scenes[scenes.length - 1];
  last.template = "outro";
  last.center = "none";
  last.callouts = [];

  const style = (EXPLAINER_STYLES as readonly string[]).includes(String(r.style)) ? (r.style as ExplainerStyle) : "flat";

  return {
    version: 1,
    title: str(r.title, 120) || opts.fallbackTitle,
    format: r.format === "9:16" || r.format === "16:9" ? r.format : opts.fallbackFormat,
    style,
    theme: t,
    scenes,
  };
}
