"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandKit, BrandReferenceImage } from "@/lib/types";

const LANGUAGES = ["Dutch", "English", "German", "French", "Spanish"];

type EditorState = Omit<BrandKit, "id" | "user_id" | "created_at" | "updated_at">;

function emptyKit(): EditorState {
  return {
    name: "",
    description: null,
    tone_of_voice: null,
    brand_values: [],
    colors: {},
    fonts: {},
    environment: null,
    do_nots: null,
    default_language: "Dutch",
    default_format: "16:9",
    logo_url: null,
    reference_images: [],
  };
}

async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1024;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height / width) * MAX); width = MAX; }
        else { width = Math.round((width / height) * MAX); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve({ base64: canvas.toDataURL("image/jpeg", 0.88).split(",")[1], mimeType: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Laden mislukt")); };
    img.src = url;
  });
}

interface Props {
  initial?: BrandKit;
  userId: string;
}

export default function BrandKitEditor({ initial, userId }: Props) {
  const router = useRouter();
  const [kit, setKit] = useState<EditorState>(initial ? {
    name: initial.name,
    description: initial.description,
    tone_of_voice: initial.tone_of_voice,
    brand_values: initial.brand_values ?? [],
    colors: initial.colors ?? {},
    fonts: initial.fonts ?? {},
    environment: initial.environment,
    do_nots: initial.do_nots,
    default_language: initial.default_language,
    default_format: initial.default_format,
    logo_url: initial.logo_url,
    reference_images: initial.reference_images ?? [],
  } : emptyKit());

  const [refPreviews, setRefPreviews] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [valueInput, setValueInput] = useState("");
  const refInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setKit((prev) => ({ ...prev, [key]: value }));
  }

  function addRefImages(files: FileList | null) {
    if (!files) return;
    const remaining = 3 - refPreviews.length;
    const toAdd = Array.from(files).filter(f => f.type.startsWith("image/")).slice(0, remaining);
    const newPreviews = toAdd.map(file => ({ file, previewUrl: URL.createObjectURL(file) }));
    setRefPreviews(prev => [...prev, ...newPreviews]);
  }

  function removeRefImage(index: number) {
    URL.revokeObjectURL(refPreviews[index].previewUrl);
    setRefPreviews(prev => prev.filter((_, i) => i !== index));
  }

  async function handleAnalyze() {
    const sources = refPreviews.length > 0 ? refPreviews.map(p => p.file) : [];
    if (sources.length === 0) return;
    setAnalyzing(true);
    setAnalyzeError("");
    try {
      const images = await Promise.all(sources.map(fileToBase64));
      const res = await fetch("/api/analyze-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analyse mislukt");
      const a = data.analysis;
      setKit(prev => ({
        ...prev,
        description:    a.description    ?? prev.description,
        tone_of_voice:  a.tone_of_voice  ?? prev.tone_of_voice,
        brand_values:   a.brand_values?.length ? a.brand_values : prev.brand_values,
        colors:         a.colors         ?? prev.colors,
        fonts:          a.fonts          ?? prev.fonts,
        environment:    a.environment    ?? prev.environment,
        do_nots:        a.do_nots        ?? prev.do_nots,
      }));
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Analyse mislukt");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${userId}/brand-kits/${Date.now()}-logo.${ext}`;
    await supabase.storage.from("scene-assets").upload(path, file, { upsert: true });
    const { data } = supabase.storage.from("scene-assets").getPublicUrl(path);
    set("logo_url", data.publicUrl);
  }

  async function handleSave() {
    if (!kit.name.trim()) { setSaveError("Geef de huisstijl een naam."); return; }
    setSaving(true);
    setSaveError("");

    try {
      // Upload reference images if any local previews
      const uploadedRefs: BrandReferenceImage[] = [...(kit.reference_images ?? [])];
      const supabase = createClient();
      for (const preview of refPreviews) {
        const ext = preview.file.name.split(".").pop();
        const path = `${userId}/brand-kits/${Date.now()}-ref.${ext}`;
        await supabase.storage.from("scene-assets").upload(path, preview.file, { upsert: true });
        const { data } = supabase.storage.from("scene-assets").getPublicUrl(path);
        uploadedRefs.push({ url: data.publicUrl, description: "" });
      }

      const payload = { ...kit, reference_images: uploadedRefs };

      if (initial?.id) {
        await fetch(`/api/brand-kits/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/brand-kits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      router.push("/brand");
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">

      {/* Naam */}
      <div>
        <label className="label">Naam huisstijl</label>
        <input
          className="input"
          placeholder="bijv. Hoofdhuisstijl, Klant A, Zomercampagne…"
          value={kit.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>

      {/* Referentieafbeeldingen + Analyseer */}
      <div className="card space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">Sfeerbeelden / Website screenshots</h3>
          <p className="text-xs text-slate-500">
            Upload 1-3 afbeeldingen. GPT-4o analyseert kleuren, stijl en tone of voice automatisch.
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          {refPreviews.map((p, i) => (
            <div key={i} className="relative w-24 h-16 rounded-xl overflow-hidden bg-black/40 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removeRefImage(i)}
                className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >×</button>
            </div>
          ))}
          {refPreviews.length < 3 && (
            <button
              onClick={() => refInputRef.current?.click()}
              className="w-24 h-16 rounded-xl border-2 border-dashed border-white/10 hover:border-blue-500/40 flex items-center justify-center text-slate-600 hover:text-slate-400 transition-colors text-2xl"
            >+</button>
          )}
          <input ref={refInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addRefImages(e.target.files)} />
        </div>

        {analyzeError && <p className="text-xs text-red-400">{analyzeError}</p>}

        <button
          onClick={handleAnalyze}
          disabled={analyzing || refPreviews.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors text-sm font-semibold disabled:opacity-40"
        >
          {analyzing ? (
            <><div className="w-3.5 h-3.5 border border-blue-400 border-t-transparent rounded-full animate-spin" />Analyseren…</>
          ) : (
            <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>Analyseer met AI</>
          )}
        </button>
      </div>

      {/* Stijlomschrijving */}
      <div>
        <label className="label">Stijlomschrijving</label>
        <textarea
          className="input resize-none"
          rows={3}
          placeholder="Omschrijf de visuele stijl van het merk…"
          value={kit.description ?? ""}
          onChange={(e) => set("description", e.target.value || null)}
        />
      </div>

      {/* Kleuren */}
      <div>
        <label className="label mb-3 block">Kleurenpalet</label>
        <div className="grid grid-cols-2 gap-3">
          {(["primary", "secondary", "accent", "background"] as const).map((key) => (
            <div key={key}>
              <label className="text-xs text-slate-500 capitalize mb-1 block">{key === "primary" ? "Primair" : key === "secondary" ? "Secundair" : key === "accent" ? "Accent" : "Achtergrond"}</label>
              <input
                className="input text-sm"
                placeholder={`bijv. donkerblauw (#1a3c6e)`}
                value={kit.colors?.[key] ?? ""}
                onChange={(e) => set("colors", { ...kit.colors, [key]: e.target.value || undefined })}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Lettertypes */}
      <div>
        <label className="label mb-3 block">Lettertypes</label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Primair lettertype</label>
            <input className="input text-sm" placeholder="bijv. Montserrat" value={kit.fonts?.primary ?? ""} onChange={(e) => set("fonts", { ...kit.fonts, primary: e.target.value || undefined })} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Secundair lettertype</label>
            <input className="input text-sm" placeholder="bijv. Open Sans" value={kit.fonts?.secondary ?? ""} onChange={(e) => set("fonts", { ...kit.fonts, secondary: e.target.value || undefined })} />
          </div>
        </div>
      </div>

      {/* Tone of voice */}
      <div>
        <label className="label">Tone of voice</label>
        <input
          className="input"
          placeholder="bijv. warm en informeel, professioneel en zakelijk"
          value={kit.tone_of_voice ?? ""}
          onChange={(e) => set("tone_of_voice", e.target.value || null)}
        />
      </div>

      {/* Merkwaarden */}
      <div>
        <label className="label">Merkwaarden</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {kit.brand_values.map((v, i) => (
            <span key={i} className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs px-2.5 py-1 rounded-full">
              {v}
              <button onClick={() => set("brand_values", kit.brand_values.filter((_, j) => j !== i))} className="hover:text-white">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1 text-sm"
            placeholder="Voeg waarde toe en druk Enter"
            value={valueInput}
            onChange={(e) => setValueInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valueInput.trim()) {
                set("brand_values", [...kit.brand_values, valueInput.trim()]);
                setValueInput("");
              }
            }}
          />
          <button
            onClick={() => { if (valueInput.trim()) { set("brand_values", [...kit.brand_values, valueInput.trim()]); setValueInput(""); } }}
            className="btn-secondary text-sm px-3"
          >+</button>
        </div>
      </div>

      {/* Omgeving */}
      <div>
        <label className="label">Vaste omgeving / setting</label>
        <input
          className="input"
          placeholder="bijv. modern kantoor, buitenlucht, industriële ruimte"
          value={kit.environment ?? ""}
          onChange={(e) => set("environment", e.target.value || null)}
        />
      </div>

      {/* Do-nots */}
      <div>
        <label className="label">Vermijden</label>
        <textarea
          className="input resize-none"
          rows={2}
          placeholder="bijv. geen concurrenten, geen donkere thema's, geen mensen in pak"
          value={kit.do_nots ?? ""}
          onChange={(e) => set("do_nots", e.target.value || null)}
        />
      </div>

      {/* Logo */}
      <div>
        <label className="label">Logo</label>
        <div className="flex items-center gap-4">
          {kit.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={kit.logo_url} alt="Logo" className="h-12 rounded-lg object-contain bg-white/5 p-1" />
          )}
          <button onClick={() => logoInputRef.current?.click()} className="btn-secondary text-sm">
            {kit.logo_url ? "Logo wijzigen" : "Logo uploaden"}
          </button>
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
        </div>
      </div>

      {/* Standaard instellingen */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Standaardtaal</label>
          <select className="input" value={kit.default_language} onChange={(e) => set("default_language", e.target.value)}>
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Standaard formaat</label>
          <select className="input" value={kit.default_format} onChange={(e) => set("default_format", e.target.value)}>
            <option value="16:9">16:9 — Landscape</option>
            <option value="9:16">9:16 — Portrait</option>
          </select>
        </div>
      </div>

      {saveError && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{saveError}</p>}

      <div className="flex gap-3 pb-8">
        <button onClick={() => router.push("/brand")} className="btn-secondary">Annuleren</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary px-8">
          {saving ? "Opslaan…" : "Huisstijl opslaan"}
        </button>
      </div>
    </div>
  );
}
