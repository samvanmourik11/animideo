import React from "react";
import type { ExplainerScene, ExplainerSpec, ExplainerStyle, ExplainerTheme } from "@/lib/explainer/spec";
import { canvasSize } from "@/lib/infographics/canvas-size";
import { easeOut } from "@/lib/infographics/timeline";
import { ExIcon } from "./icons";
import { CenterIllustration } from "./illustrations";

// Rendert één explainer-scene bij gegeven progress (0→1). De `style` op de spec
// stuurt een art-direction (achtergrond, badge-vorm, typografie, decoratie, kleur,
// glow) over dezelfde scene-structuur heen.

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function stagger(e: number, i: number, n: number, start = 0.1, dur = 0.34): number {
  const last = 1 - dur;
  const t0 = n > 1 ? start + (i / (n - 1)) * (last - start) : start;
  return clamp01((e - t0) / dur);
}
function FONT() {
  return "Inter, system-ui, sans-serif";
}
function parseHex(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lum(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function colorDist(a: string, b: string): number {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}
function shade(hex: string, amt: number): string {
  const [r, g, b] = parseHex(hex);
  const t = amt >= 0 ? 255 : 0;
  const a = Math.abs(amt);
  const c = (v: number) => Math.round(v + (t - v) * a);
  const hx = (v: number) => c(v).toString(16).padStart(2, "0");
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}
function rgba(hex: string, a: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
// Merkkleur die het verst van de achtergrond ligt (badge valt nooit weg).
function adaptive(bg: string, theme: ExplainerTheme): string {
  const dP = colorDist(theme.primary, bg);
  const dA = colorDist(theme.accent, bg);
  if (Math.max(dP, dA) < 70) return lum(bg) > 0.5 ? theme.ink : "#FFFFFF";
  return dA >= dP ? theme.accent : theme.primary;
}

const NEON = ["#22D3EE", "#A3E635", "#F472B6", "#FBBF24", "#60A5FA", "#FB7185"];

interface Tokens {
  bgKind: "solid" | "dark" | "gradient";
  bgColor: string;
  gradFrom: string;
  gradTo: string;
  gradId: string;
  ink: string;
  muted: string;
  titleColor: string;
  valueColor: string;
  badgeMode: "solid" | "outline" | "glass";
  badgeShape: "circle" | "squircle";
  badgeRender: "soft" | "solidShadow" | "glow" | "glass" | "iso3d";
  badgeColorFor: (i: number, n: number) => string;
  iconColorFor: (i: number, n: number) => string;
  glowId: string | null;
  shadowId: string | null;
  titleWeight: number;
  titleScale: number;
  valueScale: number;
  labelItalic: boolean;
  labelWeight: number;
  centerDiscFill: string;
  orbitCenterFill: string;
  centerRing: string | null;
  deco: "blobs" | "block" | "grid" | "glass" | "shapes" | "none";
}

function tokensFor(style: ExplainerStyle, scene: ExplainerScene, theme: ExplainerTheme): Tokens {
  const bg = scene.bg;
  const onLight = lum(bg) > 0.6;
  const acc = adaptive(bg, theme);
  const geo = [theme.accent, theme.primary, "#22C55E", "#EF4444", "#8B5CF6", "#06B6D4"];
  const base: Tokens = {
    bgKind: "gradient", bgColor: bg, gradFrom: shade(bg, 0.1), gradTo: shade(bg, -0.16), gradId: `g-${scene.id}`,
    ink: onLight ? theme.ink : "#FFFFFF",
    muted: onLight ? shade(theme.ink, 0.42) : "#D7E0EE",
    titleColor: onLight ? theme.ink : "#FFFFFF",
    valueColor: acc,
    badgeMode: "solid", badgeShape: "circle", badgeRender: "soft",
    badgeColorFor: () => acc,
    iconColorFor: () => "#FFFFFF",
    glowId: null, shadowId: `sh-${scene.id}`, titleWeight: 800, titleScale: 1, valueScale: 1, labelItalic: true, labelWeight: 600,
    centerDiscFill: onLight ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.12)",
    orbitCenterFill: theme.primary,
    centerRing: null,
    deco: "blobs",
  };
  switch (style) {
    case "bold":
      return {
        ...base,
        gradFrom: shade(bg, 0.06), gradTo: shade(bg, -0.26),
        badgeShape: "squircle", badgeRender: "solidShadow",
        badgeColorFor: () => "#FFFFFF",
        iconColorFor: () => acc,
        titleWeight: 900, titleScale: 1.18, valueScale: 1.32, labelItalic: false, labelWeight: 800,
        deco: "block",
      };
    case "neon":
      return {
        ...base,
        bgKind: "dark", bgColor: "#0A0E1A", gradFrom: "#121C33", gradTo: "#04060C",
        ink: "#EAF1FB", muted: "#8C9AB5", titleColor: "#FFFFFF", valueColor: NEON[0],
        badgeMode: "outline", badgeRender: "glow",
        badgeColorFor: (i) => NEON[i % NEON.length],
        iconColorFor: (i) => NEON[i % NEON.length],
        glowId: `glow-${scene.id}`, shadowId: null,
        centerDiscFill: "#E6ECF7", orbitCenterFill: "#E6ECF7", centerRing: NEON[0],
        deco: "grid",
      };
    case "glass":
      return {
        ...base,
        bgKind: "gradient", gradFrom: shade(bg, onLight ? 0.16 : 0.05), gradTo: shade(bg, onLight ? -0.18 : 0.3),
        ink: onLight ? "#1F2937" : "#FFFFFF",
        muted: onLight ? "rgba(31,41,55,0.6)" : "#D7E0EE",
        badgeMode: "glass", badgeRender: "glass", titleWeight: 700,
        iconColorFor: () => (onLight ? theme.primary : "#FFFFFF"),
        centerDiscFill: "rgba(255,255,255,0.5)", orbitCenterFill: "rgba(255,255,255,0.6)",
        deco: "glass",
      };
    case "geometric":
      return { ...base, badgeRender: "iso3d", badgeColorFor: (i) => geo[i % geo.length], deco: "shapes" };
    default:
      return base;
  }
}

function Background({ tk, W, H }: { tk: Tokens; W: number; H: number }) {
  // Altijd een gradient: meteen rijker dan een vlakke kleur, en per stijl anders.
  return (
    <>
      <defs>
        <linearGradient id={tk.gradId} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={tk.gradFrom} />
          <stop offset="1" stopColor={tk.gradTo} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill={`url(#${tk.gradId})`} />
    </>
  );
}

function Decoration({ tk, theme, W, H }: { tk: Tokens; theme: ExplainerTheme; W: number; H: number }) {
  switch (tk.deco) {
    case "blobs":
      return (
        <>
          <circle cx={W * 0.93} cy={H * 0.1} r={W * 0.16} fill={theme.accent} opacity={0.08} />
          <circle cx={W * 0.05} cy={H * 0.92} r={W * 0.2} fill={theme.primary} opacity={0.08} />
        </>
      );
    case "block":
      return (
        <>
          <rect x={0} y={H * 0.8} width={W} height={H * 0.2} fill={tk.valueColor} opacity={0.16} />
          <circle cx={W * 0.92} cy={H * 0.14} r={W * 0.13} fill={tk.valueColor} opacity={0.16} />
        </>
      );
    case "grid": {
      const lines: React.ReactNode[] = [];
      const step = W / 16;
      for (let x = step; x < W; x += step) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={H} stroke="#1B2433" strokeWidth={1} />);
      for (let y = step; y < H; y += step) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={W} y2={y} stroke="#1B2433" strokeWidth={1} />);
      return <g opacity={0.6}>{lines}</g>;
    }
    case "glass":
      return (
        <>
          <circle cx={W * 0.85} cy={H * 0.2} r={W * 0.18} fill="#ffffff" opacity={0.12} />
          <circle cx={W * 0.12} cy={H * 0.85} r={W * 0.14} fill="#ffffff" opacity={0.1} />
        </>
      );
    case "shapes":
      return (
        <g opacity={0.55}>
          <circle cx={W * 0.07} cy={H * 0.16} r={26} fill="none" stroke={theme.accent} strokeWidth={6} />
          <path d={`M ${W * 0.9} ${H * 0.1} l 34 60 h -68 z`} fill={theme.primary} opacity={0.5} />
          <path d={`M ${W * 0.12} ${H * 0.85} q 22 -26 44 0 q 22 26 44 0`} fill="none" stroke={theme.accent} strokeWidth={6} />
          <circle cx={W * 0.93} cy={H * 0.85} r={18} fill={theme.accent} />
          <rect x={W * 0.83} y={H * 0.28} width={26} height={26} fill={theme.primary} opacity={0.5} transform={`rotate(20 ${W * 0.83 + 13} ${H * 0.28 + 13})`} />
        </g>
      );
    default:
      return null;
  }
}

function Badge({ x, y, r, tk, index, n, icon, appear, uid }: { x: number; y: number; r: number; tk: Tokens; index: number; n: number; icon: string; appear: number; uid: string }) {
  const s = 0.4 + 0.6 * appear;
  const color = tk.badgeColorFor(index, n);
  const iconColor = tk.iconColorFor(index, n);
  const gid = `bg-${uid}`;
  const glow = tk.glowId ? `url(#${tk.glowId})` : undefined;
  const shadow = tk.shadowId ? `url(#${tk.shadowId})` : undefined;
  const gloss = <ellipse cx={-r * 0.28} cy={-r * 0.34} rx={r * 0.46} ry={r * 0.26} fill="rgba(255,255,255,0.32)" />;
  let shapeEl: React.ReactNode;
  switch (tk.badgeRender) {
    case "glow":
      shapeEl = <circle r={r} fill={rgba("#0A0E1A", 0.55)} stroke={color} strokeWidth={r * 0.13} filter={glow} />;
      break;
    case "glass":
      shapeEl = (
        <>
          <defs>
            <radialGradient id={gid} cx="0.35" cy="0.3" r="0.95">
              <stop offset="0" stopColor="rgba(255,255,255,0.6)" />
              <stop offset="1" stopColor="rgba(255,255,255,0.12)" />
            </radialGradient>
          </defs>
          <circle r={r} fill={`url(#${gid})`} stroke="rgba(255,255,255,0.65)" strokeWidth={2} filter={shadow} />
          {gloss}
        </>
      );
      break;
    case "iso3d":
      shapeEl = (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={shade(color, 0.26)} />
              <stop offset="1" stopColor={shade(color, -0.2)} />
            </linearGradient>
          </defs>
          <circle cx={0} cy={r * 0.22} r={r} fill={shade(color, -0.32)} />
          <circle r={r} fill={`url(#${gid})`} filter={shadow} />
          {gloss}
        </>
      );
      break;
    case "solidShadow":
      shapeEl = <rect x={-r} y={-r} width={2 * r} height={2 * r} rx={r * 0.34} fill={color} filter={shadow} />;
      break;
    default: // soft: gradient + schaduw + glans
      shapeEl = (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={shade(color, 0.22)} />
              <stop offset="1" stopColor={shade(color, -0.14)} />
            </linearGradient>
          </defs>
          <circle r={r} fill={`url(#${gid})`} filter={shadow} />
          {gloss}
        </>
      );
  }
  return (
    <g transform={`translate(${x}, ${y}) scale(${s})`} opacity={appear}>
      {shapeEl}
      <ExIcon name={icon} x={-r * 0.56} y={-r * 0.56} size={r * 1.12} color={iconColor} strokeWidth={2.2} />
    </g>
  );
}

interface TProps { scene: ExplainerScene; W: number; H: number; e: number; theme: ExplainerTheme; tk: Tokens }

function TitleLike({ scene, W, H, e, tk }: TProps) {
  const slide = (1 - e) * 40;
  return (
    <g transform={`translate(0, ${slide})`} opacity={e}>
      <rect x={W / 2 - 46} y={H * 0.4} width={92} height={10} rx={5} fill={tk.valueColor} />
      <text x={W / 2} y={H * 0.4 + 96} textAnchor="middle" fontFamily={FONT()} fontSize={(W >= 1920 ? 96 : 72) * tk.titleScale} fontWeight={tk.titleWeight} fill={tk.titleColor}>
        {scene.title}
      </text>
      {scene.subtitle && (
        <text x={W / 2} y={H * 0.4 + 160} textAnchor="middle" fontFamily={FONT()} fontSize={W >= 1920 ? 44 : 34} fontWeight={500} fill={tk.titleColor} opacity={0.92}>
          {scene.subtitle}
        </text>
      )}
    </g>
  );
}

function CenterDisc({ tk, cx, cy, r, e }: { tk: Tokens; cx: number; cy: number; r: number; e: number }) {
  return (
    <>
      {tk.centerRing && <circle cx={cx} cy={cy} r={r * 1.04 * (0.85 + 0.15 * e)} fill="none" stroke={tk.centerRing} strokeWidth={r * 0.05} opacity={0.9 * e} filter={tk.glowId ? `url(#${tk.glowId})` : undefined} />}
      <circle cx={cx} cy={cy} r={r * (0.85 + 0.15 * e)} fill={tk.centerDiscFill} opacity={e} />
    </>
  );
}

function DeviceMetrics({ scene, W, H, e, theme, tk }: TProps) {
  const cx = W / 2;
  const cy = H * 0.62;
  const n = scene.callouts.length;
  const R = Math.min(W, H) * 0.36;
  const badgeR = Math.min(W, H) * 0.05;
  return (
    <g>
      {scene.title && (
        <text x={cx} y={H * 0.09} textAnchor="middle" fontFamily={FONT()} fontSize={(W >= 1920 ? 60 : 46) * tk.titleScale} fontWeight={tk.titleWeight} fill={tk.titleColor} opacity={e}>
          {scene.title}
        </text>
      )}
      <CenterDisc tk={tk} cx={cx} cy={cy} r={Math.min(W, H) * 0.3} e={e} />
      <g transform={`translate(${cx}, ${cy}) scale(${0.8 + 0.2 * e})`} opacity={e}>
        <CenterIllustration name={scene.center} size={Math.min(W, H) * 0.42} theme={theme} />
      </g>
      {scene.callouts.map((c, i) => {
        const a = (200 + (n > 1 ? (i * 140) / (n - 1) : 70)) * (Math.PI / 180);
        const bx = cx + R * Math.cos(a);
        const by = cy + R * Math.sin(a);
        const appear = stagger(e, i, n);
        const left = Math.cos(a) < -0.15;
        const top = Math.sin(a) < -0.85;
        const lx = top ? bx : left ? bx - badgeR - 18 : bx + badgeR + 18;
        const ly = top ? by - badgeR - 18 : by + 8;
        const anchor = top ? "middle" : left ? "end" : "start";
        return (
          <g key={i}>
            <Badge x={bx} y={by} r={badgeR} tk={tk} index={i} n={n} icon={c.icon} appear={appear} uid={`${scene.id}-d${i}`} />
            <text x={lx} y={ly} textAnchor={anchor} fontFamily={FONT()} fontSize={(W >= 1920 ? 34 : 26) * tk.valueScale} fontWeight={tk.labelWeight} fill={tk.ink} opacity={appear} fontStyle={tk.labelItalic ? "italic" : "normal"}>
              {c.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function OrbitIcons({ scene, W, H, e, theme, tk }: TProps) {
  const cx = W / 2;
  const cy = H * 0.58;
  const n = scene.callouts.length;
  const Rc = Math.min(W, H) * 0.2;
  const Rring = Math.min(W, H) * 0.36;
  const badgeR = Math.min(W, H) * 0.052;
  const rot = e * 12;
  return (
    <g>
      {scene.title && (
        <text x={cx} y={H * 0.15} textAnchor="middle" fontFamily={FONT()} fontSize={(W >= 1920 ? 58 : 44) * tk.titleScale} fontWeight={tk.titleWeight} fill={tk.titleColor} opacity={e}>
          {scene.title}
        </text>
      )}
      <g transform={`rotate(${rot}, ${cx}, ${cy})`} opacity={0.5 * e}>
        <circle cx={cx} cy={cy} r={Rring} fill="none" stroke={tk.bgKind === "dark" ? "#26324A" : "#ffffff"} strokeWidth={2} strokeDasharray="2 16" />
        <circle cx={cx} cy={cy} r={Rring * 1.18} fill="none" stroke={tk.bgKind === "dark" ? "#26324A" : "#ffffff"} strokeWidth={2} strokeDasharray="2 22" opacity={0.6} />
      </g>
      {tk.centerRing && <circle cx={cx} cy={cy} r={Rc * 1.05 * (0.85 + 0.15 * e)} fill="none" stroke={tk.centerRing} strokeWidth={Rc * 0.04} opacity={0.9 * e} filter={tk.glowId ? `url(#${tk.glowId})` : undefined} />}
      <circle cx={cx} cy={cy} r={Rc * (0.85 + 0.15 * e)} fill={tk.orbitCenterFill} opacity={e} />
      <g transform={`translate(${cx}, ${cy}) scale(${0.8 + 0.2 * e})`} opacity={e}>
        <CenterIllustration name={scene.center} size={Rc * 1.5} theme={theme} />
      </g>
      {scene.callouts.map((c, i) => {
        const a = (-90 + (i * 360) / n) * (Math.PI / 180);
        const bx = cx + Rring * Math.cos(a);
        const by = cy + Rring * Math.sin(a);
        return <Badge key={i} x={bx} y={by} r={badgeR} tk={tk} index={i} n={n} icon={c.icon} appear={stagger(e, i, n)} uid={`${scene.id}-o${i}`} />;
      })}
    </g>
  );
}

function BoxesCallouts({ scene, W, H, e, theme, tk }: TProps) {
  const cx = W / 2;
  const cy = H * 0.56;
  const n = scene.callouts.length;
  const badgeR = Math.min(W, H) * 0.05;
  const slots = [
    { x: W * 0.2, y: H * 0.45, anchor: "start" as const, lx: W * 0.2 + badgeR + 16 },
    { x: W * 0.8, y: H * 0.45, anchor: "end" as const, lx: W * 0.8 - badgeR - 16 },
    { x: W * 0.5, y: H * 0.86, anchor: "start" as const, lx: W * 0.5 + badgeR + 16 },
    { x: W * 0.32, y: H * 0.86, anchor: "start" as const, lx: W * 0.32 + badgeR + 16 },
    { x: W * 0.68, y: H * 0.86, anchor: "end" as const, lx: W * 0.68 - badgeR - 16 },
  ];
  return (
    <g>
      <rect x={0} y={H * 0.34} width={W} height={H * 0.34} fill={tk.bgKind === "dark" ? "rgba(255,255,255,0.04)" : "#ffffff"} opacity={tk.bgKind === "dark" ? 1 : 0.14} />
      {scene.title && (
        <text x={cx} y={H * 0.15} textAnchor="middle" fontFamily={FONT()} fontSize={(W >= 1920 ? 58 : 44) * tk.titleScale} fontWeight={tk.titleWeight} fill={tk.titleColor} opacity={e}>
          {scene.title}
        </text>
      )}
      <g transform={`translate(${cx}, ${cy}) scale(${(0.8 + 0.2 * e) * 1.4})`} opacity={e}>
        <CenterIllustration name={scene.center} size={Math.min(W, H) * 0.3} theme={theme} />
      </g>
      {scene.callouts.slice(0, slots.length).map((c, i) => {
        const s = slots[i];
        const appear = stagger(e, i, n);
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={s.x} y2={s.y} stroke={tk.ink} strokeWidth={1.5} opacity={0.25 * appear} />
            <Badge x={s.x} y={s.y} r={badgeR} tk={tk} index={i} n={n} icon={c.icon} appear={appear} uid={`${scene.id}-b${i}`} />
            <text x={s.lx} y={s.y + 8} textAnchor={s.anchor} fontFamily={FONT()} fontSize={(W >= 1920 ? 32 : 26) * tk.valueScale} fontWeight={tk.labelWeight} fill={tk.ink} opacity={appear} fontStyle={tk.labelItalic ? "italic" : "normal"}>
              {c.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function paletteFor(tk: Tokens, theme: ExplainerTheme): string[] {
  if (tk.badgeMode === "outline") return NEON;
  return [theme.accent, theme.primary, "#22C55E", "#8B5CF6", "#06B6D4", "#F59E0B"];
}
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

function LineChart({ scene, W, H, e, tk }: TProps) {
  const data = scene.data ?? [];
  const glow = tk.glowId ? `url(#${tk.glowId})` : undefined;
  const title = (
    <text x={W / 2} y={H * 0.12} textAnchor="middle" fontFamily={FONT()} fontSize={(W >= 1920 ? 58 : 44) * tk.titleScale} fontWeight={tk.titleWeight} fill={tk.titleColor} opacity={e}>
      {scene.title}
    </text>
  );
  if (data.length < 2) return <g>{title}</g>;
  const x0 = W * 0.1, x1 = W * 0.9;
  const baseline = H * 0.8, top = H * 0.3;
  const chartH = baseline - top;
  const vals = data.map((d) => d.value);
  const max = Math.max(...vals), min = Math.min(...vals, 0);
  const range = max - min || 1;
  const step = (x1 - x0) / (data.length - 1);
  const pts = data.map((d, i) => [x0 + step * i, baseline - ((d.value - min) / range) * chartH] as [number, number]);
  const poly = pts.map((p) => p.join(",")).join(" ");
  const len = (x1 - x0) + chartH;
  const visible = Math.max(1, Math.round(pts.length * e));
  const areaId = `area-${scene.id}`;
  const area = `M ${pts[0][0]},${baseline} ` + pts.map((p) => `L ${p[0]},${p[1]}`).join(" ") + ` L ${pts[pts.length - 1][0]},${baseline} Z`;
  return (
    <g>
      {title}
      <defs>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tk.valueColor} stopOpacity="0.38" />
          <stop offset="1" stopColor={tk.valueColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      {pts.map((p, i) => (
        <line key={`g${i}`} x1={p[0]} y1={top} x2={p[0]} y2={baseline} stroke={tk.bgKind === "dark" ? "#1B2433" : rgba(tk.ink, 0.12)} strokeWidth={1} opacity={0.7} />
      ))}
      <path d={area} fill={`url(#${areaId})`} opacity={e} />
      <polyline points={poly} fill="none" stroke={tk.valueColor} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" filter={glow} strokeDasharray={len} strokeDashoffset={len * (1 - e)} />
      {pts.slice(0, visible).map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r={14} fill={tk.bgKind === "dark" ? "#0A0E1A" : "#fff"} stroke={tk.valueColor} strokeWidth={6} filter={glow} />
          <text x={p[0]} y={p[1] - 28} textAnchor="middle" fontFamily={FONT()} fontSize={W >= 1920 ? 40 : 30} fontWeight={800} fill={tk.titleColor}>{data[i].value}</text>
          <text x={p[0]} y={baseline + 44} textAnchor="middle" fontFamily={FONT()} fontSize={W >= 1920 ? 28 : 22} fontWeight={600} fill={tk.muted}>{data[i].label}</text>
        </g>
      ))}
    </g>
  );
}

function JourneyPath({ scene, W, H, e, tk }: TProps) {
  const n = scene.callouts.length || 1;
  const cy = H * 0.56;
  const amp = H * 0.16;
  const x0 = W * 0.12, x1 = W * 0.88;
  const step = n > 1 ? (x1 - x0) / (n - 1) : 0;
  const nodes = scene.callouts.map((c, i) => ({ c, i, x: x0 + step * i, y: cy + (i % 2 === 0 ? -amp : amp) }));
  let d = nodes.length ? `M ${nodes[0].x} ${nodes[0].y}` : "";
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1], b = nodes[i];
    const mx = (a.x + b.x) / 2;
    d += ` C ${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`;
  }
  const badgeR = Math.min(W, H) * 0.055;
  return (
    <g>
      {scene.title && (
        <text x={W / 2} y={H * 0.13} textAnchor="middle" fontFamily={FONT()} fontSize={(W >= 1920 ? 56 : 42) * tk.titleScale} fontWeight={tk.titleWeight} fill={tk.titleColor} opacity={e}>
          {scene.title}
        </text>
      )}
      <path d={d} fill="none" stroke={tk.bgKind === "dark" ? "#26324A" : rgba(tk.ink, 0.18)} strokeWidth={badgeR * 0.5} strokeLinecap="round" />
      {nodes.map(({ c, i, x, y }) => {
        const appear = stagger(e, i, n);
        return (
          <g key={i}>
            <Badge x={x} y={y} r={badgeR} tk={tk} index={i} n={n} icon={c.icon} appear={appear} uid={`${scene.id}-j${i}`} />
            <circle cx={x + badgeR * 0.74} cy={y - badgeR * 0.74} r={badgeR * 0.34} fill={tk.titleColor} opacity={appear} />
            <text x={x + badgeR * 0.74} y={y - badgeR * 0.74 + badgeR * 0.12} textAnchor="middle" fontFamily={FONT()} fontSize={badgeR * 0.38} fontWeight={800} fill={tk.bgColor} opacity={appear}>{i + 1}</text>
            <text x={x} y={y + (i % 2 === 0 ? badgeR + 40 : badgeR + 40)} textAnchor="middle" fontFamily={FONT()} fontSize={(W >= 1920 ? 30 : 24) * tk.valueScale} fontWeight={tk.labelWeight} fill={tk.ink} opacity={appear}>{c.label}</text>
          </g>
        );
      })}
    </g>
  );
}

function DonutCallouts({ scene, W, H, e, theme, tk }: TProps) {
  const data = scene.data ?? [];
  const title = (
    <text x={W / 2} y={H * 0.12} textAnchor="middle" fontFamily={FONT()} fontSize={(W >= 1920 ? 56 : 42) * tk.titleScale} fontWeight={tk.titleWeight} fill={tk.titleColor} opacity={e}>
      {scene.title}
    </text>
  );
  if (data.length < 2) return <g>{title}</g>;
  const cx = W / 2, cy = H * 0.6, r = Math.min(W, H) * 0.26;
  const pal = paletteFor(tk, theme);
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0) || 1;
  let acc = 0;
  const segs = data.map((d, i) => {
    const frac = Math.max(0, d.value) / total;
    const s = acc * 360, en = (acc + frac) * 360;
    acc += frac;
    return { d, i, s, en, mid: (s + en) / 2, color: pal[i % pal.length], pct: Math.round(frac * 100) };
  });
  const sweep = 360 * e;
  return (
    <g>
      {title}
      <g filter={tk.glowId ? `url(#${tk.glowId})` : undefined}>
        <defs>
          {segs.map((sg) => (
            <linearGradient key={`g${sg.i}`} id={`seg-${scene.id}-${sg.i}`} x1="0" y1="0" x2="0.3" y2="1">
              <stop offset="0" stopColor={shade(sg.color, 0.26)} />
              <stop offset="1" stopColor={shade(sg.color, -0.08)} />
            </linearGradient>
          ))}
        </defs>
        {segs.map((sg) => {
          const en = Math.min(sg.en, sweep);
          if (en <= sg.s) return null;
          return <path key={sg.i} d={arcPath(cx, cy, r, sg.s, en)} fill={`url(#seg-${scene.id}-${sg.i})`} />;
        })}
      </g>
      <circle cx={cx} cy={cy} r={r * 0.56} fill={tk.bgKind === "dark" ? "#0A0E1A" : tk.bgKind === "gradient" ? tk.gradTo : tk.bgColor} />
      <ellipse cx={cx - r * 0.3} cy={cy - r * 0.4} rx={r * 0.55} ry={r * 0.28} fill="rgba(255,255,255,0.12)" />
      {segs.map((sg) => {
        const [lx, ly] = polar(cx, cy, r * 1.2, sg.mid);
        const left = lx < cx;
        const appear = clamp01((e - sg.s / 360) * 3);
        return (
          <g key={`l${sg.i}`} opacity={appear}>
            <circle cx={lx} cy={ly} r={Math.min(W, H) * 0.03} fill={sg.color} />
            <text x={lx} y={ly + 7} textAnchor="middle" fontFamily={FONT()} fontSize={W >= 1920 ? 26 : 20} fontWeight={800} fill="#fff">{sg.i + 1}</text>
            <text x={left ? lx - Math.min(W, H) * 0.04 : lx + Math.min(W, H) * 0.04} y={ly + 8} textAnchor={left ? "end" : "start"} fontFamily={FONT()} fontSize={(W >= 1920 ? 28 : 22)} fontWeight={tk.labelWeight} fill={tk.ink}>{sg.d.label} ({sg.pct}%)</text>
          </g>
        );
      })}
    </g>
  );
}

function BigStat({ scene, W, H, e, tk }: TProps) {
  const items = scene.callouts.slice(0, 2);
  const cols = items.length || 1;
  return (
    <g>
      {scene.title && (
        <text x={W / 2} y={H * 0.16} textAnchor="middle" fontFamily={FONT()} fontSize={(W >= 1920 ? 52 : 40) * tk.titleScale} fontWeight={tk.titleWeight} fill={tk.titleColor} opacity={e}>
          {scene.title}
        </text>
      )}
      {items.map((c, i) => {
        const cx = cols === 1 ? W / 2 : W * (i === 0 ? 0.3 : 0.7);
        const appear = stagger(e, i, cols, 0.1, 0.5);
        const slide = (1 - appear) * 30;
        return (
          <g key={i} transform={`translate(0, ${slide})`} opacity={appear}>
            <g transform={`translate(${cx}, ${H * 0.42})`}>
              <Badge x={0} y={0} r={Math.min(W, H) * 0.07} tk={tk} index={i} n={cols} icon={c.icon} appear={appear} uid={`${scene.id}-s${i}`} />
            </g>
            <text x={cx} y={H * 0.66} textAnchor="middle" fontFamily={FONT()} fontSize={(cols === 1 ? (W >= 1920 ? 130 : 96) : (W >= 1920 ? 90 : 66)) * tk.valueScale} fontWeight={900} fill={tk.valueColor}>
              {c.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

const ISO_PALETTE = ["#EC4899", "#D946EF", "#A855F7", "#7C6CF0", "#6366F1", "#3B82F6"];

function IsoSteps({ scene, W, H, e, tk }: TProps) {
  const steps = scene.callouts.slice(0, 6);
  const n = steps.length || 1;
  const title = (
    <text x={W / 2} y={H * 0.12} textAnchor="middle" fontFamily={FONT()} fontSize={(W >= 1920 ? 56 : 42) * tk.titleScale} fontWeight={tk.titleWeight} fill={tk.titleColor} opacity={e}>
      {scene.title}
    </text>
  );
  if (steps.length < 2) return <g>{title}</g>;
  const w = Math.min(W, H) * 0.12;
  const ry = w * 0.5;
  const th = w * 0.6;
  const dx = w * 1.5;
  const dy = (ry + th) * 0.8;
  const x0 = W / 2 - ((n - 1) * dx) / 2;
  const y0 = H * 0.66 + ((n - 1) * dy) / 2;
  const shadow = tk.shadowId ? `url(#${tk.shadowId})` : undefined;
  const items = steps.map((c, i) => {
    const cx = x0 + i * dx;
    const cy = y0 - i * dy;
    const color = ISO_PALETTE[i % ISO_PALETTE.length];
    const appear = stagger(e, i, n, 0.1, 0.4);
    const rise = (1 - appear) * 36;
    const gid = `iso-${scene.id}-${i}`;
    const top = `M ${cx},${cy - ry} L ${cx + w},${cy} L ${cx},${cy + ry} L ${cx - w},${cy} Z`;
    const left = `M ${cx - w},${cy} L ${cx},${cy + ry} L ${cx},${cy + ry + th} L ${cx - w},${cy + th} Z`;
    const right = `M ${cx},${cy + ry} L ${cx + w},${cy} L ${cx + w},${cy + th} L ${cx},${cy + ry + th} Z`;
    // Labels altijd aan de linkerzijde: dat gebied is bij een oplopende trap vrij.
    const nodeX = cx - w - 56;
    const nodeY = cy;
    return (
      <g key={i} transform={`translate(0, ${rise})`} opacity={appear}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0.25" y2="1">
            <stop offset="0" stopColor={shade(color, 0.24)} />
            <stop offset="1" stopColor={color} />
          </linearGradient>
        </defs>
        <path d={right} fill={shade(color, -0.14)} />
        <path d={left} fill={shade(color, -0.3)} />
        <path d={top} fill={`url(#${gid})`} filter={shadow} />
        <text x={cx} y={cy + ry * 0.2} textAnchor="middle" fontFamily={FONT()} fontSize={w * 0.5} fontWeight={800} fill="#ffffff">{String(i + 1).padStart(2, "0")}</text>
        <line x1={cx - w} y1={cy} x2={nodeX} y2={nodeY} stroke={tk.muted} strokeWidth={2} strokeDasharray="3 6" opacity={0.8} />
        <circle cx={nodeX} cy={nodeY} r={9} fill="none" stroke={color} strokeWidth={4} />
        <text x={nodeX - 16} y={nodeY + 7} textAnchor="end" fontFamily={FONT()} fontSize={(W >= 1920 ? 30 : 24) * tk.valueScale} fontWeight={tk.labelWeight} fill={tk.ink}>{c.label}</text>
      </g>
    );
  });
  // Onderste/voorste stap (i=0) als laatste tekenen voor correcte overlap.
  return <g>{title}{items.slice().reverse()}</g>;
}

function ringSeg(rOut: number, rIn: number, a0: number, a1: number): string {
  const [ox0, oy0] = polar(0, 0, rOut, a0);
  const [ox1, oy1] = polar(0, 0, rOut, a1);
  const [ix1, iy1] = polar(0, 0, rIn, a1);
  const [ix0, iy0] = polar(0, 0, rIn, a0);
  const large = a1 - a0 <= 180 ? 0 : 1;
  return `M ${ox0},${oy0} A ${rOut},${rOut} 0 ${large} 1 ${ox1},${oy1} L ${ix1},${iy1} A ${rIn},${rIn} 0 ${large} 0 ${ix0},${iy0} Z`;
}

function IsoDonut({ scene, W, H, e, theme, tk }: TProps) {
  const data = scene.data ?? [];
  const title = (
    <text x={W / 2} y={H * 0.12} textAnchor="middle" fontFamily={FONT()} fontSize={(W >= 1920 ? 56 : 42) * tk.titleScale} fontWeight={tk.titleWeight} fill={tk.titleColor} opacity={e}>
      {scene.title}
    </text>
  );
  if (data.length < 2) return <g>{title}</g>;
  const cx = W / 2, cy = H * 0.58;
  const rOut = Math.min(W, H) * 0.24, rIn = rOut * 0.56;
  const th = rOut * 0.5;
  const sy = 0.6;
  const pal = paletteFor(tk, theme);
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0) || 1;
  let acc = 0;
  const segs = data.map((d, i) => {
    const frac = Math.max(0, d.value) / total;
    const s = acc * 360, en = (acc + frac) * 360;
    acc += frac;
    return { d, i, s, en, mid: (s + en) / 2, color: pal[i % pal.length], pct: Math.round(frac * 100) };
  });
  const sweep = 360 * e;
  const shadow = tk.shadowId ? `url(#${tk.shadowId})` : undefined;
  const calloutPos = (a: number, rad: number): [number, number] => {
    const ang = ((a - 90) * Math.PI) / 180;
    return [cx + rad * Math.cos(ang), cy + rad * sy * Math.sin(ang)];
  };
  return (
    <g>
      {title}
      <g transform={`translate(${cx}, ${cy}) scale(1, ${sy})`}>
        <g transform={`translate(0, ${th})`}>
          {segs.map((sg) => {
            const en = Math.min(sg.en, sweep);
            return en > sg.s ? <path key={`d${sg.i}`} d={ringSeg(rOut, rIn, sg.s, en)} fill={shade(sg.color, -0.45)} /> : null;
          })}
        </g>
        {segs.map((sg) => {
          const en = Math.min(sg.en, sweep);
          return en > sg.s ? <path key={`t${sg.i}`} d={ringSeg(rOut, rIn, sg.s, en)} fill={sg.color} filter={shadow} /> : null;
        })}
      </g>
      {segs.map((sg) => {
        const [px, py] = calloutPos(sg.mid, rOut + Math.min(W, H) * 0.05);
        const left = px < cx;
        const appear = clamp01((e - sg.s / 360) * 3);
        const nr = Math.min(W, H) * 0.028;
        return (
          <g key={`c${sg.i}`} opacity={appear}>
            <circle cx={px} cy={py} r={nr} fill={sg.color} filter={shadow} />
            <text x={px} y={py + nr * 0.36} textAnchor="middle" fontFamily={FONT()} fontSize={nr * 1.1} fontWeight={800} fill="#fff">{sg.i + 1}</text>
            <text x={left ? px - nr - 12 : px + nr + 12} y={py + 8} textAnchor={left ? "end" : "start"} fontFamily={FONT()} fontSize={W >= 1920 ? 26 : 20} fontWeight={tk.labelWeight} fill={tk.ink}>{sg.d.label} ({sg.pct}%)</text>
          </g>
        );
      })}
    </g>
  );
}

export function SceneInner({ spec, sceneIndex, progress }: { spec: ExplainerSpec; sceneIndex: number; progress: number }) {
  const { width: W, height: H } = canvasSize(spec.format);
  const scene = spec.scenes[sceneIndex];
  const style = spec.style ?? "flat";
  const tk = tokensFor(style, scene, spec.theme);
  const e = easeOut(clamp01(progress));
  const common: TProps = { scene, W, H, e, theme: spec.theme, tk };

  let body: React.ReactNode = null;
  switch (scene.template) {
    case "title":
    case "outro":
      body = <TitleLike {...common} />;
      break;
    case "deviceMetrics":
      body = <DeviceMetrics {...common} />;
      break;
    case "orbitIcons":
      body = <OrbitIcons {...common} />;
      break;
    case "boxesCallouts":
      body = <BoxesCallouts {...common} />;
      break;
    case "lineChart":
      body = <LineChart {...common} />;
      break;
    case "journeyPath":
      body = <JourneyPath {...common} />;
      break;
    case "donutCallouts":
      body = <DonutCallouts {...common} />;
      break;
    case "bigStat":
      body = <BigStat {...common} />;
      break;
    case "isoSteps":
      body = <IsoSteps {...common} />;
      break;
    case "isoDonut":
      body = <IsoDonut {...common} />;
      break;
  }

  return (
    <>
      {tk.glowId && (
        <defs>
          <filter id={tk.glowId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}
      {tk.shadowId && (
        <defs>
          <filter id={tk.shadowId} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#0B1220" floodOpacity="0.3" />
          </filter>
        </defs>
      )}
      <Background tk={tk} W={W} H={H} />
      <Decoration tk={tk} theme={spec.theme} W={W} H={H} />
      {body}
    </>
  );
}

export default function ExplainerStage({ spec, sceneIndex, progress }: { spec: ExplainerSpec; sceneIndex: number; progress: number }) {
  const { width: W, height: H } = canvasSize(spec.format);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <SceneInner spec={spec} sceneIndex={sceneIndex} progress={progress} />
    </svg>
  );
}
