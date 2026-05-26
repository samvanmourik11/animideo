"use client";

import { STYLE_PACKS, styleCoverUrl } from "@/lib/style-packs";
import type { VisualStyle } from "@/lib/types";

// Visuele stijl-picker met thumbnail per pack. Vervangt de tekst-dropdowns
// in alle wizards. Een klik kiest een pack; cover-beeld komt rechtstreeks
// uit de style-refs bucket (zelfde plek waar Nano Banana Pro ze ophaalt).

export default function StylePicker({
  value,
  onChange,
  label = "Stijl",
  size = "md",
}: {
  value: VisualStyle | null;
  onChange: (v: VisualStyle) => void;
  label?: string | null;
  size?: "sm" | "md";
}) {
  const thumbCls = size === "sm" ? "aspect-square" : "aspect-video";
  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-slate-300 mb-2">{label}</label>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {STYLE_PACKS.map((pack) => {
          const selected = value === pack.id;
          const cover = pack.refIndices.length > 0 ? styleCoverUrl(pack.id) : null;
          return (
            <button
              key={pack.id}
              type="button"
              onClick={() => onChange(pack.id)}
              className={`group relative rounded-xl overflow-hidden border-2 text-left transition-all ${
                selected
                  ? "border-blue-400 ring-2 ring-blue-400/30"
                  : "border-white/10 hover:border-white/30"
              }`}
              title={pack.description}
            >
              <div className={`${thumbCls} bg-slate-900 relative`}>
                {cover ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={cover}
                    alt={pack.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs px-2 text-center">
                    Geen voorbeelden
                  </div>
                )}
                {selected && (
                  <span className="absolute top-1.5 right-1.5 bg-blue-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    ✓
                  </span>
                )}
              </div>
              <div className="px-2 py-1.5 bg-[#0c1428]">
                <p className="text-xs font-medium text-white truncate">{pack.name}</p>
              </div>
            </button>
          );
        })}
      </div>
      {value && (
        <p className="mt-2 text-[11px] text-slate-500">
          {STYLE_PACKS.find((p) => p.id === value)?.description}
        </p>
      )}
    </div>
  );
}
