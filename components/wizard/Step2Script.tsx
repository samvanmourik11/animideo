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
          <h2 className="text-2xl font-semibold text-[#1e3a5f]">Script Editor</h2>
          <p className="text-gray-500 text-sm mt-1">
            {scenes.length} scenes · {totalDuration}s total — edit any cell, reorder, add or delete rows.
          </p>
        </div>
        <button onClick={addScene} className="btn-secondary text-sm">
          + Add Scene
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-3 font-medium text-gray-600 w-28">Scene / Sec</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">Voice-over Text</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">Image Prompt</th>
              <th className="text-left px-3 py-3 font-medium text-gray-600">Motion Instruction</th>
              <th className="px-3 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {scenes.map((scene, i) => (
              <tr key={scene.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-[#1e3a5f]">#{scene.number}</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={30}
                        className="w-14 border border-gray-200 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={scene.duration}
                        onChange={(e) => updateScene(i, "duration", parseInt(e.target.value) || 5)}
                      />
                      <span className="text-gray-400 text-xs">sec</span>
                    </div>
                    <div className="flex gap-0.5 mt-1">
                      <button
                        onClick={() => moveScene(i, -1)}
                        disabled={i === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30 p-0.5"
                        title="Move up"
                      >↑</button>
                      <button
                        onClick={() => moveScene(i, 1)}
                        disabled={i === scenes.length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30 p-0.5"
                        title="Move down"
                      >↓</button>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 align-top">
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={4}
                    placeholder="Narrator text…"
                    value={scene.voiceover_text}
                    onChange={(e) => updateScene(i, "voiceover_text", e.target.value)}
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={4}
                    placeholder="Describe the static image…"
                    value={scene.image_prompt}
                    onChange={(e) => updateScene(i, "image_prompt", e.target.value)}
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={4}
                    placeholder="How the image should move…"
                    value={scene.motion_prompt}
                    onChange={(e) => updateScene(i, "motion_prompt", e.target.value)}
                  />
                </td>
                <td className="px-3 py-2 align-top text-center">
                  <button
                    onClick={() => deleteScene(i)}
                    className="text-red-400 hover:text-red-600 text-lg leading-none"
                    title="Delete scene"
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
          ← Back
        </button>
        <button
          onClick={handleContinue}
          disabled={saving || scenes.length === 0}
          className="btn-primary px-8 py-3"
        >
          {saving ? "Saving…" : "Generate All Images →"}
        </button>
      </div>
    </div>
  );
}
