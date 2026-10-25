"use client";

import { CREDIT_COSTS, creditLabel } from "@/lib/credit-costs";
import { useState } from "react";
import { Character, VisualStyle } from "@/lib/types";
import StylePicker from "@/components/style/StylePicker";
import { DEFAULT_STORY_STYLE, stijlenVoor, STORY_STYLE_PRESETS } from "@/lib/infographics/story-style";
import { compressImage } from "@/lib/compress-image";

interface Props {
  characters: Character[];
  onAdd:      (c: Character) => void;
  onRemove:   (id: string) => void;
  onRename:   (c: Character) => void;
  /** Mag dit account de realistische stijl kiezen? (zie lib/studio/access.ts) */
  magRealistisch?: boolean;
}

type Mode = "upload" | "generate";

/** De naam van een stijl, of de opgeslagen waarde zelf bij een personage uit het oude systeem. */
function stijlNaam(id: string): string {
  return STORY_STYLE_PRESETS.find((p) => p.id === id)?.name ?? id;
}

export default function CharacterStudio({ characters, onAdd, onRemove, onRename, magRealistisch = false }: Props) {
  const [mode, setMode] = useState<Mode>("upload");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // Dezelfde stijlen als in de storytelling- en dialoogtool. Het oude lijstje
  // ("Realistic Animation", "Kurzgezagt") hoorde bij een ander systeem: een
  // personage daaruit paste nooit bij de video waarin het werd gebruikt.
  const [style, setStyle] = useState<string>(DEFAULT_STORY_STYLE);
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
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [renameError, setRenameError] = useState("");

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
          ? `Foto transformeren naar ${stijlNaam(style)}...`
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
      if (mode === "upload" && file) {
        // Verklein/comprimeer de foto zodat de upload onder de serverlimiet blijft.
        const compressed = await compressImage(file);
        form.append("file", compressed);
      }

      const res = await fetch("/api/characters", { method: "POST", body: form });

      // De server geeft niet altijd JSON terug. Een te grote upload wordt door
      // het platform met platte tekst ("Request Entity Too Large") afgewezen,
      // dus alleen JSON parsen als de response dat ook echt is.
      const isJson = res.headers.get("content-type")?.includes("application/json");
      const data = isJson ? await res.json() : null;
      if (!res.ok || !data?.character) {
        if (res.status === 413) {
          setError("De foto is te groot. Kies een kleinere foto en probeer opnieuw.");
        } else {
          setError(data?.error ?? "Aanmaken mislukt. Probeer het opnieuw.");
        }
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

  function startRename(c: Character) {
    setEditingId(c.id);
    setEditName(c.name);
    setRenameError("");
  }

  function cancelRename() {
    setEditingId("");
    setEditName("");
    setRenameError("");
  }

  async function saveRename(id: string) {
    const trimmed = editName.trim();
    if (!trimmed) { setRenameError("Naam mag niet leeg zijn"); return; }
    // Niets veranderd? Dan geen request — scheelt een rondje en houdt de
    // sortering op updated_at intact.
    const current = characters.find(c => c.id === id);
    if (current && current.name === trimmed) { cancelRename(); return; }

    setSavingName(true);
    setRenameError("");
    try {
      const res = await fetch(`/api/characters/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: trimmed }),
      });
      const isJson = res.headers.get("content-type")?.includes("application/json");
      const data = isJson ? await res.json() : null;
      if (!res.ok || !data?.character) {
        setRenameError(data?.error ?? "Hernoemen mislukt");
        return;
      }
      onRename(data.character as Character);
      cancelRename();
    } catch (err: unknown) {
      setRenameError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingName(false);
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
      <div className="bg-paneel-2/60 border border-rand rounded-xl p-5">
        <div className="flex items-center gap-1 p-1 bg-paneel border border-rand rounded-lg w-fit mb-4">
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={`text-xs font-medium px-3 py-1 rounded-md ${
              mode === "upload" ? "bg-blue-600 text-white" : "text-tekst-2 hover:bg-paneel-2/60"
            }`}
          >
            📸 Upload foto
          </button>
          <button
            type="button"
            onClick={() => setMode("generate")}
            className={`text-xs font-medium px-3 py-1 rounded-md ${
              mode === "generate" ? "bg-blue-600 text-white" : "text-tekst-2 hover:bg-paneel-2/60"
            }`}
          >
            ✨ Genereer met AI
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-tekst-2 mb-1.5">Naam</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Bijv. Sarah de coach"
              className="w-full bg-paneel border border-rand rounded-md px-3 py-2 text-sm text-tekst"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-tekst-2 mb-1.5">Stijl</label>
            <StylePicker value={style} onChange={setStyle} presets={stijlenVoor(magRealistisch)} />
            <p className="text-[10px] text-tekst-3 mt-1">
              Kies dezelfde stijl als de video's waarin dit personage meespeelt.
            </p>
          </div>

          {mode === "upload" ? (
            <div>
              <label className="block text-xs font-medium text-tekst-2 mb-1.5">Foto</label>
              {previewUrl ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="preview" className="w-40 h-40 object-cover rounded-lg border border-rand" />
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
                  className="block w-full text-sm text-tekst-2 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-blue-600 file:text-white"
                />
              )}
              <p className="text-[11px] text-tekst-3 mt-1.5">Portretfoto werkt het beste. Achtergrond wordt automatisch verwijderd.</p>
            </div>
          ) : null}

          <div>
            <label className="block text-xs font-medium text-tekst-2 mb-1.5">
              Beschrijving {mode === "generate" ? "" : <span className="text-tekst-3 font-normal">(optioneel — AI vult aan)</span>}
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder={mode === "generate"
                ? "Bijv. een vriendelijke vrouw rond de 35 met kort donker haar, blauwe blouse, zelfverzekerde uitstraling"
                : "Laat leeg om AI te laten beschrijven, of voeg eigen tekst toe"}
              className="w-full bg-paneel border border-rand rounded-md px-3 py-2 text-sm text-tekst placeholder:text-tekst-3"
              required={mode === "generate"}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-tekst-2 mb-1.5">Geslacht (optioneel)</label>
              <select
                value={gender}
                onChange={e => setGender(e.target.value)}
                className="w-full bg-paneel border border-rand rounded-md px-3 py-2 text-sm text-tekst"
              >
                <option value="">Onbepaald</option>
                <option value="man">Man</option>
                <option value="vrouw">Vrouw</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-tekst-2 mb-1.5">Leeftijd (optioneel)</label>
              <select
                value={ageRange}
                onChange={e => setAgeRange(e.target.value)}
                className="w-full bg-paneel border border-rand rounded-md px-3 py-2 text-sm text-tekst"
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
              <label className="flex items-center gap-2 text-xs text-tekst-2 cursor-pointer" title="Een gestyleerde versie van je foto met dezelfde persoon, in de gekozen stijl">
                <input type="checkbox" checked={transformStyle} onChange={e => setTransformStyle(e.target.checked)} />
                Transformeer naar {stijlNaam(style)} <span className="text-tekst-3">(+{creditLabel(CREDIT_COSTS.IMAGE_GENERATION)})</span>
              </label>
            )}
            <label className="flex items-center gap-2 text-xs text-tekst-2 cursor-pointer">
              <input type="checkbox" checked={removeBg} onChange={e => setRemoveBg(e.target.checked)} />
              Achtergrond verwijderen
            </label>
            <label className="flex items-center gap-2 text-xs text-tekst-2 cursor-pointer">
              <input type="checkbox" checked={autoDescribe} onChange={e => setAutoDescribe(e.target.checked)} />
              AI-beschrijving toevoegen
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-rand text-white font-medium py-2.5 rounded-lg"
          >
            {submitting ? (progress || "Bezig...") : mode === "upload" ? "Karakter opslaan" : "Genereer karakter"}
          </button>

          {error && (
            <div className="bg-red-950/50 border border-red-700/50 text-red-600 dark:text-red-200 text-sm rounded-lg px-3 py-2">{error}</div>
          )}
        </form>
      </div>

      <div className="bg-paneel-2/60 border border-rand rounded-xl p-5">
        <h2 className="text-sm font-semibold text-tekst mb-3">Mijn karakters ({characters.length})</h2>
        {characters.length === 0 ? (
          <p className="text-xs text-tekst-3">Nog geen karakters. Maak er hierboven een aan.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {characters.map(c => (
              <div key={c.id} className="bg-paneel border border-rand rounded-lg overflow-hidden">
                <div className="aspect-square bg-paneel relative">
                  {c.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" />
                  )}
                  <div className="absolute top-1 right-1 flex gap-1">
                    <button
                      onClick={() => startRename(c)}
                      className="bg-black/70 text-white text-xs px-1.5 py-0.5 rounded"
                      title="Naam wijzigen"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      className="bg-black/70 text-white text-xs px-1.5 py-0.5 rounded disabled:opacity-50"
                      title="Verwijderen"
                    >
                      {deletingId === c.id ? "..." : "×"}
                    </button>
                  </div>
                </div>
                <div className="p-2">
                  {editingId === c.id ? (
                    <div>
                      <input
                        type="text"
                        value={editName}
                        autoFocus
                        maxLength={80}
                        disabled={savingName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") { e.preventDefault(); saveRename(c.id); }
                          if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
                        }}
                        className="w-full bg-paneel border border-blue-500/60 rounded px-1.5 py-1 text-xs text-tekst disabled:opacity-60"
                      />
                      <div className="flex gap-1 mt-1">
                        <button
                          onClick={() => saveRename(c.id)}
                          disabled={savingName}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-rand text-white text-[10px] font-medium py-1 rounded"
                        >
                          {savingName ? "Opslaan..." : "Opslaan"}
                        </button>
                        <button
                          onClick={cancelRename}
                          disabled={savingName}
                          className="flex-1 bg-paneel-2/60 hover:bg-paneel-2 text-tekst-2 text-[10px] py-1 rounded disabled:opacity-50"
                        >
                          Annuleer
                        </button>
                      </div>
                      {renameError && (
                        <p className="text-[10px] text-red-600 dark:text-red-300 mt-1">{renameError}</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <p
                        onClick={() => startRename(c)}
                        title="Klik om de naam te wijzigen"
                        className="text-xs font-medium text-tekst truncate cursor-pointer hover:text-blue-600 dark:hover:text-blue-300"
                      >
                        {c.name}
                      </p>
                      <p className="text-[10px] text-tekst-3 line-clamp-2 mt-0.5">
                        {[c.gender, c.age_range, c.style ? stijlNaam(c.style) : ""].filter(Boolean).join(" · ")}
                      </p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
