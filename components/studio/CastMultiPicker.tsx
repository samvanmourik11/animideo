"use client";

import { Character } from "@/lib/types";

export const MAX_GEKOZEN_PERSONAGES = 10;

// Meerdere personages uit de bibliotheek kiezen voor één project. Volgorde telt:
// de eerste is de hoofdpersoon. Leeg = AI verzint zelf passende personen.
export default function CastMultiPicker({
  value, characters, onChange,
}: {
  value: string[];
  characters: Character[];
  onChange: (ids: string[]) => void;
}) {
  const gekozen = value
    .map(id => characters.find(c => c.id === id))
    .filter((c): c is Character => !!c);
  const beschikbaar = characters.filter(c => !value.includes(c.id));
  const vol = value.length >= MAX_GEKOZEN_PERSONAGES;

  const kenmerken = (c: Character) => [c.gender, c.age_range].filter(Boolean).join(", ");

  return (
    <div className="space-y-3">
      {gekozen.length > 0 ? (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {gekozen.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-900/60 p-2">
              <div className="w-12 h-12 rounded-md border border-white/10 bg-slate-950 overflow-hidden flex items-center justify-center shrink-0">
                {c.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl">🎭</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{c.name}</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {i === 0 ? <span className="text-cyan-300">Hoofdpersoon</span> : kenmerken(c) || "Meespeler"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange([c.id, ...value.filter(id => id !== c.id)])}
                    className="text-[10px] text-slate-400 hover:text-cyan-300"
                  >
                    maak hoofdpersoon
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onChange(value.filter(id => id !== c.id))}
                  className="text-[10px] text-slate-500 hover:text-red-400"
                >
                  verwijderen
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">Nog niemand gekozen — AI verzint zelf passende personen.</p>
      )}

      {characters.length === 0 ? (
        <p className="text-xs text-slate-500">Je hebt nog geen personages in je bibliotheek.</p>
      ) : vol ? (
        <p className="text-xs text-slate-500">Maximaal {MAX_GEKOZEN_PERSONAGES} personages per video.</p>
      ) : beschikbaar.length > 0 && (
        <select
          value=""
          onChange={e => { if (e.target.value) onChange([...value, e.target.value]); }}
          className="w-full md:w-1/2 bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">{gekozen.length === 0 ? "+ Kies je hoofdpersoon" : "+ Personage toevoegen"}</option>
          {beschikbaar.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}{kenmerken(c) ? ` (${kenmerken(c)})` : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
