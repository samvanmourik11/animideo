"use client";

import { useEffect, useState } from "react";

// Prototype van de nieuwe "Infographics Show"-stijl (3e infographic-stijl).
// Doel: de MOTION laten zien — bewegende swirl-achtergrond, inslaande kop,
// gauge-naald die wegzwiept + meetellend bedrag. Zelfstandig, geen auth/DB.
// Bekijk op: http://localhost:3000/infoshow-prototype

export default function InfoshowPrototypePage() {
  const [runKey, setRunKey] = useState(0);
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a12",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Scene key={runKey} />
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={() => setRunKey((k) => k + 1)}
          style={{
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "10px 20px",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ↻ Opnieuw afspelen
        </button>
        <span style={{ color: "#64748b", fontSize: 13 }}>
          Prototype — Infographics Show-stijl (data/concept-slide)
        </span>
      </div>
    </div>
  );
}

function Scene() {
  const [value, setValue] = useState(150);

  // Bedrag telt mee met de naald-sweep (start 0.8s, duurt 1.3s, ease-out).
  useEffect(() => {
    const FROM = 150, TO = 15000, DELAY = 800, DUR = 1300;
    let raf = 0;
    let start = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / DUR);
      setValue(Math.round(FROM + (TO - FROM) * ease(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    const id = setTimeout(() => { raf = requestAnimationFrame(tick); }, DELAY);
    return () => { clearTimeout(id); cancelAnimationFrame(raf); };
  }, []);

  // Wavy swirl-stripes (tweekleurig) voor de bewegende achtergrond.
  const stripes: string[] = [];
  for (let i = -2; i < 24; i++) {
    const baseY = i * 92;
    let d = `M -120 ${baseY}`;
    for (let x = -120; x <= 2120; x += 24) {
      const y = baseY + Math.sin(x / 190 + i * 0.55) * 50;
      d += ` L ${x.toFixed(0)} ${y.toFixed(1)}`;
    }
    stripes.push(d);
  }

  return (
    <div className="stage">
      <style>{CSS}</style>

      {/* Laag 1: bewegende swirl-achtergrond */}
      <div className="bg">
        <svg className="swirl" viewBox="0 0 2000 2000" preserveAspectRatio="xMidYMid slice">
          <rect x="0" y="0" width="2000" height="2000" fill="#1d2a86" />
          {stripes.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#33489f" strokeWidth={52} />
          ))}
        </svg>
      </div>

      {/* Laag 2: inslaande kop */}
      <h1 className="headline">ZO SNEL LOOPT HET OP</h1>

      {/* Laag 3: gauge-kaart */}
      <div className="card">
        <div className="cardTitle">PRIJS PER JAAR</div>
        <svg viewBox="0 0 400 250" className="gauge">
          <defs>
            <linearGradient id="gaugeGrad" x1="40" y1="0" x2="360" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#22c55e" />
              <stop offset="0.45" stopColor="#eab308" />
              <stop offset="0.72" stopColor="#f97316" />
              <stop offset="1" stopColor="#ef4444" />
            </linearGradient>
          </defs>
          {/* gekleurde boog (groen -> rood), buigt naar BOVEN */}
          <path
            d="M 40 200 A 160 160 0 0 1 360 200"
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeWidth={24}
            strokeLinecap="round"
          />
          {/* naald — zwiept van laag (links) naar hoog (rechts) en bevriest daar (CSS) */}
          <g className="needle">
            <line x1="200" y1="200" x2="200" y2="68" stroke="#1f2937" strokeWidth={6} strokeLinecap="round" />
          </g>
          <circle cx="200" cy="200" r="13" fill="#1f2937" />
          <circle cx="200" cy="200" r="5" fill="#fff" />
          <text x="40" y="232" className="gLabel" textAnchor="middle">€150</text>
          <text x="360" y="232" className="gLabel" textAnchor="middle">€15.000</text>
        </svg>
        <div className="bigNumber">€{value.toLocaleString("nl-NL")}</div>
      </div>

      {/* Laag 4: logo lower-third */}
      <div className="logo">
        <div className="logoMark">i</div>
        <span>JOUWANIMATIEVIDEO</span>
      </div>
    </div>
  );
}

const CSS = `
.stage {
  position: relative;
  width: min(94vw, 1024px);
  aspect-ratio: 16 / 9;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0,0,0,0.6);
  background: #1d2a86;
}
.bg { position: absolute; inset: 0; overflow: hidden; }
.swirl {
  position: absolute;
  top: 50%; left: 50%;
  width: 240%; height: 240%;
  transform-origin: center;
  transform: translate(-50%, -50%) rotate(0deg);
  animation: swirl 90s linear infinite;
  opacity: 0.9;
}
@keyframes swirl {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to   { transform: translate(-50%, -50%) rotate(360deg); }
}
.headline {
  position: absolute;
  top: 8%; left: 0; right: 0;
  text-align: center;
  margin: 0;
  padding: 0 6%;
  color: #fff;
  font-size: clamp(22px, 4.6vw, 52px);
  font-weight: 800;
  letter-spacing: 0.5px;
  text-shadow: 0 4px 14px rgba(0,0,0,0.35);
  opacity: 0;
  animation: slamIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) 0.15s forwards;
}
@keyframes slamIn {
  0%   { opacity: 0; transform: scale(1.25); }
  60%  { opacity: 1; transform: scale(0.97); }
  100% { opacity: 1; transform: scale(1); }
}
.card {
  position: absolute;
  left: 50%; top: 54%;
  transform: translate(-50%, -50%);
  width: 56%;
  background: #f8fafc;
  border-radius: 20px;
  padding: 18px 22px 14px;
  box-shadow: 0 16px 40px rgba(0,0,0,0.3);
  text-align: center;
  opacity: 0;
  animation: popIn 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2) 0.35s forwards;
}
@keyframes popIn {
  0%   { opacity: 0; transform: translate(-50%, -42%) scale(0.9); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
.cardTitle {
  font-size: clamp(13px, 2vw, 22px);
  font-weight: 800;
  color: #0f172a;
  letter-spacing: 1px;
  margin-bottom: 4px;
}
.gauge { width: 70%; display: block; margin: 0 auto; }
.needle {
  transform-box: view-box;
  transform-origin: 200px 200px;
  animation: needleSweep 1.3s cubic-bezier(0.34, 1.4, 0.64, 1) 0.8s both;
}
@keyframes needleSweep {
  from { transform: rotate(-90deg); }
  to   { transform: rotate(58deg); }
}
.gLabel { fill: #475569; font-size: 17px; font-weight: 700; }
.bigNumber {
  font-size: clamp(20px, 3.4vw, 36px);
  font-weight: 900;
  color: #0f172a;
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
.logo {
  position: absolute;
  left: 18px; bottom: 16px;
  display: flex; align-items: center; gap: 8px;
  color: #fff; font-weight: 800; font-size: clamp(9px, 1.5vw, 14px);
  letter-spacing: 1px;
  opacity: 0;
  animation: fadeUp 0.5s ease 1.0s forwards;
}
.logoMark {
  width: 1.9em; height: 1.9em;
  background: #2563eb; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.2em; font-style: italic;
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 0.95; transform: translateY(0); }
}
`;
