"use client";

import { useState } from "react";
import Image from "next/image";
import { Project } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import InsufficientCreditsModal from "@/components/InsufficientCreditsModal";
import { PhotoScene } from "./PhotoStep2Upload";

interface TransformResult {
  imageUrl: string | null;
  transforming: boolean;
  error: string;
}

interface Props {
  project: Project;
  photoScenes: PhotoScene[];
  onNext: () => void;
  onBack: () => void;
}

export default function PhotoStep3Transform({ project, photoScenes, onNext, onBack }: Props) {
  const [results, setResults] = useState<Record<string, TransformResult>>(() =>
    Object.fromEntries(photoScenes.map((s) => [s.id, { imageUrl: null, transforming: false, error: "" }]))
  );
  const [creditModal, setCreditModal] = useState<{ credits: number; required: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const allDone = photoScenes.every((s) => results[s.id]?.imageUrl);

  async function transformScene(scene: PhotoScene) {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";

    setResults((prev) => ({ ...prev, [scene.id]: { imageUrl: null, transforming: true, error: "" } }));

    try {
      const res = await fetch("/api/transform-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          sourceImageUrl: scene.sourceImageUrl,
          transformPrompt: scene.transformPrompt,
          style:   project.visual_style,
          projectId: project.id,
          sceneId:   scene.id,
          format:    project.format,
        }),
      });

      const data = await res.json();

      if (res.status === 402) {
        setCreditModal({ credits: data.credits, required: data.required });
        setResults((prev) => ({ ...prev, [scene.id]: { imageUrl: null, transforming: false, error: "" } }));
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Transformatie mislukt");

      setResults((prev) => ({ ...prev, [scene.id]: { imageUrl: data.imageUrl, transforming: false, error: "" } }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResults((prev) => ({ ...prev, [scene.id]: { imageUrl: null, transforming: false, error: msg } }));
    }
  }

  async function transformAll() {
    for (const scene of photoScenes) {
      if (!results[scene.id]?.imageUrl) {
        await transformScene(scene);
      }
    }
  }

  async function handleNext() {
    setSaving(true);
    const supabase = createClient();

    // Bouw Scene[] op en sla op in het project
    const scenes = photoScenes.map((s, i) => ({
      id:               s.id,
      number:           i + 1,
      duration:         5,
      voiceover_text:   s.voiceoverText,
      image_prompt:     s.transformPrompt,
      motion_prompt:    s.motionPrompt,
      image_url:        results[s.id]?.imageUrl ?? null,
      video_url:        null,
      canvas_json:      null,
      source_image_url: s.sourceImageUrl,
    }));

    await supabase
      .from("projects")
      .update({ scenes, status: "ImagesReady" })
      .eq("id", project.id);

    setSaving(false);
    onNext();
  }

  return (
    <>
      {creditModal && (
        <InsufficientCreditsModal
          credits={creditModal.credits}
          required={creditModal.required}
          onClose={() => setCreditModal(null)}
        />
      )}

      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Foto's transformeren</h2>
            <p className="text-sm text-slate-500">
              Elke foto wordt omgezet naar <span className="text-white">{project.visual_style}</span>-stijl.
            </p>
          </div>
          {!allDone && (
            <button onClick={transformAll} className="btn-primary text-sm shrink-0">
              Alles transformeren
            </button>
          )}
        </div>

        {photoScenes.map((scene) => {
          const r = results[scene.id];
          return (
            <div key={scene.id} className="card">
              <p className="text-sm font-semibold text-white mb-3">Scene {scene.number}</p>

              <div className="flex gap-4 items-start">
                {/* Origineel */}
                <div className="flex-1 space-y-1">
                  <p className="text-xs text-slate-500">Origineel</p>
                  <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-white/5">
                    <Image src={scene.previewUrl} alt="Origineel" fill className="object-cover" />
                  </div>
                </div>

                {/* Pijl */}
                <div className="flex items-center pt-8 text-slate-500 text-xl">→</div>

                {/* Resultaat */}
                <div className="flex-1 space-y-1">
                  <p className="text-xs text-slate-500">Getransformeerd</p>
                  <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-white/5 flex items-center justify-center">
                    {r?.imageUrl ? (
                      <Image src={r.imageUrl} alt="Getransformeerd" fill className="object-cover" />
                    ) : r?.transforming ? (
                      <p className="text-xs text-blue-400 animate-pulse">Transformeren…</p>
                    ) : (
                      <p className="text-xs text-slate-600">Nog niet getransformeerd</p>
                    )}
                  </div>
                  {r?.error && <p className="text-xs text-red-400">{r.error}</p>}
                </div>
              </div>

              {/* Transformeer / opnieuw knop */}
              {!r?.transforming && (
                <button
                  onClick={() => transformScene(scene)}
                  className="mt-3 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {r?.imageUrl ? "Opnieuw transformeren" : "Transformeer deze scene"}
                </button>
              )}
            </div>
          );
        })}

        <div className="flex gap-3">
          <button onClick={onBack} className="btn-secondary flex-1">← Terug</button>
          <button
            onClick={handleNext}
            disabled={!allDone || saving}
            className="btn-primary flex-1"
          >
            {saving ? "Opslaan…" : "Verder naar Motion →"}
          </button>
        </div>
      </div>
    </>
  );
}
