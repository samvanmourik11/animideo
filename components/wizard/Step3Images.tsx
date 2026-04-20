"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Project, Scene, ImageModel } from "@/lib/types";
import InsufficientCreditsModal from "@/components/InsufficientCreditsModal";
import InpaintModal from "@/components/InpaintModal";
import { createClient } from "@/lib/supabase/client";

const IMAGE_MODELS: { value: ImageModel; label: string; badge: string; badgeColor: string; description: string }[] = [
  { value: "flux-schnell", label: "Flux Schnell", badge: "Snel",      badgeColor: "bg-emerald-500/15 text-emerald-400", description: "Snel & goedkoop" },
  { value: "flux-pro",     label: "Flux Pro",     badge: "Kwaliteit", badgeColor: "bg-purple-500/15 text-purple-400",   description: "Maximale kwaliteit" },
  { value: "seedream",     label: "Seedream 4.0", badge: "Tekst",     badgeColor: "bg-cyan-500/15 text-cyan-400",       description: "Kan tekst renderen in beeld" },
  { value: "recraft",      label: "Recraft v3",   badge: "Top",       badgeColor: "bg-pink-500/15 text-pink-400",       description: "Midjourney-niveau" },
  { value: "dall-e-3",     label: "DALL·E 3",     badge: "OpenAI",    badgeColor: "bg-blue-500/15 text-blue-400",       description: "Sterke promptopvolging" },
];

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onNext: () => void;
  onBack: () => void;
  plan?: string;
}

export default function Step3Images({ project, onUpdate, onNext, onBack, plan = "free" }: Props) {
  const [scenes, setScenes] = useState<Scene[]>(project.scenes ?? []);
  const [currentIndex, setCurrentIndex] = useState(() => {
    const firstPending = (project.scenes ?? []).findIndex((s) => !s.image_url);
    return firstPending === -1 ? 0 : firstPending;
  });
  const [imageModel, setImageModel] = useState<ImageModel>((project.image_model as ImageModel) ?? "flux-schnell");
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [error, setError] = useState("");
  const [cacheBust, setCacheBust] = useState<Record<string, number>>({});
  const [creditModal, setCreditModal] = useState<{ credits: number; required: number } | null>(null);
  const [upscaling, setUpscaling] = useState(false);
  const [inpaintOpen, setInpaintOpen] = useState(false);

  async function saveImageModel(model: ImageModel) {
    setImageModel(model);
    onUpdate({ image_model: model });
    await fetch("/api/save-project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, image_model: model }),
    });
  }

  const scene = scenes[currentIndex];
  const totalScenes = scenes.length;
  const doneCount = scenes.filter((s) => s.image_url).length;
  const allDone = doneCount === totalScenes;

  async function generateImage(prompt: string) {
    setGenerating(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          projectId: project.id,
          sceneId: scene.id,
          imagePrompt: prompt,
          visualStyle: project.visual_style,
          brandKitId: project.brand_kit_id ?? null,
          imageModel,
          format: project.format,
        }),
      });
      let data: { imageUrl?: string; error?: string; credits?: number; required?: number } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server error (HTTP ${res.status}) — no details returned`);
      }
      if (res.status === 402) {
        setCreditModal({ credits: data.credits ?? 0, required: data.required ?? 1 });
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Afbeelding genereren mislukt");

      const updatedScenes = scenes.map((s, i) =>
        i === currentIndex ? { ...s, image_url: data.imageUrl ?? null, image_prompt: prompt } : s
      );
      setScenes(updatedScenes);
      setCacheBust(prev => ({ ...prev, [scene.id]: Date.now() }));
      setEditingPrompt(false);
      router.refresh(); // update credits in navbar
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  async function upscaleImage() {
    if (!scene.image_url) return;
    setUpscaling(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const res = await fetch("/api/upscale-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          sourceImageUrl: scene.image_url,
          projectId: project.id,
          sceneId: scene.id,
          scale: 2,
        }),
      });
      let data: { imageUrl?: string; error?: string; credits?: number; required?: number } = {};
      try { data = await res.json(); } catch { throw new Error(`Server error (HTTP ${res.status})`); }

      if (res.status === 402) {
        setCreditModal({ credits: data.credits ?? 0, required: data.required ?? 1 });
        return;
      }
      if (!res.ok || !data.imageUrl) throw new Error(data.error ?? "Upscalen mislukt");

      const updatedScenes = scenes.map((s, i) =>
        i === currentIndex ? { ...s, image_url: data.imageUrl ?? null } : s
      );
      setScenes(updatedScenes);
      setCacheBust(prev => ({ ...prev, [scene.id]: Date.now() }));
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upscalen mislukt");
    } finally {
      setUpscaling(false);
    }
  }

  function handleInpaintSuccess(newImageUrl: string) {
    const updatedScenes = scenes.map((s, i) =>
      i === currentIndex ? { ...s, image_url: newImageUrl } : s
    );
    setScenes(updatedScenes);
    setCacheBust(prev => ({ ...prev, [scene.id]: Date.now() }));
    setInpaintOpen(false);
    router.refresh();
  }

  async function deleteImage() {
    const updatedScenes = scenes.map((s, i) =>
      i === currentIndex ? { ...s, image_url: null } : s
    );
    setScenes(updatedScenes);
    setCacheBust(prev => { const next = { ...prev }; delete next[scene.id]; return next; });
    await fetch("/api/save-project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, scenes: updatedScenes }),
    });
    onUpdate({ scenes: updatedScenes });
  }

  async function acceptScene() {
    const updatedScenes = [...scenes];
    const updated = updatedScenes;

    // Autosave
    await fetch("/api/save-project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, scenes: updated }),
    });
    onUpdate({ scenes: updated });

    if (currentIndex < totalScenes - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }

  async function handleContinue() {
    const updatedScenes = scenes;
    await fetch("/api/save-project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, scenes: updatedScenes, status: "ImagesReady" }),
    });
    onUpdate({ scenes: updatedScenes, status: "ImagesReady" });
    onNext();
  }

  if (!scene) return null;

  return (
    <>
      {creditModal && (
        <InsufficientCreditsModal
          credits={creditModal.credits}
          required={creditModal.required}
          onClose={() => setCreditModal(null)}
        />
      )}
      {inpaintOpen && scene.image_url && (
        <InpaintModal
          sourceImageUrl={scene.image_url}
          projectId={project.id}
          sceneId={scene.id}
          onClose={() => setInpaintOpen(false)}
          onSuccess={handleInpaintSuccess}
          onInsufficientCredits={(credits, required) => {
            setInpaintOpen(false);
            setCreditModal({ credits, required });
          }}
        />
      )}
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Afbeeldingen</h2>
        <p className="text-slate-300 text-sm mt-1">
          Bekijk en keur de afbeeldingen per scene goed voordat je verder gaat naar motion.
        </p>
      </div>

      {/* Image model selector */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Beeldgeneratie model</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {IMAGE_MODELS.map((m) => (
            <button
              key={m.value}
              onClick={() => !generating && saveImageModel(m.value)}
              disabled={generating}
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

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-slate-400 mb-2">
          <span>Scene {currentIndex + 1} van {totalScenes}</span>
          <span>{doneCount} van {totalScenes} goedgekeurd</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-1.5">
          <div
            className="bg-blue-500 h-1.5 rounded-full transition-all shadow-[0_0_8px_rgba(59,130,246,0.6)]"
            style={{ width: `${(doneCount / Math.max(totalScenes, 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Scene navigation pills */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {scenes.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setCurrentIndex(i)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all
              ${i === currentIndex
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                : s.image_url
                ? "bg-green-500/15 text-green-400 border border-green-500/20"
                : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"
              }`}
          >
            #{s.number} {s.image_url ? "✓" : ""}
          </button>
        ))}
      </div>

      <div className="card space-y-4">
        <div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Afbeelding prompt</span>
          {editingPrompt ? (
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
                  onClick={() => generateImage(promptDraft)}
                  disabled={generating}
                >
                  {generating ? "Genereren…" : "Genereer met nieuwe prompt"}
                </button>
                <button
                  className="btn-secondary text-sm"
                  onClick={() => setEditingPrompt(false)}
                >
                  Annuleren
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-slate-300 leading-relaxed">{scene.image_prompt}</p>
          )}
        </div>

        {/* Image area */}
        <div className="rounded-xl overflow-hidden bg-[#060d1f] border border-white/10 aspect-video flex items-center justify-center relative">
          {scene.image_url ? (
            <>
              <Image
                src={cacheBust[scene.id] ? `${scene.image_url}?cb=${cacheBust[scene.id]}` : scene.image_url}
                alt={`Scene ${scene.number}`}
                fill
                className="object-cover"
                unoptimized
              />
              {plan === "free" && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-white/50 text-sm font-semibold bg-black/30 px-3 py-1 rounded backdrop-blur-sm">
                    animideo.ai
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-slate-500">
              {generating ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-slate-300">Afbeelding genereren…</p>
                </div>
              ) : (
                <p className="text-sm">Nog geen afbeelding</p>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={() => generateImage(scene.image_prompt)}
              className="mt-2 btn-primary text-sm"
            >
              Opnieuw proberen
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2">
          {!scene.image_url && !generating && (
            <button
              onClick={() => generateImage(scene.image_prompt)}
              className="btn-primary"
            >
              Genereer afbeelding
            </button>
          )}
          {scene.image_url && (
            <>
              <button
                onClick={() => generateImage(scene.image_prompt)}
                disabled={generating || upscaling}
                className="btn-secondary text-sm"
              >
                {generating ? "Genereren…" : "Opnieuw genereren"}
              </button>
              <button
                onClick={() => setInpaintOpen(true)}
                disabled={generating || upscaling}
                className="text-sm px-3 py-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-colors flex items-center gap-1"
                title="Deel van afbeelding bewerken (inpainting)"
              >
                <span>🎨</span> Bewerk deel
              </button>
              <button
                onClick={upscaleImage}
                disabled={generating || upscaling}
                className="text-sm px-3 py-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition-colors flex items-center gap-1 disabled:opacity-50"
                title="Verhoog resolutie 2×"
              >
                <span>⬆️</span> {upscaling ? "Upscalen…" : "Upscale 2×"}
              </button>
              <button
                onClick={deleteImage}
                disabled={generating || upscaling}
                className="text-sm px-3 py-1.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1"
                title="Afbeelding verwijderen"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Verwijderen
              </button>
              <button
                onClick={() => {
                  setPromptDraft(scene.image_prompt);
                  setEditingPrompt(true);
                }}
                disabled={generating || upscaling}
                className="btn-secondary text-sm"
              >
                Prompt aanpassen + opnieuw
              </button>
              {!editingPrompt && (
                <button
                  onClick={acceptScene}
                  disabled={generating || upscaling}
                  className="btn-primary text-sm"
                >
                  {currentIndex < totalScenes - 1 ? "Accepteren → Volgende scene" : "Accepteren"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-6">
        <button onClick={onBack} className="btn-secondary">← Terug</button>
        {allDone && (
          <button onClick={handleContinue} className="btn-primary px-8 py-3">
            Doorgaan naar Motion →
          </button>
        )}
      </div>
    </div>
    </>
  );
}
