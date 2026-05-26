"use client";

import { useState } from "react";
import { Character, VisualStyle } from "@/lib/types";
import StylePicker from "@/components/StylePicker";

interface Props {
  characters: Character[];
  onAdd:      (c: Character) => void;
  onRemove:   (id: string) => void;
}

type Mode = "upload" | "generate";

export default function CharacterStudio({ characters, onAdd, onRemove }: Props) {
  const [mode, setMode] = useState<Mode>("upload");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState<VisualStyle>("Realistic");
  const [gender, setGender] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [removeBg, setRemoveBg] = useState(true);
  const [autoDescribe, setAutoDescribe] = useState(true);
  const [transformStyle, setTransformStyle] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  function reset() {
    setName(""); setDescription(""); setGender(""); setAgeRange("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null); setPreviewUrl("");
    setError(""); setProgress("");
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "upload" && !file) { setError("Upload een foto"); return; }
    if (mode === "generate" && !description.trim()) { setError("Beschrijf het karakter"); return; }

    setSubmitting(true);
    setProgress(
      mode === "generate"
        ? "Karakter genereren..."
        : transformStyle
          ? `Foto transformeren naar ${style}...`
          : "Foto verwerken..."
    );

    try {
      const form = new FormData();
      form.append("mode", mode);
      form.append("name", name.trim() || (mode === "upload" ? "Geüpload karakter" : "Gegenereerd karakter"));
      form.append("description", description);
      form.append("style", style);
      form.append("gender", gender);
      form.append("age_range", ageRange);
      form.append("remove_bg", removeBg ? "true" : "false");
      form.append("auto_describe", autoDescribe ? "true" : "false");
      form.append("transform_style", transformStyle ? "true" : "false");
      if (mode === "upload" && file) form.append("file", file);

      const res = await fetch("/api/characters", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.character) {
        setError(data.error ?? "Aanmaken mislukt");
        return;
      }
      onAdd(data.character as Character);
      reset();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
      setProgress("");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Weet je zeker dat je dit karakter wilt verwijderen?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/characters/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Verwijderen mislukt");
        return;
      }
      onRemove(id);
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <div className="flex items-center gap-1 p-1 bg-slate-950/60 border border-white/10 rounded-lg w-fit mb-4">
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={`text-xs font-medium px-3 py-1 rounded-md ${
              mode === "upload" ? "bg-cyan-600 text-white" : "text-slate-300 hover:bg-white/5"
            }`}
          >
            📸 Upload foto
          </button>
          <button
            type="button"
            onClick={() => setMode("generate")}
            className={`text-xs font-medium px-3 py-1 rounded-md ${
              mode === "generate" ? "bg-cyan-600 text-white" : "text-slate-300 hover:bg-white/5"
            }`}
          >
            ✨ Genereer met AI
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Naam</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Bijv. Sarah de coach"
              className="w-full bg-slate-900/60 border border-white/10 rounded-md px-3 py-2 text-sm text-white"
            />
          </div>
          <StylePicker value={style} onChange={setStyle} label="Stijl" size="sm" />

          {mode === "upload" ? (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Foto</label>
              {previewUrl ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="preview" className="w-40 h-40 object-cover rounded-lg border border-white/10" />
                  <button
                    type="button"
                    onClick={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setFile(null); setPreviewUrl(""); }}
                    className="absolute top-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded"
                  >x</button>
                </div>
              ) : (
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                  className="block w-full text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-cyan-600 file:text-white"
                />
              )}
              <p className="text-[11px] text-slate-500 mt-1.5">Portretfoto werkt het beste. Achtergrond wordt automatisch verwijderd.</p>
            </div>
          ) : null}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Beschrijving {mode === "generate" ? "" : <span className="text-slate-500 font-normal">(optioneel — AI vult aan)</span>}
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder={mode === "generate"
                ? "Bijv. een vriendelijke vrouw rond de 35 met kort donker haar, blauwe blouse, zelfverzekerde uitstraling"
                : "Laat leeg om AI te laten beschrijven, of voeg eigen tekst toe"}
              className="w-full bg-slate-900/60 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-slate-500"
              required={mode === "generate"}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Geslacht (optioneel)</label>
              <select
                value={gender}
                onChange={e => setGender(e.target.value)}
                className="w-full bg-slate-900/60 border border-white/10 rounded-md px-3 py-2 text-sm text-white"
              >
                <option value="">Onbepaald</option>
                <option value="man">Man</option>
                <option value="vrouw">Vrouw</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Leeftijd (optioneel)</label>
              <select
                value={ageRange}
                onChange={e => setAgeRange(e.target.value)}
                className="w-full bg-slate-900/60 border border-white/10 rounded-md px-3 py-2 text-sm text-white"
              >
                <option value="">Onbepaald</option>
                <option value="20-30">20-30</option>
                <option value="30-40">30-40</option>
                <option value="40-50">40-50</option>
                <option value="50-60">50-60</option>
                <option value="60+">60+</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            {mode === "upload" && (
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer" title="Een gestyleerde versie van je foto met dezelfde persoon, in de gekozen stijl">
                <input type="checkbox" checked={transformStyle} onChange={e => setTransformStyle(e.target.checked)} />
                Transformeer naar {style} <span className="text-slate-500">(+1 credit)</span>
              </label>
            )}
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={removeBg} onChange={e => setRemoveBg(e.target.checked)} />
              Achtergrond verwijderen
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={autoDescribe} onChange={e => setAutoDescribe(e.target.checked)} />
              AI-beschrijving toevoegen
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-medium py-2.5 rounded-lg"
          >
            {submitting ? (progress || "Bezig...") : mode === "upload" ? "Karakter opslaan" : "Genereer karakter"}
          </button>

          {error && (
            <div className="bg-red-950/50 border border-red-700/50 text-red-200 text-sm rounded-lg px-3 py-2">{error}</div>
          )}
        </form>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Mijn karakters ({characters.length})</h2>
        {characters.length === 0 ? (
          <p className="text-xs text-slate-500">Nog geen karakters. Maak er hierboven een aan.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {characters.map(c => (
              <div key={c.id} className="bg-slate-950/60 border border-white/10 rounded-lg overflow-hidden">
                <div className="aspect-square bg-slate-900 relative">
                  {c.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" />
                  )}
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    className="absolute top-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded disabled:opacity-50"
                    title="Verwijderen"
                  >
                    {deletingId === c.id ? "..." : "×"}
                  </button>
                </div>
                <div className="p-2">
                  <p className="text-xs font-medium text-white truncate">{c.name}</p>
                  <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">
                    {[c.gender, c.age_range, c.style].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
