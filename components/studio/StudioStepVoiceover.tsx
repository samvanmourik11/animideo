"use client";

import { useState, useEffect, useRef } from "react";
import { Project } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onNext: () => void;
  onBack: () => void;
}

const VOICES = [
  { value: "Charlotte", label: "Charlotte (warm vrouwelijk)" },
  { value: "Sarah",     label: "Sarah (zacht vrouwelijk)" },
  { value: "Rachel",    label: "Rachel (kalm vrouwelijk)" },
  { value: "Jessica",   label: "Jessica (jeugdig vrouwelijk)" },
  { value: "Lily",      label: "Lily (warm jong vrouwelijk)" },
  { value: "Brian",     label: "Brian (warm mannelijk)" },
  { value: "Daniel",    label: "Daniel (autoritair mannelijk)" },
  { value: "George",    label: "George (Brits mannelijk)" },
  { value: "Liam",      label: "Liam (jong mannelijk)" },
  { value: "Will",      label: "Will (rustig mannelijk)" },
];

export default function StudioStepVoiceover({ project, onUpdate, onNext, onBack }: Props) {
  const [voice, setVoice] = useState(project.selected_voice ?? "Charlotte");
  const [stability, setStability] = useState(0.5);
  const [speed, setSpeed] = useState(1);
  const [audioUrl, setAudioUrl] = useState(project.voice_audio_url ?? "");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const waveRef = useRef<HTMLDivElement>(null);

  const scenes = project.scenes ?? [];
  const fullScript = scenes.map(s => s.voiceover_text).filter(Boolean).join(" ");
  const totalVideoDuration = scenes.reduce((acc, s) => acc + (s.duration || 0), 0);

  useEffect(() => {
    if (!audioUrl || !waveRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ws: any = null;
    (async () => {
      const WaveSurfer = (await import("wavesurfer.js")).default;
      if (!waveRef.current) return;
      ws = WaveSurfer.create({
        container:     waveRef.current,
        waveColor:     "#06b6d4",
        progressColor: "#0e7490",
        height:        70,
        barWidth:      2,
        barGap:        1,
        barRadius:     2,
      });
      ws.load(audioUrl);
      ws.on("ready", () => setAudioDuration(Math.round(ws.getDuration())));
    })();
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ws as any)?.destroy();
    };
  }, [audioUrl]);

  async function handleGenerate() {
    if (!fullScript.trim()) {
      setError("Geen voice-over tekst in scenes");
      return;
    }
    setError("");
    setGenerating(true);
    setAudioUrl("");
    setAudioDuration(null);
    try {
      const res = await fetch("/api/studio/generate-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, voice, stability, speed }),
      });
      const data = await res.json();
      if (!res.ok || !data.audioUrl) {
        setError(data.error ?? "Voice generatie mislukt");
        return;
      }
      setAudioUrl(data.audioUrl);
      onUpdate({ voice_audio_url: data.audioUrl, selected_voice: data.voice, status: "VoiceReady" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setGenerating(false);
    }
  }

  const durationDiff = audioDuration !== null ? audioDuration - totalVideoDuration : null;

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold text-white">Voice-over</h2>
        <p className="text-slate-500 text-sm mt-0.5">
          ElevenLabs via fal.ai. Geen ElevenLabs Pro abo nodig.
        </p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Volledig script ({project.language})</label>
          <textarea
            readOnly
            value={fullScript}
            rows={Math.min(12, Math.max(4, scenes.length * 2))}
            className="w-full bg-slate-950/60 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-300 font-mono leading-relaxed"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Voice</label>
            <select
              value={voice}
              onChange={e => setVoice(e.target.value)}
              disabled={generating}
              className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              {VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Stabiliteit ({stability.toFixed(2)})
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={stability}
              onChange={e => setStability(Number(e.target.value))}
              disabled={generating}
              className="w-full accent-cyan-500"
            />
            <p className="text-[10px] text-slate-500 mt-0.5">Lager = expressiever, hoger = consistenter</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Snelheid ({speed.toFixed(2)}x)
            </label>
            <input
              type="range"
              min="0.7"
              max="1.2"
              step="0.05"
              value={speed}
              onChange={e => setSpeed(Number(e.target.value))}
              disabled={generating}
              className="w-full accent-cyan-500"
            />
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating || !fullScript.trim()}
          className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-medium py-2.5 rounded-lg"
        >
          {generating ? "Voice genereren..." : audioUrl ? "Opnieuw genereren" : "Genereer voice-over"}
        </button>

        {error && (
          <div className="bg-red-950/40 border border-red-700/40 text-red-200 text-sm rounded-lg px-3 py-2">{error}</div>
        )}
      </div>

      {audioUrl && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950/60 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-500 mb-0.5">Video duur</p>
              <p className="text-lg font-bold text-white">{totalVideoDuration}s</p>
            </div>
            <div className="bg-slate-950/60 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-500 mb-0.5">Audio duur</p>
              <p className="text-lg font-bold text-white">{audioDuration ?? "..."}s</p>
            </div>
          </div>

          {durationDiff !== null && (
            <div className={`text-xs px-3 py-2 rounded-lg ${
              Math.abs(durationDiff) <= 3
                ? "bg-emerald-950/40 text-emerald-300 border border-emerald-700/30"
                : "bg-amber-950/40 text-amber-200 border border-amber-700/30"
            }`}>
              {Math.abs(durationDiff) <= 3
                ? "Audio en video sluiten goed aan."
                : durationDiff > 0
                ? `Audio is ${durationDiff}s langer dan de video. Wordt afgekapt bij export.`
                : `Audio is ${Math.abs(durationDiff)}s korter. Het einde wordt stil.`}
            </div>
          )}

          <div ref={waveRef} className="rounded-md bg-slate-950/60 border border-white/10 p-2" />
          <audio src={audioUrl} controls className="w-full mt-2" />
        </div>
      )}

      <div className="flex items-center justify-between mt-6">
        <button onClick={onBack} className="text-sm bg-white/10 hover:bg-white/15 text-white px-4 py-2 rounded-md">← Terug</button>
        <button
          onClick={onNext}
          disabled={!audioUrl}
          className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-medium px-6 py-2.5 rounded-lg"
        >
          Naar editor →
        </button>
      </div>
    </div>
  );
}
