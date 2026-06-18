"use client";

import { useEffect, useRef, useState } from "react";
import { Project } from "@/lib/types";
import InfographicVideo from "./render/InfographicVideo";
import { totalDuration, FPS } from "@/lib/infographics/video";

export default function InfographicStepExport({
  project,
  onBack,
}: {
  project: Project;
  plan: string;
  onBack: () => void;
}) {
  const spec = project.infographic_spec!;
  const aspect = spec.format === "16:9" ? "16 / 9" : "1080 / 1350";
  const totalFrames = Math.max(1, Math.round(totalDuration(spec) * FPS));

  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  // Afspeel-lus voor de preview (loopt). Stuurt InfographicVideo per frame aan.
  useEffect(() => {
    if (!playing) return;
    startRef.current = null;
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = (ts - startRef.current) / 1000;
      const f = Math.round(elapsed * FPS) % totalFrames;
      setFrame(f);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, totalFrames]);

  const [busy, setBusy] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(project.video_url ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pngBusy, setPngBusy] = useState(false);

  async function exportVideo() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/infographics/export-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Video-export mislukt."); return; }
      setVideoUrl(json.url);
    } catch {
      setError("Er ging iets mis tijdens de video-export.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPng() {
    setError(null);
    setPngBusy(true);
    try {
      const res = await fetch("/api/infographics/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "PNG-export mislukt."); return; }
      const blob = await (await fetch(json.url)).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${project.title.replace(/\s+/g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch {
      setError("Er ging iets mis tijdens de PNG-export.");
    } finally {
      setPngBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,560px)_1fr] gap-6">
      <div className="lg:sticky lg:top-4 self-start space-y-3">
        <div className="rounded-xl overflow-hidden border border-white/10 bg-black/20" style={{ aspectRatio: aspect }}>
          <InfographicVideo spec={spec} frame={frame} totalFrames={totalFrames} style={{ width: "100%", height: "100%" }} />
        </div>
        <div className="flex items-center justify-between">
          <button onClick={() => setPlaying((p) => !p)} className="text-sm text-slate-300 hover:text-white flex items-center gap-2">
            {playing ? "⏸ Pauzeer preview" : "▶ Speel preview"}
          </button>
          <span className="text-xs text-slate-500">{(totalDuration(spec)).toFixed(1)}s · {spec.format}</span>
        </div>
      </div>

      <div className="space-y-4 max-w-md">
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Video downloaden</h3>
          <p className="text-xs text-slate-400">
            Exporteer de infographic als geanimeerde MP4: elke scene komt in beeld, cijfers tellen op en
            grafieken bouwen zich op. Dit kan een minuut duren.
          </p>
          <button onClick={exportVideo} disabled={busy} className="btn-primary text-sm w-full">
            {busy ? "Bezig met renderen…" : "Exporteer video (MP4)"}
          </button>
          {videoUrl && !busy && (
            <div className="space-y-2">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={videoUrl} controls className="w-full rounded-lg border border-white/10" />
              <a href={videoUrl} download className="text-sm text-blue-400 hover:text-blue-300">Download MP4 ↓</a>
            </div>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">Of als losse afbeelding</h3>
          <p className="text-xs text-slate-400">
            De volledige infographic als scherpe PNG op {spec.format === "16:9" ? "1920×1080" : "1080×1350"} pixels.
          </p>
          <button onClick={downloadPng} disabled={pngBusy} className="btn-secondary text-sm w-full">
            {pngBusy ? "Bezig…" : "Download PNG"}
          </button>
        </div>

        <button onClick={onBack} className="text-sm text-slate-400 hover:text-white">← Terug naar bewerken</button>
      </div>
    </div>
  );
}
