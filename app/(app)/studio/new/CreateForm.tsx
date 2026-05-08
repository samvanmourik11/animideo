"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const FORMATS = [
  { value: "16:9", label: "Liggend (16:9) - YouTube, presentaties" },
  { value: "9:16", label: "Staand (9:16) - TikTok, Reels, Shorts" },
] as const;

const SCENE_COUNTS = [3, 4, 5, 6] as const;
const MAX_CHARACTER_REFS = 3;

async function resizeToBlob(file: File, maxDim = 1280): Promise<Blob> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
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
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("Blob conversie mislukt")), "image/jpeg", 0.9);
  });
}

type Preview = { file: File; previewUrl: string };

export default function CreateForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [format, setFormat] = useState<"16:9" | "9:16">("16:9");
  const [sceneCount, setSceneCount] = useState<number>(4);
  const [styleRef, setStyleRef] = useState<Preview | null>(null);
  const [characterRefs, setCharacterRefs] = useState<Preview[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  function handleStyleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStyleRef({ file, previewUrl: URL.createObjectURL(file) });
    e.target.value = "";
  }

  function handleCharacterFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const previews = files.map(f => ({ file: f, previewUrl: URL.createObjectURL(f) }));
    setCharacterRefs(prev => [...prev, ...previews].slice(0, MAX_CHARACTER_REFS));
    e.target.value = "";
  }

  function removeStyle() {
    if (styleRef) URL.revokeObjectURL(styleRef.previewUrl);
    setStyleRef(null);
  }

  function removeCharacter(idx: number) {
    setCharacterRefs(prev => {
      const removed = prev[idx];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!idea.trim()) {
      setError("Beschrijf eerst je idee");
      return;
    }
    setError("");
    setSubmitting(true);
    const supabase = createClient();
    const today = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
    const projectTitle = title.trim() || `Studio - ${today}`;

    try {
      setProgress("Project aanmaken...");
      const { data: project, error: insertErr } = await supabase
        .from("projects")
        .insert({
          user_id:      userId,
          title:        projectTitle,
          language:     "Dutch",
          format,
          visual_style: "Cinematic",
          notes:        idea,
          status:       "Draft",
          mode:         "studio",
        })
        .select()
        .single();
      if (insertErr || !project) throw new Error(insertErr?.message ?? "Kon project niet aanmaken");

      const updates: { style_reference_url?: string; character_reference_urls?: string[] } = {};

      if (styleRef) {
        setProgress("Style reference uploaden...");
        const blob = await resizeToBlob(styleRef.file, 1280);
        const path = `${userId}/${project.id}/style-ref.jpg`;
        const { error: upErr } = await supabase.storage
          .from("scene-assets")
          .upload(path, blob, { contentType: "image/jpeg", upsert: true });
        if (upErr) throw new Error(`Style upload: ${upErr.message}`);
        updates.style_reference_url = supabase.storage.from("scene-assets").getPublicUrl(path).data.publicUrl;
      }

      if (characterRefs.length > 0) {
        const urls: string[] = [];
        for (let i = 0; i < characterRefs.length; i++) {
          setProgress(`Character reference ${i + 1}/${characterRefs.length} uploaden...`);
          const blob = await resizeToBlob(characterRefs[i].file, 1280);
          const path = `${userId}/${project.id}/char-ref-${i}.jpg`;
          const { error: upErr } = await supabase.storage
            .from("scene-assets")
            .upload(path, blob, { contentType: "image/jpeg", upsert: true });
          if (upErr) throw new Error(`Character upload ${i + 1}: ${upErr.message}`);
          urls.push(supabase.storage.from("scene-assets").getPublicUrl(path).data.publicUrl);
        }
        updates.character_reference_urls = urls;
      }

      if (Object.keys(updates).length > 0) {
        setProgress("Project opslaan...");
        const { error: updErr } = await supabase
          .from("projects")
          .update(updates)
          .eq("id", project.id);
        if (updErr) throw new Error(`Project update: ${updErr.message}`);
      }

      // Pass scene count via query so wizard knows the target
      router.push(`/studio/${project.id}?scenes=${sceneCount}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setSubmitting(false);
      setProgress("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Project titel <span className="text-slate-500 font-normal">(optioneel)</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Bijv. Klant - Relatietherapeut intro video"
            className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Idee
          </label>
          <textarea
            value={idea}
            onChange={e => setIdea(e.target.value)}
            rows={5}
            placeholder="Beschrijf het verhaal of de boodschap. Bijv. een korte video voor een relatietherapeut: een man worstelt met zijn relatie, gaat naar de therapeut en loopt naar buiten met nieuwe hoop."
            className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">Formaat</label>
            <select
              value={format}
              onChange={e => setFormat(e.target.value as "16:9" | "9:16")}
              className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              {FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">Aantal scenes</label>
            <select
              value={sceneCount}
              onChange={e => setSceneCount(Number(e.target.value))}
              className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              {SCENE_COUNTS.map(n => <option key={n} value={n}>{n} scenes</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-white mb-1">Anchors</h2>
          <p className="text-xs text-slate-400">
            Optioneel maar sterk aanbevolen. Worden in elke scene meegestuurd voor strakke
            stijl- en character-consistency.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Style reference {styleRef ? "(1)" : "(optioneel)"}
            </label>
            {styleRef ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={styleRef.previewUrl} alt="style" className="w-32 h-32 object-cover rounded-md border border-white/10" />
                <button
                  type="button"
                  onClick={removeStyle}
                  disabled={submitting}
                  className="absolute top-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded"
                >
                  x
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="image/*"
                onChange={handleStyleFile}
                disabled={submitting}
                className="block w-full text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-cyan-600 file:text-white hover:file:bg-cyan-700"
              />
            )}
            <p className="text-xs text-slate-500 mt-1.5">Bepaalt de visuele look (kleurpalet, brushwork, sfeer)</p>
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
                onChange={handleCharacterFiles}
                disabled={submitting}
                className="block w-full text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-cyan-600 file:text-white hover:file:bg-cyan-700 mb-2"
              />
            )}
            {characterRefs.length > 0 && (
              <div className="flex gap-2">
                {characterRefs.map((ref, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ref.previewUrl} alt={`char ${i + 1}`} className="w-20 h-20 object-cover rounded-md border border-white/10" />
                    <button
                      type="button"
                      onClick={() => removeCharacter(i)}
                      disabled={submitting}
                      className="absolute top-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1.5">Wie verschijnt in de video (1 portretfoto is meestal genoeg)</p>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting || !idea.trim()}
        className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition"
      >
        {submitting ? (progress || "Bezig...") : "Naar wizard"}
      </button>

      {error && (
        <div className="bg-red-950/50 border border-red-700/50 text-red-200 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </form>
  );
}
