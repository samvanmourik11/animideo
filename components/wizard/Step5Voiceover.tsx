"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Project } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function Step5Voiceover({ project, onUpdate, onNext, onBack }: Props) {
  const [audioUrl, setAudioUrl] = useState(project.voice_audio_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const waveContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wavesurferRef = useRef<any>(null);

  const scenes = project.scenes ?? [];
  const totalVideoDuration = scenes.reduce((acc, s) => acc + (s.duration || 0), 0);

  // Build the full concatenated voiceover script
  const fullScript = scenes
    .map((s) => `Scene ${s.number}:\n${s.voiceover_text}`)
    .join("\n\n");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fullScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = fullScript;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  useEffect(() => {
    if (!audioUrl || !waveContainerRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ws: any = null;
    (async () => {
      const WaveSurfer = (await import("wavesurfer.js")).default;
      if (!waveContainerRef.current) return;
      ws = WaveSurfer.create({
        container: waveContainerRef.current,
        waveColor: "#3b82f6",
        progressColor: "#1e3a5f",
        height: 80,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
      });
      ws.load(audioUrl);
      ws.on("ready", () => {
        setAudioDuration(Math.round(ws.getDuration()));
      });
      wavesurferRef.current = ws;
    })();

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ws as any)?.destroy();
    };
  }, [audioUrl]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setError("Please upload an MP3 or WAV file.");
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
      onUpdate({ voice_audio_url: url, status: "VoiceReady" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const durationDiff = audioDuration !== null ? audioDuration - totalVideoDuration : null;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-[#1e3a5f]">Voice-over</h2>
        <p className="text-slate-300 text-sm mt-1">
          Generate your voice-over using ElevenLabs (free), then upload the MP3 below.
        </p>
      </div>

      {/* ── Full script ───────────────────────────────────────── */}
      <div className="card space-y-3 mb-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1e3a5f]">Your Voice-over Script</h3>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${copied
                ? "bg-green-100 text-green-700"
                : "bg-[#1e3a5f] text-white hover:bg-[#2a4d7f]"
              }`}
          >
            {copied ? "✓ Copied!" : "Copy All Text"}
          </button>
        </div>
        <textarea
          readOnly
          value={fullScript}
          rows={Math.min(16, scenes.length * 3 + scenes.length)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-slate-500 bg-gray-50 resize-none font-mono leading-relaxed focus:outline-none"
        />
      </div>

      {/* ── ElevenLabs instructions ───────────────────────────── */}
      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-[#1e3a5f] mb-4">
          How to create your voice-over with ElevenLabs (free):
        </h3>
        <ol className="space-y-3">
          {[
            <>Go to <strong>elevenlabs.io</strong> and create a free account</>,
            <>Click <strong>Text to Speech</strong> in the left menu</>,
            <>Paste the copied text into the text box</>,
            <>Choose a voice you like and click <strong>Generate</strong></>,
            <>Click the download button to save the MP3</>,
            <>Upload your MP3 file below</>,
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3b82f6] text-white text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <span className="text-sm text-slate-500 leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* ── Upload + waveform ─────────────────────────────────── */}
      <div className="card space-y-6">
        {/* Duration comparison */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-xs text-slate-300 mb-1">Total Video Duration</p>
            <p className="text-2xl font-bold text-[#1e3a5f]">{totalVideoDuration}s</p>
          </div>
          <div className={`rounded-lg p-4 text-center ${audioDuration !== null ? "bg-blue-50" : "bg-gray-50"}`}>
            <p className="text-xs text-slate-300 mb-1">Audio Duration</p>
            <p className="text-2xl font-bold text-[#1e3a5f]">
              {audioDuration !== null ? `${audioDuration}s` : "—"}
            </p>
          </div>
        </div>

        {durationDiff !== null && (
          <div className={`rounded-lg p-3 text-sm ${
            Math.abs(durationDiff) <= 3
              ? "bg-green-50 text-green-700"
              : "bg-amber-50 text-amber-700"
          }`}>
            {Math.abs(durationDiff) <= 3
              ? "Audio and video lengths match well."
              : durationDiff > 0
              ? `Audio is ${durationDiff}s longer than the video — it will be trimmed on export.`
              : `Audio is ${Math.abs(durationDiff)}s shorter than the video — the end will be silent.`
            }
          </div>
        )}

        {/* Upload */}
        <div>
          <label className="label">Upload MP3 or WAV</label>
          <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors
            ${uploading ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:border-[#3b82f6] hover:bg-blue-50/30"}`}
          >
            <input
              type="file"
              accept="audio/mpeg,audio/wav,audio/mp3,.mp3,.wav"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
            {uploading ? (
              <div className="flex items-center gap-2 text-blue-600">
                <div className="w-5 h-5 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Uploading…</span>
              </div>
            ) : (
              <div className="text-center text-gray-400">
                <p className="text-3xl mb-1">🎵</p>
                <p className="text-sm font-medium">{audioUrl ? "Upload a new file" : "Click to upload your MP3"}</p>
                <p className="text-xs mt-1">MP3 or WAV</p>
              </div>
            )}
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Waveform */}
        {audioUrl && (
          <div>
            <label className="label">Waveform Preview</label>
            <div
              ref={waveContainerRef}
              className="rounded-lg bg-gray-50 border border-gray-100 overflow-hidden p-2"
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-6">
        <button onClick={onBack} className="btn-secondary">← Back</button>
        <button
          onClick={onNext}
          disabled={!audioUrl}
          className="btn-primary px-8 py-3"
        >
          Continue to Editor →
        </button>
      </div>
    </div>
  );
}
