"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Project, Scene, SceneLipsync } from "@/lib/types";
import { STORY_VOICES } from "@/lib/infographics/story-voices";
import { lipsyncCredits, LIPSYNC_MAX_SEC } from "@/lib/lipsync";
import { VIDEO_MODELLEN, STANDAARD_VIDEO_MODEL, videoModel as kiesVideoModel } from "@/lib/video-modellen";
import InsufficientCreditsModal from "@/components/InsufficientCreditsModal";
import { createClient } from "@/lib/supabase/client";

// Het beweegmodel is te kiezen (zie video-modellen.ts). Eén model voor alles werkte
// niet: komt een beeld er niet goed uit, dan is hetzelfde model nóg een keer proberen
// zelden de oplossing en een ander model wél (Sam over zijn redacteuren, 21-09-2026).

// Standaard-bewegingsinstructie: het beeld komt logisch/subtiel tot leven op
// basis van wat er te zien is. De per-scène motion-prompt is hiermee verborgen;
// de gebruiker hoeft niets in te vullen. Een optionele globale instructie wordt
// hieraan toegevoegd (zie effectiveMotion).
const DEFAULT_MOTION =
  "Bring this still image to life with subtle, natural motion that fits its content: gentle cinematic camera movement (a slow push-in, pan or parallax) and small, lifelike movements. Stay faithful to the image — keep the same subjects, composition and style, with no abrupt changes or new elements.";

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onNext: () => void;
  onBack: () => void;
  plan?: string;
  /** Upload-tool: per scène ook een pratende (lipsync) clip kunnen maken en downloaden. */
  lipsync?: boolean;
  /**
   * Zelf het beweegmodel kiezen. Staat aan in de upload-tool, waar onze eigen mensen
   * werken: lukt een clip niet, dan is een ander model vaak de oplossing. Voor klanten
   * blijft het bij het standaardmodel, zodat ze niet hoeven te kiezen tussen prijzen.
   */
  modelKeuze?: boolean;
}

/** Downloadlink voor een clip uit Supabase-opslag (?download= zet de bestandsnaam). */
function downloadLink(url: string, naam: string): string {
  if (!url.includes("/storage/v1/object/public/")) return url;
  return `${url.split("?")[0]}?download=${encodeURIComponent(naam)}`;
}

export default function Step4Motion({ project, onUpdate, onNext, onBack, plan = "free", lipsync = false, modelKeuze = false }: Props) {
  const router = useRouter();
  const [scenes, setScenes] = useState<Scene[]>(project.scenes ?? []);
  const [currentIndex, setCurrentIndex] = useState(() => {
    const firstPending = (project.scenes ?? []).findIndex((s) => !s.video_url);
    return firstPending === -1 ? 0 : firstPending;
  });
  const [videoModel, setVideoModel] = useState<string>(STANDAARD_VIDEO_MODEL);
  const [generating, setGenerating] = useState(false);
  const [globalInstruction, setGlobalInstruction] = useState("");
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [cacheBust, setCacheBust] = useState<Record<string, number>>({});
  const [creditModal, setCreditModal] = useState<{ credits: number; required: number } | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Soort clip per scène: gewone beweging of lipsync. Een scène die al een lipsync
  // heeft, opent in lipsync.
  const [soort, setSoort] = useState<Record<string, "beweging" | "lipsync">>({});
  const [uploadBezig, setUploadBezig] = useState(false);

  const scene = scenes[currentIndex];
  const totalScenes = scenes.length;
  const doneCount = scenes.filter((s) => s.video_url).length;
  const allDone = doneCount === totalScenes;

  // Effectieve motion-prompt: vaste logische default + optionele globale
  // instructie. Per-scène prompts worden niet meer getoond of bewerkt.
  const effectiveMotion = () =>
    [DEFAULT_MOTION, globalInstruction.trim()].filter(Boolean).join(" ");

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
    // Capture the scene we are generating for at submit time. If the user
    // navigates to a different scene during polling, we still update the
    // correct scene's video_url instead of overwriting the wrong one.
    const targetSceneId = scene.id;
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

      // Safety: stop polling after 5 minutes regardless. If no result by then,
      // assume Kling failed and refund/error.
      const pollStartedAt = Date.now();
      const MAX_POLL_MS = 5 * 60 * 1000;

      // Poll for status
      pollIntervalRef.current = setInterval(async () => {
        try {
          if (Date.now() - pollStartedAt > MAX_POLL_MS) {
            clearInterval(pollIntervalRef.current!);
            pollIntervalRef.current = null;
            throw new Error("Video generatie duurt te lang. Probeer opnieuw of neem contact op met support als de credits niet teruggestort zijn.");
          }

          const statusRes = await fetch(
            `/api/runway-status?taskId=${taskId}&projectId=${project.id}&sceneId=${targetSceneId}&videoModel=${usedModel ?? videoModel}`
          );
          // Non-2xx of geen geldige JSON: behandel als FAILED zodat client
          // niet eeuwig blijft pollen op een 500.
          if (!statusRes.ok) {
            clearInterval(pollIntervalRef.current!);
            pollIntervalRef.current = null;
            throw new Error(`Status check faalde (HTTP ${statusRes.status})`);
          }
          const statusData = await statusRes.json();

          if (statusData.status === "SUCCEEDED") {
            clearInterval(pollIntervalRef.current!);
            pollIntervalRef.current = null;
            setStatusMsg("");
            let persistedScenes: Scene[] = [];
            setScenes(prev => {
              persistedScenes = prev.map(s =>
                s.id === targetSceneId
                  ? { ...s, video_url: statusData.videoUrl, motion_prompt: motionPrompt }
                  : s
              );
              return persistedScenes;
            });
            setCacheBust(prev => ({ ...prev, [targetSceneId]: Date.now() }));
            // Persisteer direct zodat video_url niet verloren gaat bij refresh
            onUpdate({ scenes: persistedScenes });
            fetch("/api/save-project", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectId: project.id, scenes: persistedScenes }),
            }).catch(() => {});
            router.refresh(); // update credits in navbar
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

  const soortVan = (s: Scene) => soort[s.id] ?? (s.lipsync ? "lipsync" : "beweging");

  function zetLipsync(wijziging: Partial<SceneLipsync>) {
    const id = scene.id;
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, lipsync: { ...(s.lipsync ?? {}), ...wijziging } } : s)));
  }

  async function uploadOpname(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("De opname is groter dan 5 MB. Gebruik een kortere of kleinere opname (bijv. mp3)."); return; }
    setUploadBezig(true);
    setError("");
    try {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("Sessie verlopen — log opnieuw in");
      const ext = (file.name.split(".").pop() ?? "mp3").toLowerCase();
      const pad = `${user.id}/${project.id}/lipsync-${scene.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from("audio").upload(pad, file, { upsert: true, contentType: file.type || undefined });
      if (upErr) throw new Error(upErr.message);
      const url = sb.storage.from("audio").getPublicUrl(pad).data.publicUrl;
      zetLipsync({ eigenAudioUrl: url, eigenAudioNaam: file.name });
    } catch (err) {
      setError(`Opname uploaden mislukt: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploadBezig(false);
    }
  }

  async function maakLipsync() {
    const imageUrl = scene.image_url;
    if (!imageUrl) { setError("Deze scène heeft nog geen afbeelding."); return; }
    const ls = scene.lipsync ?? {};
    if (!ls.eigenAudioUrl && !ls.tekst?.trim()) { setError("Vul in wat er gezegd wordt, of upload een opname."); return; }
    const targetSceneId = scene.id;
    setGenerating(true);
    setError("");
    setStatusMsg(ls.eigenAudioUrl ? "Opname klaarzetten…" : "Stem inspreken…");
    try {
      const res = await fetch("/api/generate-lipsync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          tekst: ls.eigenAudioUrl ? undefined : ls.tekst,
          stem: ls.stem,
          taal: project.language,
          audioUrl: ls.eigenAudioUrl ?? undefined,
          aanwijzing: ls.aanwijzing,
        }),
      });
      const data = await res.json().catch(() => ({ error: `Serverfout (HTTP ${res.status})` }));
      if (res.status === 402) {
        setCreditModal({ credits: data.credits, required: data.required });
        setGenerating(false); setStatusMsg("");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Lipsync mislukt");
      const { requestId, audioUrl } = data as { requestId: string; audioUrl: string; duur: number };
      setStatusMsg(`Pratende clip maken (${Math.round(data.duur)} s geluid), dit duurt een paar minuten…`);

      const start = Date.now();
      pollIntervalRef.current = setInterval(async () => {
        try {
          if (Date.now() - start > 15 * 60 * 1000) throw new Error("De lipsync duurt te lang. Probeer het opnieuw.");
          const st = await fetch(`/api/generate-lipsync/status?requestId=${encodeURIComponent(requestId)}`);
          const sd = await st.json().catch(() => ({ status: "BEZIG" }));
          if (sd.status === "BEZIG") return;
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          if (sd.status !== "KLAAR") throw new Error(sd.error ?? "Lipsync mislukt");
          let bijgewerkt: Scene[] = [];
          setScenes((prev) => {
            bijgewerkt = prev.map((s) => (s.id === targetSceneId
              ? { ...s, video_url: sd.videoUrl, lipsync: { ...(s.lipsync ?? {}), audioUrl } }
              : s));
            return bijgewerkt;
          });
          setCacheBust((prev) => ({ ...prev, [targetSceneId]: Date.now() }));
          onUpdate({ scenes: bijgewerkt });
          fetch("/api/save-project", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: project.id, scenes: bijgewerkt }),
          }).catch(() => {});
          router.refresh();
          setGenerating(false);
          setStatusMsg("");
        } catch (pollErr) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setError(pollErr instanceof Error ? pollErr.message : String(pollErr));
          setGenerating(false);
          setStatusMsg("");
        }
      }, 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGenerating(false);
      setStatusMsg("");
    }
  }

  const maakClip = () => (lipsync && soortVan(scene) === "lipsync" ? maakLipsync() : generateMotion(effectiveMotion()));

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
    const isLast = currentIndex >= totalScenes - 1;
    await fetch("/api/save-project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, scenes: updatedScenes, ...(isLast ? { status: "MotionReady" } : {}) }),
    });
    onUpdate({ scenes: updatedScenes, ...(isLast ? { status: "MotionReady" } : {}) });
    if (isLast) {
      // Laatste scène goedgekeurd → door naar de volgende stap (voice-over).
      onNext();
    } else {
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
        <h2 className="text-2xl font-bold text-white">Beweging</h2>
        <p className="text-slate-500 text-sm mt-1">
          Elke afbeelding komt automatisch en logisch tot leven. Druk per scène op
          de knop om de clip te genereren.
        </p>
      </div>

      {modelKeuze && (<>
      {/* Welk model het beeld laat bewegen. Elk model beweegt anders: lukt een clip
          niet, dan helpt een ander model meestal meer dan dezelfde nog een keer. */}
      <div className="card mb-6">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Beweegmodel
        </label>
        <div className="grid gap-2 sm:grid-cols-2 mt-2">
          {VIDEO_MODELLEN.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setVideoModel(m.id)}
              disabled={generating}
              className={`text-left rounded-lg border p-2.5 transition disabled:opacity-40 ${
                videoModel === m.id
                  ? "border-blue-400/70 bg-blue-500/10"
                  : "border-white/10 bg-white/[0.02] hover:border-white/25"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-white">{m.naam}</span>
                <span className="text-[11px] text-slate-400">{m.credits} credits</span>
              </span>
              <span className="block text-[11px] leading-snug text-slate-500 mt-0.5">{m.waarvoor}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-600 mt-2">
          Komt een clip er niet goed uit? Probeer dan hetzelfde beeld met een ander model — dat helpt vaker dan
          opnieuw proberen met hetzelfde.
        </p>
      </div>
      </>)}

      {/* Optionele globale bewegingsinstructie — geldt voor alle scènes. Vul dit
          in vóór je genereert, zodat je geen credits verspilt aan opnieuw doen. */}
      <div className="card mb-6">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Bewegingsinstructie (optioneel)
        </label>
        <textarea
          className="input resize-none text-sm mt-2"
          rows={2}
          placeholder="Bijv. 'rustige, langzame camerabeweging' of 'lichte parallax, geen zoom'. Laat leeg voor automatische, logische beweging."
          value={globalInstruction}
          onChange={(e) => setGlobalInstruction(e.target.value)}
          disabled={generating}
        />
        <p className="text-[11px] text-slate-600 mt-1">
          Geldt voor alle scènes en wordt toegevoegd aan de automatische beweging.
          Vul dit in vóór je de eerste clip genereert om credits te besparen.
        </p>
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

        {lipsync && !scene.designed && (
          <div className="space-y-3">
            <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10 w-fit">
              {(["beweging", "lipsync"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setSoort((prev) => ({ ...prev, [scene.id]: k }))}
                  disabled={generating}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${soortVan(scene) === k ? "bg-blue-500/20 text-blue-300" : "text-slate-400 hover:text-white"}`}
                >
                  {k === "beweging" ? "Beweging" : "Lipsync (pratend)"}
                </button>
              ))}
            </div>

            {soortVan(scene) === "lipsync" && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <p className="text-xs text-slate-400">
                  Het personage in het beeld spreekt de tekst uit, met bewegende mond. Gebruik een beeld
                  waarop het gezicht goed te zien is. Maximaal {LIPSYNC_MAX_SEC} seconden geluid.
                </p>

                {scene.lipsync?.eigenAudioUrl ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-slate-300">Eigen opname: {scene.lipsync.eigenAudioNaam ?? "geüpload"}</span>
                    <audio src={scene.lipsync.eigenAudioUrl} controls className="h-8" />
                    <button
                      onClick={() => zetLipsync({ eigenAudioUrl: null, eigenAudioNaam: null })}
                      disabled={generating}
                      className="text-xs text-slate-400 hover:text-white underline"
                    >
                      Toch tekst laten inspreken
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Wat zegt het personage?</label>
                      <textarea
                        className="input resize-none text-sm mt-2"
                        rows={3}
                        placeholder="Bijv. 'Welkom! Vandaag laat ik je zien hoe het werkt.'"
                        value={scene.lipsync?.tekst ?? ""}
                        onChange={(e) => zetLipsync({ tekst: e.target.value })}
                        disabled={generating}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Stem</label>
                      <select
                        className="input text-sm w-auto"
                        value={scene.lipsync?.stem ?? "Charlotte"}
                        onChange={(e) => zetLipsync({ stem: e.target.value })}
                        disabled={generating}
                      >
                        {STORY_VOICES.map((v) => (
                          <option key={v.id} value={v.id}>{v.label} — {v.description}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <label className={`inline-block text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10 cursor-pointer ${generating || uploadBezig ? "opacity-40 pointer-events-none" : ""}`}>
                  {uploadBezig ? "Uploaden…" : scene.lipsync?.eigenAudioUrl ? "Andere opname uploaden" : "Of upload een eigen opname (mp3, wav, m4a)"}
                  <input type="file" accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-m4a,audio/mp4" className="hidden" onChange={uploadOpname} />
                </label>

                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Aanwijzing (optioneel)</label>
                  <input
                    className="input text-sm mt-2"
                    placeholder="Bijv. 'enthousiast, met handgebaren' — in het Engels werkt het het best"
                    value={scene.lipsync?.aanwijzing ?? ""}
                    onChange={(e) => zetLipsync({ aanwijzing: e.target.value })}
                    disabled={generating}
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Kost {lipsyncCredits(5)} credits per begonnen 5 seconden geluid.
                </p>
              </div>
            )}
          </div>
        )}

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
                    JouwAnimatieVideo A.I.
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
              onClick={maakClip}
              className="mt-2 btn-primary text-sm"
            >
              Opnieuw proberen
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {scene.designed ? (
            <>
              <p className="text-sm text-slate-400 flex-1">
                Ontworpen scène — automatisch geanimeerd in de huisstijl.
              </p>
              <button onClick={acceptScene} disabled={generating} className="btn-primary text-sm">
                {currentIndex < totalScenes - 1 ? "Goedkeuren → volgende" : "Goedkeuren"}
              </button>
            </>
          ) : (
          <>
          {!scene.video_url && !generating && (
            <button onClick={maakClip} className="btn-primary">
              {lipsync && soortVan(scene) === "lipsync"
                ? "Maak lipsync-clip"
                : modelKeuze
                  ? `Genereer videoclip (${kiesVideoModel(videoModel).naam}, ${kiesVideoModel(videoModel).credits} credits)`
                  : "Genereer videoclip"}
            </button>
          )}
          {scene.video_url && (
            <>
              <button
                onClick={maakClip}
                disabled={generating}
                className="btn-secondary text-sm"
              >
                {generating ? "Genereren…" : "Opnieuw genereren"}
              </button>
              {lipsync && (
                <a
                  href={downloadLink(scene.video_url, `${(project.title || "clip").replace(/[^\w\-]+/g, "-")}-scene-${scene.number}${scene.lipsync?.audioUrl && soortVan(scene) === "lipsync" ? "-lipsync" : ""}.mp4`)}
                  className="btn-secondary text-sm"
                >
                  Download clip
                </a>
              )}
              <button
                onClick={deleteVideo}
                disabled={generating}
                className="text-sm px-3 py-1.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1"
                title="Videoclip verwijderen"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Verwijderen
              </button>
              <button
                onClick={acceptScene}
                disabled={generating}
                className="btn-primary text-sm"
              >
                {currentIndex < totalScenes - 1 ? "Goedkeuren → volgende" : "Goedkeuren"}
              </button>
            </>
          )}
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
