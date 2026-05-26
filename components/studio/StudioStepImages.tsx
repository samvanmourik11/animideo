"use client";

import { useState, useRef } from "react";
import { Project, Scene } from "@/lib/types";
import { buildOutroImage } from "@/lib/outro-overlay";
import SceneEditModal from "@/components/SceneEditModal";

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onNext: () => void;
  onBack: () => void;
}

type SceneStatus = "idle" | "running" | "done" | "error";
type OutroStatus = "idle" | "running" | "done" | "error";

export default function StudioStepImages({ project, onUpdate, onNext, onBack }: Props) {
  const scenes = project.scenes ?? [];
  // Initialize once, then ONLY mutate via pushScenes. Auto-syncing from props on
  // every render would race with our synchronous pushScenes update during async
  // batch generation: a setStatus re-render could read stale props (because
  // parent setProject hadn't propagated yet) and overwrite the fresh ref.
  const scenesRef = useRef<Scene[]>(scenes);

  const [statuses, setStatuses] = useState<Record<string, SceneStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [batchRunning, setBatchRunning] = useState(false);
  const [outroStatus, setOutroStatus] = useState<OutroStatus>("idle");
  const [outroError, setOutroError] = useState("");
  const outroAppliedRef = useRef(false);
  const [editScene, setEditScene] = useState<Scene | null>(null);

  const anchorCount =
    (project.style_reference_url ? 1 : 0) +
    (project.character_reference_urls?.length ?? 0);

  const outroContact = project.outro_contact ?? {};
  const hasOutroContent =
    !!project.outro_logo_url ||
    Object.values(outroContact).some(v => typeof v === "string" && v.trim().length > 0);

  // Update both the ref (synchronously) and the parent state. Critical inside
  // async batch loops where React may not re-render between iterations, so
  // relying on render-synced scenesRef would leave it stale.
  function pushScenes(newScenes: Scene[]) {
    scenesRef.current = newScenes;
    onUpdate({ scenes: newScenes });
  }

  function setScenes(newScenes: Scene[]) {
    pushScenes(newScenes);
  }

  function setStatus(id: string, status: SceneStatus) {
    setStatuses(prev => ({ ...prev, [id]: status }));
  }

  function setSceneError(id: string, err: string) {
    setErrors(prev => ({ ...prev, [id]: err }));
  }

  function clearSceneError(id: string) {
    setErrors(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function effectiveStatus(scene: Scene): SceneStatus {
    return statuses[scene.id] ?? (scene.image_url ? "done" : "idle");
  }

  function updatePrompt(id: string, value: string) {
    // Use the ref (always latest) instead of closure scenes to avoid race
    // when typing fast or when scenes were just updated by another action.
    setScenes(scenesRef.current.map(s => s.id === id ? { ...s, image_prompt: value } : s));
  }

  async function applyOutro(sceneId: string): Promise<boolean> {
    const scene = scenesRef.current.find(s => s.id === sceneId);
    if (!scene?.image_url) {
      setOutroError("Eerst een eindbeeld genereren");
      setOutroStatus("error");
      return false;
    }
    if (!hasOutroContent) {
      setOutroError("Geen logo of contactgegevens ingevuld");
      setOutroStatus("error");
      return false;
    }
    setOutroStatus("running");
    setOutroError("");
    try {
      const blob = await buildOutroImage({
        baseImageUrl: scene.image_url,
        logoUrl:      project.outro_logo_url,
        contact:      outroContact,
        format:       project.format,
      });
      const form = new FormData();
      form.append("projectId", project.id);
      form.append("sceneId", sceneId);
      form.append("file", blob, "outro.jpg");
      const res = await fetch("/api/studio/apply-outro", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) {
        setOutroError(data.error ?? "Outro mislukt");
        setOutroStatus("error");
        return false;
      }
      if (Array.isArray(data.scenes)) {
        pushScenes(data.scenes);
      } else {
        pushScenes(scenesRef.current.map(s => s.id === sceneId ? { ...s, image_url: data.imageUrl } : s));
      }
      setOutroStatus("done");
      outroAppliedRef.current = true;
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setOutroError(msg);
      setOutroStatus("error");
      return false;
    }
  }

  async function generateOne(sceneId: string): Promise<boolean> {
    setStatus(sceneId, "running");
    clearSceneError(sceneId);

    try {
      // Send the FULL current scenes so server-side update preserves all
      // prior image_urls and any unsaved prompt edits in other scenes.
      const res = await fetch("/api/studio/generate-scene-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId:    project.id,
          sceneId,
          clientScenes: scenesRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) {
        setSceneError(sceneId, data.error ?? "Onbekende fout");
        setStatus(sceneId, "error");
        return false;
      }
      // Trust the canonical scenes returned by the server
      if (Array.isArray(data.scenes)) {
        pushScenes(data.scenes);
      } else {
        const fallback = scenesRef.current.map(s =>
          s.id === sceneId ? { ...s, image_url: data.imageUrl } : s
        );
        pushScenes(fallback);
      }
      setStatus(sceneId, "done");

      // Auto-apply outro overlay on the last scene the first time it gets an image.
      const sceneList = scenesRef.current;
      const lastSceneId = sceneList[sceneList.length - 1]?.id;
      if (
        sceneId === lastSceneId &&
        hasOutroContent &&
        !outroAppliedRef.current
      ) {
        outroAppliedRef.current = true;
        // fire-and-forget; UI shows separate status
        applyOutro(sceneId).catch(() => {});
      }
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSceneError(sceneId, msg);
      setStatus(sceneId, "error");
      return false;
    }
  }

  async function generateAll() {
    if (batchRunning) return;
    setBatchRunning(true);
    // Iterate ref so newly added scenes (or removed ones) are seen mid-batch.
    // Closure scenes from props would be stale after a re-render.
    const ids = scenesRef.current.map(s => s.id);
    for (const id of ids) {
      const current = scenesRef.current.find(s => s.id === id);
      if (!current) continue;
      if ((statuses[id] ?? (current.image_url ? "done" : "idle")) === "done") continue;
      await generateOne(id);
    }
    setBatchRunning(false);
  }

  function handleContinue() {
    if (allDone) onUpdate({ status: "ImagesReady" });
    onNext();
  }

  const doneCount = scenes.filter(s => effectiveStatus(s) === "done").length;
  const allDone = scenes.length > 0 && doneCount === scenes.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-white">Beelden</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {doneCount}/{scenes.length} klaar.{" "}
            {anchorCount > 0
              ? `Elke scene gebruikt ${anchorCount} anchor reference${anchorCount === 1 ? "" : "s"} via Nano Banana Pro.`
              : "Geen anchors. Elke scene wordt text-to-image gegenereerd."}
          </p>
        </div>
        <button
          onClick={generateAll}
          disabled={batchRunning || allDone}
          className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-md"
        >
          {batchRunning ? "Bezig..." : allDone ? "Allemaal klaar" : doneCount > 0 ? "Genereer ontbrekende" : "Genereer alles"}
        </button>
      </div>

      <div className="space-y-4">
        {scenes.map((scene, idx) => {
          const status = effectiveStatus(scene);
          const err = errors[scene.id];
          const isLast = idx === scenes.length - 1;
          const showOutroBtn = isLast && hasOutroContent;
          return (
            <div key={scene.id} className="bg-white/5 border border-white/10 rounded-xl p-4 grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-cyan-400">
                    Scene #{idx + 1} ({scene.duration}s){isLast && hasOutroContent ? " · outro" : ""}
                  </span>
                  <div className="flex gap-1.5">
                    {showOutroBtn && (
                      <button
                        onClick={() => applyOutro(scene.id)}
                        disabled={outroStatus === "running" || status === "running" || !scene.image_url}
                        className="text-xs bg-cyan-600/20 border border-cyan-500/40 hover:bg-cyan-600/30 text-cyan-200 px-2.5 py-1 rounded-md disabled:opacity-40"
                        title="Plak logo en contactgegevens als overlay op deze scene"
                      >
                        {outroStatus === "running" ? "Outro..." : "Outro overlay"}
                      </button>
                    )}
                    {status === "done" && scene.image_url && (
                      <button
                        onClick={() => setEditScene(scene)}
                        disabled={batchRunning}
                        className="text-xs bg-purple-600/20 border border-purple-500/40 hover:bg-purple-600/30 text-purple-200 px-2.5 py-1 rounded-md disabled:opacity-40"
                        title="Geef een korte instructie om dit beeld bij te sturen"
                      >
                        ✎ Bewerk
                      </button>
                    )}
                    <button
                      onClick={() => generateOne(scene.id)}
                      disabled={status === "running" || batchRunning}
                      className="text-xs bg-white/10 hover:bg-white/15 text-white px-2.5 py-1 rounded-md disabled:opacity-50"
                    >
                      {status === "running" ? "Bezig..." : status === "done" ? "Opnieuw" : "Genereer"}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 italic">&quot;{scene.voiceover_text}&quot;</p>
                <textarea
                  value={scene.image_prompt}
                  onChange={e => updatePrompt(scene.id, e.target.value)}
                  rows={5}
                  disabled={status === "running"}
                  className="w-full bg-slate-950 border border-white/10 rounded-md px-2 py-1.5 text-sm text-white"
                />
                {err && <p className="text-xs text-red-400">Fout: {err}</p>}
                {isLast && outroStatus === "error" && outroError && (
                  <p className="text-xs text-red-400">Outro fout: {outroError}</p>
                )}
                {isLast && outroStatus === "done" && (
                  <p className="text-xs text-cyan-300">Outro overlay toegepast.</p>
                )}
              </div>
              <div className="aspect-video md:aspect-auto md:h-[180px] rounded-md overflow-hidden border border-white/10 bg-slate-950 flex items-center justify-center relative">
                {status === "running" && (
                  <div className="text-center">
                    <div className="inline-block w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-2" />
                    <p className="text-xs text-slate-400">Genereren...</p>
                  </div>
                )}
                {status !== "running" && scene.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scene.image_url} alt={`Scene ${idx + 1}`} className="w-full h-full object-cover" />
                )}
                {status !== "running" && !scene.image_url && (
                  <p className="text-xs text-slate-600">Nog geen beeld</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-6">
        <button onClick={onBack} className="text-sm bg-white/10 hover:bg-white/15 text-white px-4 py-2 rounded-md">
          ← Terug
        </button>
        <button
          onClick={handleContinue}
          disabled={!allDone}
          className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-medium px-6 py-2.5 rounded-lg"
        >
          Naar beweging →
        </button>
      </div>

      {editScene && editScene.image_url && (
        <SceneEditModal
          open
          onClose={() => setEditScene(null)}
          projectId={project.id}
          sceneId={editScene.id}
          currentImageUrl={editScene.image_url}
          clientScenes={scenesRef.current}
          onUpdated={(newUrl, updatedScenes) => {
            // Server geeft de hele scenes-array terug (na de DB-update) —
            // pakken die zodat we niet ergens out-of-sync raken met edits
            // die de gebruiker had open staan.
            if (updatedScenes && updatedScenes.length > 0) {
              pushScenes(updatedScenes);
            } else {
              pushScenes(
                scenesRef.current.map((s) =>
                  s.id === editScene.id ? { ...s, image_url: newUrl } : s
                )
              );
            }
          }}
        />
      )}
    </div>
  );
}
