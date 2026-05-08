"use client";

import { useState } from "react";

const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const RESOLUTIONS = ["1K", "2K", "4K"];
const MAX_SCENES = 6;
const MAX_CHARACTER_REFS = 3;

type SceneState = {
  prompt: string;
  status: "idle" | "running" | "done" | "error";
  imageUrl?: string;
  error?: string;
  processingMs?: number;
  model?: string;
};

type ApiResponse = {
  imageUrl?: string;
  model?: string;
  referenceCount?: number;
  processingMs?: number;
  error?: string;
};

async function resizeToDataUrl(file: File, maxDim = 1024): Promise<string> {
  const reader = new FileReader();
  const dataUrl: string = await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });
  const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas niet beschikbaar");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.9);
}

export default function TestForm() {
  const [styleRef, setStyleRef] = useState<string | null>(null);
  const [characterRefs, setCharacterRefs] = useState<string[]>([]);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("2K");
  const [scenes, setScenes] = useState<SceneState[]>([
    { prompt: "", status: "idle" },
    { prompt: "", status: "idle" },
    { prompt: "", status: "idle" },
  ]);
  const [running, setRunning] = useState(false);
  const [globalError, setGlobalError] = useState("");

  async function handleStyleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeToDataUrl(file, 1024);
      setStyleRef(dataUrl);
    } catch {
      setGlobalError("Kon style reference niet verwerken");
    }
    e.target.value = "";
  }

  async function handleCharacterUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    try {
      const dataUrls = await Promise.all(files.map(f => resizeToDataUrl(f, 1024)));
      setCharacterRefs(prev => [...prev, ...dataUrls].slice(0, MAX_CHARACTER_REFS));
    } catch {
      setGlobalError("Kon character reference niet verwerken");
    }
    e.target.value = "";
  }

  function updateScene(idx: number, patch: Partial<SceneState>) {
    setScenes(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  function addScene() {
    if (scenes.length >= MAX_SCENES) return;
    setScenes(prev => [...prev, { prompt: "", status: "idle" }]);
  }

  function removeScene(idx: number) {
    if (scenes.length <= 1) return;
    setScenes(prev => prev.filter((_, i) => i !== idx));
  }

  async function callApi(prompt: string, refs: string[]): Promise<ApiResponse> {
    const res = await fetch("/api/test-nano-banana", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        referenceImages: refs,
        aspectRatio,
        resolution,
      }),
    });
    return await res.json();
  }

  async function handleGenerateAll() {
    setGlobalError("");
    const activeIndices = scenes
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.prompt.trim().length > 0)
      .map(({ i }) => i);

    if (activeIndices.length === 0) {
      setGlobalError("Vul minstens 1 scene prompt in");
      return;
    }

    setRunning(true);
    setScenes(prev => prev.map((s, i) =>
      activeIndices.includes(i) ? { ...s, status: "idle", imageUrl: undefined, error: undefined } : s
    ));

    const anchors = [
      ...(styleRef ? [styleRef] : []),
      ...characterRefs,
    ];

    let firstSceneOutput: string | null = null;

    for (const idx of activeIndices) {
      updateScene(idx, { status: "running" });

      let refs: string[];
      if (anchors.length > 0) {
        refs = anchors;
      } else if (firstSceneOutput) {
        refs = [firstSceneOutput];
      } else {
        refs = [];
      }

      try {
        const data = await callApi(scenes[idx].prompt, refs);
        if (data.error || !data.imageUrl) {
          updateScene(idx, { status: "error", error: data.error ?? "Onbekende fout" });
          continue;
        }
        updateScene(idx, {
          status: "done",
          imageUrl: data.imageUrl,
          processingMs: data.processingMs,
          model: data.model,
        });
        if (anchors.length === 0 && firstSceneOutput === null) {
          firstSceneOutput = data.imageUrl;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        updateScene(idx, { status: "error", error: msg });
      }
    }

    setRunning(false);
  }

  const filledCount = scenes.filter(s => s.prompt.trim().length > 0).length;
  const usingAnchors = !!styleRef || characterRefs.length > 0;

  return (
    <div className="space-y-6">
      <section className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-white mb-1">Project anchors</h2>
          <p className="text-xs text-slate-400">
            Optioneel. Worden meegestuurd aan elke scene voor consistente stijl en character.
            Zonder anchors gebruikt scene 1 text-to-image, en scenes 2 t/m 6 referen scene 1.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Style reference {styleRef ? "(1)" : ""}
            </label>
            {styleRef ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={styleRef} alt="style ref" className="w-32 h-32 object-cover rounded-md border border-white/10" />
                <button
                  type="button"
                  onClick={() => setStyleRef(null)}
                  className="absolute top-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded"
                >
                  x
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="image/*"
                onChange={handleStyleUpload}
                className="block w-full text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-cyan-600 file:text-white hover:file:bg-cyan-700"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Character references ({characterRefs.length}/{MAX_CHARACTER_REFS})
            </label>
            {characterRefs.length < MAX_CHARACTER_REFS && (
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleCharacterUpload}
                className="block w-full text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-cyan-600 file:text-white hover:file:bg-cyan-700 mb-2"
              />
            )}
            {characterRefs.length > 0 && (
              <div className="flex gap-2">
                {characterRefs.map((src, i) => (
                  <div key={i} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`character ${i + 1}`} className="w-20 h-20 object-cover rounded-md border border-white/10" />
                    <button
                      type="button"
                      onClick={() => setCharacterRefs(prev => prev.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/5">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Aspect ratio</label>
            <select
              value={aspectRatio}
              onChange={e => setAspectRatio(e.target.value)}
              className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Resolutie</label>
            <select
              value={resolution}
              onChange={e => setResolution(e.target.value)}
              className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              {RESOLUTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Scenes</h2>
            <p className="text-xs text-slate-400">
              {filledCount}/{scenes.length} ingevuld. Lege scenes worden overgeslagen.
            </p>
          </div>
          {scenes.length < MAX_SCENES && (
            <button
              type="button"
              onClick={addScene}
              disabled={running}
              className="text-xs bg-white/10 hover:bg-white/15 text-white px-3 py-1.5 rounded-md"
            >
              + scene
            </button>
          )}
        </div>

        <div className="space-y-3">
          {scenes.map((scene, idx) => (
            <div key={idx} className="border border-white/10 rounded-lg p-3 bg-slate-900/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-200">Scene {idx + 1}</span>
                {scenes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeScene(idx)}
                    disabled={running}
                    className="text-xs text-slate-500 hover:text-red-400"
                  >
                    verwijder
                  </button>
                )}
              </div>
              <textarea
                value={scene.prompt}
                onChange={e => updateScene(idx, { prompt: e.target.value })}
                rows={3}
                placeholder={
                  idx === 0
                    ? "Bijv. Same character and painted cinematic style as references. The man steps out of the dark sedan into a foggy night driveway..."
                    : "Same character and style as references. Next moment in the story..."
                }
                disabled={running}
                className="w-full bg-slate-950/60 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
              />
              {scene.status === "running" && (
                <div className="mt-2 text-xs text-cyan-400">Bezig met genereren...</div>
              )}
              {scene.status === "error" && (
                <div className="mt-2 text-xs text-red-400">Fout: {scene.error}</div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleGenerateAll}
          disabled={running || filledCount === 0}
          className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition"
        >
          {running ? "Bezig..." : `Genereer ${filledCount} scene${filledCount === 1 ? "" : "s"}`}
        </button>

        {globalError && (
          <div className="bg-red-950/50 border border-red-700/50 text-red-200 text-sm rounded-lg px-3 py-2">
            {globalError}
          </div>
        )}

        <div className="text-xs text-slate-500 pt-1">
          Strategie: {usingAnchors
            ? `elke scene gebruikt ${(styleRef ? 1 : 0) + characterRefs.length} anchor reference${(styleRef ? 1 : 0) + characterRefs.length === 1 ? "" : "s"}.`
            : "geen anchors. Scene 1 wordt text-to-image, scenes 2+ gebruiken scene 1 als reference."}
        </div>
      </section>

      {scenes.some(s => s.imageUrl) && (
        <section className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Resultaten</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {scenes.map((scene, idx) => scene.imageUrl ? (
              <div key={idx} className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="text-slate-300">Scene {idx + 1}</span>
                  <span>{scene.processingMs ? (scene.processingMs / 1000).toFixed(1) + "s" : ""}</span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={scene.imageUrl} alt={`Scene ${idx + 1}`} className="w-full rounded-md border border-white/10" />
                <a
                  href={scene.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-cyan-400 hover:text-cyan-300"
                >
                  Open in nieuwe tab
                </a>
              </div>
            ) : null)}
          </div>
        </section>
      )}
    </div>
  );
}
