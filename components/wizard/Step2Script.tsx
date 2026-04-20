"use client";

import { useState } from "react";
import { Project, Scene } from "@/lib/types";

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function Step2Script({ project, onUpdate, onNext, onBack }: Props) {
  const [scenes, setScenes] = useState<Scene[]>(project.scenes ?? []);
  const [saving, setSaving] = useState(false);

  function updateScene(index: number, field: keyof Scene, value: string | number) {
    const updated = scenes.map((s, i) =>
      i === index ? { ...s, [field]: value } : s
    );
    setScenes(updated);
  }

  function addScene() {
    const newScene: Scene = {
      id: `scene-${Date.now()}`,
      number: scenes.length + 1,
      duration: 5,
      voiceover_text: "",
      image_prompt: "",
      motion_prompt: "",
      image_url: null,
      video_url: null,
      canvas_json: null,
    };
    setScenes([...scenes, newScene]);
  }

  function deleteScene(index: number) {
    const updated = scenes
      .filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, number: i + 1 }));
    setScenes(updated);
  }

  function moveScene(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= scenes.length) return;
    const updated = [...scenes];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    setScenes(updated.map((s, i) => ({ ...s, number: i + 1 })));
  }

  async function handleContinue() {
    setSaving(true);
    const renumbered = scenes.map((s, i) => ({ ...s, number: i + 1 }));
    try {
      await fetch("/api/save-project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, scenes: renumbered }),
      });
      onUpdate({ scenes: renumbered });
      onNext();
    } finally {
      setSaving(false);
    }
  }

  const totalDuration = scenes.reduce((acc, s) => acc + (s.duration || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Script Editor</h2>
          <p className="text-slate-500 text-sm mt-1">
            {scenes.length} scenes · {totalDuration}s totaal — bewerk, herorden, voeg toe of verwijder.
          </p>
        </div>
        <button onClick={addScene} className="btn-secondary text-sm">
          + Scene toevoegen
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/[0.07]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/[0.03] border-b border-white/[0.07]">
              <th className="text-left px-4 py-3 font-medium text-slate-400 w-28">Scene / Sec</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Voice-over tekst</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Afbeelding prompt</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Motion instructie</th>
              <th className="px-3 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {scenes.map((scene, i) => (
              <tr key={scene.id} className="border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-col gap-1.5">
                    <span className="font-bold text-blue-400 text-xs">#{scene.number}</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={30}
                        className="w-14 bg-[#060d1f] border border-white/10 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        value={scene.duration}
                        onChange={(e) => updateScene(i, "duration", parseInt(e.target.value) || 5)}
                      />
                      <span className="text-slate-500 text-xs">sec</span>
                    </div>
                    <div className="flex gap-1 mt-0.5">
                      <button
                        onClick={() => moveScene(i, -1)}
                        disabled={i === 0}
                        className="text-slate-400 hover:text-slate-300 disabled:opacity-20 p-0.5 transition-colors"
                        title="Omhoog"
                      >↑</button>
                      <button
                        onClick={() => moveScene(i, 1)}
                        disabled={i === scenes.length - 1}
                        className="text-slate-400 hover:text-slate-300 disabled:opacity-20 p-0.5 transition-colors"
                        title="Omlaag"
                      >↓</button>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  <textarea
                    className="w-full bg-[#060d1f] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                    rows={4}
                    placeholder="Narrator tekst…"
                    value={scene.voiceover_text}
                    onChange={(e) => updateScene(i, "voiceover_text", e.target.value)}
                  />
                </td>
                <td className="px-3 py-3 align-top">
                  <textarea
                    className="w-full bg-[#060d1f] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                    rows={4}
                    placeholder="Beschrijf de afbeelding…"
                    value={scene.image_prompt}
                    onChange={(e) => updateScene(i, "image_prompt", e.target.value)}
                  />
                </td>
                <td className="px-3 py-3 align-top">
                  <textarea
                    className="w-full bg-[#060d1f] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                    rows={4}
                    placeholder="Hoe beweegt de afbeelding…"
                    value={scene.motion_prompt}
                    onChange={(e) => updateScene(i, "motion_prompt", e.target.value)}
                  />
                </td>
                <td className="px-3 py-3 align-top text-center">
                  <button
                    onClick={() => deleteScene(i)}
                    className="text-slate-400 hover:text-red-400 text-xl leading-none transition-colors"
                    title="Scene verwijderen"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-6">
        <button onClick={onBack} className="btn-secondary">
          ← Terug
        </button>
        <button
          onClick={handleContinue}
          disabled={saving || scenes.length === 0}
          className="btn-primary px-8 py-3"
        >
          {saving ? "Opslaan…" : "Genereer alle afbeeldingen →"}
        </button>
      </div>
    </div>
  );
}
