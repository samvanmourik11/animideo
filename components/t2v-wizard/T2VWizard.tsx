"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Project } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import InsufficientCreditsModal from "@/components/InsufficientCreditsModal";

const VISUAL_STYLES: { value: string; label: string; tip?: string }[] = [
  { value: "Cinematic",      label: "Cinematic" },
  { value: "Realistic",      label: "Realistic" },
  { value: "3D Animatie",    label: "3D Animatie" },
  { value: "3D Pixar",       label: "3D Pixar" },
  { value: "2D Cartoon",     label: "2D Cartoon",     tip: "Minder betrouwbaar" },
  { value: "Motion Graphic", label: "Motion Graphic", tip: "Minder betrouwbaar" },
  { value: "Whiteboard",     label: "Whiteboard",     tip: "Minder betrouwbaar" },
];

const VIDEO_MODELS = [
  {
    value: "seedance-lite-t2v",
    label: "Seedance Lite",
    badge: "Goedkoop",
    badgeColor: "bg-cyan-500/15 text-cyan-400",
    description: "ByteDance, snel en betaalbaar",
  },
  {
    value: "kling-standard-t2v",
    label: "Kling Standard",
    badge: "Snel",
    badgeColor: "bg-emerald-500/15 text-emerald-400",
    description: "Goede kwaliteit — ~25s",
  },
  {
    value: "seedance-pro-t2v",
    label: "Seedance Pro",
    badge: "Sterk",
    badgeColor: "bg-indigo-500/15 text-indigo-400",
    description: "Sterk in mensen en beweging",
  },
  {
    value: "kling-pro-t2v",
    label: "Kling Pro",
    badge: "Beste kwaliteit",
    badgeColor: "bg-purple-500/15 text-purple-400",
    description: "Vloeiendste beweging — ~90s",
  },
];

interface Props {
  initialProject: Project;
  plan: string;
}

export default function T2VWizard({ initialProject, plan }: Props) {
  const router = useRouter();

  const [idea, setIdea]           = useState("");
  const [prompt, setPrompt]       = useState("");
  const [visualStyle, setVisualStyle] = useState("Cinematic");
  const [videoModel, setVideoModel] = useState("seedance-lite-t2v");
  const [format, setFormat]       = useState<"16:9" | "9:16">(initialProject.format ?? "16:9");
  const [videoUrl, setVideoUrl]   = useState<string | null>(null);

  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [generatingVideo, setGeneratingVideo]   = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError]         = useState("");
  const [creditModal, setCreditModal] = useState<{ credits: number; required: number } | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function handleGeneratePrompt() {
    if (!idea.trim()) return;
    setGeneratingPrompt(true);
    setError("");
    setPrompt("");
    setVideoUrl(null);

    try {
      const res = await fetch("/api/generate-t2v-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.trim(), format, visualStyle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Prompt genereren mislukt");
      setPrompt(data.prompt);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Er ging iets mis");
    } finally {
      setGeneratingPrompt(false);
    }
  }

  async function handleGenerateVideo() {
    if (!prompt.trim()) return;
    setGeneratingVideo(true);
    setError("");
    setVideoUrl(null);
    setStatusMsg(`Indienen bij ${VIDEO_MODELS.find((m) => m.value === videoModel)?.label ?? "video model"}…`);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const res = await fetch("/api/generate-t2v", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ videoPrompt: prompt, format, videoModel }),
      });

      const data = await res.json();
      if (res.status === 402) {
        setCreditModal({ credits: data.credits, required: data.required });
        setGeneratingVideo(false);
        setStatusMsg("");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Video genereren mislukt");

      const { taskId, videoModel: usedModel } = data;
      const sceneId = `t2v-${Date.now()}`;
      setStatusMsg("Video genereren, even geduld…");

      // Sla prompt op in project
      await fetch("/api/save-project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId:   initialProject.id,
          video_model: videoModel,
          format,
        }),
      });

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(
            `/api/runway-status?taskId=${taskId}&projectId=${initialProject.id}&sceneId=${sceneId}&videoModel=${usedModel ?? videoModel}`
          );
          const statusData = await statusRes.json();

          if (statusData.status === "SUCCEEDED") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setStatusMsg("");
            setVideoUrl(statusData.videoUrl);
            setGeneratingVideo(false);
            router.refresh();
          } else if (statusData.status === "FAILED") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            throw new Error(statusData.error ?? "Video genereren mislukt");
          }
        } catch (pollErr: unknown) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setError(pollErr instanceof Error ? pollErr.message : "Er ging iets mis");
          setGeneratingVideo(false);
          setStatusMsg("");
        }
      }, 6000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Er ging iets mis");
      setGeneratingVideo(false);
      setStatusMsg("");
    }
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

      <div className="max-w-xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">⚡</span>
            <h1 className="text-2xl font-bold text-white">Text to Video</h1>
          </div>
          <p className="text-slate-500 text-sm">
            Beschrijf je idee — de AI schrijft de videoprompt en Kling genereert direct een clip.
          </p>
        </div>

        <div className="space-y-5">

          {/* Stap 1 — Idee */}
          <div>
            <label className="label">Jouw idee</label>
            <textarea
              className="input resize-none text-sm"
              rows={3}
              placeholder="bijv. Een astronaut loopt over de maan terwijl de aarde opkomt aan de horizon, gouden licht…"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              disabled={generatingPrompt || generatingVideo}
            />
            <div className="mt-3">
              <label className="label">Visuele stijl</label>
              <div className="flex flex-wrap gap-2">
                {VISUAL_STYLES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => !generatingPrompt && !generatingVideo && setVisualStyle(s.value)}
                    disabled={generatingPrompt || generatingVideo}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      visualStyle === s.value
                        ? "border-blue-500 bg-blue-500/10 text-blue-300"
                        : "border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200"
                    }`}
                  >
                    {s.label}
                    {s.tip && <span className="text-slate-400 font-normal">⚠</span>}
                  </button>
                ))}
              </div>
              {VISUAL_STYLES.find((s) => s.value === visualStyle)?.tip && (
                <p className="text-xs text-amber-500/70 mt-1.5">
                  ⚠ {visualStyle} werkt minder betrouwbaar in text-to-video — Kling is getraind op realistisch beeldmateriaal.
                </p>
              )}
            </div>

            <button
              onClick={handleGeneratePrompt}
              disabled={!idea.trim() || generatingPrompt || generatingVideo}
              className="mt-3 btn-primary text-sm"
            >
              {generatingPrompt ? "Prompt genereren…" : "Genereer videoprompt →"}
            </button>
          </div>

          {/* Stap 2 — Gegenereerde prompt */}
          {(prompt || generatingPrompt) && (
            <div>
              <label className="label">
                Videoprompt
                <span className="text-slate-400 font-normal ml-2 text-xs">— pas aan indien gewenst</span>
              </label>
              {generatingPrompt ? (
                <div className="input flex items-center gap-3 min-h-[80px] text-slate-500 text-sm">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                  Prompt genereren…
                </div>
              ) : (
                <textarea
                  className="input resize-none text-sm leading-relaxed"
                  rows={5}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={generatingVideo}
                />
              )}
            </div>
          )}

          {/* Stap 3 — Model & Formaat */}
          {prompt && !generatingPrompt && (
            <>
              <div>
                <label className="label">Video model</label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {VIDEO_MODELS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => !generatingVideo && setVideoModel(m.value)}
                      disabled={generatingVideo}
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

              <div>
                <label className="label">Formaat</label>
                <div className="flex gap-3">
                  {(["16:9", "9:16"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => !generatingVideo && setFormat(f)}
                      disabled={generatingVideo}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        format === f
                          ? "border-blue-500 bg-blue-500/10 text-blue-300"
                          : "border-white/10 text-slate-400 hover:border-white/20"
                      }`}
                    >
                      {f === "16:9" ? "🖥 Landscape (16:9)" : "📱 Portrait (9:16)"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Genereer video knop */}
              {!videoUrl && (
                <button
                  onClick={handleGenerateVideo}
                  disabled={generatingVideo || !prompt.trim()}
                  className="w-full btn-primary py-3 text-base"
                >
                  {generatingVideo ? (
                    <span className="flex items-center justify-center gap-3">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {statusMsg}
                    </span>
                  ) : "Genereer video →"}
                </button>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Resultaat */}
          {videoUrl && (
            <div className="space-y-3">
              <div className="rounded-xl overflow-hidden bg-[#060d1f] border border-white/10 aspect-video relative">
                <video
                  src={videoUrl}
                  controls
                  loop
                  controlsList="nodownload"
                  className="w-full h-full object-contain"
                />
                {plan === "free" && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-white/40 text-sm font-semibold bg-black/30 px-3 py-1 rounded backdrop-blur-sm">
                      animideo.ai
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setVideoUrl(null); handleGenerateVideo(); }}
                  className="btn-secondary text-sm flex-1"
                >
                  Opnieuw genereren
                </button>
                <button
                  onClick={() => { setVideoUrl(null); setPrompt(""); }}
                  className="btn-secondary text-sm flex-1"
                >
                  Nieuw idee
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
