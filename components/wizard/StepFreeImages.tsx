"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Project, Scene } from "@/lib/types";

interface LocalScene {
  id: string;
  number: number;
  file: File;
  previewUrl: string;
  duration: number;
  motionPrompt: string;
  analyzing: boolean;
}

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onNext: () => void;
}

const MAX_SCENES = 10;

function generateSceneId() {
  return `scene-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Resize a File to max 768px longest side, convert to JPEG base64 for GPT-4o Vision */
async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 768;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height / width) * MAX); width = MAX; }
        else { width = Math.round((width / height) * MAX); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      const base64 = canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
      resolve({ base64, mimeType: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Afbeelding laden mislukt")); };
    img.src = url;
  });
}

export default function StepFreeImages({ project, onUpdate, onNext }: Props) {
  const [title, setTitle] = useState(project.title);
  const [scenes, setScenes] = useState<LocalScene[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const dragItemRef = useRef<number | null>(null);
  const dragOverItemRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const remaining = MAX_SCENES - scenes.length;
    if (remaining <= 0) return;
    const toAdd = arr.slice(0, remaining);
    const newScenes: LocalScene[] = toAdd.map((file, i) => ({
      id: generateSceneId(),
      number: scenes.length + i + 1,
      file,
      previewUrl: URL.createObjectURL(file),
      duration: 5,
      motionPrompt: "",
      analyzing: false,
    }));
    setScenes((prev) => [...prev, ...newScenes].map((s, i) => ({ ...s, number: i + 1 })));
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }

  function removeScene(index: number) {
    URL.revokeObjectURL(scenes[index].previewUrl);
    setScenes((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, number: i + 1 })));
  }

  function updateDuration(index: number, value: number) {
    setScenes((prev) => prev.map((s, i) => i === index ? { ...s, duration: value } : s));
  }

  function updateMotionPrompt(index: number, value: string) {
    setScenes((prev) => prev.map((s, i) => i === index ? { ...s, motionPrompt: value } : s));
  }

  async function analyzeScene(index: number) {
    const scene = scenes[index];
    if (!scene || scene.analyzing) return;
    setScenes((prev) => prev.map((s, i) => i === index ? { ...s, analyzing: true } : s));
    try {
      const { base64, mimeType } = await fileToBase64(scene.file);
      const res = await fetch("/api/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analyse mislukt");
      setScenes((prev) => prev.map((s, i) => i === index ? { ...s, motionPrompt: data.motionPrompt, analyzing: false } : s));
    } catch (err) {
      setScenes((prev) => prev.map((s, i) => i === index ? { ...s, analyzing: false } : s));
    }
  }

  // Drag-to-reorder
  function onDragStart(index: number) {
    dragItemRef.current = index;
  }
  function onDragEnter(index: number) {
    dragOverItemRef.current = index;
  }
  function onDragEnd() {
    const from = dragItemRef.current;
    const to = dragOverItemRef.current;
    if (from === null || to === null || from === to) { dragItemRef.current = null; dragOverItemRef.current = null; return; }
    const arr = [...scenes];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    setScenes(arr.map((s, i) => ({ ...s, number: i + 1 })));
    dragItemRef.current = null;
    dragOverItemRef.current = null;
  }

  async function handleNext() {
    if (scenes.length === 0) return;
    setUploading(true);
    setError("");
    setUploadProgress(0);

    try {
      const supabase = createClient();
      const builtScenes: Scene[] = [];

      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i];
        const ext = s.file.name.split(".").pop() ?? "jpg";
        const path = `${project.user_id}/${project.id}/${s.id}-image.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from("scene-assets")
          .upload(path, s.file, { contentType: s.file.type, upsert: true });

        if (uploadErr) throw new Error(`Upload scene ${s.number} mislukt: ${uploadErr.message}`);

        const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(path);

        builtScenes.push({
          id: s.id,
          number: s.number,
          duration: s.duration,
          voiceover_text: "",
          image_prompt: "",
          motion_prompt: s.motionPrompt,
          image_url: urlData.publicUrl,
          video_url: null,
          canvas_json: null,
        });

        setUploadProgress(Math.round(((i + 1) / scenes.length) * 85));
      }

      // Save title + scenes + status to DB
      await fetch("/api/save-project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          title,
          scenes: builtScenes,
          status: "ImagesReady",
        }),
      });

      setUploadProgress(100);
      onUpdate({ title, scenes: builtScenes, status: "ImagesReady" });
      onNext();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Er ging iets mis bij uploaden");
    } finally {
      setUploading(false);
    }
  }

  const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);
  const canContinue = scenes.length > 0 && !uploading;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Title */}
      <div className="mb-6">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
          Projectnaam
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-[#0c1428] border border-white/10 rounded-xl px-4 py-2.5 text-white text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          placeholder="Naam van je project…"
        />
      </div>

      {/* Drop zone */}
      {scenes.length < MAX_SCENES && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center py-10 cursor-pointer transition-colors
            ${dragOver ? "border-blue-400 bg-blue-500/10" : "border-white/10 hover:border-blue-500/40 hover:bg-white/[0.02]"}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-300">
            Sleep afbeeldingen hierheen of klik om te kiezen
          </p>
          <p className="text-xs text-slate-600 mt-1">
            JPG, PNG of WebP · max {MAX_SCENES} scenes ({MAX_SCENES - scenes.length} resterend)
          </p>
        </div>
      )}

      {/* Scene list */}
      {scenes.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-slate-400">
              <span className="font-semibold text-white">{scenes.length}</span> scene{scenes.length !== 1 ? "s" : ""} ·{" "}
              <span className="font-semibold text-white">{totalDuration}s</span> totaal
            </p>
            <p className="text-xs text-slate-600">Sleep om te herordenen</p>
          </div>

          <div className="space-y-3 mb-6">
            {scenes.map((scene, i) => (
              <div
                key={scene.id}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragEnter={() => onDragEnter(i)}
                onDragEnd={onDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-4 flex gap-4 cursor-grab active:cursor-grabbing active:border-blue-500/40 transition-colors"
              >
                {/* Thumbnail */}
                <div className="w-24 h-16 rounded-xl overflow-hidden flex-none bg-black/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={scene.previewUrl} alt="" className="w-full h-full object-cover" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-blue-400">#{scene.number}</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={scene.duration}
                        onChange={(e) => updateDuration(i, parseInt(e.target.value) || 5)}
                        className="w-14 bg-[#060d1f] border border-white/10 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                      <span className="text-xs text-slate-500">sec</span>
                    </div>
                    <div className="flex-1" />
                    <button
                      onClick={() => removeScene(i)}
                      className="text-slate-600 hover:text-red-400 transition-colors text-lg leading-none"
                      title="Verwijderen"
                    >
                      ×
                    </button>
                  </div>

                  {/* Motion prompt */}
                  <div className="flex gap-2 items-start">
                    <textarea
                      rows={2}
                      placeholder="Bewegingsinstructie voor Runway… (klik Analyseer)"
                      value={scene.motionPrompt}
                      onChange={(e) => updateMotionPrompt(i, e.target.value)}
                      className="flex-1 bg-[#060d1f] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                    />
                    <button
                      onClick={() => analyzeScene(i)}
                      disabled={scene.analyzing}
                      className="flex-none flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors text-xs font-semibold disabled:opacity-50"
                      title="GPT-4o analyseert de afbeelding"
                    >
                      {scene.analyzing ? (
                        <>
                          <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                          Analyseren…
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          Analyseer
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Afbeeldingen uploaden…</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all shadow-[0_0_8px_rgba(59,130,246,0.6)]"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-slate-600">
          {scenes.length === 0 ? "Upload minimaal 1 afbeelding om door te gaan." : ""}
        </p>
        <button
          onClick={handleNext}
          disabled={!canContinue}
          className="btn-primary px-8 py-3 disabled:opacity-40"
        >
          {uploading ? "Uploaden…" : "Doorgaan naar Beweging →"}
        </button>
      </div>
    </div>
  );
}
