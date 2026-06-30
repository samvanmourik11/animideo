"use client";

import { useState } from "react";

// PROOF OF CONCEPT — storytelling infographic scene.
// Beeldmodel maakt de platte illustratie (zonder tekst); de typografie, het
// grote getal en de callout liggen er deterministisch in SVG overheen. Zo zie je
// de combinatie die we voor de echte tool willen: illustratie op animatiemarkt-
// niveau + haarscherpe, bewerkbare tekst in de merkkleuren.

const W = 1920;
const H = 1080;

function Line({ words, x, y, size, navy, accent, highlight }: { words: string; x: number; y: number; size: number; navy: string; accent: string; highlight: string }) {
  const parts = words.split(" ");
  const hl = highlight.trim().toLowerCase();
  return (
    <text x={x} y={y} fontFamily="Inter, system-ui, sans-serif" fontSize={size} fontWeight={800} fill={navy}>
      {parts.map((w, i) => (
        <tspan key={i} fill={hl && w.toLowerCase().replace(/[.,]/g, "") === hl ? accent : navy}>
          {w}{i < parts.length - 1 ? " " : ""}
        </tspan>
      ))}
    </text>
  );
}

export default function StoryProofPage() {
  const [subject, setSubject] = useState(
    "a cozy detached house with a pitched dark-navy roof and light-blue walls, a small chimney, a green bush and a tree beside it, set against soft grey mountains"
  );
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Overlay-velden
  const [line1, setLine1] = useState("De staat helpt je");
  const [line2, setLine2] = useState("verwarming vergroenen");
  const [highlight, setHighlight] = useState("vergroenen");
  const [bigNumber, setBigNumber] = useState("5.500€");
  const [callout, setCallout] = useState("21°");
  const [navy, setNavy] = useState("#16243f");
  const [accent, setAccent] = useState("#e8643c");

  // Callout-anker (waar het lijntje naartoe wijst) — in het echte product geeft
  // de AI dit mee; hier handmatig zodat je het op de illustratie kunt richten.
  const [cx, setCx] = useState(640);
  const [cy, setCy] = useState(360);
  const [ax, setAx] = useState(880);
  const [ay, setAy] = useState(620);

  async function generate() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/infographics/story-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: subject }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setImageUrl(data.imageUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto p-6">
      <h1 className="text-xl font-bold text-white mb-1">Storytelling-scene · proof of concept</h1>
      <p className="text-sm text-slate-400 mb-6">Illustratie via beeldmodel (zonder tekst) + SVG-overlay voor kop, cijfer en callout.</p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Composite */}
        <div>
          <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#f3f1ec]" style={{ aspectRatio: "16 / 9" }}>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-slate-400 text-sm">Nog geen illustratie. Klik op Genereer.</div>
            )}

            <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
              {/* Kop, twee regels */}
              <Line words={line1} x={110} y={170} size={84} navy={navy} accent={accent} highlight={highlight} />
              <Line words={line2} x={110} y={262} size={84} navy={navy} accent={accent} highlight={highlight} />

              {/* Groot getal rechtsboven */}
              {bigNumber && (
                <text x={W - 110} y={180} textAnchor="end" fontFamily="Inter, system-ui, sans-serif" fontSize={132} fontWeight={800} fill={accent}>
                  {bigNumber}
                </text>
              )}

              {/* Callout: cirkel + lijntje + ankerpunt */}
              {callout && (
                <>
                  <line x1={cx} y1={cy + 78} x2={ax} y2={ay} stroke={navy} strokeWidth={3} />
                  <circle cx={ax} cy={ay} r={9} fill={navy} />
                  <circle cx={cx} cy={cy} r={78} fill="#ffffff" stroke="rgba(0,0,0,0.08)" strokeWidth={2} />
                  <text x={cx} y={cy} dy="0.35em" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontSize={54} fontWeight={800} fill={navy}>
                    {callout}
                  </text>
                </>
              )}
            </svg>
          </div>
          {err && <p className="text-red-400 text-sm mt-3 break-words">{err}</p>}
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <label className="block text-[11px] text-slate-400">Illustratie (Engels, beschrijf de scene, geen tekst)</label>
            <textarea value={subject} onChange={(e) => setSubject(e.target.value)} rows={5} className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
            <button onClick={generate} disabled={loading} className="btn-primary text-sm w-full disabled:opacity-50">
              {loading ? "Genereren…" : imageUrl ? "Opnieuw genereren" : "Genereer illustratie"}
            </button>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-white mb-1">Overlay</p>
            <Field label="Kop regel 1" value={line1} onChange={setLine1} />
            <Field label="Kop regel 2" value={line2} onChange={setLine2} />
            <Field label="Accentwoord" value={highlight} onChange={setHighlight} />
            <Field label="Groot getal" value={bigNumber} onChange={setBigNumber} />
            <Field label="Callout" value={callout} onChange={setCallout} />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <ColorField label="Tekst" value={navy} onChange={setNavy} />
              <ColorField label="Accent" value={accent} onChange={setAccent} />
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-white mb-1">Callout-positie</p>
            <Range label="Cirkel X" value={cx} set={setCx} max={W} />
            <Range label="Cirkel Y" value={cy} set={setCy} max={H} />
            <Range label="Anker X" value={ax} set={setAx} max={W} />
            <Range label="Anker Y" value={ay} set={setAy} max={H} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-slate-400 mb-0.5">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white" />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-slate-400 mb-0.5">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-8 bg-transparent border border-white/10 rounded cursor-pointer" />
    </label>
  );
}

function Range({ label, value, set, max }: { label: string; value: number; set: (n: number) => void; max: number }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-slate-400">{label}: {value}</span>
      <input type="range" min={0} max={max} value={value} onChange={(e) => set(Number(e.target.value))} className="w-full" />
    </label>
  );
}
