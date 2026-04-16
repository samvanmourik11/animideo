"use client";

import { useState, useRef, Dispatch, SetStateAction } from "react";
import Image from "next/image";
import { Project } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

export interface PhotoScene {
  id: string;
  number: number;
  sourceImageUrl: string;   // Supabase storage URL
  previewUrl: string;       // local object URL for preview
  transformPrompt: string;
  voiceoverText: string;
  motionPrompt: string;
  analyzing: boolean;
  error: string;
}

interface Props {
  project: Project;
  photoScenes: PhotoScene[];
  onScenesChange: Dispatch<SetStateAction<PhotoScene[]>>;
  onNext: () => void;
  onBack: () => void;
}

export default function PhotoStep2Upload({ project, photoScenes, onScenesChange, onNext, onBack }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canContinue = photoScenes.length > 0 && photoScenes.every((s) => !s.analyzing && !s.error);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";

    setUploading(true);

    for (const file of Array.from(files)) {
      const sceneNumber = photoScenes.length + 1;
      const sceneId     = crypto.randomUUID();
      const previewUrl  = URL.createObjectURL(file);

      // Optimistic add
      const newScene: PhotoScene = {
        id: sceneId,
        number: sceneNumber,
        sourceImageUrl: "",
        previewUrl,
        transformPrompt: "",
        voiceoverText: "",
        motionPrompt: "",
        analyzing: true,
        error: "",
      };
      onScenesChange([...photoScenes, newScene]);

      try {
        // 1. Upload naar Supabase storage
        const arrayBuf   = await file.arrayBuffer();
        const fileName   = `${project.user_id}/${project.id}/${sceneId}-source.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from("scene-assets")
          .upload(fileName, arrayBuf, { contentType: file.type, upsert: true });

        if (uploadErr) throw new Error(uploadErr.message);

        const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(fileName);
        const sourceImageUrl = urlData.publicUrl;

        // 2. Analyse via GPT-4 Vision
        const base64 = await fileToBase64(file);
        const res = await fetch("/api/analyze-photo", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType:    file.type,
            style:       project.visual_style,
            sceneNumber,
            totalScenes: photoScenes.length + 1,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Analyse mislukt");

        onScenesChange((prev: PhotoScene[]) =>
          prev.map((s) =>
            s.id === sceneId
              ? {
                  ...s,
                  sourceImageUrl,
                  transformPrompt: data.transformPrompt,
                  voiceoverText:   data.voiceoverText,
                  motionPrompt:    data.motionPrompt,
                  analyzing:       false,
                }
              : s
          )
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        onScenesChange((prev: PhotoScene[]) =>
          prev.map((s) => (s.id === sceneId ? { ...s, analyzing: false, error: msg } : s))
        );
      }
    }
    setUploading(false);
  }

  function updateScene(id: string, field: keyof PhotoScene, value: string) {
    onScenesChange(photoScenes.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  }

  function removeScene(id: string) {
    const updated = photoScenes
      .filter((s) => s.id !== id)
      .map((s, i) => ({ ...s, number: i + 1 }));
    onScenesChange(updated);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Foto's uploaden</h2>
        <p className="text-sm text-slate-500">
          Upload foto's — elke foto wordt één scene. AI analyseert de foto en stelt prompts voor.
        </p>
      </div>

      {/* Geüploade scenes */}
      {photoScenes.map((scene) => (
        <div key={scene.id} className="card space-y-4">
          <div className="flex items-start gap-4">
            {/* Thumbnail */}
            <div className="relative w-28 h-20 rounded-xl overflow-hidden shrink-0 bg-white/5">
              <Image src={scene.previewUrl} alt={`Scene ${scene.number}`} fill className="object-cover" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Scene {scene.number}</p>
                <button
                  onClick={() => removeScene(scene.id)}
                  className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                >
                  Verwijderen
                </button>
              </div>

              {scene.analyzing && (
                <p className="text-xs text-blue-400 mt-1 animate-pulse">AI analyseert foto…</p>
              )}
              {scene.error && (
                <p className="text-xs text-red-400 mt-1">{scene.error}</p>
              )}
            </div>
          </div>

          {!scene.analyzing && !scene.error && (
            <div className="space-y-3">
              {/* Transformatie prompt */}
              <div>
                <label className="label text-xs">Transformatie prompt</label>
                <textarea
                  rows={2}
                  className="input text-sm resize-none"
                  value={scene.transformPrompt}
                  onChange={(e) => updateScene(scene.id, "transformPrompt", e.target.value)}
                />
              </div>
              {/* Voice-over tekst */}
              <div>
                <label className="label text-xs">Voice-over tekst</label>
                <textarea
                  rows={2}
                  className="input text-sm resize-none"
                  value={scene.voiceoverText}
                  onChange={(e) => updateScene(scene.id, "voiceoverText", e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Upload dropzone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        className="border-2 border-dashed border-white/10 hover:border-blue-500/40 rounded-2xl p-10 text-center cursor-pointer transition-colors"
      >
        <p className="text-2xl mb-2">📷</p>
        <p className="text-sm font-medium text-slate-300">
          {uploading ? "Uploaden en analyseren…" : "Klik of sleep foto's hierheen"}
        </p>
        <p className="text-xs text-slate-500 mt-1">JPG, PNG — meerdere tegelijk mogelijk</p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="flex gap-3">
        <button onClick={onBack} className="btn-secondary flex-1">← Terug</button>
        <button
          onClick={onNext}
          disabled={!canContinue}
          className="btn-primary flex-1"
        >
          Verder naar transformeren →
        </button>
      </div>
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
