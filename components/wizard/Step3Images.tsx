"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Project, Scene } from "@/lib/types";
import InsufficientCreditsModal from "@/components/InsufficientCreditsModal";
import { createClient } from "@/lib/supabase/client";

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
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [error, setError] = useState("");
  const [cacheBust, setCacheBust] = useState<Record<string, number>>({});
  const [creditModal, setCreditModal] = useState<{ credits: number; required: number } | null>(null);

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
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[#1e3a5f]">Image Review</h2>
        <p className="text-gray-500 text-sm mt-1">
          Review and approve images for each scene before moving to motion.
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
          <span>Scene {currentIndex + 1} of {totalScenes}</span>
          <span>{doneCount} of {totalScenes} approved</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-[#3b82f6] h-2 rounded-full transition-all"
            style={{ width: `${(doneCount / totalScenes) * 100}%` }}
          />
        </div>
      </div>

      {/* Scene navigation pills */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {scenes.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setCurrentIndex(i)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
              ${i === currentIndex
                ? "bg-[#1e3a5f] text-white"
                : s.image_url
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
          >
            #{s.number} {s.image_url ? "✓" : ""}
          </button>
        ))}
      </div>

      <div className="card space-y-4">
        <div>
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Image Prompt</span>
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
                  {generating ? "Generating…" : "Regenerate with New Prompt"}
                </button>
                <button
                  className="btn-secondary text-sm"
                  onClick={() => setEditingPrompt(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-700 leading-relaxed">{scene.image_prompt}</p>
          )}
        </div>

        {/* Image area */}
        <div className="rounded-xl overflow-hidden bg-gray-50 border border-gray-100 aspect-video flex items-center justify-center relative">
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
                    jouwanimatievideo.nl
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-gray-400">
              {generating ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm">Generating image with Flux Pro…</p>
                </div>
              ) : (
                <p className="text-sm">No image yet</p>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => generateImage(scene.image_prompt)}
              className="mt-2 btn-primary text-sm"
            >
              Try Again
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
              Generate Image
            </button>
          )}
          {scene.image_url && (
            <>
              <button
                onClick={() => generateImage(scene.image_prompt)}
                disabled={generating}
                className="btn-secondary text-sm"
              >
                {generating ? "Generating…" : "Regenerate"}
              </button>
              <button
                onClick={deleteImage}
                disabled={generating}
                className="text-sm px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors flex items-center gap-1"
                title="Delete image and start fresh"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
              <button
                onClick={() => {
                  setPromptDraft(scene.image_prompt);
                  setEditingPrompt(true);
                }}
                disabled={generating}
                className="btn-secondary text-sm"
              >
                Edit Prompt + Regenerate
              </button>
              {!editingPrompt && (
                <button
                  onClick={acceptScene}
                  disabled={generating}
                  className="btn-primary text-sm"
                >
                  {currentIndex < totalScenes - 1 ? "Accept → Next Scene" : "Accept"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-6">
        <button onClick={onBack} className="btn-secondary">← Back</button>
        {allDone && (
          <button onClick={handleContinue} className="btn-primary px-8 py-3">
            Continue to Motion →
          </button>
        )}
      </div>
    </div>
    </>
  );
}
