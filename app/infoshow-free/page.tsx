"use client";

import { useState } from "react";
import { InfoshowStyles, Player, type Scene } from "@/components/infoshow/blocks";

// Demo van VRIJE COMPOSITIE: ChatGPT plaatst per scene zelf de elementen
// (tekst, personage, icoon, cijfer, vorm, pijl) -> elke scene is uniek,
// geen vaste sjablonen. De renderer maakt exact wat beschreven staat.

const DEMO: Scene[] = [
  { type: "free", dur: 3.5, bg: "#1d2a86", swirl: true, elements: [
    { kind: "text", x: 50, y: 30, text: "WAT KOST AI JE ÉCHT?", size: "xl" },
    { kind: "icon", x: 50, y: 62, emoji: "🤖", size: 20 },
  ] },
  { type: "free", dur: 4.5, bg: "#15243a", elements: [
    { kind: "char", x: 26, y: 62, w: 32, h: 74, styleId: "A", expression: "neutraal", pose: "wijzen" },
    { kind: "stat", x: 70, y: 38, value: "€15.000", label: "PER JAAR", color: "#5fd36a" },
    { kind: "text", x: 70, y: 64, text: "de echte rekening", size: "m", color: "#cbd5e1" },
  ] },
  { type: "free", dur: 4, bg: "#3a2230", elements: [
    { kind: "text", x: 50, y: 16, text: "WAAR GAAT HET HEEN?", size: "l" },
    { kind: "icon", x: 24, y: 58, emoji: "💸", size: 18 },
    { kind: "arrow", x1: 34, y1: 58, x2: 66, y2: 58 },
    { kind: "icon", x: 76, y: 58, emoji: "☁️", size: 18 },
  ] },
  { type: "free", dur: 3, bg: "#10243a", swirl: true, elements: [
    { kind: "text", x: 50, y: 50, text: "REKEN HET ZELF NA.", size: "xl" },
  ] },
];

const VOORBEELDEN = ["Hoe werkt een zwart gat?", "Waarom is fastfashion een probleem?", "De opkomst van TikTok", "Hoe verdient Google geld?"];

export default function FreePage() {
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
      const res = await fetch("/api/infoshow/compose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: subject }) });
      const data = await res.json();
      if (!res.ok || !data.scenes?.length) { setError(data.error ?? "Genereren mislukt"); return; }
      setScenes(data.scenes); setVersion((v) => v + 1);
    } catch { setError("Er ging iets mis. Probeer opnieuw."); } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a12", padding: "32px 16px 60px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, fontFamily: "system-ui,sans-serif" }}>
      <InfoshowStyles />
      <h1 style={{ color: "#e2e8f0", fontSize: 22, fontWeight: 800, margin: 0 }}>Vrije compositie — ChatGPT bouwt elke scene zelf</h1>
      <p style={{ color: "#64748b", fontSize: 14, margin: 0, textAlign: "center", maxWidth: 660 }}>
        Geen vaste sjablonen meer: AI plaatst per scene zelf tekst, personages, iconen, cijfers en pijlen. De renderer maakt exact wat beschreven staat.
      </p>
      <div style={{ display: "flex", gap: 8, width: "min(94vw,720px)", flexWrap: "wrap", justifyContent: "center" }}>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && generate(topic)}
          placeholder="Onderwerp, bijv. 'Hoe werkt een vulkaan?'"
          style={{ flex: 1, minWidth: 280, background: "#0f172a", color: "#e2e8f0", border: "1px solid #1e293b", borderRadius: 12, padding: "12px 16px", fontSize: 15 }} />
        <button onClick={() => generate(topic)} disabled={loading}
          style={{ background: loading ? "#1e293b" : "#2563eb", color: "#fff", border: "none", borderRadius: 12, padding: "12px 22px", fontSize: 15, fontWeight: 700, cursor: loading ? "default" : "pointer" }}>
          {loading ? "Bezig…" : "Genereer ▶"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {VOORBEELDEN.map((v) => <button key={v} onClick={() => { setTopic(v); generate(v); }} disabled={loading} style={{ background: "#111827", color: "#94a3b8", border: "1px solid #1e293b", borderRadius: 999, padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>{v}</button>)}
      </div>
      {error && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{error}</p>}
      <Player key={version} scenes={scenes} />
    </div>
  );
}
