import React from "react";
import type {
  BarChartBlock,
  ComparisonBlock,
  InfographicTheme,
  LineChartBlock,
  ListBlock,
  PieChartBlock,
  ProcessBlock,
  StatBlock,
} from "@/lib/types";
import { CARD_PAD } from "@/lib/infographics/layout";
import { categoryColors, contrastText, gridColor, mutedText, rgba, shade } from "@/lib/infographics/colors";
import { Icon, hasIcon } from "./icons";

// Alle block-renderers tekenen pure SVG binnen de card-rechthoek (origin 0,0,
// breedte=width, hoogte=height). De content krijgt CARD_PAD aan binnenruimte.
// `progress` (0→1) stuurt de enter-animatie; statisch = 1. Gradient-ids
// (ig-g0..7, ig-area) en filters (ig-shadow, ig-glow) komen uit de <defs> in
// InfographicCanvas.

interface BlockProps<B> {
  block: B;
  x: number;
  y: number;
  width: number;
  height: number;
  theme: InfographicTheme;
  progress: number;
}

const FONT = (t: InfographicTheme) => t.fontFamily || "Inter, system-ui, sans-serif";
const gradId = (i: number) => `ig-g${i % 8}`;

function animatedNumber(value: string, progress: number): string {
  if (progress >= 1) return value;
  const m = value.match(/^(\D*)(-?[\d.,]+)(.*)$/);
  if (!m) return value;
  const [, pre, numStr, post] = m;
  const n = parseFloat(numStr.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return value;
  const decimals = /[.,]\d/.test(numStr) ? 1 : 0;
  return `${pre}${(n * progress).toFixed(decimals)}${post}`;
}

/** Kop binnen een card; geeft de y terug waar de content begint. */
function CardTitle({ title, theme, x, y }: { title: string | undefined; theme: InfographicTheme; x: number; y: number }) {
  if (!title) return null;
  return (
    <text x={x} y={y + 22} fontFamily={FONT(theme)} fontSize={30} fontWeight={700} fill={theme.textColor}>
      {title}
    </text>
  );
}

function inset(width: number, height: number, hasTitle: boolean) {
  const x = CARD_PAD;
  const top = CARD_PAD;
  const contentTop = top + (hasTitle ? 54 : 0);
  return { x, top, contentTop, w: width - CARD_PAD * 2, contentH: height - contentTop - CARD_PAD };
}

// ── Stat (flat explainer-journey: icoon-badges aan een verbindend pad) ───────
export function StatRow({ block, width, height, theme, progress }: BlockProps<StatBlock>) {
  const items = block.items;
  const n = items.length;
  const colors = categoryColors(theme, n);
  // Breed genoeg → badges wisselen links/rechts (zoals het goedgekeurde prototype);
  // smal (bijv. een kolom in 16:9) → linker-spine zodat tekst altijd past.
  const alt = width >= 760;
  const R = Math.max(40, Math.min(74, (height / n) * 0.3, width * 0.085));
  // Reserveer ruimte: boven de eerste node voor het grote cijfer, onder de
  // laatste node voor label + sub, zodat tekst nooit buiten het blok valt.
  const padTop = R * 1.15;
  const padBot = R * 1.5 + 20;
  const top = padTop;
  const bottom = height - padBot;
  const gap = n > 1 ? (bottom - top) / (n - 1) : 0;
  const xLeft = alt ? width * 0.3 : R + 12;
  const xRight = width * 0.7;

  const nodes = items.map((it, i) => ({
    it,
    i,
    color: colors[i],
    cx: alt ? (i % 2 === 0 ? xLeft : xRight) : xLeft,
    cy: n > 1 ? top + i * gap : height / 2,
  }));

  let pathD = `M ${nodes[0].cx} ${nodes[0].cy}`;
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1];
    const b = nodes[i];
    const my = (a.cy + b.cy) / 2;
    pathD += ` C ${a.cx} ${my} ${b.cx} ${my} ${b.cx} ${b.cy}`;
  }

  const valueSize = Math.min(98, R * 1.45);
  const labelSize = Math.max(26, R * 0.5);
  const subSize = Math.max(20, R * 0.36);

  return (
    <g>
      <path d={pathD} fill="none" stroke={rgba(theme.textColor, 0.13)} strokeWidth={Math.max(8, R * 0.2)} strokeLinecap="round" />
      {nodes.map(({ it, i, cx, cy, color }) => {
        const nodeProg = Math.min(1, Math.max(0, progress * n - i));
        const textRight = alt ? cx === xLeft : true;
        const tx = textRight ? cx + R + 40 : cx - R - 40;
        const anchor = textRight ? "start" : "end";
        const val = (it.prefix ?? "") + animatedNumber(it.value, progress) + (it.suffix ?? "");
        return (
          <g key={i} opacity={0.2 + 0.8 * nodeProg}>
            {/* uitsparing zodat de badge los op het pad ligt */}
            <circle cx={cx} cy={cy} r={R + 9} fill={theme.background} />
            <circle cx={cx} cy={cy} r={R} fill={color} filter="url(#ig-shadow)" />
            <Icon name={it.icon} x={cx - R * 0.52} y={cy - R * 0.52} size={R * 1.04} color="#ffffff" strokeWidth={2.4} />
            {/* volgnummer-chip */}
            <circle cx={cx + R * 0.74} cy={cy - R * 0.74} r={R * 0.32} fill={theme.textColor} />
            <text x={cx + R * 0.74} y={cy - R * 0.74 + R * 0.11} textAnchor="middle" fontFamily={FONT(theme)} fontSize={R * 0.34} fontWeight={800} fill={contrastText(theme.textColor)}>
              {i + 1}
            </text>
            <text x={tx} y={cy - 2} textAnchor={anchor} fontFamily={FONT(theme)} fontSize={valueSize} fontWeight={800} fill={color}>
              {val}
            </text>
            <text x={tx} y={cy + labelSize + 8} textAnchor={anchor} fontFamily={FONT(theme)} fontSize={labelSize} fontWeight={700} fill={theme.textColor}>
              {it.label}
            </text>
            {it.sub && (
              <text x={tx} y={cy + labelSize + subSize + 18} textAnchor={anchor} fontFamily={FONT(theme)} fontSize={subSize} fontWeight={500} fill={mutedText(theme)}>
                {it.sub}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ── Bar chart ─────────────────────────────────────────────────────────────
export function BarChart({ block, width, height, theme, progress }: BlockProps<BarChartBlock>) {
  const { x, contentTop, w, contentH } = inset(width, height, !!block.title);
  const max = Math.max(...block.data.map((d) => d.value), 1);
  const horizontal = block.orientation === "horizontal";

  if (horizontal) {
    const rowH = contentH / block.data.length;
    const barH = Math.min(46, rowH * 0.5);
    const labelW = Math.min(w * 0.34, 320);
    const barMaxW = w - labelW - 110;
    return (
      <g>
        <CardTitle title={block.title} theme={theme} x={x} y={CARD_PAD} />
        {block.data.map((d, i) => {
          const cy = contentTop + rowH * i + rowH / 2;
          const bw = (d.value / max) * barMaxW * progress;
          return (
            <g key={i}>
              <text x={x} y={cy + 7} fontFamily={FONT(theme)} fontSize={23} fontWeight={600} fill={theme.textColor}>{d.label}</text>
              <rect x={x + labelW} y={cy - barH / 2} width={barMaxW} height={barH} rx={barH / 2} fill={rgba(theme.textColor, 0.08)} />
              <rect x={x + labelW} y={cy - barH / 2} width={Math.max(barH, bw)} height={barH} rx={barH / 2} fill={d.color || `url(#${gradId(i)})`} />
              <text x={x + labelW + Math.max(barH, bw) + 14} y={cy + 7} fontFamily={FONT(theme)} fontSize={23} fontWeight={800} fill={theme.textColor}>
                {animatedNumber(String(d.value), progress)}{block.unit ? " " + block.unit : ""}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  const baseline = contentTop + contentH - 40;
  const chartTop = contentTop + 30;
  const chartH = baseline - chartTop;
  const slot = w / block.data.length;
  const barW = Math.min(slot * 0.56, 120);
  return (
    <g>
      <CardTitle title={block.title} theme={theme} x={x} y={CARD_PAD} />
      <line x1={x} y1={baseline} x2={x + w} y2={baseline} stroke={gridColor(theme)} strokeWidth={1.5} opacity={0.5} />
      {block.data.map((d, i) => {
        const h = (d.value / max) * chartH * progress;
        const bx = x + slot * i + (slot - barW) / 2;
        return (
          <g key={i}>
            <rect x={bx} y={baseline - h} width={barW} height={Math.max(0, h)} rx={12} fill={d.color || `url(#${gradId(i)})`} />
            <text x={bx + barW / 2} y={baseline - h - 14} textAnchor="middle" fontFamily={FONT(theme)} fontSize={24} fontWeight={800} fill={theme.textColor}>
              {animatedNumber(String(d.value), progress)}{block.unit ? " " + block.unit : ""}
            </text>
            <text x={bx + barW / 2} y={baseline + 30} textAnchor="middle" fontFamily={FONT(theme)} fontSize={21} fontWeight={500} fill={mutedText(theme)}>
              {d.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ── Pie / donut ─────────────────────────────────────────────────────────────
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const [sx, sy] = polar(cx, cy, r, end);
  const [ex, ey] = polar(cx, cy, r, start);
  const large = end - start <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 ${large} 0 ${ex} ${ey} Z`;
}

export function PieChart({ block, width, height, theme, progress }: BlockProps<PieChartBlock>) {
  const { x, contentTop, w, contentH } = inset(width, height, !!block.title);
  const total = block.data.reduce((a, d) => a + Math.max(0, d.value), 0) || 1;
  const colors = categoryColors(theme, block.data.length);
  const r = Math.min(contentH, w * 0.44) / 2 - 4;
  const cx = x + r + 8;
  const cy = contentTop + contentH / 2;

  let acc = 0;
  const slices = block.data.map((d, i) => {
    const frac = Math.max(0, d.value) / total;
    const start = acc * 360;
    const end = (acc + frac) * 360;
    acc += frac;
    return { d, i, start, end, color: d.color || colors[i], pct: Math.round(frac * 100) };
  });
  const sweepTo = 360 * progress;
  const top = slices.reduce((m, s) => (s.pct > m.pct ? s : m), slices[0]);

  const legendX = cx + r + 44;
  const legendStep = Math.min(56, contentH / block.data.length);
  return (
    <g>
      <CardTitle title={block.title} theme={theme} x={x} y={CARD_PAD} />
      <g filter="url(#ig-shadow)">
        {slices.map((s) => {
          const end = Math.min(s.end, sweepTo);
          if (end <= s.start) return null;
          return <path key={s.i} d={arcPath(cx, cy, r, s.start, end)} fill={s.color} />;
        })}
      </g>
      {block.variant === "donut" && (
        <>
          <circle cx={cx} cy={cy} r={r * 0.58} fill={shade(theme.background, 0.07)} />
          <text x={cx} y={cy - 4} textAnchor="middle" fontFamily={FONT(theme)} fontSize={44} fontWeight={800} fill={top.color}>{top.pct}%</text>
          <text x={cx} y={cy + 30} textAnchor="middle" fontFamily={FONT(theme)} fontSize={19} fontWeight={500} fill={mutedText(theme)}>{top.d.label}</text>
        </>
      )}
      {slices.map((s, i) => (
        <g key={`lg-${i}`}>
          <rect x={legendX} y={cy - (block.data.length * legendStep) / 2 + i * legendStep} width={24} height={24} rx={7} fill={s.color} />
          <text x={legendX + 36} y={cy - (block.data.length * legendStep) / 2 + i * legendStep + 19} fontFamily={FONT(theme)} fontSize={23} fontWeight={600} fill={theme.textColor}>
            {s.d.label}
          </text>
          <text x={legendX + 36} y={cy - (block.data.length * legendStep) / 2 + i * legendStep + 19} textAnchor="end" dx={w - legendX - 36 + CARD_PAD} fontFamily={FONT(theme)} fontSize={23} fontWeight={800} fill={s.color}>
            {s.pct}%
          </text>
        </g>
      ))}
    </g>
  );
}

// ── Line chart ────────────────────────────────────────────────────────────
export function LineChart({ block, width, height, theme, progress }: BlockProps<LineChartBlock>) {
  const { x, contentTop, w, contentH } = inset(width, height, !!block.title);
  const baseline = contentTop + contentH - 44;
  const chartTop = contentTop + 36;
  const chartH = baseline - chartTop;
  const vals = block.data.map((d) => d.value);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const range = max - min || 1;
  const step = block.data.length > 1 ? w / (block.data.length - 1) : 0;

  const pts = block.data.map((d, i) => {
    const px = x + step * i;
    const py = baseline - ((d.value - min) / range) * chartH;
    return [px, py] as [number, number];
  });
  const polyline = pts.map((p) => p.join(",")).join(" ");
  const areaPath = `M ${pts[0][0]} ${baseline} L ${polyline.split(" ").join(" L ")} L ${pts[pts.length - 1][0]} ${baseline} Z`;
  const pathLen = w + chartH;
  const visiblePts = Math.max(1, Math.floor(pts.length * progress + 0.0001));

  return (
    <g>
      <CardTitle title={block.title} theme={theme} x={x} y={CARD_PAD} />
      {/* verticale rasterlijnen */}
      {pts.map((p, i) => (
        <line key={`grid-${i}`} x1={p[0]} y1={chartTop - 6} x2={p[0]} y2={baseline} stroke={gridColor(theme)} strokeWidth={1} opacity={0.18} />
      ))}
      <line x1={x} y1={baseline} x2={x + w} y2={baseline} stroke={gridColor(theme)} strokeWidth={1.5} opacity={0.4} />
      <path d={areaPath} fill="url(#ig-area)" opacity={progress} />
      {/* gloed-kopie + scherpe lijn */}
      <polyline points={polyline} fill="none" stroke={theme.accent} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" filter="url(#ig-glow)" strokeDasharray={pathLen} strokeDashoffset={pathLen * (1 - progress)} />
      <polyline points={polyline} fill="none" stroke={theme.accent} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={pathLen} strokeDashoffset={pathLen * (1 - progress)} />
      {pts.slice(0, visiblePts).map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r={9} fill={theme.background} stroke={theme.accent} strokeWidth={4} />
          <text x={p[0]} y={p[1] - 22} textAnchor="middle" fontFamily={FONT(theme)} fontSize={22} fontWeight={800} fill={theme.textColor}>
            {block.data[i].value}{block.unit ? " " + block.unit : ""}
          </text>
          <text x={p[0]} y={baseline + 30} textAnchor="middle" fontFamily={FONT(theme)} fontSize={20} fontWeight={500} fill={mutedText(theme)}>
            {block.data[i].label}
          </text>
        </g>
      ))}
    </g>
  );
}

// ── Process / timeline ──────────────────────────────────────────────────────
export function ProcessSteps({ block, width, height, theme, progress }: BlockProps<ProcessBlock>) {
  const { x, contentTop, contentH } = inset(width, height, !!block.title);
  const rowH = contentH / block.steps.length;
  const colors = categoryColors(theme, block.steps.length);
  const R = Math.min(30, rowH * 0.32);
  const cxDot = x + R;
  const n = block.steps.length;
  return (
    <g>
      <CardTitle title={block.title} theme={theme} x={x} y={CARD_PAD} />
      <line x1={cxDot} y1={contentTop + rowH / 2} x2={cxDot} y2={contentTop + rowH * (n - 1) + rowH / 2} stroke={rgba(theme.textColor, 0.18)} strokeWidth={3} />
      {block.steps.map((s, i) => {
        const cy = contentTop + rowH * i + rowH / 2;
        const stepProg = Math.min(1, Math.max(0, progress * n - i));
        const labelY = s.date ? cy - 2 : s.description ? cy - 4 : cy + 9;
        return (
          <g key={i} opacity={0.25 + 0.75 * stepProg}>
            <circle cx={cxDot} cy={cy} r={R} fill={colors[i]} filter="url(#ig-shadow)" />
            <text x={cxDot} y={cy + R * 0.34} textAnchor="middle" fontFamily={FONT(theme)} fontSize={R * 0.95} fontWeight={800} fill={contrastText(colors[i])}>
              {i + 1}
            </text>
            {s.date && (
              <text x={cxDot + R + 24} y={cy - 30} fontFamily={FONT(theme)} fontSize={19} fontWeight={700} fill={colors[i]}>{s.date}</text>
            )}
            <text x={cxDot + R + 24} y={labelY} fontFamily={FONT(theme)} fontSize={26} fontWeight={700} fill={theme.textColor}>
              {s.label}
            </text>
            {s.description && (
              <text x={cxDot + R + 24} y={labelY + 28} fontFamily={FONT(theme)} fontSize={20} fontWeight={500} fill={mutedText(theme)}>
                {s.description}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ── Comparison ────────────────────────────────────────────────────────────
export function ComparisonTable({ block, width, height, theme, progress }: BlockProps<ComparisonBlock>) {
  const { x, contentTop, w, contentH } = inset(width, height, !!block.title);
  const headerH = 64;
  const rowH = (contentH - headerH) / block.rows.length;
  const colors = categoryColors(theme, 2);
  const labelW = w * 0.34;
  const colW = (w - labelW) / 2;
  const col1 = x + labelW;
  const col2 = col1 + colW;
  return (
    <g opacity={0.3 + 0.7 * progress}>
      <CardTitle title={block.title} theme={theme} x={x} y={CARD_PAD} />
      <rect x={col1} y={contentTop} width={colW} height={contentH} rx={12} fill={rgba(colors[0], 0.12)} />
      <rect x={col2} y={contentTop} width={colW} height={contentH} rx={12} fill={rgba(colors[1], 0.12)} />
      <text x={col1 + colW / 2} y={contentTop + 42} textAnchor="middle" fontFamily={FONT(theme)} fontSize={25} fontWeight={800} fill={colors[0]}>{block.columns[0]}</text>
      <text x={col2 + colW / 2} y={contentTop + 42} textAnchor="middle" fontFamily={FONT(theme)} fontSize={25} fontWeight={800} fill={colors[1]}>{block.columns[1]}</text>
      {block.rows.map((rrow, i) => {
        const cy = contentTop + headerH + rowH * i + rowH / 2;
        return (
          <g key={i}>
            {i > 0 && <line x1={x} y1={contentTop + headerH + rowH * i} x2={x + w} y2={contentTop + headerH + rowH * i} stroke={rgba(theme.textColor, 0.1)} strokeWidth={1} />}
            <text x={x} y={cy + 7} fontFamily={FONT(theme)} fontSize={22} fontWeight={600} fill={theme.textColor}>{rrow.label}</text>
            <text x={col1 + colW / 2} y={cy + 7} textAnchor="middle" fontFamily={FONT(theme)} fontSize={23} fontWeight={700} fill={theme.textColor}>{rrow.left}</text>
            <text x={col2 + colW / 2} y={cy + 7} textAnchor="middle" fontFamily={FONT(theme)} fontSize={23} fontWeight={700} fill={theme.textColor}>{rrow.right}</text>
          </g>
        );
      })}
    </g>
  );
}

// ── List ────────────────────────────────────────────────────────────────────
export function BulletList({ block, width, height, theme, progress }: BlockProps<ListBlock>) {
  const { x, contentTop, w, contentH } = inset(width, height, !!block.title);
  const grid = block.variant === "iconGrid";
  const cols = grid && block.items.length > 3 ? 2 : 1;
  const rows = Math.ceil(block.items.length / cols);
  const rowH = contentH / rows;
  const colW = w / cols;
  const colors = categoryColors(theme, block.items.length);
  const n = block.items.length;
  const R = Math.min(26, rowH * 0.3);
  return (
    <g>
      <CardTitle title={block.title} theme={theme} x={x} y={CARD_PAD} />
      {block.items.map((it, i) => {
        const col = grid ? i % cols : 0;
        const row = grid ? Math.floor(i / cols) : i;
        const ix = x + col * colW;
        const cy = contentTop + row * rowH + rowH / 2;
        const itemProg = Math.min(1, Math.max(0, progress * n - i));
        const useIcon = grid || hasIcon(it.icon);
        return (
          <g key={i} opacity={0.2 + 0.8 * itemProg}>
            {block.variant === "numbered" ? (
              <>
                <circle cx={ix + R} cy={cy} r={R} fill={colors[i]} />
                <text x={ix + R} y={cy + R * 0.34} textAnchor="middle" fontFamily={FONT(theme)} fontSize={R * 0.95} fontWeight={800} fill={contrastText(colors[i])}>{i + 1}</text>
              </>
            ) : useIcon ? (
              <>
                <circle cx={ix + R} cy={cy} r={R} fill={rgba(colors[i], 0.16)} />
                <Icon name={it.icon} x={ix + R - R * 0.6} y={cy - R * 0.6} size={R * 1.2} color={colors[i]} strokeWidth={2.2} />
              </>
            ) : (
              <circle cx={ix + 11} cy={cy} r={10} fill={colors[i]} />
            )}
            <text x={ix + (block.variant === "numbered" || useIcon ? R * 2 + 18 : 36)} y={cy + 8} fontFamily={FONT(theme)} fontSize={24} fontWeight={500} fill={theme.textColor}>
              {it.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}
