"use client";

import { useState } from "react";

// Prototype 2: code-gerenderd PERSONAGE (SVG-puppet) in de Infographics Show-
// stijl. Bewijst dat de "poppetjes" net als de gauge zonder AI kunnen, volledig
// gerigd: idle-bob, knipperen, pratende mond, gebarende arm + spreekballon.
// Bekijk op: http://localhost:3000/infoshow-prototype-2

export default function InfoshowChar() {
  const [runKey, setRunKey] = useState(0);
  return (
    <div
      style={{
        minHeight: "100vh", background: "#0a0a12", display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 20, padding: 24, fontFamily: "system-ui, sans-serif",
      }}
    >
      <Scene key={runKey} />
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={() => setRunKey((k) => k + 1)}
          style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 12,
            padding: "10px 20px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
        >
          ↻ Opnieuw afspelen
        </button>
        <span style={{ color: "#64748b", fontSize: 13 }}>
          Prototype 2 — personage in code (geen AI)
        </span>
      </div>
    </div>
  );
}

function Scene() {
  return (
    <div className="stage2">
      <style>{CSS}</style>
      <svg viewBox="0 0 1280 720" className="full" preserveAspectRatio="xMidYMid slice">
        {/* ── Themed achtergrond (lab/kantoor) ── */}
        <rect x="0" y="0" width="1280" height="720" fill="#2b3a59" />
        <rect x="0" y="0" width="1280" height="470" fill="#33456a" />
        {/* schoolbord/scherm achter */}
        <rect x="150" y="70" width="980" height="320" rx="14" fill="#3e527c" />
        {/* zwevende bokeh-stippen (subtiele beweging) */}
        <circle className="dot d1" cx="250" cy="170" r="16" fill="#ffffff" opacity="0.08" />
        <circle className="dot d2" cx="1010" cy="140" r="22" fill="#ffffff" opacity="0.07" />
        <circle className="dot d3" cx="900" cy="250" r="12" fill="#ffffff" opacity="0.09" />
        <circle className="dot d1" cx="380" cy="300" r="10" fill="#ffffff" opacity="0.07" />

        {/* ── Personage (gerigd) ── */}
        <g className="char">
          {/* lichaam / jas */}
          <path d="M520 720 L520 560 Q520 470 640 470 Q760 470 760 560 L760 720 Z" fill="#f1f4f8" />
          <path d="M624 470 L640 540 L656 470 Z" fill="#2b6cb0" />
          <rect x="632" y="470" width="16" height="70" fill="#2b6cb0" />
          {/* nek */}
          <rect x="616" y="400" width="48" height="60" rx="14" fill="#e2a878" />
          {/* hoofd */}
          <circle cx="640" cy="330" r="78" fill="#e8b58f" />
          {/* oren */}
          <circle cx="564" cy="332" r="13" fill="#e2a878" />
          <circle cx="716" cy="332" r="13" fill="#e2a878" />
          {/* haar */}
          <path d="M566 322 Q560 250 640 246 Q720 250 714 322 Q694 286 640 286 Q586 286 566 322 Z" fill="#3a2a22" />
          {/* wenkbrauwen */}
          <rect x="600" y="306" width="34" height="7" rx="3.5" fill="#3a2a22" />
          <rect x="646" y="306" width="34" height="7" rx="3.5" fill="#3a2a22" />
          {/* ogen (knipperen via CSS) */}
          <g className="eye" style={{ transformOrigin: "616px 330px" }}>
            <ellipse cx="616" cy="330" rx="13" ry="15" fill="#ffffff" />
            <circle cx="618" cy="332" r="5.5" fill="#1f2937" />
          </g>
          <g className="eye" style={{ transformOrigin: "664px 330px" }}>
            <ellipse cx="664" cy="330" rx="13" ry="15" fill="#ffffff" />
            <circle cx="666" cy="332" r="5.5" fill="#1f2937" />
          </g>
          {/* wangen */}
          <circle cx="598" cy="356" r="11" fill="#f0a99a" opacity="0.5" />
          <circle cx="682" cy="356" r="11" fill="#f0a99a" opacity="0.5" />
          {/* mond (praat via CSS) */}
          <ellipse className="mouth" cx="640" cy="372" rx="15" ry="4" fill="#7a3b34" style={{ transformOrigin: "640px 372px" }} />

          {/* gebarende arm (pivot bij schouder, CSS) */}
          <g className="arm" style={{ transformOrigin: "740px 520px" }}>
            <path d="M735 525 Q770 470 815 452" stroke="#f1f4f8" strokeWidth="34" fill="none" strokeLinecap="round" />
            <circle cx="820" cy="450" r="17" fill="#e8b58f" />
          </g>
        </g>

        {/* ── Bureau ervoor ── */}
        <rect x="0" y="612" width="1280" height="108" fill="#b08968" />
        <rect x="0" y="612" width="1280" height="14" fill="#c79a76" />
        {/* simpel laptopje als prop */}
        <rect x="430" y="566" width="120" height="74" rx="6" fill="#cbd5e1" />
        <rect x="442" y="576" width="96" height="54" rx="3" fill="#1f2937" />
        <rect x="418" y="636" width="144" height="10" rx="5" fill="#9aa6b8" />
      </svg>

      {/* spreekballon (HTML, popt in) */}
      <div className="bubble">
        Dit personage is volledig in code, geen AI.
        <span className="tail" />
      </div>

      {/* logo lower-third */}
      <div className="logo2"><div className="logoMark2">i</div><span>JOUWANIMATIEVIDEO</span></div>
    </div>
  );
}

const CSS = `
.stage2 {
  position: relative; width: min(94vw, 1024px); aspect-ratio: 16 / 9;
  border-radius: 16px; overflow: hidden; box-shadow: 0 24px 80px rgba(0,0,0,0.6);
  background: #2b3a59;
}
.full { position: absolute; inset: 0; width: 100%; height: 100%; }
.char { animation: bob 3.6s ease-in-out infinite; }
@keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
.eye { transform-box: view-box; animation: blink 4.2s infinite; }
@keyframes blink { 0%,92%,100% { transform: scaleY(1); } 96% { transform: scaleY(0.1); } }
.mouth { transform-box: view-box; animation: talk 0.42s ease-in-out 0.8s 6 both; }
@keyframes talk { 0% { transform: scaleY(1); } 50% { transform: scaleY(2.1); } 100% { transform: scaleY(0.9); } }
.arm { transform-box: view-box; animation: armGesture 2.4s ease 0.8s both; }
@keyframes armGesture { 0% { transform: rotate(0deg); } 25% { transform: rotate(-14deg); } 55% { transform: rotate(5deg); } 100% { transform: rotate(0deg); } }
.dot { animation: drift 9s ease-in-out infinite; }
.d2 { animation-duration: 11s; }
.d3 { animation-duration: 7.5s; }
@keyframes drift {
  0%,100% { transform: translateY(0); }
  50% { transform: translateY(-18px); }
}
.bubble {
  position: absolute; left: 56%; top: 20%;
  background: #ffffff; color: #0f172a;
  font-size: clamp(12px, 2vw, 22px); font-weight: 700;
  padding: 14px 18px; border-radius: 16px; max-width: 38%;
  box-shadow: 0 10px 26px rgba(0,0,0,0.28);
  opacity: 0; transform-origin: bottom left;
  animation: bubblePop 0.45s cubic-bezier(0.2,0.9,0.3,1.3) 0.8s forwards;
}
.tail {
  position: absolute; left: 22px; bottom: -12px;
  width: 0; height: 0; border: 12px solid transparent;
  border-top-color: #ffffff; border-bottom: 0;
}
@keyframes bubblePop {
  0% { opacity: 0; transform: scale(0.6) translateY(10px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
.logo2 {
  position: absolute; left: 18px; bottom: 16px; display: flex; align-items: center; gap: 8px;
  color: #fff; font-weight: 800; font-size: clamp(9px,1.5vw,14px); letter-spacing: 1px;
  opacity: 0; animation: fadeUp2 0.5s ease 1.0s forwards;
}
.logoMark2 {
  width: 1.9em; height: 1.9em; background: #2563eb; border-radius: 6px;
  display: flex; align-items: center; justify-content: center; font-size: 1.2em; font-style: italic;
}
@keyframes fadeUp2 { from { opacity:0; transform: translateY(8px);} to { opacity:0.95; transform: translateY(0);} }
`;
