"use client";

import type { DialogueVoorwerp } from "@/lib/infographics/dialogue-schema";

// Voorwerpen die in het verhaal terugkomen, met hoe ze eruitzien. Staat zowel in
// de opzet als bij de beeldregie van het draaiboek, net als de tekenstijl: je ziet
// pas dat de wagen elke keer anders is als de beelden er zijn.

const MAX = 4;

export default function VasteVoorwerpen({
  voorwerpen,
  onChange,
  disabled = false,
}: {
  voorwerpen: DialogueVoorwerp[];
  onChange: (v: DialogueVoorwerp[]) => void;
  disabled?: boolean;
}) {
  // Een andere naam of beschrijving maakt het getekende blad ongeldig: dat wordt
  // bij het volgende storyboard opnieuw gemaakt.
  const zet = (i: number, velden: Partial<DialogueVoorwerp>) =>
    onChange(voorwerpen.map((v, x) => (x !== i ? v : { ...v, ...velden, bladUrl: null })));

  return (
    <div>
      <span className="block text-[11px] text-slate-400 mb-1">Voorwerpen die terugkomen</span>
      <p className="text-[11px] text-slate-500 mb-1.5">
        Zo zien ze er in élk beeld uit. Elk voorwerp wordt één keer getekend (1 credit) en dat beeld gaat mee naar
        de scènes waarin het genoemd wordt.
      </p>
      {voorwerpen.length > 0 && (
        <ul className="space-y-1.5 mb-1.5">
          {voorwerpen.map((v, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <input
                value={v.naam}
                onChange={(e) => zet(i, { naam: e.target.value })}
                disabled={disabled}
                placeholder="naam"
                className="w-28 shrink-0 bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-slate-600 disabled:opacity-50"
              />
              <textarea
                value={v.uiterlijk}
                onChange={(e) => zet(i, { uiterlijk: e.target.value })}
                disabled={disabled}
                rows={2}
                placeholder="hoe het eruitziet: vorm, kleuren, materiaal (het liefst in het Engels)"
                className="flex-1 min-w-0 bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-slate-600 disabled:opacity-50 resize-y"
              />
              <button
                type="button"
                onClick={() => onChange(voorwerpen.filter((_, x) => x !== i))}
                disabled={disabled}
                title="Voorwerp verwijderen"
                className="text-xs text-slate-500 hover:text-red-400 disabled:opacity-30 mt-1"
              >✕</button>
            </li>
          ))}
        </ul>
      )}
      {voorwerpen.length < MAX && (
        <button
          type="button"
          onClick={() => onChange([...voorwerpen, { naam: "", uiterlijk: "", bladUrl: null }])}
          disabled={disabled}
          className="text-[11px] text-slate-400 hover:text-emerald-400 disabled:opacity-30"
        >+ voorwerp</button>
      )}
    </div>
  );
}
