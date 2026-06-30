"use client";

import { Character } from "@/lib/types";

// Gedeelde personage-kiezer. Volledige variant (met portret + beschrijving) voor
// de create-stap en het cast-paneel; compacte variant voor per-scène afwijken.
export default function CharacterPicker({
  label, value, characters, excludeId, onChange, placeholder, compact = false, disabled = false,
}: {
  label: string;
  value: string;            // "" = AI / geen
  characters: Character[];
  excludeId?: string;
  onChange: (id: string) => void;
  placeholder: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const available = characters.filter(c => !excludeId || c.id !== excludeId);
  const selected = characters.find(c => c.id === value);

  if (compact) {
    return (
      <label className="inline-flex items-center gap-1.5 text-[10px] text-slate-300" title={label}>
        <span className="w-5 h-5 rounded border border-white/10 bg-slate-950 overflow-hidden flex items-center justify-center shrink-0">
          {selected?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px]">🎭</span>
          )}
        </span>
        <span className="text-slate-400">{label}:</span>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="bg-slate-950 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white disabled:opacity-50"
        >
          <option value="">{placeholder}</option>
          {available.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-200 mb-2">{label}</label>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-md border border-white/10 bg-slate-950 overflow-hidden flex items-center justify-center shrink-0">
          {selected?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.image_url} alt={selected.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl">🎭</span>
          )}
        </div>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="flex-1 bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          <option value="">{placeholder}</option>
          {available.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}{[c.gender, c.age_range].filter(Boolean).length > 0 ? ` (${[c.gender, c.age_range].filter(Boolean).join(", ")})` : ""}
            </option>
          ))}
        </select>
      </div>
      {selected?.description && (
        <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-2">{selected.description}</p>
      )}
    </div>
  );
}
