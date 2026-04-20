"use client";

import { Dispatch, SetStateAction, useState } from "react";
import Image from "next/image";
import { Project, Scene, ImageModel } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import InsufficientCreditsModal from "@/components/InsufficientCreditsModal";
import { PhotoScene } from "./PhotoStep2Upload";

const IMAGE_MODELS: { value: ImageModel; label: string; badge: string; badgeColor: string; description: string }[] = [
  { value: "flux-schnell", label: "Flux Schnell", badge: "Snel",       badgeColor: "bg-emerald-500/15 text-emerald-400", description: "Snel & goedkoop" },
  { value: "flux-pro",     label: "Flux Pro",     badge: "Kwaliteit",  badgeColor: "bg-purple-500/15 text-purple-400",   description: "Maximale kwaliteit" },
  { value: "seedream",     label: "Seedream",     badge: "Compositie", badgeColor: "bg-cyan-500/15 text-cyan-400",       description: "Bewaart compositie, tekst-render" },
  { value: "controlnet",   label: "ControlNet",   badge: "Edges",      badgeColor: "bg-orange-500/15 text-orange-400",   description: "Bewaart compositie via edges" },
  { value: "recraft",      label: "Recraft v3",   badge: "Top",        badgeColor: "bg-pink-500/15 text-pink-400",       description: "Midjourney-niveau" },
  { value: "dall-e-3",     label: "DALL·E 3",     badge: "Tekst",      badgeColor: "bg-blue-500/15 text-blue-400",       description: "Puur op prompt" },
];

interface Props {
  project: Project;
  photoScenes: PhotoScene[];
  onScenesChange: Dispatch<SetStateAction<PhotoScene[]>>;
  onNext: (scenes: Scene[]) => void;
  onBack: () => void;
}

export default function PhotoStep3Transform({ project, photoScenes, onScenesChange, onNext, onBack }: Props) {
  const [creditModal, setCreditModal] = useState<{ credits: number; required: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [cacheBust, setCacheBust] = useState<Record<string, number>>({});
  const [imageModel, setImageModel] = useState<ImageModel>((project.image_model as ImageModel) ?? "flux-schnell");

  async function saveImageModel(model: ImageModel) {
    setImageModel(model);
    await fetch("/api/save-project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, image_model: model }),
    }).catch(() => {});
  }

  const allDone = photoScenes.length > 0 && photoScenes.every((s) => s.transformedImageUrl);

  async function transformScene(scene: PhotoScene, customPrompt?: string) {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";

    const prompt = customPrompt ?? scene.transformPrompt;

    // Sla aangepaste prompt op in state
    if (customPrompt && customPrompt !== scene.transformPrompt) {
      onScenesChange((prev) =>
        prev.map((s) => s.id === scene.id ? { ...s, transformPrompt: customPrompt } : s)
      );
    }

    // Markeer als bezig
    onScenesChange((prev) =>
      prev.map((s) => s.id === scene.id ? { ...s, transforming: true, transformError: "" } : s)
    );

    try {
      const res = await fetch("/api/transform-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          sourceImageUrl:  scene.sourceImageUrl,
          transformPrompt: prompt,
          style:           project.visual_style,
          projectId:       project.id,
          sceneId:         scene.id,
          format:          project.format,
          imageModel,
        }),
      });

      const data = await res.json();

      if (res.status === 402) {
        setCreditModal({ credits: data.credits, required: data.required });
        onScenesChange((prev) =>
          prev.map((s) => s.id === scene.id ? { ...s, transforming: false } : s)
        );
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Transformatie mislukt");

      onScenesChange((prev) =>
        prev.map((s) =>
          s.id === scene.id
            ? { ...s, transformedImageUrl: data.imageUrl, transforming: false, transformError: "" }
            : s
        )
      );
      setCacheBust((prev) => ({ ...prev, [scene.id]: Date.now() }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onScenesChange((prev) =>
        prev.map((s) => s.id === scene.id ? { ...s, transforming: false, transformError: msg } : s)
      );
    }
  }

  async function transformAll() {
    for (const scene of photoScenes) {
      if (!scene.transformedImageUrl && !scene.transforming) {
        await transformScene(scene);
      }
    }
  }

  function startEditPrompt(scene: PhotoScene) {
    setPromptDraft(scene.transformPrompt);
    setEditingPromptId(scene.id);
  }

  function cancelEditPrompt() {
    setEditingPromptId(null);
    setPromptDraft("");
  }

  async function handleNext() {
    setSaving(true);

    const scenes: Scene[] = photoScenes.map((s, i) => ({
      id:               s.id,
      number:           i + 1,
      duration:         5,
      voiceover_text:   s.voiceoverText,
      image_prompt:     s.transformPrompt,
      motion_prompt:    s.motionPrompt,
      image_url:        s.transformedImageUrl ?? null,
      video_url:        null,
      canvas_json:      null,
      source_image_url: s.sourceImageUrl,
    }));

    await fetch("/api/save-project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, scenes, status: "ImagesReady" }),
    });

    setSaving(false);
    onNext(scenes);
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
            <h2 className="text-lg font-semibold text-white mb-1">Foto&apos;s transformeren</h2>
            <p className="text-sm text-slate-500">
              Elke foto wordt omgezet naar <span className="text-white">{project.visual_style}</span>-stijl.
            </p>
          </div>
          <button
            onClick={transformAll}
            disabled={photoScenes.some((s) => s.transforming)}
            className="btn-primary text-sm shrink-0"
          >
            Alles transformeren
          </button>
        </div>

        {/* Image model selector */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Transformatiemodel</p>
          <div className="grid grid-cols-3 gap-3">
            {IMAGE_MODELS.map((m) => (
              <button
                key={m.value}
                onClick={() => !photoScenes.some((s) => s.transforming) && saveImageModel(m.value)}
                disabled={photoScenes.some((s) => s.transforming)}
                className={`text-left p-3 rounded-xl border transition-all ${
                  imageModel === m.value
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-white">{m.label}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${m.badgeColor}`}>{m.badge}</span>
                </div>
                <p className="text-xs text-slate-500">{m.description}</p>
              </button>
            ))}
          </div>
        </div>

        {photoScenes.map((scene) => (
          <div key={scene.id} className="card space-y-3">
            <p className="text-sm font-semibold text-white">Scene {scene.number}</p>

            {/* Transform prompt */}
            <div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Transform prompt</span>
              {editingPromptId === scene.id ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    className="input resize-none text-sm"
                    rows={3}
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      className="btn-primary text-sm"
                      onClick={() => {
                        cancelEditPrompt();
                        transformScene(scene, promptDraft);
                      }}
                      disabled={scene.transforming}
                    >
                      {scene.transforming ? "Bezig…" : "Opslaan + Transformeren"}
                    </button>
                    <button className="btn-secondary text-sm" onClick={cancelEditPrompt}>
                      Annuleren
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex items-start justify-between gap-2">
                  <p className="text-sm text-slate-300 leading-relaxed">{scene.transformPrompt}</p>
                  <button
                    onClick={() => startEditPrompt(scene)}
                    disabled={scene.transforming}
                    className="shrink-0 text-xs text-slate-500 hover:text-slate-300 border border-white/10 hover:border-white/20 px-2 py-1 rounded-lg transition-colors"
                  >
                    Bewerken
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-4 items-start">
              {/* Origineel */}
              <div className="flex-1 space-y-1">
                <p className="text-xs text-slate-500">Origineel</p>
                <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-white/5">
                  <Image src={scene.previewUrl} alt="Origineel" fill className="object-cover" />
                </div>
              </div>

              <div className="flex items-center pt-8 text-slate-500 text-xl shrink-0">→</div>

              {/* Resultaat */}
              <div className="flex-1 space-y-1">
                <p className="text-xs text-slate-500">Getransformeerd</p>
                <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-white/5 flex items-center justify-center">
                  {scene.transformedImageUrl ? (
                    <Image
                      src={cacheBust[scene.id] ? `${scene.transformedImageUrl}?cb=${cacheBust[scene.id]}` : scene.transformedImageUrl}
                      alt="Getransformeerd"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : scene.transforming ? (
                    <p className="text-xs text-blue-400 animate-pulse">Transformeren…</p>
                  ) : (
                    <p className="text-xs text-slate-400">Nog niet getransformeerd</p>
                  )}
                </div>
                {scene.transformError && (
                  <p className="text-xs text-red-400">{scene.transformError}</p>
                )}
              </div>
            </div>

            {/* Transformeer / opnieuw knop */}
            <button
              onClick={() => transformScene(scene)}
              disabled={scene.transforming}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                scene.transformedImageUrl
                  ? "border-white/10 text-slate-400 hover:text-white hover:border-white/20"
                  : "border-blue-500/40 text-blue-400 hover:text-blue-300 hover:border-blue-500/60"
              }`}
            >
              {scene.transforming
                ? "Bezig…"
                : scene.transformedImageUrl
                ? "↺ Opnieuw genereren"
                : "Transformeer deze scene"}
            </button>
          </div>
        ))}

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
