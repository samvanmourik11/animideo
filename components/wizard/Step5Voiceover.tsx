"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Project, Scene } from "@/lib/types";

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
  { value: "rbqBOMK4BPTMGvIB7N8w", label: "Hugo (enthousiast Nederlands mannelijk)" },
];

export default function Step5Voiceover({ project, onUpdate, onNext, onBack }: Props) {
  const [voice, setVoice] = useState(project.selected_voice ?? "Charlotte");
  const [stability, setStability] = useState(0.5);
  const [speed, setSpeed] = useState(1);
  const [audioUrl, setAudioUrl] = useState(project.voice_audio_url ?? "");
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [aligning, setAligning] = useState(false);
  const [alignResult, setAlignResult] = useState<{ ok: boolean; message: string } | null>(null);
  const waveRef = useRef<HTMLDivElement>(null);

  const scenes = project.scenes ?? [];
  // De tekst wordt per scène bewerkt en direct in de scènes opgeslagen. Eerder
  // was dit één los tekstvak dat nergens bewaard werd: een aanpassing kwam niet
  // in de editor aan (de scènes hielden de oude zinnen) en na "terug" stond de
  // oude tekst er weer. Alleen zonder scènes valt het terug op één vrij tekstvak.
  const [freeText, setFreeText] = useState("");
  const scriptText = scenes.length > 0
    ? scenes.map(s => (s.voiceover_text ?? "").trim()).filter(Boolean).join(" ")
    : freeText;
  const totalVideoDuration = scenes.reduce((acc, s) => acc + (s.duration || 0), 0);

  // Welke tekst zit er in de huidige audio? Zo zien we dat de tekst na het
  // genereren nog is aangepast, en dat de stem dus iets anders zegt dan er staat.
  // Per project in localStorage; zonder notitie (oudere projecten) gaan we ervan
  // uit dat audio en tekst bij elkaar horen.
  const voicedKey = `voice-script-${project.id}`;
  const [voicedScript, setVoicedScript] = useState<string | null>(null);
  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(voicedKey); } catch {}
    setVoicedScript(stored ?? (project.voice_audio_url ? scriptText : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function rememberVoiced(text: string) {
    setVoicedScript(text);
    try { window.localStorage.setItem(voicedKey, text); } catch {}
  }
  const textChanged = !!audioUrl && voicedScript !== null && voicedScript !== scriptText;

  function setSceneText(sceneId: string, text: string) {
    onUpdate({ scenes: scenes.map(s => s.id === sceneId ? { ...s, voiceover_text: text } : s) });
  }

  useEffect(() => {
    if (!audioUrl || !waveRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ws: any = null;
    (async () => {
      const WaveSurfer = (await import("wavesurfer.js")).default;
      if (!waveRef.current) return;
      ws = WaveSurfer.create({
        container:     waveRef.current,
        waveColor:     "#3b82f6",
        progressColor: "#1e3a5f",
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

  async function handleGenerate(): Promise<boolean> {
    if (!scriptText.trim()) {
      setError("Vul eerst de voice-over-tekst in.");
      return false;
    }
    setError("");
    setGenerating(true);
    setAudioUrl("");
    setAudioDuration(null);
    try {
      const res = await fetch("/api/generate-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, voice, stability, speed, script: scriptText }),
      });
      const data = await res.json();
      if (!res.ok || !data.audioUrl) {
        setError(data.error ?? "Voice generatie mislukt");
        return false;
      }
      setAudioUrl(data.audioUrl);
      rememberVoiced(scriptText);
      onUpdate({ voice_audio_url: data.audioUrl, selected_voice: data.voice, status: "VoiceReady" });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return false;
    } finally {
      setGenerating(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setError("Upload een MP3 of WAV bestand.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessie verlopen");
      const ext = file.name.split(".").pop();
      const fileName = `${user.id}/${project.id}/voice.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("audio")
        .upload(fileName, file, { upsert: true, contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage.from("audio").getPublicUrl(fileName);
      const url = urlData.publicUrl;

      await fetch("/api/save-project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, voice_audio_url: url, status: "VoiceReady" }),
      });

      setAudioUrl(url);
      // Eigen opname: we kunnen niet weten wat erin gezegd wordt, dus geen waarschuwing.
      rememberVoiced(scriptText);
      onUpdate({ voice_audio_url: url, status: "VoiceReady" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload mislukt");
    } finally {
      setUploading(false);
    }
  }

  async function handleAlign(): Promise<boolean> {
    setAlignResult(null);
    setAligning(true);
    try {
      const res = await fetch("/api/align-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, clientScenes: scenes.length > 0 ? scenes : undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.scenes) {
        setAlignResult({ ok: false, message: data.error ?? "Sync mislukt" });
        return false;
      }
      onUpdate({ scenes: data.scenes });

      // Opsommingsscènes opnieuw renderen met de zojuist berekende per-bullet
      // timings, zodat elke bullet exact invliegt wanneer de stem 'm noemt.
      const bulletScenes = (data.scenes as Scene[]).filter(s => s.designed?.kind === "bullets");
      if (bulletScenes.length > 0) {
        setAlignResult({ ok: true, message: "Opsommingen synchroniseren met de stem…" });
        let latest = data.scenes as Scene[];
        for (const bs of bulletScenes) {
          try {
            const r = await fetch("/api/studio/render-designed-scene", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectId: project.id, sceneId: bs.id, clientScenes: latest }),
            });
            const d = await r.json();
            if (r.ok && Array.isArray(d.scenes)) {
              latest = d.scenes as Scene[];
              onUpdate({ scenes: latest });
            }
          } catch { /* best-effort; sync van overige scènes gaat door */ }
        }
      }

      setAlignResult({
        ok:      true,
        message: data.fallbackUsed
          ? "Synchroon op tekstlengte (Whisper miste woorden)"
          : `Scenes gesynchroniseerd op stem (${data.wordsMatched} woorden)${bulletScenes.length ? `, opsommingen synced` : ""}`,
      });
      return true;
    } catch (err: unknown) {
      setAlignResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
      return false;
    } finally {
      setAligning(false);
    }
  }

  // Tekst aangepast na het genereren: eerst de stem vernieuwen en de scènes erop
  // laten aansluiten, dan pas door — anders zegt de stem in de editor nog de oude tekst.
  async function refreshAndContinue() {
    if (!(await handleGenerate())) return;
    await handleAlign();
    onNext();
  }

  const fmtDur = (n: number) => Math.round(n * 10) / 10;
  const durationDiff = audioDuration !== null ? fmtDur(audioDuration - totalVideoDuration) : null;

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold text-white">Voice-over</h2>
        <p className="text-slate-500 text-sm mt-0.5">
          Genereer direct met ElevenLabs via fal.ai. Geen apart abonnement nodig.
        </p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
        {scenes.length > 0 ? (
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">Voice-over per scène ({project.language})</label>
            <div className="space-y-2">
              {scenes.map((s, i) => (
                <div key={s.id} className="flex items-start gap-2">
                  <span className="text-[11px] font-bold text-cyan-400 mt-2 w-14 shrink-0">Scène {i + 1}</span>
                  <textarea
                    value={s.voiceover_text ?? ""}
                    onChange={e => setSceneText(s.id, e.target.value)}
                    disabled={generating || aligning}
                    placeholder="Tekst die bij deze scène wordt uitgesproken…"
                    rows={2}
                    className="flex-1 bg-slate-950/60 border border-white/10 rounded-md px-3 py-2 text-sm text-white leading-relaxed disabled:opacity-60"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">Volledig script ({project.language})</label>
            <textarea
              value={freeText}
              onChange={e => setFreeText(e.target.value)}
              disabled={generating}
              placeholder="Typ hier de voice-over-tekst voor je video…"
              rows={4}
              className="w-full bg-slate-950/60 border border-white/10 rounded-md px-3 py-2 text-sm text-white font-mono leading-relaxed disabled:opacity-60"
            />
          </div>
        )}

        {textChanged && !generating && (
          <div className="bg-amber-950/40 border border-amber-700/40 text-amber-200 text-xs rounded-lg px-3 py-2">
            Je hebt de tekst aangepast. De stem zegt nog de oude tekst — maak de voice-over opnieuw zodat hij klopt.
          </div>
        )}

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
              className="w-full accent-blue-500"
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
              className="w-full accent-blue-500"
            />
          </div>
        </div>

        <button
          onClick={() => { handleGenerate(); }}
          disabled={generating || aligning || !scriptText.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white font-medium py-2.5 rounded-lg"
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
              <p className="text-lg font-bold text-white">{fmtDur(totalVideoDuration)}s</p>
            </div>
            <div className="bg-slate-950/60 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-500 mb-0.5">Audio duur</p>
              <p className="text-lg font-bold text-white">{audioDuration !== null ? fmtDur(audioDuration) : "..."}s</p>
            </div>
          </div>

          {durationDiff !== null && (
            <div className={`text-xs px-3 py-2 rounded-lg ${
              Math.abs(durationDiff) <= 3
                ? "bg-emerald-950/40 text-emerald-300 border border-emerald-700/30"
                : "bg-amber-950/40 text-amber-200 border border-amber-700/30"
            }`}>
              {Math.abs(durationDiff) <= 1
                ? "Audio en video sluiten goed aan."
                : durationDiff > 0
                ? `Audio is ${fmtDur(durationDiff)}s langer dan de video. Klik 'Auto-sync' om scenes aan te passen.`
                : `Audio is ${fmtDur(Math.abs(durationDiff))}s korter. Klik 'Auto-sync' om scenes aan te passen.`}
            </div>
          )}

          <div className="bg-slate-950/60 border border-cyan-500/20 rounded-lg p-3 space-y-2">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-white">🎯 Auto-sync video met stem</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Whisper transcribeert de audio en matcht woord voor woord met de
                  voice-over tekst van elke scene. De scene-duraties worden zo gezet
                  dat ze samen exact gelijk zijn aan de audio-duur — geen gaps, geen overhang.
                </p>
              </div>
              <button
                onClick={handleAlign}
                disabled={aligning || !audioUrl}
                className="text-xs bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-medium px-3 py-2 rounded-md whitespace-nowrap"
              >
                {aligning ? "Sync..." : "Auto-sync"}
              </button>
            </div>
            {alignResult && (
              <p className={`text-xs ${alignResult.ok ? "text-emerald-300" : "text-red-300"}`}>
                {alignResult.message}
              </p>
            )}
          </div>

          <div ref={waveRef} className="rounded-md bg-slate-950/60 border border-white/10 p-2" />
          <audio src={audioUrl} controls className="w-full mt-2" />
        </div>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowUpload(s => !s)}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          {showUpload ? "Verberg upload optie" : "Of upload eigen MP3"}
        </button>
        {showUpload && (
          <div className="mt-3 bg-white/5 border border-white/10 rounded-xl p-4">
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-white/10 rounded-lg cursor-pointer hover:border-blue-500/40 hover:bg-blue-500/5">
              <input
                type="file"
                accept="audio/mpeg,audio/wav,audio/mp3,.mp3,.wav"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
              />
              {uploading ? (
                <div className="flex items-center gap-2 text-blue-400">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Uploaden...</span>
                </div>
              ) : (
                <div className="text-center text-slate-400">
                  <p className="text-2xl mb-0.5">🎵</p>
                  <p className="text-xs">Klik om je eigen MP3 of WAV te uploaden</p>
                </div>
              )}
            </label>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-6">
        <button onClick={onBack} className="text-sm bg-white/10 hover:bg-white/15 text-white px-4 py-2 rounded-md">← Terug</button>
        <button
          onClick={textChanged ? refreshAndContinue : onNext}
          disabled={!audioUrl || generating || aligning}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white font-medium px-6 py-2.5 rounded-lg"
        >
          {generating || aligning
            ? "Voice-over vernieuwen…"
            : textChanged ? "Voice-over vernieuwen en naar editor →" : "Naar editor →"}
        </button>
      </div>
    </div>
  );
}
