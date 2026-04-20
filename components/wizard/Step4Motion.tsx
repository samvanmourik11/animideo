"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Project, Scene, VideoModel } from "@/lib/types";
import InsufficientCreditsModal from "@/components/InsufficientCreditsModal";
import { createClient } from "@/lib/supabase/client";

const VIDEO_MODELS: { value: VideoModel; label: string; badge: string; badgeColor: string; description: string }[] = [
  {
    value:       "seedance-lite",
    label:       "Seedance Lite",
    badge:       "Goedkoop",
    badgeColor:  "bg-cyan-500/15 text-cyan-400",
    description: "ByteDance, snel en betaalbaar — ~30s",
  },
  {
    value:       "kling-standard",
    label:       "Kling 1.6 Standard",
    badge:       "Snel & goed",
    badgeColor:  "bg-emerald-500/15 text-emerald-400",
    description: "Goede kwaliteit, sneller klaar — ~25s",
  },
  {
    value:       "seedance-pro",
    label:       "Seedance Pro",
    badge:       "Sterk",
    badgeColor:  "bg-indigo-500/15 text-indigo-400",
    description: "ByteDance, sterk in mensen en beweging — ~60s",
  },
  {
    value:       "kling-pro",
    label:       "Kling 1.6 Pro",
    badge:       "Beste kwaliteit",
    badgeColor:  "bg-purple-500/15 text-purple-400",
    description: "Vloeiendste beweging, meeste detail — ~2min",
  },
];

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onNext: () => void;
  onBack: () => void;
  plan?: string;
}

export default function Step4Motion({ project, onUpdate, onNext, onBack, plan = "free" }: Props) {
  const router = useRouter();
  const [scenes, setScenes] = useState<Scene[]>(project.scenes ?? []);
  const [currentIndex, setCurrentIndex] = useState(() => {
    const firstPending = (project.scenes ?? []).findIndex((s) => !s.video_url);
    return firstPending === -1 ? 0 : firstPending;
  });
  const [videoModel, setVideoModel] = useState<VideoModel>("kling-pro");
  const [generating, setGenerating] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [cacheBust, setCacheBust] = useState<Record<string, number>>({});
  const [creditModal, setCreditModal] = useState<{ credits: number; required: number } | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scene = scenes[currentIndex];
  const totalScenes = scenes.length;
  const doneCount = scenes.filter((s) => s.video_url).length;
  const allDone = doneCount === totalScenes;

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  async function generateMotion(motionPrompt: string) {
    const imageUrl = scene.image_url;
    if (!imageUrl) {
      setError("This scene has no accepted image yet. Go back to Step 3 — Images and accept one first.");
      return;
    }
    setGenerating(true);
    setError("");
    setStatusMsg("Indienen bij Kling…");

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const res = await fetch("/api/generate-motion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          imageUrl,
          motionPrompt,
          format:     project.format,
          videoModel,
        }),
      });
      const data = await res.json();
      if (res.status === 402) {
        setCreditModal({ credits: data.credits, required: data.required });
        setGenerating(false);
        setStatusMsg("");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Video beweging aanmaken mislukt");

      const { taskId, videoModel: usedModel } = data;
      setStatusMsg("Video genereren, even geduld…");

      // Poll for status
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(
            `/api/runway-status?taskId=${taskId}&projectId=${project.id}&sceneId=${scene.id}&videoModel=${usedModel ?? videoModel}`
          );
          const statusData = await statusRes.json();

          if (statusData.status === "SUCCEEDED") {
            clearInterval(pollIntervalRef.current!);
            pollIntervalRef.current = null;
            setStatusMsg("");
            let persistedScenes: Scene[] = [];
            setScenes(prev => {
              persistedScenes = prev.map((s, i) =>
                i === currentIndex
                  ? { ...s, video_url: statusData.videoUrl, motion_prompt: motionPrompt }
                  : s
              );
              return persistedScenes;
            });
            setCacheBust(prev => ({ ...prev, [scene.id]: Date.now() }));
            // Persisteer direct zodat video_url niet verloren gaat bij refresh
            onUpdate({ scenes: persistedScenes });
            fetch("/api/save-project", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectId: project.id, scenes: persistedScenes }),
            }).catch(() => {});
            router.refresh(); // update credits in navbar
            setEditingPrompt(false);
            setGenerating(false);
          } else if (statusData.status === "FAILED") {
            clearInterval(pollIntervalRef.current!);
            pollIntervalRef.current = null;
            throw new Error(statusData.error ?? "Kling generatie mislukt");
          }
          // PENDING or RUNNING — keep polling
        } catch (pollErr: unknown) {
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          setError(pollErr instanceof Error ? pollErr.message : "Polling error");
          setGenerating(false);
          setStatusMsg("");
        }
      }, 6000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setGenerating(false);
      setStatusMsg("");
    }
  }

  async function deleteVideo() {
    const updatedScenes = scenes.map((s, i) =>
      i === currentIndex ? { ...s, video_url: null } : s
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
    await fetch("/api/save-project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, scenes: updatedScenes }),
    });
    onUpdate({ scenes: updatedScenes });
    if (currentIndex < totalScenes - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }

  async function handleContinue() {
    await fetch("/api/save-project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, scenes, status: "MotionReady" }),
    });
    onUpdate({ scenes, status: "MotionReady" });
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
        <h2 className="text-2xl font-bold text-white">Motion Review</h2>
        <p className="text-slate-500 text-sm mt-1">
          Genereer een 5-seconden videoclip per scene.
        </p>
      </div>

      {/* Video model selector */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Video model</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {VIDEO_MODELS.map((m) => (
            <button
              key={m.value}
              onClick={() => !generating && setVideoModel(m.value)}
              disabled={generating}
              className={`text-left p-3 rounded-xl border transition-all ${
                videoModel === m.value
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
            style={{ width: `${(doneCount / totalScenes) * 100}%` }}
          />
        </div>
      </div>

      {/* Scene navigation pills */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {scenes.map((s, i) => (
          <button
            key={s.id}
            onClick={() => !generating && setCurrentIndex(i)}
            disabled={generating}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all
              ${i === currentIndex
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                : s.video_url
                ? "bg-green-500/15 text-green-400 border border-green-500/20"
                : "bg-white/5 text-slate-500 border border-white/10 hover:bg-white/10"
              }`}
          >
            #{s.number} {s.video_url ? "✓" : ""}
          </button>
        ))}
      </div>

      <div className="card space-y-4">
        {/* Motion prompt */}
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Motion instructie</span>
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
                  onClick={() => generateMotion(promptDraft)}
                  disabled={generating}
                >
                  {generating ? "Generating…" : "Regenerate with New Prompt"}
                </button>
                <button className="btn-secondary text-sm" onClick={() => setEditingPrompt(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-slate-300 leading-relaxed">{scene.motion_prompt}</p>
          )}
        </div>

        {/* Source image */}
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Bronafbeelding (uit Stap 3)
          </span>
          {scene.image_url ? (
            <div className="mt-2 rounded-xl overflow-hidden bg-[#060d1f] border border-white/10 aspect-video w-full relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={scene.image_url}
                alt={`Scene ${scene.number} bron`}
                crossOrigin="anonymous"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="mt-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-sm text-amber-400">
              Geen afbeelding gevonden. Ga terug naar <strong>Stap 3 — Afbeeldingen</strong> en accepteer er eerst één.
            </div>
          )}
        </div>

        {/* Video area */}
        <div className="rounded-xl overflow-hidden bg-[#060d1f] border border-white/10 aspect-video flex items-center justify-center relative">
          {scene.video_url ? (
            <div className="relative w-full h-full">
              <video
                key={`${scene.video_url}-${cacheBust[scene.id] ?? 0}`}
                src={cacheBust[scene.id] ? `${scene.video_url}?cb=${cacheBust[scene.id]}` : scene.video_url}
                controls
                loop
                controlsList="nodownload"
                className="w-full h-full object-contain"
              />
              {/* Watermark overlay for free plan */}
              {plan === "free" && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-white/40 text-sm font-semibold bg-black/30 px-3 py-1 rounded backdrop-blur-sm">
                    animideo.ai
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-slate-500">
              {generating ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-slate-300">{statusMsg}</p>
                </div>
              ) : (
                <p className="text-sm">Nog geen videoclip</p>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={() => generateMotion(scene.motion_prompt)}
              className="mt-2 btn-primary text-sm"
            >
              Opnieuw proberen
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2">
          {!scene.video_url && !generating && !editingPrompt && (
            <button onClick={() => generateMotion(scene.motion_prompt)} className="btn-primary">
              Generate Video Clip
            </button>
          )}
          {scene.video_url && !editingPrompt && (
            <>
              <button
                onClick={() => generateMotion(scene.motion_prompt)}
                disabled={generating}
                className="btn-secondary text-sm"
              >
                {generating ? "Generating…" : "Regenerate"}
              </button>
              <button
                onClick={deleteVideo}
                disabled={generating}
                className="text-sm px-3 py-1.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1"
                title="Videoclip verwijderen"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
              <button
                onClick={() => {
                  setPromptDraft(scene.motion_prompt);
                  setEditingPrompt(true);
                }}
                disabled={generating}
                className="btn-secondary text-sm"
              >
                Edit Motion Prompt + Regenerate
              </button>
              <button
                onClick={acceptScene}
                disabled={generating}
                className="btn-primary text-sm"
              >
                {currentIndex < totalScenes - 1 ? "Accept → Next Scene" : "Accept"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-6">
        <button onClick={onBack} className="btn-secondary">← Back</button>
        {allDone && (
          <button onClick={handleContinue} className="btn-primary px-8 py-3">
            Continue to Voice-over →
          </button>
        )}
      </div>
    </div>
    </>
  );
}
