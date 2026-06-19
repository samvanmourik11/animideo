"use client";

import { useEffect, useRef, useState } from "react";

// Gedeelde bouwblokken voor de "Infographics Show"-stijl: personages, scènes,
// een scene-model en een Speler die scenes achter elkaar afspeelt. Alles in code.

// ── Hand ───────────────────────────────────────────────────────────────────
function Hand({ x, y, r = 0, s = 1, fill, line, lw = 0 }:
  { x: number; y: number; r?: number; s?: number; fill: string; line?: string; lw?: number }) {
  const F: [number, number, number, number][] =
    [[-6, -3, -7.5, -17], [-2, -5, -2.5, -19], [2, -5, 2.5, -19], [6, -3, 7.5, -17], [-7, 3, -15, -3]];
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} strokeLinecap="round">
      {lw > 0 && line && F.map((f, i) => <line key={`o${i}`} x1={f[0]} y1={f[1]} x2={f[2]} y2={f[3]} stroke={line} strokeWidth={5.5 + lw * 2} />)}
      {lw > 0 && line && <circle r={9 + lw} fill={line} />}
      {F.map((f, i) => <line key={i} x1={f[0]} y1={f[1]} x2={f[2]} y2={f[3]} stroke={fill} strokeWidth={5.5} />)}
      <circle r={9} fill={fill} />
    </g>
  );
}

// ── Personages (5 stijlen) ──────────────────────────────────────────────────
export type Expression = "neutraal" | "blij" | "verbaasd" | "denkend";
export type Pose = "presenteren" | "zwaaien" | "wijzen" | "idle";

export function Character({
  skin = "#e8b58f", skinShade = "#e2a878", hair = "#3a2a22",
  shirt = "#f1f4f8", accent = "#2b6cb0", longHair = false,
  expression = "neutraal", pose = "presenteren", talk = true,
}: {
  skin?: string; skinShade?: string; hair?: string; shirt?: string;
  accent?: string; longHair?: boolean; expression?: Expression; pose?: Pose; talk?: boolean;
}) {
  const browY = expression === "verbaasd" ? 96 : 104;
  const browTilt = expression === "denkend" ? 10 : 0;
  const eyeRy = expression === "verbaasd" ? 19 : 15;
  const pupilR = expression === "verbaasd" ? 6.5 : 5.5;
  let mouth: React.ReactNode;
  if (expression === "blij") mouth = <path d="M222 168 Q240 188 258 168" stroke="#7a3b34" strokeWidth={6} fill="none" strokeLinecap="round" />;
  else if (expression === "verbaasd") mouth = <ellipse cx={240} cy={172} rx={9} ry={11} fill="#7a3b34" />;
  else mouth = <ellipse className={talk ? "mouth talk" : "mouth"} cx={240} cy={170} rx={14} ry={4} fill="#7a3b34" style={{ transformOrigin: "240px 170px" }} />;
  const armClass = pose === "zwaaien" ? "arm wave" : pose === "wijzen" ? "arm point" : pose === "idle" ? "arm" : "arm present";
  const armPath = pose === "zwaaien" ? "M315 195 Q360 150 372 100" : pose === "wijzen" ? "M315 195 Q370 175 415 150" : pose === "idle" ? "M315 200 Q330 250 320 300" : "M315 195 Q360 165 405 172";
  const handXY = pose === "zwaaien" ? [374, 96] : pose === "wijzen" ? [420, 148] : pose === "idle" ? [320, 305] : [410, 172];
  return (
    <svg viewBox="0 0 480 360" className="charSvg" preserveAspectRatio="xMidYMax meet">
      <g className="char">
        <path d="M120 360 L120 300 Q120 250 240 250 Q360 250 360 300 L360 360 Z" fill={shirt} />
        <path d="M224 250 L240 300 L256 250 Z" fill={accent} />
        <rect x={232} y={250} width={16} height={52} fill={accent} />
        <rect x={216} y={196} width={48} height={56} rx={14} fill={skinShade} />
        {longHair && <path d="M150 110 Q150 250 196 250 L284 250 Q330 250 330 110 Z" fill={hair} />}
        <circle cx={240} cy={120} r={80} fill={skin} />
        <circle cx={162} cy={122} r={13} fill={skinShade} />
        <circle cx={318} cy={122} r={13} fill={skinShade} />
        <path d="M164 112 Q158 38 240 34 Q322 38 316 112 Q294 74 240 74 Q186 74 164 112 Z" fill={hair} />
        <rect x={198} y={browY} width={34} height={7} rx={3.5} fill={hair} transform={`rotate(${browTilt} 215 ${browY})`} />
        <rect x={248} y={browY} width={34} height={7} rx={3.5} fill={hair} transform={`rotate(${-browTilt} 265 ${browY})`} />
        <g className="eye" style={{ transformOrigin: "216px 122px" }}><ellipse cx={216} cy={122} rx={13} ry={eyeRy} fill="#fff" /><circle cx={218} cy={124} r={pupilR} fill="#1f2937" /></g>
        <g className="eye" style={{ transformOrigin: "264px 122px" }}><ellipse cx={264} cy={122} rx={13} ry={eyeRy} fill="#fff" /><circle cx={266} cy={124} r={pupilR} fill="#1f2937" /></g>
        <circle cx={198} cy={150} r={11} fill="#f0a99a" opacity={0.5} />
        <circle cx={282} cy={150} r={11} fill="#f0a99a" opacity={0.5} />
        {mouth}
        <g className={armClass} style={{ transformOrigin: "315px 200px" }}>
          <path d={armPath} stroke={shirt} strokeWidth={32} fill="none" strokeLinecap="round" />
          <Hand x={handXY[0]} y={handXY[1]} s={1.4} fill={skin} r={pose === "zwaaien" ? -8 : pose === "wijzen" ? 92 : pose === "idle" ? 172 : 78} />
        </g>
        {expression === "denkend" && (
          <g className="arm"><path d="M300 250 Q270 210 250 178" stroke={shirt} strokeWidth={30} fill="none" strokeLinecap="round" /><circle cx={248} cy={176} r={15} fill={skin} /></g>
        )}
      </g>
    </svg>
  );
}

export function CharacterB({ skin = "#f0c39c", hair = "#2a1d16", shirt = "#ef6f53", pants = "#2b3a67", pose = "zwaaien" }:
  { skin?: string; hair?: string; shirt?: string; pants?: string; pose?: "zwaaien" | "lopen" | "wijzen" }) {
  const walking = pose === "lopen";
  const rightArm = pose === "zwaaien" ? "M190 118 Q214 86 222 50" : pose === "wijzen" ? "M190 122 Q226 120 252 116" : "M190 118 Q202 158 196 196";
  const rightHand = pose === "zwaaien" ? [223, 47] : pose === "wijzen" ? [254, 116] : [196, 200];
  return (
    <svg viewBox="0 0 320 480" className="charSvg" preserveAspectRatio="xMidYMax meet">
      <g className={walking ? "bguy walkbob" : "bguy swayB"}>
        <g className={walking ? "legB legA" : "legB"} style={{ transformOrigin: "153px 248px" }}><path d="M153 242 L146 418" stroke={pants} strokeWidth={22} strokeLinecap="round" fill="none" /><ellipse cx={140} cy={424} rx={20} ry={10} fill="#1f2937" /></g>
        <g className={walking ? "legB legBk" : "legB"} style={{ transformOrigin: "167px 248px" }}><path d="M167 242 L176 418" stroke={pants} strokeWidth={22} strokeLinecap="round" fill="none" /><ellipse cx={182} cy={424} rx={20} ry={10} fill="#1f2937" /></g>
        <path d="M126 110 Q160 98 194 110 L186 246 Q160 258 134 246 Z" fill={shirt} />
        <g className={walking ? "armB armA" : "armB"} style={{ transformOrigin: "130px 118px" }}><path d="M130 118 Q118 158 126 196" stroke={shirt} strokeWidth={18} strokeLinecap="round" fill="none" /><Hand x={126} y={200} r={172} fill={skin} /></g>
        <g className={pose === "zwaaien" ? "armB waveB" : walking ? "armB armBk" : "armB"} style={{ transformOrigin: "190px 118px" }}><path d={rightArm} stroke={shirt} strokeWidth={18} strokeLinecap="round" fill="none" /><Hand x={rightHand[0]} y={rightHand[1]} fill={skin} r={pose === "zwaaien" ? -6 : pose === "wijzen" ? 92 : 172} /></g>
        <rect x={152} y={94} width={16} height={20} fill={skin} />
        <circle cx={160} cy={66} r={34} fill={skin} />
        <path d="M127 62 Q125 28 160 26 Q195 28 193 62 Q179 46 160 46 Q141 46 127 62 Z" fill={hair} />
        <circle cx={150} cy={66} r={4} fill="#1f2937" /><circle cx={170} cy={66} r={4} fill="#1f2937" />
        <path d="M151 78 Q160 86 169 78" stroke="#7a3b34" strokeWidth={3.5} fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function CharacterC() {
  const ink = "#27303f", fill = "#dbe9ff";
  return (
    <svg viewBox="0 0 320 360" className="charSvg" preserveAspectRatio="xMidYMax meet">
      <g className="char">
        <path d="M70 360 L70 300 Q70 250 160 250 Q250 250 250 300 L250 360 Z" fill={fill} stroke={ink} strokeWidth={5} strokeLinejoin="round" />
        <path d="M142 252 L160 284 L178 252" fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" />
        <line x1={146} y1={250} x2={146} y2={216} stroke={ink} strokeWidth={5} /><line x1={174} y1={250} x2={174} y2={216} stroke={ink} strokeWidth={5} />
        <circle cx={160} cy={152} r={62} fill="#fff" stroke={ink} strokeWidth={5} />
        <path d="M100 148 Q96 86 160 84 Q224 86 220 148 Q210 112 160 112 Q110 112 100 148 Z" fill={ink} />
        <circle cx={140} cy={152} r={4.5} fill={ink} /><circle cx={180} cy={152} r={4.5} fill={ink} />
        <path d="M128 136 q12 -6 24 0 M168 136 q12 -6 24 0" fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round" />
        <path d="M142 178 Q160 194 178 178" fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" />
        <g className="arm waveB" style={{ transformOrigin: "240px 272px" }}>
          <path d="M240 272 Q286 232 292 186" fill="none" stroke={ink} strokeWidth={17} strokeLinecap="round" />
          <path d="M240 272 Q286 232 292 186" fill="none" stroke={fill} strokeWidth={8} strokeLinecap="round" />
          <Hand x={293} y={184} r={-6} fill="#fff" line={ink} lw={2.2} />
        </g>
      </g>
    </svg>
  );
}

export function CharacterD({ body = "#10a37f" }: { body?: string }) {
  const ink = "#1f2937";
  return (
    <svg viewBox="0 0 320 360" className="charSvg" preserveAspectRatio="xMidYMax meet">
      <g className="bounce">
        <path d="M134 250 L130 312" stroke={ink} strokeWidth={10} strokeLinecap="round" /><path d="M186 250 L190 312" stroke={ink} strokeWidth={10} strokeLinecap="round" />
        <ellipse cx={124} cy={316} rx={16} ry={8} fill={ink} /><ellipse cx={196} cy={316} rx={16} ry={8} fill={ink} />
        <rect x={96} y={120} width={128} height={132} rx={40} fill={body} />
        <circle cx={138} cy={178} r={15} fill="#fff" /><circle cx={182} cy={178} r={15} fill="#fff" />
        <circle cx={140} cy={181} r={6.5} fill={ink} /><circle cx={184} cy={181} r={6.5} fill={ink} />
        <path d="M142 206 Q160 222 178 206" fill="none" stroke="#fff" strokeWidth={6} strokeLinecap="round" />
        <path d="M96 168 Q70 180 64 200" stroke={ink} strokeWidth={10} strokeLinecap="round" fill="none" /><Hand x={62} y={204} r={170} s={0.8} fill={ink} />
        <g className="arm waveB" style={{ transformOrigin: "224px 162px" }}><path d="M224 162 Q258 132 264 96" stroke={ink} strokeWidth={10} strokeLinecap="round" fill="none" /><Hand x={265} y={92} r={-6} s={0.8} fill={ink} /></g>
      </g>
    </svg>
  );
}

export function CharacterE({ skin = "#f3b58a", hair = "#28324a", shirt = "#f4a72c" }: { skin?: string; hair?: string; shirt?: string }) {
  const ink = "#21263a", sw = 7;
  return (
    <svg viewBox="0 0 320 360" className="charSvg" preserveAspectRatio="xMidYMax meet">
      <g className="char">
        <path d="M70 360 L70 300 Q70 248 160 248 Q250 248 250 300 L250 360 Z" fill={shirt} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
        <rect x={140} y={206} width={40} height={52} fill={skin} stroke={ink} strokeWidth={sw} />
        <circle cx={160} cy={148} r={66} fill={skin} stroke={ink} strokeWidth={sw} />
        <path d="M94 150 Q88 76 160 72 Q232 76 226 150 Q204 106 160 106 Q116 106 94 150 Z" fill={hair} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
        <g className="eye" style={{ transformOrigin: "138px 150px" }}><circle cx={138} cy={150} r={11} fill="#fff" stroke={ink} strokeWidth={3} /><circle cx={140} cy={152} r={5} fill={ink} /></g>
        <g className="eye" style={{ transformOrigin: "182px 150px" }}><circle cx={182} cy={150} r={11} fill="#fff" stroke={ink} strokeWidth={3} /><circle cx={184} cy={152} r={5} fill={ink} /></g>
        <path d="M124 130 q14 -8 28 0 M168 130 q14 -8 28 0" fill="none" stroke={ink} strokeWidth={6} strokeLinecap="round" />
        <path d="M138 176 Q160 196 182 176" fill="none" stroke={ink} strokeWidth={6} strokeLinecap="round" />
        <g className="arm waveB" style={{ transformOrigin: "240px 278px" }}>
          <path d="M240 278 Q286 236 292 190" fill="none" stroke={ink} strokeWidth={34} strokeLinecap="round" />
          <path d="M240 278 Q286 236 292 190" fill="none" stroke={shirt} strokeWidth={24} strokeLinecap="round" />
          <Hand x={293} y={188} r={-6} s={1.2} fill={skin} line={ink} lw={2.6} />
        </g>
      </g>
    </svg>
  );
}

const CHARS: Record<string, React.FC<any>> = { A: Character, B: CharacterB, C: CharacterC, D: CharacterD, E: CharacterE };

// ── Hulpjes ─────────────────────────────────────────────────────────────────
function Swirl() {
  const stripes: string[] = [];
  for (let i = -2; i < 22; i++) {
    let d = `M -120 ${i * 92}`;
    for (let x = -120; x <= 2120; x += 28) d += ` L ${x} ${(i * 92 + Math.sin(x / 190 + i * 0.55) * 48).toFixed(1)}`;
    stripes.push(d);
  }
  return (
    <svg className="swirl" viewBox="0 0 2000 2000" preserveAspectRatio="xMidYMid slice">
      <rect width="2000" height="2000" fill="#1d2a86" />
      {stripes.map((d, i) => <path key={i} d={d} fill="none" stroke="#33489f" strokeWidth={52} />)}
    </svg>
  );
}
function Logo() { return <div className="logo"><div className="logoMark">i</div><span>JOUWANIMATIEVIDEO</span></div>; }

function useLoopCount(from: number, to: number, dur: number, cycle: number) {
  const [v, setV] = useState(from);
  useEffect(() => {
    let raf = 0, startT = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const run = (now: number) => {
      if (!startT) startT = now;
      const t = Math.min(1, ((now - startT) % cycle) / dur);
      setV(Math.round(from + (to - from) * ease(t)));
      raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [from, to, dur, cycle]);
  return v;
}

// ── Scene-model ───────────────────────────────────────────────────────────
// Vrije compositie: ChatGPT plaatst elementen op een 16:9 vlak (x,y in % 0-100).
export type FreeElement =
  | { kind: "text"; x: number; y: number; text: string; size?: "s" | "m" | "l" | "xl"; color?: string; align?: "left" | "center" | "right" }
  | { kind: "stat"; x: number; y: number; value: string; label?: string; color?: string }
  | { kind: "icon"; x: number; y: number; emoji: string; size?: number }
  | { kind: "shape"; shape: "rect" | "circle"; x: number; y: number; w: number; h?: number; color?: string; radius?: number }
  | { kind: "char"; x: number; y: number; w?: number; h?: number; styleId?: "A" | "B" | "C" | "D" | "E"; expression?: Expression; pose?: Pose }
  | { kind: "arrow"; x1: number; y1: number; x2: number; y2: number; color?: string };

export type Scene =
  | { type: "free"; dur: number; bg: string; swirl?: boolean; elements: FreeElement[] }
  | { type: "statement"; dur: number; text: string; sub?: string }
  | { type: "gauge"; dur: number; headline: string; title: string; from: number; to: number; unit?: string }
  | { type: "triptych"; dur: number; panels: string[] }
  | { type: "map"; dur: number }
  | { type: "chart"; dur: number; pct: number; label: string; sub?: string }
  | { type: "character"; dur: number; styleId: "A" | "B" | "C" | "D" | "E"; bg: string; bubble?: string; charProps?: Record<string, unknown> };

const PANEL_COLORS = ["#2f5fb0", "#2e8b6f", "#b0383f", "#6b46c1"];

// ── Scene-renderers (vullen de hele stage) ─────────────────────────────────
function GaugeView({ headline, title, from, to, unit = "" }: any) {
  const val = useLoopCount(from, to, 1500, 9000);
  return (
    <>
      <Swirl />
      <div className="gHeadline">{headline}</div>
      <div className="gCard">
        <div className="gTitle">{title}</div>
        <svg viewBox="0 0 400 250" className="gGauge">
          <defs><linearGradient id="ggp" x1="40" y1="0" x2="360" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#22c55e" /><stop offset="0.45" stopColor="#eab308" /><stop offset="0.72" stopColor="#f97316" /><stop offset="1" stopColor="#ef4444" /></linearGradient></defs>
          <path d="M 40 200 A 160 160 0 0 1 360 200" fill="none" stroke="url(#ggp)" strokeWidth={24} strokeLinecap="round" />
          <g className="gNeedle" style={{ transformOrigin: "200px 200px" }}><line x1={200} y1={200} x2={200} y2={68} stroke="#1f2937" strokeWidth={6} strokeLinecap="round" /></g>
          <circle cx={200} cy={200} r={13} fill="#1f2937" /><circle cx={200} cy={200} r={5} fill="#fff" />
        </svg>
        <div className="gNum">{unit}{val.toLocaleString("nl-NL")}</div>
      </div>
      <Logo />
    </>
  );
}
function TriptychView({ panels }: { panels: string[] }) {
  return (
    <>
      <div className="trip">
        {panels.map((h, i) => (
          <div key={i} className="panel" style={{ background: PANEL_COLORS[i % PANEL_COLORS.length], animationDelay: `${i * 0.25}s` }}>
            <div className="panelH">{h}</div>
            <svg viewBox="0 0 120 120" className="target">
              <circle cx={60} cy={60} r={46} fill="#e23b3b" /><circle cx={60} cy={60} r={34} fill="#fff" /><circle cx={60} cy={60} r={22} fill="#e23b3b" /><circle cx={60} cy={60} r={11} fill="#fff" /><circle cx={60} cy={60} r={4} fill="#e23b3b" />
              <g className="arrow" style={{ transformOrigin: "60px 60px" }}><line x1={60} y1={60} x2={118} y2={30} stroke="#7a4a1f" strokeWidth={5} strokeLinecap="round" /><polygon points="60,60 74,54 70,68" fill="#c9962f" /></g>
            </svg>
          </div>
        ))}
      </div>
      <Logo />
    </>
  );
}
function MapView() {
  return (
    <>
      <svg viewBox="0 0 680 360" className="full">
        <rect x={0} y={0} width={680} height={360} fill="#dfe7ea" /><rect x={0} y={210} width={680} height={40} fill="#cdd8dc" /><rect x={300} y={0} width={42} height={360} fill="#cdd8dc" /><circle cx={150} cy={90} r={48} fill="#bcd6b0" /><rect x={470} y={250} width={150} height={90} rx={8} fill="#bcd6b0" />
        <path d="M70 250 C 180 250, 200 110, 330 120 S 520 210, 600 120" fill="none" stroke="#e23b3b" strokeWidth={6} strokeLinecap="round" strokeDasharray="12 12" />
        <g transform="translate(600 120)"><circle cx={0} cy={0} r={5} fill="#1f2937" /><circle cx={-14} cy={-2} r={7} fill="#1f2937" /><circle cx={14} cy={-2} r={7} fill="#1f2937" /></g>
        <g transform="translate(70 250)"><path d="M0 6 C 22 6 22 -22 0 -40 C -22 -22 -22 6 0 6 Z" fill="#2b6cb0" /><circle cx={0} cy={-20} r={9} fill="#fff" /></g>
        <g className="car"><rect x={-16} y={-9} width={32} height={18} rx={5} fill="#1f2937" /><rect x={-9} y={-15} width={16} height={8} rx={3} fill="#374151" /><circle cx={-9} cy={9} r={4} fill="#111" /><circle cx={9} cy={9} r={4} fill="#111" /></g>
      </svg>
      <Logo />
    </>
  );
}
function ChartView({ pct, label, sub = "VERLIES" }: any) {
  const cur = useLoopCount(0, pct, 1600, 9000);
  const R = 70, C = 2 * Math.PI * R, off = C * (1 - cur / 100);
  return (
    <>
      <svg viewBox="0 0 680 360" className="full"><rect x={0} y={0} width={680} height={360} fill="#101a2e" />{[40, 250, 470].map((x) => (<g key={x}><rect x={x} y={60} width={170} height={110} rx={6} fill="#16243f" /><rect x={x} y={200} width={170} height={110} rx={6} fill="#16243f" /></g>))}</svg>
      <div className="chartWrap"><svg viewBox="0 0 180 180" className="donut"><circle cx={90} cy={90} r={R} fill="none" stroke="#26344f" strokeWidth={22} /><circle cx={90} cy={90} r={R} fill="none" stroke="#5fd36a" strokeWidth={22} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 90 90)" /><text x={90} y={86} textAnchor="middle" className="donutPct">{cur}%</text><text x={90} y={108} textAnchor="middle" className="donutSub">{sub}</text></svg></div>
      <div className="chartLabel">{label}</div>
      <Logo />
    </>
  );
}
function StatementView({ text, sub }: { text: string; sub?: string }) {
  return (<><Swirl /><div className="stmt"><div className="stmtMain">{text}</div>{sub && <div className="stmtSub">{sub}</div>}</div><Logo /></>);
}
function CharacterView({ styleId, bg, bubble, charProps }: any) {
  const C = CHARS[styleId] ?? Character;
  return (
    <div style={{ position: "absolute", inset: 0, background: bg }}>
      <div className="board" />
      <C {...(charProps ?? {})} />
      {bubble && <div className="cbubble">{bubble}<span className="ctail" /></div>}
      <Logo />
    </div>
  );
}

const FE_SIZE: Record<string, string> = { s: "clamp(11px,2vw,20px)", m: "clamp(15px,3vw,30px)", l: "clamp(20px,4.4vw,46px)", xl: "clamp(26px,6vw,64px)" };
function FreeEl({ e, i }: { e: FreeElement; i: number }) {
  const base: React.CSSProperties = { position: "absolute", animationDelay: `${0.1 + i * 0.12}s` };
  const fd: React.CSSProperties = { animationDelay: `${-(i % 4) * 1.3}s` }; // float-fase varieren
  if (e.kind === "text")
    return <div className="fe" style={{ ...base, left: `${e.x}%`, top: `${e.y}%` }}><div className="feFloat feText" style={{ ...fd, color: e.color || "#fff", fontSize: FE_SIZE[e.size || "m"], textAlign: e.align || "center" }}>{e.text}</div></div>;
  if (e.kind === "stat")
    return <div className="fe" style={{ ...base, left: `${e.x}%`, top: `${e.y}%` }}><div className="feFloat feStat" style={{ ...fd, color: e.color || "#fff" }}><div className="feStatV">{e.value}</div>{e.label && <div className="feStatL">{e.label}</div>}</div></div>;
  if (e.kind === "icon")
    return <div className="fe" style={{ ...base, left: `${e.x}%`, top: `${e.y}%` }}><div className="feFloat" style={{ ...fd, fontSize: `${e.size || 10}vmin`, lineHeight: 1 }}>{e.emoji}</div></div>;
  if (e.kind === "shape")
    return <div className="fe" style={{ ...base, left: `${e.x}%`, top: `${e.y}%`, width: `${e.w}%`, height: `${e.h ?? e.w}%`, background: e.color || "#3b82f6", borderRadius: e.shape === "circle" ? "50%" : `${e.radius ?? 14}px` }} />;
  if (e.kind === "char") {
    const C = CHARS[e.styleId || "A"] ?? Character;
    return <div className="fe" style={{ ...base, left: `${e.x}%`, top: `${e.y}%`, width: `${e.w ?? 30}%`, height: `${e.h ?? 72}%` }}><C expression={e.expression} pose={e.pose} /></div>;
  }
  return null;
}
function FreeSceneView({ bg, swirl, elements }: { bg: string; swirl?: boolean; elements: FreeElement[] }) {
  const arrows = elements.filter((e) => e.kind === "arrow") as Extract<FreeElement, { kind: "arrow" }>[];
  const others = elements.filter((e) => e.kind !== "arrow");
  return (
    <div style={{ position: "absolute", inset: 0, background: bg, overflow: "hidden" }}>
      {swirl && <Swirl />}
      {arrows.length > 0 && (
        <svg className="full" viewBox="0 0 1600 900" preserveAspectRatio="none">
          {arrows.map((a, i) => <line key={i} className="feLine" style={{ animationDelay: `${0.1 + i * 0.12}s` }} x1={a.x1 / 100 * 1600} y1={a.y1 / 100 * 900} x2={a.x2 / 100 * 1600} y2={a.y2 / 100 * 900} stroke={a.color || "#fff"} strokeWidth={6} strokeLinecap="round" />)}
        </svg>
      )}
      {others.map((e, i) => <FreeEl key={i} e={e} i={i} />)}
      <Logo />
    </div>
  );
}

function SceneView({ scene }: { scene: Scene }) {
  switch (scene.type) {
    case "free": return <FreeSceneView bg={scene.bg} swirl={scene.swirl} elements={scene.elements} />;
    case "gauge": return <GaugeView {...scene} />;
    case "triptych": return <TriptychView panels={scene.panels} />;
    case "map": return <MapView />;
    case "chart": return <ChartView {...scene} />;
    case "statement": return <StatementView text={scene.text} sub={scene.sub} />;
    case "character": return <CharacterView {...scene} />;
  }
}

// ── Speler ──────────────────────────────────────────────────────────────────
export function Player({ scenes }: { scenes: Scene[] }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [k, setK] = useState(0); // remount-key zodat animaties per scene herstarten
  const goto = (idx: number) => { setI(((idx % scenes.length) + scenes.length) % scenes.length); setK((x) => x + 1); };

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => goto(i + 1), scenes[i].dur * 1000);
    return () => clearTimeout(t);
  }, [i, playing, k]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = scenes.reduce((a, s) => a + s.dur, 0);
  return (
    <div className={`player ${playing ? "" : "paused"}`}>
      <div className="pstage" style={{ background: scenes[i].type === "map" ? "#e8eef0" : "#0c1424" }}>
        <div className="pscene" key={k}>
          <div className="pcam" style={{ animationDuration: `${scenes[i].dur}s` }}><SceneView scene={scenes[i]} /></div>
        </div>
        <div className="pbar"><div className="pbarFill" key={k} style={{ animationDuration: `${scenes[i].dur}s` }} /></div>
      </div>
      <div className="pcontrols">
        <button className="pbtn" onClick={() => setPlaying((p) => !p)}>{playing ? "⏸" : "▶"}</button>
        <button className="pbtn" onClick={() => goto(0)}>↻</button>
        <button className="pbtn" onClick={() => goto(i - 1)}>‹</button>
        <button className="pbtn" onClick={() => goto(i + 1)}>›</button>
        {scenes.map((s, idx) => <span key={idx} className={idx === i ? "dot on" : "dot"} title={s.type} onClick={() => goto(idx)} />)}
        <span style={{ marginLeft: 8 }}>Scene {i + 1}/{scenes.length} · {scenes[i].type} · totaal ~{total}s</span>
      </div>
    </div>
  );
}

export function InfoshowStyles() { return <style>{INFOSHOW_CSS}</style>; }

const INFOSHOW_CSS = `
.logo { position:absolute; left:18px; bottom:16px; display:flex; align-items:center; gap:7px; color:#fff; font-weight:800; font-size:13px; letter-spacing:1px; z-index:5; }
.logoMark { width:24px; height:24px; background:#2563eb; border-radius:5px; display:flex; align-items:center; justify-content:center; font-style:italic; font-size:15px; }
.charSvg { position:absolute; inset:0; width:100%; height:100%; }
.board { position:absolute; left:8%; top:10%; width:84%; height:54%; background:rgba(255,255,255,0.06); border-radius:12px; }
.char { animation:bob 3.6s ease-in-out infinite; }
@keyframes bob { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-7px);} }
.eye { transform-box:view-box; animation:blink 4.2s infinite; }
@keyframes blink { 0%,92%,100%{transform:scaleY(1);} 96%{transform:scaleY(0.1);} }
.mouth.talk { transform-box:view-box; animation:talk 0.42s ease-in-out infinite; }
@keyframes talk { 0%{transform:scaleY(1);} 50%{transform:scaleY(2.1);} 100%{transform:scaleY(0.9);} }
.arm { transform-box:view-box; }
.arm.present { animation:present 4s ease-in-out infinite; } @keyframes present { 0%,100%{transform:rotate(0);} 50%{transform:rotate(-7deg);} }
.arm.wave { animation:wave 0.9s ease-in-out infinite; } @keyframes wave { 0%,100%{transform:rotate(8deg);} 50%{transform:rotate(-16deg);} }
.arm.point { animation:point 3.5s ease-in-out infinite; } @keyframes point { 0%,100%{transform:rotate(0);} 50%{transform:rotate(-5deg);} }
.cbubble { position:absolute; left:52%; top:12%; background:#fff; color:#0f172a; font-weight:700; font-size:clamp(13px,1.9vw,20px); padding:12px 16px; border-radius:16px; max-width:42%; box-shadow:0 8px 22px rgba(0,0,0,0.28); animation:pop 0.5s cubic-bezier(0.2,0.9,0.3,1.3) both; z-index:4; }
.ctail { position:absolute; left:18px; bottom:-12px; width:0; height:0; border:12px solid transparent; border-top-color:#fff; border-bottom:0; }
@keyframes pop { 0%{opacity:0; transform:scale(0.7) translateY(8px);} 100%{opacity:1; transform:scale(1) translateY(0);} }
.full { position:absolute; inset:0; width:100%; height:100%; }
.swirl { position:absolute; top:50%; left:50%; width:240%; height:240%; transform:translate(-50%,-50%); animation:swirl 90s linear infinite; opacity:0.9; }
@keyframes swirl { from{transform:translate(-50%,-50%) rotate(0);} to{transform:translate(-50%,-50%) rotate(360deg);} }
.gHeadline { position:absolute; top:7%; left:0; right:0; text-align:center; color:#fff; font-size:clamp(18px,3.4vw,38px); font-weight:800; text-shadow:0 3px 10px rgba(0,0,0,0.35); animation:slam 0.6s cubic-bezier(0.2,0.8,0.2,1) both; }
@keyframes slam { 0%{opacity:0; transform:scale(1.25);} 60%{opacity:1; transform:scale(0.97);} 100%{transform:scale(1);} }
.gCard { position:absolute; left:50%; top:56%; transform:translate(-50%,-50%); width:54%; background:#f8fafc; border-radius:18px; padding:14px 18px 12px; text-align:center; box-shadow:0 12px 30px rgba(0,0,0,0.3); animation:pop 0.5s cubic-bezier(0.2,0.9,0.3,1.2) 0.15s both; }
.gTitle { font-size:clamp(12px,1.9vw,18px); font-weight:800; color:#0f172a; letter-spacing:1px; }
.gGauge { width:66%; display:block; margin:0 auto; }
.gNeedle { transform-box:view-box; animation:needle 9s cubic-bezier(0.34,1.4,0.64,1) infinite; }
@keyframes needle { 0%{transform:rotate(-90deg);} 16%{transform:rotate(58deg);} 95%{transform:rotate(58deg);} 100%{transform:rotate(-90deg);} }
.gNum { font-size:clamp(18px,3vw,32px); font-weight:900; color:#0f172a; font-variant-numeric:tabular-nums; }
.trip { position:absolute; inset:0; display:flex; gap:2%; padding:5%; }
.panel { flex:1; border-radius:14px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; padding:14px; opacity:0; animation:panelIn 0.6s ease both; }
@keyframes panelIn { 0%{opacity:0; transform:translateY(16px) scale(0.95);} 100%{opacity:1; transform:translateY(0) scale(1);} }
.panelH { color:#fff; font-weight:800; font-size:clamp(12px,1.8vw,20px); text-align:center; letter-spacing:0.5px; }
.target { width:46%; }
.arrow { animation:arrowIn 0.6s ease 0.4s both; }
@keyframes arrowIn { 0%{transform:translate(40px,-26px) scale(0.6); opacity:0;} 100%{transform:translate(0,0) scale(1); opacity:1;} }
.car { offset-path:path("M70 250 C 180 250, 200 110, 330 120 S 520 210, 600 120"); offset-rotate:auto; animation:drive 5s ease-in-out 0.2s both; }
@keyframes drive { 0%{offset-distance:0%;} 100%{offset-distance:100%;} }
.chartWrap { position:absolute; left:50%; top:44%; transform:translate(-50%,-50%); width:32%; }
.donut { width:100%; display:block; }
.donutPct { fill:#fff; font-size:34px; font-weight:900; } .donutSub { fill:#9fb0c8; font-size:13px; font-weight:700; letter-spacing:1px; }
.chartLabel { position:absolute; left:50%; bottom:14%; transform:translateX(-50%); background:#fff; color:#0f172a; font-weight:800; font-size:clamp(12px,1.8vw,18px); padding:8px 16px; border-radius:8px; white-space:nowrap; animation:pop 0.5s ease 0.5s both; }
.stmt { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:0 8%; color:#fff; font-weight:800; }
.stmt .stmtMain { font-size:clamp(22px,4.6vw,52px); text-shadow:0 4px 14px rgba(0,0,0,0.4); animation:slam 0.6s cubic-bezier(0.2,0.8,0.2,1) both; }
.stmtSub { margin-top:12px; font-size:clamp(13px,2vw,22px); color:#cbd5e1; font-weight:600; animation:pop 0.5s ease 0.35s both; }
.bguy.swayB { transform-box:view-box; transform-origin:160px 432px; animation:swayB 3.8s ease-in-out infinite; } @keyframes swayB { 0%,100%{transform:rotate(-1.6deg);} 50%{transform:rotate(1.6deg);} }
.walkbob { animation:walkbob 0.78s ease-in-out infinite; } @keyframes walkbob { 0%,50%,100%{transform:translateY(0);} 25%,75%{transform:translateY(-6px);} }
.legB,.armB { transform-box:view-box; }
.legA,.armBk { animation:swingF 0.78s ease-in-out infinite; } .legBk,.armA { animation:swingB 0.78s ease-in-out infinite; }
@keyframes swingF { 0%,100%{transform:rotate(20deg);} 50%{transform:rotate(-20deg);} } @keyframes swingB { 0%,100%{transform:rotate(-20deg);} 50%{transform:rotate(20deg);} }
.waveB { animation:waveB 0.8s ease-in-out infinite; } @keyframes waveB { 0%,100%{transform:rotate(6deg);} 50%{transform:rotate(-20deg);} }
.bounce { animation:bounceB 1.5s ease-in-out infinite; } @keyframes bounceB { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-12px);} }

/* vrije compositie */
.fe { opacity:0; animation:feIn 0.55s cubic-bezier(0.2,0.9,0.3,1.2) both; }
@keyframes feIn { 0%{opacity:0; transform:translate(-50%,-50%) scale(0.82);} 100%{opacity:1; transform:translate(-50%,-50%) scale(1);} }
.feLine { opacity:0; animation:feFade 0.5s ease both; } @keyframes feFade { to{opacity:1;} }
.feText { font-weight:800; text-shadow:0 2px 8px rgba(0,0,0,0.35); white-space:pre-wrap; max-width:80%; }
.feStat { text-align:center; font-weight:900; }
.feStatV { font-size:clamp(26px,6vw,64px); line-height:1; font-variant-numeric:tabular-nums; }
.feStatL { font-size:clamp(11px,1.8vw,18px); font-weight:700; opacity:0.85; margin-top:4px; }

/* speler */
.player { width:min(94vw,1024px); margin:0 auto; }
.pstage { position:relative; width:100%; aspect-ratio:16/9; border-radius:16px; overflow:hidden; box-shadow:0 24px 80px rgba(0,0,0,0.6); }
.pscene { position:absolute; inset:0; animation:sceneIn 0.5s ease both; }
@keyframes sceneIn { from{opacity:0; transform:scale(1.06);} to{opacity:1; transform:scale(1);} }
/* doorlopende camerabeweging (Ken Burns) per scene -> geen diashow */
.pcam { position:absolute; inset:0; transform-origin:50% 45%; animation:kenburns linear both; }
@keyframes kenburns { from{transform:scale(1.03);} to{transform:scale(1.13);} }
/* zachte 'ademende' beweging op vrije elementen zodat niets stilstaat */
.feFloat { animation:feFloat 6s ease-in-out infinite; }
@keyframes feFloat { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-7px);} }
.pbar { position:absolute; left:0; right:0; bottom:0; height:5px; background:rgba(255,255,255,0.16); z-index:9; }
.pbarFill { height:100%; background:#3b82f6; width:0; animation:pbarGrow linear both; }
@keyframes pbarGrow { from{width:0;} to{width:100%;} }
.player.paused .pscene *, .player.paused .pbarFill { animation-play-state:paused !important; }
.pcontrols { display:flex; align-items:center; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:16px; color:#94a3b8; font-size:13px; font-family:system-ui,sans-serif; }
.pbtn { background:#1e293b; color:#fff; border:none; border-radius:10px; min-width:40px; height:36px; font-size:15px; cursor:pointer; }
.dot { width:10px; height:10px; border-radius:50%; background:#334155; cursor:pointer; } .dot.on { background:#3b82f6; }
`;
