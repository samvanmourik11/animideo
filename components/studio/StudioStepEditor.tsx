"use client";

// Laatste stap van de Studio-wizard: de nieuwe video-editor, met de in de wizard
// opgebouwde video er al in geladen. We maken (of hergebruiken) een editor-project
// uit de Studio-assets en tonen de EditorShell inline. Een knop opent dezelfde
// editor op volledig scherm wanneer er meer ruimte nodig is.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import EditorShell from "@/components/editor/EditorShell";
import { migrateTimeline, type Ratio, type TimelineDoc } from "@/lib/editor/timeline";
import type { Project } from "@/lib/types";

type Loaded = {
  id: string;
  userId: string;
  title: string;
  ratio: Ratio;
  timeline: TimelineDoc;
};

export default function StudioStepEditor({
  project,
  onBack,
}: {
  project: Project;
  onBack: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  // Ondertiteling op de geëxporteerde video — bewerkbaar (tekst per scène uit de
  // voice-over, dus geen transcriptie-fouten) en met instelbare grootte.
  const [subOpen, setSubOpen] = useState(false);
  const [subSegments, setSubSegments] = useState<{ text: string; start: number; duration: number }[]>([]);
  const [subSize, setSubSize] = useState<"small" | "medium" | "large">("medium");
  const [subStatus, setSubStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [subUrl, setSubUrl] = useState<string | null>(null);
  const [subError, setSubError] = useState("");

  function toggleSubtitles() {
    if (!subOpen) {
      // Initialiseer de tekst uit de scènes (voice-over), met cumulatieve starttijd.
      let t = 0;
      const segs = (project.scenes ?? []).map(s => {
        const seg = { text: (s.voiceover_text || "").trim(), start: t, duration: s.duration || 0 };
        t += s.duration || 0;
        return seg;
      }).filter(s => s.text.length > 0 && s.duration > 0);
      setSubSegments(segs);
    }
    setSubOpen(o => !o);
  }

  async function burnSubtitles() {
    if (!data || subStatus === "running") return;
    setSubStatus("running"); setSubError(""); setSubUrl(null);
    try {
      const res = await fetch("/api/studio/subtitles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editorProjectId: data.id, segments: subSegments, fontSize: subSize }),
      });
      const d = await res.json();
      if (!res.ok || !d.url) { setSubError(d.error ?? "Ondertiteling mislukt"); setSubStatus("error"); return; }
      setSubUrl(d.url); setSubStatus("done");
    } catch (e) {
      setSubError(e instanceof Error ? e.message : String(e)); setSubStatus("error");
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const cacheKey = `studio-editor-${project.id}`;
    let cachedId: string | null = null;
    try {
      cachedId = localStorage.getItem(cacheKey);
    } catch {}

    (async () => {
      try {
        const res = await fetch("/api/studio/export-to-editor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: project.id, editorProjectId: cachedId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Laden mislukt");

        try {
          localStorage.setItem(cacheKey, json.id);
        } catch {}

        setData({
          id: json.id,
          userId: json.userId,
          title: json.title,
          ratio: json.ratio as Ratio,
          timeline: migrateTimeline(json.timeline as TimelineDoc),
        });
        setStatus("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Onbekende fout");
        setStatus("error");
      }
    })();
  }, [project.id]);

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3 text-slate-400">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-cyan-400 animate-spin" />
        <p className="text-sm">Je video wordt in de editor geladen…</p>
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-[40vh] gap-4 text-center">
        <p className="text-sm text-red-400">De editor kon niet geladen worden.</p>
        {error && <p className="text-xs text-slate-500 max-w-md break-words">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onBack} className="btn-secondary text-sm">
            Terug
          </button>
          <button
            onClick={() => {
              started.current = false;
              setStatus("loading");
              setError(null);
            }}
            className="btn-primary text-sm"
          >
            Opnieuw proberen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-slate-400 hover:text-white">
          ← Terug naar voice-over
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSubtitles}
            className={`text-sm ${subOpen ? "text-white" : "text-slate-300 hover:text-white"}`}
            title="Ondertiteling toevoegen — bewerkbaar, met de echte voice-over-tekst"
          >
            💬 Ondertiteling
          </button>
          <Link
            href={`/editor/${data.id}`}
            className="text-sm text-cyan-300 hover:text-cyan-200"
          >
            Op volledig scherm openen ↗
          </Link>
        </div>
      </div>

      {subOpen && (
        <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs text-slate-400">
              Tekst komt uit je voice-over (pas gerust aan). Exporteer eerst de video in de editor.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-slate-500">Grootte:</span>
              {(["small", "medium", "large"] as const).map(sz => (
                <button
                  key={sz}
                  onClick={() => setSubSize(sz)}
                  className={`text-[11px] px-2 py-0.5 rounded border ${subSize === sz ? "bg-cyan-600/30 border-cyan-400 text-cyan-100" : "bg-white/5 border-white/10 text-slate-400 hover:border-white/30"}`}
                >
                  {sz === "small" ? "Klein" : sz === "medium" ? "Normaal" : "Groot"}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {subSegments.length === 0 && (
              <p className="text-xs text-slate-500">Geen voice-over-tekst gevonden in de scènes.</p>
            )}
            {subSegments.map((seg, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[10px] text-slate-500 mt-1.5 w-6 shrink-0">#{i + 1}</span>
                <textarea
                  value={seg.text}
                  onChange={e => setSubSegments(prev => prev.map((s, k) => k === i ? { ...s, text: e.target.value } : s))}
                  rows={1}
                  className="flex-1 bg-slate-950 border border-white/10 rounded px-2 py-1 text-xs text-white"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={burnSubtitles}
              disabled={subStatus === "running" || subSegments.length === 0}
              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
            >
              {subStatus === "running" ? "Ondertitelen… (~1 min)" : "Ondertiteling inbranden"}
            </button>
            {subStatus === "done" && subUrl && (
              <a href={subUrl} className="text-xs text-cyan-300 underline" target="_blank" rel="noreferrer">Download ondertitelde video</a>
            )}
            {subStatus === "error" && subError && <span className="text-xs text-red-400">{subError}</span>}
          </div>
        </div>
      )}

      {/* Vaste hoogte zodat de EditorShell (flex h-full) netjes in de wizard past. */}
      <div className="h-[78vh] rounded-xl border border-white/10 overflow-hidden bg-[#0b0b12]">
        <EditorShell
          projectId={data.id}
          userId={data.userId}
          title={data.title}
          ratio={data.ratio}
          initialTimeline={data.timeline}
        />
      </div>
    </div>
  );
}
