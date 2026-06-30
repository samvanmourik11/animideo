"use client";

import { useState, useRef, useEffect } from "react";
import { Project, Scene, DesignedSceneContent, Character, CastRole } from "@/lib/types";
import { toBulletsScene, toNormalScene } from "@/lib/studio/scene-type";
import PromptEditor from "@/components/studio/PromptEditor";

interface Props {
  project: Project;
  targetScenes: number;
  onUpdate: (updates: Partial<Project>) => void;
  onNext: () => void;
  characters?: Character[];
}

export default function StudioStepScript({ project, targetScenes, onUpdate, onNext, characters = [] }: Props) {
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
      // Idee eerst opslaan zodat generate-script de laatste tekst gebruikt.
      await fetch("/api/save-project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, notes: project.notes ?? "" }),
      }).catch(() => {});
      const res = await fetch("/api/studio/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, targetScenes }),
      });
      const text = await res.text();
      let data: { error?: string; scenes?: Scene[]; cast_roles?: CastRole[] } = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (!res.ok || !data.scenes) {
        setError(data.error ?? "Script genereren mislukt, probeer het opnieuw.");
        return;
      }
      onUpdate({ scenes: data.scenes, status: "ScriptReady", ...(Array.isArray(data.cast_roles) ? { cast_roles: data.cast_roles } : {}) });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setGenerating(false);
    }
  }

  // Geen auto-generatie meer: het idee is nu de eerste stap. De gebruiker ziet
  // en bewerkt het idee en klikt zelf op "Genereer script" — zo wordt er geen
  // script (en credits) verspild voordat het idee klopt.

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

  // Expliciete overschrijf-save (geen merge) zodat bij type-omzetting het oude
  // beeld/video echt gewist wordt en niet door de autosave-merge teruggezet.
  async function persistScenes(newScenes: Scene[]) {
    try {
      await fetch("/api/save-project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, scenes: newScenes }),
      });
    } catch {}
  }

  function convertScene(index: number, target: "designed" | "normal") {
    const next = scenes.map((s, i) => i === index ? (target === "designed" ? toBulletsScene(s) : toNormalScene(s)) : s);
    setScenes(next);
    persistScenes(next);
  }

  function updateDesigned(index: number, patch: Partial<DesignedSceneContent>) {
    setScenes(scenes.map((s, i) => i === index && s.designed ? { ...s, designed: { ...s.designed, ...patch } } : s));
  }

  function updateBullet(index: number, bi: number, text: string) {
    setScenes(scenes.map((s, i) => {
      if (i !== index || !s.designed?.bullets) return s;
      return { ...s, designed: { ...s.designed, bullets: s.designed.bullets.map((b, k) => k === bi ? { ...b, text } : b) } };
    }));
  }

  function addBullet(index: number) {
    setScenes(scenes.map((s, i) => {
      if (i !== index || s.designed?.kind !== "bullets") return s;
      const bullets = [...(s.designed.bullets ?? []), { text: "", icon: "check" }].slice(0, 6);
      return { ...s, designed: { ...s.designed, bullets } };
    }));
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
      {/* Stap 1: het idee. Bewerkbaar en bewaard; vormt de basis voor het script. */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold text-white">Idee</h2>
          <button
            onClick={generate}
            disabled={generating || !(project.notes ?? "").trim()}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {generating ? "Genereren..." : scenes.length > 0 ? "Script opnieuw genereren" : "Genereer script →"}
          </button>
        </div>
        <p className="text-slate-500 text-sm mb-2">
          Dit is de basis voor je script. Pas het aan en (her)genereer het script.
        </p>
        <textarea
          value={project.notes ?? ""}
          onChange={e => onUpdate({ notes: e.target.value })}
          rows={5}
          placeholder="Beschrijf je idee of het verhaal..."
          className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
        />
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-700/40 text-red-200 text-sm rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {scenes.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-xl p-10 text-center text-slate-400 text-sm">
          Nog geen script. Klik op <span className="text-white font-medium">Genereer script</span> hierboven om het uit je idee te maken.
        </div>
      ) : (
      <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-slate-500 text-sm">
          {scenes.length} scenes, {totalDuration}s totaal. Wijzigingen worden automatisch opgeslagen.
        </p>
        <button
          onClick={addScene}
          className="text-xs bg-white/10 hover:bg-white/15 text-white px-3 py-1.5 rounded-md"
        >
          + Scene
        </button>
      </div>

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
                        onChange={e => {
                          const v = parseInt(e.target.value);
                          updateScene(i, "duration", Number.isNaN(v) ? scene.duration : Math.min(30, Math.max(1, v)));
                        }}
                        className="w-12 bg-slate-950 border border-white/10 rounded-md px-1.5 py-1 text-sm text-white text-center"
                      />
                      <span className="text-slate-500 text-xs">s</span>
                    </div>
                    <div className="flex gap-1 mt-0.5">
                      <button onClick={() => moveScene(i, -1)} disabled={i === 0} className="text-slate-500 hover:text-slate-300 disabled:opacity-20 text-xs">↑</button>
                      <button onClick={() => moveScene(i, 1)} disabled={i === scenes.length - 1} className="text-slate-500 hover:text-slate-300 disabled:opacity-20 text-xs">↓</button>
                    </div>
                    {scene.designed?.kind === "cta" ? null : scene.designed ? (
                      <button onClick={() => convertScene(i, "normal")} className="text-[10px] text-cyan-300 hover:text-cyan-200 mt-1 text-left">→ normale scène</button>
                    ) : (
                      <button onClick={() => convertScene(i, "designed")} className="text-[10px] text-cyan-300 hover:text-cyan-200 mt-1 text-left">→ opsomming</button>
                    )}
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
                {scene.designed ? (
                  <td className="px-3 py-3 align-top" colSpan={2}>
                    {scene.designed.kind === "cta" ? (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
                        <span className="text-xs font-semibold text-amber-200">📣 Eindscène (call-to-action)</span>
                        <p className="text-xs text-slate-400 mt-1">Wordt automatisch in de huisstijl gemaakt, met je logo en contactgegevens. Geen AI-beeld nodig.</p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/[0.06] p-3 space-y-2">
                        <span className="text-xs font-semibold text-cyan-200">📊 Opsommingsscène — wordt als ontworpen grafiek in de huisstijl gemaakt (geen AI-beeld)</span>
                        <input
                          value={scene.designed.title}
                          onChange={e => updateDesigned(i, { title: e.target.value })}
                          placeholder="Titel van de opsomming"
                          className="w-full bg-slate-950 border border-white/10 rounded-md px-2 py-1.5 text-sm text-white"
                        />
                        <div className="space-y-1">
                          {(scene.designed.bullets ?? []).map((b, bi) => (
                            <input
                              key={bi}
                              value={b.text}
                              onChange={e => updateBullet(i, bi, e.target.value)}
                              placeholder={`Punt ${bi + 1}`}
                              className="w-full bg-slate-950 border border-white/10 rounded-md px-2 py-1 text-xs text-white"
                            />
                          ))}
                          {(scene.designed.bullets?.length ?? 0) < 6 && (
                            <button onClick={() => addBullet(i)} className="text-[11px] text-cyan-300 hover:text-cyan-200">+ punt</button>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-3 align-top">
                      <PromptEditor
                        rows={5}
                        value={scene.image_prompt}
                        onChange={v => updateScene(i, "image_prompt", v)}
                        characters={characters}
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
                  </>
                )}
                <td className="px-3 py-3 align-top text-center">
                  <button onClick={() => deleteScene(i)} className="text-slate-500 hover:text-red-400 text-lg leading-none">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}

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
