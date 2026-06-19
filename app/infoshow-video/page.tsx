"use client";

import { useState } from "react";
import { InfoshowStyles, Player, type Scene } from "@/components/infoshow/blocks";

// Voorbeeld-script (fallback / startpunt). De AI genereert straks zo'n lijst.
const DEMO: Scene[] = [
  { type: "statement", dur: 3, text: "WAT KOST AI JE ÉCHT?" },
  { type: "character", dur: 4.5, styleId: "A", bg: "#2b3a59", bubble: "Je denkt: €20 per maand. Toch?", charProps: { expression: "neutraal", pose: "presenteren" } },
  { type: "gauge", dur: 5, headline: "ZO SNEL LOOPT HET OP", title: "PRIJS PER JAAR", from: 150, to: 15000, unit: "€" },
  { type: "chart", dur: 4.5, pct: 80, label: "VERBORGEN KOSTEN", sub: "ONZICHTBAAR" },
  { type: "triptych", dur: 4.5, panels: ["TOKENS", "OPSLAG", "API-CALLS"] },
  { type: "character", dur: 4, styleId: "D", bg: "#15243a", bubble: "Reken het zelf maar na." },
  { type: "statement", dur: 3, text: "DAT IS DE ECHTE REKENING." },
];

const VOORBEELDEN = ["Waarom slapen we eigenlijk?", "Hoe verdient Spotify geld?", "De opkomst van elektrische auto's", "Wat gebeurt er met je data online?"];

export default function VideoPage() {
  const [topic, setTopic] = useState("");
  const [scenes, setScenes] = useState<Scene[]>(DEMO);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate(t: string) {
    const subject = t.trim();
    if (loading) return;
    if (!subject) { setError("Vul eerst een onderwerp in."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/infoshow/script", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: subject }),
      });
      const data = await res.json();
      if (!res.ok || !data.scenes?.length) { setError(data.error ?? "Genereren mislukt"); return; }
      setScenes(data.scenes); setVersion((v) => v + 1);
    } catch {
      setError("Er ging iets mis. Probeer opnieuw.");
    } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a12", padding: "32px 16px 60px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, fontFamily: "system-ui,sans-serif" }}>
      <InfoshowStyles />
      <h1 style={{ color: "#e2e8f0", fontSize: 22, fontWeight: 800, margin: 0 }}>Infographics Show — video uit een onderwerp</h1>
      <p style={{ color: "#64748b", fontSize: 14, margin: 0, textAlign: "center", maxWidth: 620 }}>
        Typ een onderwerp, AI schrijft het scene-script in deze stijl en de speler speelt het meteen af.
      </p>

      {/* Onderwerp-invoer */}
      <div style={{ display: "flex", gap: 8, width: "min(94vw,720px)", flexWrap: "wrap", justifyContent: "center" }}>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && generate(topic)}
          placeholder="Onderwerp, bijv. 'Waarom is koffie zo populair?'"
          style={{ flex: 1, minWidth: 280, background: "#0f172a", color: "#e2e8f0", border: "1px solid #1e293b", borderRadius: 12, padding: "12px 16px", fontSize: 15 }}
        />
        <button onClick={() => generate(topic)} disabled={loading}
          style={{ background: loading ? "#1e293b" : "#2563eb", color: "#fff", border: "none", borderRadius: 12, padding: "12px 22px", fontSize: 15, fontWeight: 700, cursor: loading ? "default" : "pointer" }}>
          {loading ? "Bezig…" : "Genereer ▶"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {VOORBEELDEN.map((v) => (
          <button key={v} onClick={() => { setTopic(v); generate(v); }} disabled={loading}
            style={{ background: "#111827", color: "#94a3b8", border: "1px solid #1e293b", borderRadius: 999, padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>{v}</button>
        ))}
      </div>
      {error && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{error}</p>}

      <Player key={version} scenes={scenes} />
    </div>
  );
}
