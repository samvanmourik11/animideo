import type {
  ChartDataPoint,
  InfographicBlock,
  InfographicFormat,
  InfographicSpec,
  InfographicTheme,
} from "@/lib/types";

// De renderer mag NOOIT een ongeldige spec krijgen. Deze guard normaliseert de
// (mogelijk rommelige) AI-output: kapotte blocks worden weggegooid i.p.v. te
// crashen, getallen worden geforceerd naar eindige waarden, array-lengtes worden
// geclamped, ontbrekende kleuren komen uit de brandkit of een default-palet,
// en alle strings worden afgekapt tegen layout-overflow.

const DEFAULT_THEME: InfographicTheme = {
  primary: "#2563eb",
  secondary: "#64748b",
  accent: "#f59e0b",
  background: "#0b1220",
  textColor: "#e2e8f0",
  fontFamily: "Inter, system-ui, sans-serif",
};

export interface BrandThemeHint {
  primary?: string | null;
  secondary?: string | null;
  accent?: string | null;
  background?: string | null;
  textColor?: string | null;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown, max = 200): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}
function hex(v: unknown): string | undefined {
  return typeof v === "string" && HEX.test(v.trim()) ? v.trim() : undefined;
}
function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function clamp<T>(items: T[], min: number, max: number): T[] | null {
  if (items.length < min) return null;
  return items.slice(0, max);
}

function normTheme(raw: unknown, brand?: BrandThemeHint): InfographicTheme {
  const t = isObj(raw) ? raw : {};
  return {
    primary: hex(t.primary) ?? brand?.primary ?? DEFAULT_THEME.primary,
    secondary: hex(t.secondary) ?? brand?.secondary ?? DEFAULT_THEME.secondary,
    accent: hex(t.accent) ?? brand?.accent ?? DEFAULT_THEME.accent,
    background: hex(t.background) ?? brand?.background ?? DEFAULT_THEME.background,
    textColor: hex(t.textColor) ?? brand?.textColor ?? DEFAULT_THEME.textColor,
    fontFamily: str(t.fontFamily, 80) ?? DEFAULT_THEME.fontFamily,
  };
}

function normChartData(raw: unknown, min: number, max: number): ChartDataPoint[] | null {
  const points: ChartDataPoint[] = [];
  for (const p of arr(raw)) {
    if (!isObj(p)) continue;
    const label = str(p.label, 40);
    const value = num(p.value);
    if (label === undefined || value === undefined) continue;
    points.push({ label, value, ...(hex(p.color) ? { color: hex(p.color) } : {}) });
  }
  return clamp(points, min, max);
}

function normBlock(raw: unknown, i: number): InfographicBlock | null {
  if (!isObj(raw) || typeof raw.type !== "string") return null;
  const id = str(raw.id, 60) ?? `${raw.type}-${i}`;

  switch (raw.type) {
    case "stat": {
      const items = arr(raw.items)
        .filter(isObj)
        .map((it) => {
          const value = str(it.value, 16);
          const label = str(it.label, 60);
          if (!value || !label) return null;
          return {
            value,
            label,
            ...(str(it.prefix, 6) ? { prefix: str(it.prefix, 6) } : {}),
            ...(str(it.suffix, 8) ? { suffix: str(it.suffix, 8) } : {}),
            ...(str(it.icon, 24) ? { icon: str(it.icon, 24) } : {}),
            ...(str(it.sub, 48) ? { sub: str(it.sub, 48) } : {}),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const clamped = clamp(items, 1, 6);
      return clamped ? { type: "stat", id, items: clamped } : null;
    }
    case "barChart": {
      const data = normChartData(raw.data, 2, 8);
      if (!data) return null;
      const orientation = raw.orientation === "horizontal" ? "horizontal" : "vertical";
      return {
        type: "barChart",
        id,
        orientation,
        ...(str(raw.title, 80) ? { title: str(raw.title, 80) } : {}),
        ...(str(raw.unit, 12) ? { unit: str(raw.unit, 12) } : {}),
        data,
      };
    }
    case "pieChart": {
      const data = normChartData(raw.data, 2, 6);
      if (!data) return null;
      const variant = raw.variant === "donut" ? "donut" : "pie";
      return {
        type: "pieChart",
        id,
        variant,
        ...(str(raw.title, 80) ? { title: str(raw.title, 80) } : {}),
        data,
      };
    }
    case "lineChart": {
      const data = normChartData(raw.data, 2, 12);
      if (!data) return null;
      return {
        type: "lineChart",
        id,
        ...(str(raw.title, 80) ? { title: str(raw.title, 80) } : {}),
        ...(str(raw.unit, 12) ? { unit: str(raw.unit, 12) } : {}),
        data,
      };
    }
    case "process": {
      const steps = arr(raw.steps)
        .filter(isObj)
        .map((s) => {
          const label = str(s.label, 60);
          if (!label) return null;
          return {
            label,
            ...(str(s.description, 120) ? { description: str(s.description, 120) } : {}),
            ...(str(s.date, 24) ? { date: str(s.date, 24) } : {}),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const clamped = clamp(steps, 2, 6);
      if (!clamped) return null;
      const variant = raw.variant === "timeline" ? "timeline" : "steps";
      return { type: "process", id, variant, ...(str(raw.title, 80) ? { title: str(raw.title, 80) } : {}), steps: clamped };
    }
    case "comparison": {
      const cols = arr(raw.columns).map((c) => str(c, 40)).filter((x): x is string => !!x);
      if (cols.length < 2) return null;
      const rows = arr(raw.rows)
        .filter(isObj)
        .map((r) => {
          const label = str(r.label, 60);
          const left = str(r.left, 40);
          const right = str(r.right, 40);
          if (!label || left === undefined || right === undefined) return null;
          return { label, left, right };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const clamped = clamp(rows, 2, 6);
      if (!clamped) return null;
      return {
        type: "comparison",
        id,
        columns: [cols[0], cols[1]],
        ...(str(raw.title, 80) ? { title: str(raw.title, 80) } : {}),
        rows: clamped,
      };
    }
    case "list": {
      const items = arr(raw.items)
        .filter(isObj)
        .map((it) => {
          const text = str(it.text, 100);
          if (!text) return null;
          return { text, ...(str(it.icon, 24) ? { icon: str(it.icon, 24) } : {}) };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const clamped = clamp(items, 1, 8);
      if (!clamped) return null;
      const variant =
        raw.variant === "numbered" || raw.variant === "iconGrid" ? raw.variant : "bullets";
      return { type: "list", id, variant, ...(str(raw.title, 80) ? { title: str(raw.title, 80) } : {}), items: clamped };
    }
    default:
      return null;
  }
}

export interface ValidateOpts {
  fallbackTitle?: string;
  fallbackFormat?: InfographicFormat;
  brand?: BrandThemeHint;
  logoUrl?: string | null;
}

/**
 * Normaliseert willekeurige input naar een gegarandeerd geldige InfographicSpec.
 * Gooit alleen als er geen enkel bruikbaar block overblijft.
 */
export function validateAndNormalizeSpec(input: unknown, opts: ValidateOpts = {}): InfographicSpec {
  const raw = isObj(input) ? input : {};

  const format: InfographicFormat =
    raw.format === "16:9" || raw.format === "9:16"
      ? raw.format
      : opts.fallbackFormat ?? "9:16";

  const blocks = arr(raw.blocks)
    .map((b, i) => normBlock(b, i))
    .filter((b): b is InfographicBlock => b !== null)
    .slice(0, 7);

  if (blocks.length === 0) {
    throw new Error("Geen geldige blocks in de gegenereerde infographic-spec.");
  }

  return {
    version: 1,
    title: str(raw.title, 120) ?? opts.fallbackTitle ?? "Infographic",
    ...(str(raw.subtitle, 160) ? { subtitle: str(raw.subtitle, 160) } : {}),
    ...(str(raw.source, 120) ? { source: str(raw.source, 120) } : {}),
    format,
    theme: normTheme(raw.theme, opts.brand),
    blocks,
    ...(opts.logoUrl ? { logoUrl: opts.logoUrl } : {}),
  };
}
