"use client";

import { STORY_STYLE_PRESETS, stylePreviewUrl } from "@/lib/infographics/story-style";

// Tekenstijl kiezen op BEELD in plaats van op naam.
//
// "Papercut" en "Soft 3D" zeggen niets tot je ze ziet, en de keuze bepaalt hoe de
// hele video eruit komt te zien. De vier voorbeelden tonen daarom dezelfde scène
// met dezelfde seed: wat je vergelijkt is puur het stijlverschil, niet een ander
// plaatje. Ze staan als vaste bestanden in public/style-previews, dus bekijken
// kost niets — net als de voice-previews.
//
// Gedeeld tussen de dialoogmodus en de storytelling-tool, zodat een stijl er in
// beide op dezelfde manier bij staat.

export default function StylePicker({
  value,
  onChange,
  disabled = false,
  /** Toelichting onder de kaartjes, bijv. waarom de keuze vastligt. */
  hint,
}: {
  value: string;
  onChange: (styleId: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {STORY_STYLE_PRESETS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            disabled={disabled}
            title={disabled ? hint : `${s.name} — ${s.tagline}`}
            className={`rounded-lg border overflow-hidden text-left transition disabled:opacity-50 disabled:cursor-not-allowed ${
              s.id === value
                ? "border-orange-400 ring-1 ring-orange-400/40"
                : "border-white/10 hover:border-white/30"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={stylePreviewUrl(s.id)}
              alt={`Voorbeeld van de stijl ${s.name}`}
              className="w-full aspect-video object-cover bg-slate-800"
              loading="lazy"
            />
            <span className={`block px-2 py-1.5 ${s.id === value ? "bg-orange-500/10" : "bg-slate-900/40"}`}>
              <span className="block text-xs text-white font-medium">{s.name}</span>
              <span className="block text-[10px] text-slate-500 leading-tight">{s.tagline}</span>
            </span>
          </button>
        ))}
      </div>
      {hint && <p className="text-[10px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}
