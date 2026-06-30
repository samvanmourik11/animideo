"use client";

import { useEffect, useState } from "react";

// Gallery van de "Infographics Show"-stijl (3e infographic-stijl, prototype).
// Toont: uitgebouwde code-personages (poses/expressies/varianten) + scènetypes
// (gauge, triptiek, kaart-route, groeiend diagram). Alles in code, geen AI.
// Loopt continu zodat je de motion ziet. Bekijk: http://localhost:3000/infoshow-gallery

// ─────────────────────────────────────────────────────────────────────────
// Parametrisch personage (gerigd): kleuren + kapsel + expressie + pose.
// ─────────────────────────────────────────────────────────────────────────
type Expression = "neutraal" | "blij" | "verbaasd" | "denkend";
type Pose = "presenteren" | "zwaaien" | "wijzen" | "idle";

// Herbruikbare open hand (palm + 4 vingers + duim). Optionele outline (line/lw)
// voor de lijn- en sticker-stijl. Draait mee via r, schaalt via s.
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

function Character({
  skin = "#e8b58f", skinShade = "#e2a878", hair = "#3a2a22",
  shirt = "#f1f4f8", accent = "#2b6cb0", longHair = false,
  expression = "neutraal", pose = "presenteren", talk = true,
}: {
  skin?: string; skinShade?: string; hair?: string; shirt?: string;
  accent?: string; longHair?: boolean; expression?: Expression; pose?: Pose; talk?: boolean;
}) {
  // Expressie → wenkbrauwen / ogen / mond
  const browY = expression === "verbaasd" ? 96 : 104;
  const browTilt = expression === "denkend" ? 10 : 0;
  const eyeRy = expression === "verbaasd" ? 19 : 15;
  const pupilR = expression === "verbaasd" ? 6.5 : 5.5;

  let mouth: React.ReactNode;
  if (expression === "blij") {
    mouth = <path d="M222 168 Q240 188 258 168" stroke="#7a3b34" strokeWidth={6} fill="none" strokeLinecap="round" />;
  } else if (expression === "verbaasd") {
    mouth = <ellipse cx={240} cy={172} rx={9} ry={11} fill="#7a3b34" />;
  } else {
    mouth = (
      <ellipse className={talk ? "mouth talk" : "mouth"} cx={240} cy={170} rx={14} ry={4}
        fill="#7a3b34" style={{ transformOrigin: "240px 170px" }} />
    );
  }

  // Pose → arm
  const armClass =
    pose === "zwaaien" ? "arm wave" : pose === "wijzen" ? "arm point" : pose === "idle" ? "arm" : "arm present";
  const armPath =
    pose === "zwaaien" ? "M315 195 Q360 150 372 100" :
    pose === "wijzen"  ? "M315 195 Q370 175 415 150" :
    pose === "idle"    ? "M315 200 Q330 250 320 300" :
                          "M315 195 Q360 165 405 172"; // presenteren
  const handXY =
    pose === "zwaaien" ? [374, 96] : pose === "wijzen" ? [420, 148] : pose === "idle" ? [320, 305] : [410, 172];

  return (
    <svg viewBox="0 0 480 360" className="charSvg" preserveAspectRatio="xMidYMax meet">
      <g className="char">
        {/* lichaam / jas */}
        <path d="M120 360 L120 300 Q120 250 240 250 Q360 250 360 300 L360 360 Z" fill={shirt} />
        <path d="M224 250 L240 300 L256 250 Z" fill={accent} />
        <rect x={232} y={250} width={16} height={52} fill={accent} />
        {/* nek */}
        <rect x={216} y={196} width={48} height={56} rx={14} fill={skinShade} />
        {/* lang haar achter (vrouw-variant) */}
        {longHair && <path d="M150 110 Q150 250 196 250 L284 250 Q330 250 330 110 Z" fill={hair} />}
        {/* hoofd */}
        <circle cx={240} cy={120} r={80} fill={skin} />
        {/* oren */}
        <circle cx={162} cy={122} r={13} fill={skinShade} />
        <circle cx={318} cy={122} r={13} fill={skinShade} />
        {/* haar boven */}
        <path d="M164 112 Q158 38 240 34 Q322 38 316 112 Q294 74 240 74 Q186 74 164 112 Z" fill={hair} />
        {/* wenkbrauwen */}
        <rect x={198} y={browY} width={34} height={7} rx={3.5} fill={hair} transform={`rotate(${browTilt} 215 ${browY})`} />
        <rect x={248} y={browY} width={34} height={7} rx={3.5} fill={hair} transform={`rotate(${-browTilt} 265 ${browY})`} />
        {/* ogen */}
        <g className="eye" style={{ transformOrigin: "216px 122px" }}>
          <ellipse cx={216} cy={122} rx={13} ry={eyeRy} fill="#fff" />
          <circle cx={218} cy={124} r={pupilR} fill="#1f2937" />
        </g>
        <g className="eye" style={{ transformOrigin: "264px 122px" }}>
          <ellipse cx={264} cy={122} rx={13} ry={eyeRy} fill="#fff" />
          <circle cx={266} cy={124} r={pupilR} fill="#1f2937" />
        </g>
        {/* wangen */}
        <circle cx={198} cy={150} r={11} fill="#f0a99a" opacity={0.5} />
        <circle cx={282} cy={150} r={11} fill="#f0a99a" opacity={0.5} />
        {mouth}
        {/* arm */}
        <g className={armClass} style={{ transformOrigin: "315px 200px" }}>
          <path d={armPath} stroke={shirt} strokeWidth={32} fill="none" strokeLinecap="round" />
          <Hand x={handXY[0]} y={handXY[1]} s={1.4} fill={skin}
            r={pose === "zwaaien" ? -8 : pose === "wijzen" ? 92 : pose === "idle" ? 172 : 78} />
        </g>
        {/* denk-hand bij kin */}
        {expression === "denkend" && (
          <g className="arm">
            <path d="M300 250 Q270 210 250 178" stroke={shirt} strokeWidth={30} fill="none" strokeLinecap="round" />
            <circle cx={248} cy={176} r={15} fill={skin} />
          </g>
        )}
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Hulpjes
// ─────────────────────────────────────────────────────────────────────────
// Stijl B: geometrisch full-body "noodle-limb" personage (heel andere look).
function CharacterB({
  skin = "#f0c39c", hair = "#2a1d16", shirt = "#ef6f53", pants = "#2b3a67",
  pose = "zwaaien",
}: { skin?: string; hair?: string; shirt?: string; pants?: string; pose?: "zwaaien" | "lopen" | "wijzen" }) {
  const walking = pose === "lopen";
  const rightArm = pose === "zwaaien" ? "M190 118 Q214 86 222 50"
    : pose === "wijzen" ? "M190 122 Q226 120 252 116"
    : "M190 118 Q202 158 196 196";
  const rightHand = pose === "zwaaien" ? [223, 47] : pose === "wijzen" ? [254, 116] : [196, 200];

  return (
    <svg viewBox="0 0 320 480" className="charSvg" preserveAspectRatio="xMidYMax meet">
      <g className={walking ? "bguy walkbob" : "bguy swayB"}>
        {/* benen */}
        <g className={walking ? "legB legA" : "legB"} style={{ transformOrigin: "153px 248px" }}>
          <path d="M153 242 L146 418" stroke={pants} strokeWidth={22} strokeLinecap="round" fill="none" />
          <ellipse cx={140} cy={424} rx={20} ry={10} fill="#1f2937" />
        </g>
        <g className={walking ? "legB legBk" : "legB"} style={{ transformOrigin: "167px 248px" }}>
          <path d="M167 242 L176 418" stroke={pants} strokeWidth={22} strokeLinecap="round" fill="none" />
          <ellipse cx={182} cy={424} rx={20} ry={10} fill="#1f2937" />
        </g>
        {/* torso */}
        <path d="M126 110 Q160 98 194 110 L186 246 Q160 258 134 246 Z" fill={shirt} />
        {/* linkerarm */}
        <g className={walking ? "armB armA" : "armB"} style={{ transformOrigin: "130px 118px" }}>
          <path d="M130 118 Q118 158 126 196" stroke={shirt} strokeWidth={18} strokeLinecap="round" fill="none" />
          <Hand x={126} y={200} r={172} fill={skin} />
        </g>
        {/* rechterarm */}
        <g className={pose === "zwaaien" ? "armB waveB" : walking ? "armB armBk" : "armB"} style={{ transformOrigin: "190px 118px" }}>
          <path d={rightArm} stroke={shirt} strokeWidth={18} strokeLinecap="round" fill="none" />
          <Hand x={rightHand[0]} y={rightHand[1]} fill={skin}
            r={pose === "zwaaien" ? -6 : pose === "wijzen" ? 92 : 172} />
        </g>
        {/* nek + hoofd */}
        <rect x={152} y={94} width={16} height={20} fill={skin} />
        <circle cx={160} cy={66} r={34} fill={skin} />
        <path d="M127 62 Q125 28 160 26 Q195 28 193 62 Q179 46 160 46 Q141 46 127 62 Z" fill={hair} />
        {/* gezicht (minimaal) */}
        <circle cx={150} cy={66} r={4} fill="#1f2937" />
        <circle cx={170} cy={66} r={4} fill="#1f2937" />
        <path d="M151 78 Q160 86 169 78" stroke="#7a3b34" strokeWidth={3.5} fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function CharBCard({ label, bg, ...props }: any) {
  return <Stage label={label} bg={bg}><CharacterB {...props} /><Logo /></Stage>;
}

// Stijl C: lijn/outline (line-art, editorial).
function CharacterC() {
  const ink = "#27303f", fill = "#dbe9ff";
  return (
    <svg viewBox="0 0 320 360" className="charSvg" preserveAspectRatio="xMidYMax meet">
      <g className="char">
        <path d="M70 360 L70 300 Q70 250 160 250 Q250 250 250 300 L250 360 Z" fill={fill} stroke={ink} strokeWidth={5} strokeLinejoin="round" />
        <path d="M142 252 L160 284 L178 252" fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" />
        <line x1={146} y1={250} x2={146} y2={216} stroke={ink} strokeWidth={5} />
        <line x1={174} y1={250} x2={174} y2={216} stroke={ink} strokeWidth={5} />
        <circle cx={160} cy={152} r={62} fill="#fff" stroke={ink} strokeWidth={5} />
        <path d="M100 148 Q96 86 160 84 Q224 86 220 148 Q210 112 160 112 Q110 112 100 148 Z" fill={ink} />
        <circle cx={140} cy={152} r={4.5} fill={ink} />
        <circle cx={180} cy={152} r={4.5} fill={ink} />
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

// Stijl D: mascotte-blob met armpjes/beentjes (icoon-figuur).
function CharacterD({ body = "#10a37f" }: { body?: string }) {
  const ink = "#1f2937";
  return (
    <svg viewBox="0 0 320 360" className="charSvg" preserveAspectRatio="xMidYMax meet">
      <g className="bounce">
        <path d="M134 250 L130 312" stroke={ink} strokeWidth={10} strokeLinecap="round" />
        <path d="M186 250 L190 312" stroke={ink} strokeWidth={10} strokeLinecap="round" />
        <ellipse cx={124} cy={316} rx={16} ry={8} fill={ink} />
        <ellipse cx={196} cy={316} rx={16} ry={8} fill={ink} />
        <rect x={96} y={120} width={128} height={132} rx={40} fill={body} />
        <circle cx={138} cy={178} r={15} fill="#fff" /><circle cx={182} cy={178} r={15} fill="#fff" />
        <circle cx={140} cy={181} r={6.5} fill={ink} /><circle cx={184} cy={181} r={6.5} fill={ink} />
        <path d="M142 206 Q160 222 178 206" fill="none" stroke="#fff" strokeWidth={6} strokeLinecap="round" />
        <path d="M96 168 Q70 180 64 200" stroke={ink} strokeWidth={10} strokeLinecap="round" fill="none" />
        <Hand x={62} y={204} r={170} s={0.8} fill={ink} />
        <g className="arm waveB" style={{ transformOrigin: "224px 162px" }}>
          <path d="M224 162 Q258 132 264 96" stroke={ink} strokeWidth={10} strokeLinecap="round" fill="none" />
          <Hand x={265} y={92} r={-6} s={0.8} fill={ink} />
        </g>
      </g>
    </svg>
  );
}

// Stijl E: sticker / dikke donkere outline (bold/comic).
function CharacterE({ skin = "#f3b58a", hair = "#28324a", shirt = "#f4a72c" }: { skin?: string; hair?: string; shirt?: string }) {
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

function useLoopCount(from: number, to: number, dur: number, cycle: number) {
  const [v, setV] = useState(from);
  useEffect(() => {
    let raf = 0, startT = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const run = (now: number) => {
      if (!startT) startT = now;
      const el = (now - startT) % cycle;
      const t = Math.min(1, el / dur);
      setV(Math.round(from + (to - from) * ease(t)));
      raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [from, to, dur, cycle]);
  return v;
}

function Stage({ label, bg, children }: { label: string; bg: string; children: React.ReactNode }) {
  return (
    <div className="cell">
      <div className="stage" style={{ background: bg }}>{children}</div>
      <div className="cap">{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Scènes
// ─────────────────────────────────────────────────────────────────────────
function CharacterCard({ label, bg, bubble, ...props }: any) {
  return (
    <Stage label={label} bg={bg}>
      <div className="board" />
      <Character {...props} />
      {bubble && <div className="cbubble">{bubble}<span className="ctail" /></div>}
      <Logo />
    </Stage>
  );
}

function TriptychScene() {
  const panels = [
    { c: "#2f5fb0", h: "VERLOPEN DOMEINEN" },
    { c: "#2e8b6f", h: "MASSA-PAGINA'S" },
    { c: "#b0383f", h: "LINK-FARMS" },
  ];
  return (
    <Stage label="Multi-panel (triptiek)" bg="#0f1830">
      <div className="trip">
        {panels.map((p, i) => (
          <div key={i} className="panel" style={{ background: p.c, animationDelay: `${i * 0.25}s` }}>
            <div className="panelH">{p.h}</div>
            <svg viewBox="0 0 120 120" className="target">
              <circle cx={60} cy={60} r={46} fill="#e23b3b" />
              <circle cx={60} cy={60} r={34} fill="#fff" />
              <circle cx={60} cy={60} r={22} fill="#e23b3b" />
              <circle cx={60} cy={60} r={11} fill="#fff" />
              <circle cx={60} cy={60} r={4} fill="#e23b3b" />
              <g className="arrow" style={{ transformOrigin: "60px 60px" }}>
                <line x1={60} y1={60} x2={118} y2={30} stroke="#7a4a1f" strokeWidth={5} strokeLinecap="round" />
                <polygon points="60,60 74,54 70,68" fill="#c9962f" />
              </g>
            </svg>
          </div>
        ))}
      </div>
      <Logo />
    </Stage>
  );
}

const ROUTE = "M70 250 C 180 250, 200 110, 330 120 S 520 210, 600 120";
function MapRouteScene() {
  return (
    <Stage label="Kaart met rijdende route" bg="#e8eef0">
      <svg viewBox="0 0 680 360" className="full">
        {/* simpele kaart */}
        <rect x={0} y={0} width={680} height={360} fill="#dfe7ea" />
        <rect x={0} y={210} width={680} height={40} fill="#cdd8dc" />
        <rect x={300} y={0} width={42} height={360} fill="#cdd8dc" />
        <circle cx={150} cy={90} r={48} fill="#bcd6b0" />
        <rect x={470} y={250} width={150} height={90} rx={8} fill="#bcd6b0" />
        {/* route (stippellijn die zich tekent) */}
        <path d={ROUTE} fill="none" stroke="#e23b3b" strokeWidth={6} strokeLinecap="round"
          strokeDasharray="12 12" className="route" />
        {/* bestemming */}
        <g transform="translate(600 120)">
          <circle cx={0} cy={0} r={5} fill="#1f2937" />
          <circle cx={-14} cy={-2} r={7} fill="#1f2937" />
          <circle cx={14} cy={-2} r={7} fill="#1f2937" />
        </g>
        {/* start-pin */}
        <g transform="translate(70 250)">
          <path d="M0 6 C 22 6 22 -22 0 -40 C -22 -22 -22 6 0 6 Z" fill="#2b6cb0" />
          <circle cx={0} cy={-20} r={9} fill="#fff" />
        </g>
        {/* auto die de route volgt */}
        <g className="car">
          <rect x={-16} y={-9} width={32} height={18} rx={5} fill="#1f2937" />
          <rect x={-9} y={-15} width={16} height={8} rx={3} fill="#374151" />
          <circle cx={-9} cy={9} r={4} fill="#111" />
          <circle cx={9} cy={9} r={4} fill="#111" />
        </g>
      </svg>
      <Logo />
    </Stage>
  );
}

function ChartScene() {
  const pct = useLoopCount(0, 80, 1600, 6000);
  // donut: omtrek 2πr, r=70 → ~440; toon pct% via dashoffset
  const R = 70, C = 2 * Math.PI * R;
  const off = C * (1 - pct / 100);
  return (
    <Stage label="Diagram dat opbouwt" bg="#0c1424">
      {/* serverruimte-achtergrond (simpel) */}
      <svg viewBox="0 0 680 360" className="full">
        <rect x={0} y={0} width={680} height={360} fill="#101a2e" />
        {[40, 250, 470].map((x) => (
          <g key={x}>
            <rect x={x} y={60} width={170} height={110} rx={6} fill="#16243f" />
            <rect x={x} y={200} width={170} height={110} rx={6} fill="#16243f" />
          </g>
        ))}
      </svg>
      <div className="chartWrap">
        <svg viewBox="0 0 180 180" className="donut">
          <circle cx={90} cy={90} r={R} fill="none" stroke="#26344f" strokeWidth={22} />
          <circle cx={90} cy={90} r={R} fill="none" stroke="#5fd36a" strokeWidth={22}
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off}
            transform="rotate(-90 90 90)" />
          <text x={90} y={86} textAnchor="middle" className="donutPct">{pct}%</text>
          <text x={90} y={108} textAnchor="middle" className="donutSub">VERLIES</text>
        </svg>
      </div>
      <div className="chartLabel">NICHE-SITES: VERLOREN VERKEER</div>
      <Logo />
    </Stage>
  );
}

function GaugeScene() {
  const val = useLoopCount(150, 15000, 1500, 6000);
  return (
    <Stage label="Gauge / data-slide" bg="#1d2a86">
      <Swirl />
      <div className="gHeadline">ZO SNEL LOOPT HET OP</div>
      <div className="gCard">
        <div className="gTitle">PRIJS PER JAAR</div>
        <svg viewBox="0 0 400 250" className="gGauge">
          <defs>
            <linearGradient id="gg2" x1="40" y1="0" x2="360" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#22c55e" /><stop offset="0.45" stopColor="#eab308" />
              <stop offset="0.72" stopColor="#f97316" /><stop offset="1" stopColor="#ef4444" />
            </linearGradient>
          </defs>
          <path d="M 40 200 A 160 160 0 0 1 360 200" fill="none" stroke="url(#gg2)" strokeWidth={24} strokeLinecap="round" />
          <g className="gNeedle" style={{ transformOrigin: "200px 200px" }}>
            <line x1={200} y1={200} x2={200} y2={68} stroke="#1f2937" strokeWidth={6} strokeLinecap="round" />
          </g>
          <circle cx={200} cy={200} r={13} fill="#1f2937" /><circle cx={200} cy={200} r={5} fill="#fff" />
        </svg>
        <div className="gNum">€{val.toLocaleString("nl-NL")}</div>
      </div>
      <Logo />
    </Stage>
  );
}

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

function Logo() {
  return <div className="logo"><div className="logoMark">i</div><span>JOUWANIMATIEVIDEO</span></div>;
}

// ─────────────────────────────────────────────────────────────────────────
export default function Gallery() {
  return (
    <div className="page">
      <style>{CSS}</style>
      <h1 className="pageTitle">Infographics Show-stijl — bouwblokken (alles in code)</h1>

      <h2 className="section">5 karakterstijlen — kies er later uit</h2>
      <div className="grid">
        <Stage label="Stijl 1 · ronde bust" bg="#2b3a59"><div className="board" /><Character expression="blij" pose="zwaaien" talk={false} /></Stage>
        <Stage label="Stijl 2 · geometrisch" bg="#1f3f3a"><CharacterB pose="zwaaien" shirt="#2bb3a3" pants="#26405e" /></Stage>
        <Stage label="Stijl 3 · lijn / outline" bg="#cdd7e6"><CharacterC /></Stage>
        <Stage label="Stijl 4 · mascotte" bg="#15243a"><CharacterD /></Stage>
        <Stage label="Stijl 5 · sticker (dikke outline)" bg="#3a2b4e"><CharacterE /></Stage>
      </div>

      <h2 className="section">Personages — poses & expressies</h2>
      <div className="grid">
        <CharacterCard label="Man · neutraal · presenteren" bg="#2b3a59" expression="neutraal" pose="presenteren"
          bubble="Alles in code, geen AI." />
        <CharacterCard label="Vrouw · blij · zwaaien" bg="#3a2b59" longHair hair="#5b3a2a" skin="#f0c39c" skinShade="#e6b288"
          accent="#d6457a" shirt="#f6eef4" expression="blij" pose="zwaaien" talk={false} />
        <CharacterCard label="Man · verbaasd · idle" bg="#1f4a4a" hair="#1f2937" skin="#cf9b6f" skinShade="#c08f63"
          accent="#e0a83c" shirt="#eef3f5" expression="verbaasd" pose="idle" talk={false} />
        <CharacterCard label="Vrouw · denkend · hand bij kin" bg="#43321f" longHair hair="#2a1d16" skin="#e8b58f"
          accent="#2bb3a3" shirt="#f1f4f8" expression="denkend" pose="idle" talk={false} />
      </div>

      <h2 className="section">Personages — stijl B (geometrisch, full-body)</h2>
      <div className="grid">
        <CharBCard label="Zwaaien" bg="#22304e" shirt="#ef6f53" pants="#2b3a67" pose="zwaaien" />
        <CharBCard label="Lopen (walk-cycle)" bg="#1f3f3a" skin="#cf9b6f" hair="#1f2937" shirt="#2bb3a3" pants="#26405e" pose="lopen" />
        <CharBCard label="Wijzen" bg="#3a2b4e" skin="#f0c39c" hair="#5b3a2a" shirt="#7c5cd6" pants="#2b2f55" pose="wijzen" />
      </div>

      <h2 className="section">Scènetypes</h2>
      <div className="grid">
        <GaugeScene />
        <TriptychScene />
        <MapRouteScene />
        <ChartScene />
      </div>
    </div>
  );
}

const CSS = `
.page { min-height:100vh; background:#0a0a12; color:#e2e8f0; font-family:system-ui,sans-serif; padding:28px 24px 60px; }
.pageTitle { text-align:center; font-size:24px; font-weight:800; margin:0 0 6px; }
.section { font-size:15px; font-weight:700; color:#94a3b8; margin:30px 0 14px; text-transform:uppercase; letter-spacing:1px; }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(380px,1fr)); gap:22px; }
.cell { display:flex; flex-direction:column; gap:8px; }
.stage { position:relative; width:100%; aspect-ratio:16/9; border-radius:14px; overflow:hidden; box-shadow:0 14px 40px rgba(0,0,0,0.5); }
.cap { font-size:13px; color:#94a3b8; text-align:center; }

/* logo */
.logo { position:absolute; left:14px; bottom:12px; display:flex; align-items:center; gap:7px; color:#fff; font-weight:800; font-size:11px; letter-spacing:1px; z-index:5; }
.logoMark { width:22px; height:22px; background:#2563eb; border-radius:5px; display:flex; align-items:center; justify-content:center; font-style:italic; font-size:14px; }

/* personage */
.charSvg { position:absolute; inset:0; width:100%; height:100%; }
.board { position:absolute; left:8%; top:10%; width:84%; height:54%; background:rgba(255,255,255,0.06); border-radius:12px; }
.char { animation:bob 3.6s ease-in-out infinite; }
@keyframes bob { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-7px);} }
.eye { transform-box:view-box; animation:blink 4.2s infinite; }
@keyframes blink { 0%,92%,100%{transform:scaleY(1);} 96%{transform:scaleY(0.1);} }
.mouth.talk { transform-box:view-box; animation:talk 0.42s ease-in-out infinite; }
@keyframes talk { 0%{transform:scaleY(1);} 50%{transform:scaleY(2.1);} 100%{transform:scaleY(0.9);} }
.arm { transform-box:view-box; }
.arm.present { animation:present 4s ease-in-out infinite; }
@keyframes present { 0%,100%{transform:rotate(0deg);} 50%{transform:rotate(-7deg);} }
.arm.wave { animation:wave 0.9s ease-in-out infinite; }
@keyframes wave { 0%,100%{transform:rotate(8deg);} 50%{transform:rotate(-16deg);} }
.arm.point { animation:point 3.5s ease-in-out infinite; }
@keyframes point { 0%,100%{transform:rotate(0deg);} 50%{transform:rotate(-5deg);} }
.cbubble { position:absolute; left:52%; top:12%; background:#fff; color:#0f172a; font-weight:700; font-size:14px; padding:10px 14px; border-radius:14px; max-width:42%; box-shadow:0 8px 22px rgba(0,0,0,0.28); animation:pop 0.5s cubic-bezier(0.2,0.9,0.3,1.3) both; }
.ctail { position:absolute; left:18px; bottom:-10px; width:0; height:0; border:10px solid transparent; border-top-color:#fff; border-bottom:0; }
@keyframes pop { 0%{opacity:0; transform:scale(0.7) translateY(8px);} 100%{opacity:1; transform:scale(1) translateY(0);} }

/* gauge */
.full { position:absolute; inset:0; width:100%; height:100%; }
.swirl { position:absolute; top:50%; left:50%; width:240%; height:240%; transform:translate(-50%,-50%); animation:swirl 90s linear infinite; opacity:0.9; }
@keyframes swirl { from{transform:translate(-50%,-50%) rotate(0);} to{transform:translate(-50%,-50%) rotate(360deg);} }
.gHeadline { position:absolute; top:7%; left:0; right:0; text-align:center; color:#fff; font-size:clamp(15px,3vw,30px); font-weight:800; text-shadow:0 3px 10px rgba(0,0,0,0.35); animation:slam 0.6s cubic-bezier(0.2,0.8,0.2,1) both; }
@keyframes slam { 0%{opacity:0; transform:scale(1.25);} 60%{opacity:1; transform:scale(0.97);} 100%{transform:scale(1);} }
.gCard { position:absolute; left:50%; top:56%; transform:translate(-50%,-50%); width:58%; background:#f8fafc; border-radius:16px; padding:12px 16px 10px; text-align:center; box-shadow:0 12px 30px rgba(0,0,0,0.3); }
.gTitle { font-size:clamp(10px,1.7vw,15px); font-weight:800; color:#0f172a; letter-spacing:1px; }
.gGauge { width:70%; display:block; margin:0 auto; }
.gNeedle { transform-box:view-box; animation:needle 6s cubic-bezier(0.34,1.4,0.64,1) infinite; }
@keyframes needle { 0%{transform:rotate(-90deg);} 25%{transform:rotate(58deg);} 92%{transform:rotate(58deg);} 100%{transform:rotate(-90deg);} }
.gNum { font-size:clamp(15px,2.8vw,26px); font-weight:900; color:#0f172a; font-variant-numeric:tabular-nums; }

/* triptiek */
.trip { position:absolute; inset:0; display:flex; gap:2%; padding:5%; }
.panel { flex:1; border-radius:12px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding:10px; opacity:0; animation:panelIn 5s ease both infinite; }
@keyframes panelIn { 0%{opacity:0; transform:translateY(16px) scale(0.95);} 10%,90%{opacity:1; transform:translateY(0) scale(1);} 100%{opacity:1;} }
.panelH { color:#fff; font-weight:800; font-size:clamp(10px,1.5vw,15px); text-align:center; letter-spacing:0.5px; }
.target { width:46%; }
.arrow { animation:arrowIn 5s ease both infinite; }
@keyframes arrowIn { 0%,15%{transform:translate(40px,-26px) scale(0.6); opacity:0;} 28%,90%{transform:translate(0,0) scale(1); opacity:1;} 100%{opacity:1;} }

/* kaart-route */
.route { stroke-dasharray:12 12; }
.car { offset-path:path("M70 250 C 180 250, 200 110, 330 120 S 520 210, 600 120"); offset-rotate:auto; animation:drive 5.5s ease-in-out infinite; }
@keyframes drive { 0%{offset-distance:0%;} 65%{offset-distance:100%;} 100%{offset-distance:100%;} }

/* diagram */
.chartWrap { position:absolute; left:50%; top:44%; transform:translate(-50%,-50%); width:34%; }
.donut { width:100%; display:block; }
.donutPct { fill:#fff; font-size:34px; font-weight:900; }
.donutSub { fill:#9fb0c8; font-size:13px; font-weight:700; letter-spacing:1px; }
.chartLabel { position:absolute; left:50%; bottom:14%; transform:translateX(-50%); background:#fff; color:#0f172a; font-weight:800; font-size:clamp(10px,1.6vw,15px); padding:6px 14px; border-radius:8px; white-space:nowrap; }

/* personage stijl B (geometrisch full-body) */
.bguy.swayB { transform-box:view-box; transform-origin:160px 432px; animation:swayB 3.8s ease-in-out infinite; }
@keyframes swayB { 0%,100%{transform:rotate(-1.6deg);} 50%{transform:rotate(1.6deg);} }
.walkbob { animation:walkbob 0.78s ease-in-out infinite; }
@keyframes walkbob { 0%,50%,100%{transform:translateY(0);} 25%,75%{transform:translateY(-6px);} }
.legB,.armB { transform-box:view-box; }
.legA,.armBk { animation:swingF 0.78s ease-in-out infinite; }
.legBk,.armA { animation:swingB 0.78s ease-in-out infinite; }
@keyframes swingF { 0%,100%{transform:rotate(20deg);} 50%{transform:rotate(-20deg);} }
@keyframes swingB { 0%,100%{transform:rotate(-20deg);} 50%{transform:rotate(20deg);} }
.waveB { animation:waveB 0.8s ease-in-out infinite; }
@keyframes waveB { 0%,100%{transform:rotate(6deg);} 50%{transform:rotate(-20deg);} }
.bounce { animation:bounceB 1.5s ease-in-out infinite; }
@keyframes bounceB { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-12px);} }
`;
