"use client";

import { useState, useRef, useEffect } from "react";
import { Project, Scene } from "@/lib/types";

interface Props {
  project: Project;
  targetScenes: number;
  onUpdate: (updates: Partial<Project>) => void;
  onNext: () => void;
}

export default function StudioStepScript({ project, targetScenes, onUpdate, onNext }: Props) {
  const scenes = project.scenes ?? [];
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const triggeredRef = useRef(false);

  function setScenes(newScenes: Scene[]) {
    onUpdate({ scenes: newScenes });
  }

  async function generate() {
    if (generating) return;
    setError("");
    setGenerating(true);
    try {
      const res = await fetch("/api/studio/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, targetScenes }),
      });
      const text = await res.text();
      let data: { error?: string; scenes?: Scene[] } = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (!res.ok || !data.scenes) {
        setError(data.error ?? "Script genereren mislukt, probeer het opnieuw.");
        return;
      }
      onUpdate({ scenes: data.scenes, status: "ScriptReady" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    // Only auto-generate for a brand-new draft that has never had a script.
    // Without the status guard this re-fires on every remount: if scenes were
    // briefly empty (e.g. a save that had not landed yet) it would burn credits
    // and overwrite the script the user already had. When scenes are empty but
    // the project is past Draft, we show the editor and let the user regenerate
    // manually instead of silently spending credits.
    if (scenes.length === 0 && project.status === "Draft" && !triggeredRef.current) {
      triggeredRef.current = true;
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateScene(index: number, field: keyof Scene, value: string | number) {
    setScenes(scenes.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }

  function addScene() {
    setScenes([
      ...scenes,
      {
        id: `scene-${Date.now()}`,
        number: scenes.length + 1,
        duration: 5,
        voiceover_text: "",
        image_prompt: "",
        motion_prompt: "",
        image_url: null,
        video_url: null,
        canvas_json: null,
      },
    ]);
  }

  function deleteScene(index: number) {
    setScenes(scenes.filter((_, i) => i !== index).map((s, i) => ({ ...s, number: i + 1 })));
  }

  function moveScene(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= scenes.length) return;
    const updated = [...scenes];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    setScenes(updated.map((s, i) => ({ ...s, number: i + 1 })));
  }

  const totalDuration = scenes.reduce((acc, s) => acc + (s.duration || 0), 0);

  if (generating && scenes.length === 0) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
        <div className="inline-block w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-4" />
        <p className="text-white font-medium">GPT-4 schrijft je script...</p>
        <p className="text-sm text-slate-400 mt-1">Op basis van je idee en {targetScenes} gewenste scenes</p>
      </div>
    );
  }

  if (error && scenes.length === 0) {
    return (
      <div className="bg-red-950/40 border border-red-700/40 rounded-xl p-6 text-center">
        <p className="text-red-200 mb-3">{error}</p>
        <button onClick={generate} className="bg-red-700 hover:bg-red-600 text-white text-sm px-4 py-2 rounded-md">
          Opnieuw proberen
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-white">Script editor</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {scenes.length} scenes, {totalDuration}s totaal. Wijzigingen worden automatisch opgeslagen.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={generate}
            disabled={generating}
            className="text-xs bg-white/10 hover:bg-white/15 text-white px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            {generating ? "Genereren..." : "Opnieuw genereren"}
          </button>
          <button
            onClick={addScene}
            className="text-xs bg-white/10 hover:bg-white/15 text-white px-3 py-1.5 rounded-md"
          >
            + Scene
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-700/40 text-red-200 text-sm rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/[0.03] border-b border-white/10">
              <th className="text-left px-4 py-3 font-medium text-slate-400 w-24">#</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Voice-over</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Image prompt</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Motion</th>
              <th className="px-3 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {scenes.map((scene, i) => (
              <tr key={scene.id} className="border-b border-white/[0.05] hover:bg-white/[0.02]">
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-col gap-1.5">
                    <span className="font-bold text-cyan-400 text-xs">#{scene.number}</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={scene.duration}
                        onChange={e => updateScene(i, "duration", parseInt(e.target.value) || 5)}
                        className="w-12 bg-slate-950 border border-white/10 rounded-md px-1.5 py-1 text-sm text-white text-center"
                      />
                      <span className="text-slate-500 text-xs">s</span>
                    </div>
                    <div className="flex gap-1 mt-0.5">
                      <button onClick={() => moveScene(i, -1)} disabled={i === 0} className="text-slate-500 hover:text-slate-300 disabled:opacity-20 text-xs">↑</button>
                      <button onClick={() => moveScene(i, 1)} disabled={i === scenes.length - 1} className="text-slate-500 hover:text-slate-300 disabled:opacity-20 text-xs">↓</button>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  <textarea
                    rows={5}
                    value={scene.voiceover_text}
                    onChange={e => updateScene(i, "voiceover_text", e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-md px-2 py-1.5 text-sm text-white"
                  />
                </td>
                <td className="px-3 py-3 align-top">
                  <textarea
                    rows={5}
                    value={scene.image_prompt}
                    onChange={e => updateScene(i, "image_prompt", e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-md px-2 py-1.5 text-sm text-white"
                  />
                </td>
                <td className="px-3 py-3 align-top">
                  <textarea
                    rows={5}
                    value={scene.motion_prompt}
                    onChange={e => updateScene(i, "motion_prompt", e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-md px-2 py-1.5 text-sm text-white"
                  />
                </td>
                <td className="px-3 py-3 align-top text-center">
                  <button onClick={() => deleteScene(i)} className="text-slate-500 hover:text-red-400 text-lg leading-none">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end mt-6">
        <button
          onClick={onNext}
          disabled={scenes.length === 0}
          className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-medium px-6 py-2.5 rounded-lg"
        >
          Naar beelden →
        </button>
      </div>
    </div>
  );
}
