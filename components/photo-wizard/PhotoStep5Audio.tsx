"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Project } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onNext: () => void;
  onBack: () => void;
}

type AudioType = "voiceover" | "music";

export default function PhotoStep5Audio({ project, onUpdate, onNext, onBack }: Props) {
  const [activeTab, setActiveTab]       = useState<AudioType>("voiceover");
  const [voiceUrl, setVoiceUrl]         = useState(project.voice_audio_url ?? "");
  const [musicUrl, setMusicUrl]         = useState(project.bg_music_url ?? "");
  const [uploading, setUploading]       = useState(false);
  const [error, setError]               = useState("");

  async function handleUpload(file: File, type: AudioType) {
    if (!file.type.startsWith("audio/")) {
      setError("Upload een MP3 of WAV bestand.");
      return;
    }
    setError("");
    setUploading(true);

    try {
      const supabase = createClient();
      const ext      = file.name.split(".").pop();
      const key      = type === "voiceover" ? "voice" : "music";
      const fileName = `${project.user_id}/${project.id}/${key}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("audio")
        .upload(fileName, file, { upsert: true, contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage.from("audio").getPublicUrl(fileName);
      const url = urlData.publicUrl;

      if (type === "voiceover") {
        setVoiceUrl(url);
        onUpdate({ voice_audio_url: url });
      } else {
        setMusicUrl(url);
        onUpdate({ bg_music_url: url });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload mislukt");
    } finally {
      setUploading(false);
    }
  }

  async function handleContinue() {
    const supabase = createClient();
    await supabase
      .from("projects")
      .update({
        voice_audio_url: voiceUrl || null,
        bg_music_url:    musicUrl || null,
        status:          "VoiceReady",
      })
      .eq("id", project.id);
    onUpdate({ voice_audio_url: voiceUrl || null, bg_music_url: musicUrl || null, status: "VoiceReady" });
    onNext();
  }

  const hasAudio = voiceUrl || musicUrl;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Audio toevoegen</h2>
        <p className="text-sm text-slate-500">
          Voeg optioneel een voice-over of achtergrondmuziek toe. Je kunt ook overslaan.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border border-white/10 overflow-hidden">
        {(["voiceover", "music"] as AudioType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-blue-500/20 text-blue-300 border-b-2 border-blue-500"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            {tab === "voiceover" ? "🎙 Voice-over" : "🎵 Achtergrondmuziek"}
          </button>
        ))}
      </div>

      {/* Voice-over tab */}
      {activeTab === "voiceover" && (
        <div className="card space-y-4">
          <p className="text-sm text-slate-400">
            Maak je voice-over via ElevenLabs of een andere tool en upload het MP3-bestand hier.
          </p>

          <UploadZone
            label={voiceUrl ? "Nieuwe voice-over uploaden" : "Voice-over uploaden (MP3 / WAV)"}
            uploading={uploading}
            onFile={(f) => handleUpload(f, "voiceover")}
          />

          {voiceUrl && (
            <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-3 flex items-center gap-2">
              <span className="text-green-400 text-sm">✓ Voice-over geüpload</span>
              <audio src={voiceUrl} controls className="ml-auto h-8" />
            </div>
          )}
        </div>
      )}

      {/* Muziek tab */}
      {activeTab === "music" && (
        <div className="card space-y-4">
          <p className="text-sm text-slate-400">
            Upload achtergrondmuziek die onder de video wordt afgespeeld.
          </p>

          <UploadZone
            label={musicUrl ? "Nieuwe muziek uploaden" : "Muziek uploaden (MP3 / WAV)"}
            uploading={uploading}
            onFile={(f) => handleUpload(f, "music")}
          />

          {musicUrl && (
            <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-3 flex items-center gap-2">
              <span className="text-green-400 text-sm">✓ Muziek geüpload</span>
              <audio src={musicUrl} controls className="ml-auto h-8" />
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button onClick={onBack} className="btn-secondary flex-1">← Terug</button>
        <button
          onClick={handleContinue}
          disabled={uploading}
          className={`flex-1 ${hasAudio ? "btn-primary" : "btn-secondary"}`}
        >
          {hasAudio ? "Verder naar editor →" : "Overslaan →"}
        </button>
      </div>
    </div>
  );
}

function UploadZone({ label, uploading, onFile }: {
  label: string;
  uploading: boolean;
  onFile: (f: File) => void;
}) {
  return (
    <label className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors
      ${uploading ? "border-blue-500/40 bg-blue-500/5" : "border-white/10 hover:border-blue-500/40 hover:bg-blue-500/5"}`}
    >
      <input
        type="file"
        accept="audio/mpeg,audio/wav,audio/mp3,.mp3,.wav"
        className="hidden"
        disabled={uploading}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      {uploading ? (
        <div className="flex items-center gap-2 text-blue-400">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Uploaden…</span>
        </div>
      ) : (
        <div className="text-center text-slate-500">
          <p className="text-2xl mb-1">🎵</p>
          <p className="text-sm">{label}</p>
        </div>
      )}
    </label>
  );
}
