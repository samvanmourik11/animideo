"use client";

// ── Cijfers van een geplaatst diagram ────────────────────────────────────────
//
// Het diagram is een tekening die volgt uit de data, dus dit is de plek waar je
// hem echt bewerkt: pas een getal aan en de tekening wordt opnieuw gemaakt. Er
// zit geen model tussen — wat je intypt is wat er staat.
//
// Elke wijziging gaat als restyle_element door de commandolaag, zodat hij netjes
// in de geschiedenis komt en met één klik terug te draaien is.

import { DIAGRAM_SOORTEN, type DiagramSoort } from "@/lib/editor/charts";
import type { EditorStore } from "@/lib/editor/store";
import type { DiagramMeta } from "@/lib/editor/timeline";

export default function DiagramEditor({
  store,
  clipId,
  diagram,
}: {
  store: EditorStore;
  clipId: string;
  diagram: DiagramMeta;
}) {
  function wijzig(patch: Partial<DiagramMeta>) {
    store.dispatch({ op: "restyle_element", clipId, diagram: patch });
  }

  function zetPunt(i: number, patch: Partial<{ label: string; waarde: number }>) {
    wijzig({ data: diagram.data.map((d, k) => (k === i ? { ...d, ...patch } : d)) });
  }

  return (
    <div className="space-y-3 pt-2 border-t border-slate-200">
      <div className="text-[12px] font-semibold text-slate-700">Diagram</div>

      <div>
        <label className="block text-[12px] font-medium text-slate-600 mb-1">Soort</label>
        <select
          value={diagram.soort}
          onChange={(e) => wijzig({ soort: e.target.value as DiagramSoort })}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] text-slate-900 bg-white"
        >
          {DIAGRAM_SOORTEN.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[12px] font-medium text-slate-600 mb-1">Titel</label>
        <input
          value={diagram.titel ?? ""}
          onChange={(e) => wijzig({ titel: e.target.value })}
          placeholder="Geen titel"
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] text-slate-900"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-[12px] font-medium text-slate-600">Cijfers</label>
        {diagram.data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={d.label}
              onChange={(e) => zetPunt(i, { label: e.target.value })}
              className="flex-1 min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] text-slate-900"
            />
            <input
              type="number"
              value={d.waarde}
              onChange={(e) => zetPunt(i, { waarde: Number(e.target.value) })}
              className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] text-slate-900"
            />
            <button
              type="button"
              // Het laatste punt mag niet weg: een diagram zonder cijfers zou de
              // op weigeren, en dan gebeurt er bij het klikken zichtbaar niets.
              disabled={diagram.data.length <= 1}
              onClick={() => wijzig({ data: diagram.data.filter((_, k) => k !== i) })}
              aria-label="Rij weghalen"
              className="w-7 h-7 shrink-0 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => wijzig({ data: [...diagram.data, { label: `Punt ${diagram.data.length + 1}`, waarde: 10 }] })}
          className="w-full rounded-lg border border-slate-200 hover:bg-slate-50 text-[13px] py-1.5 text-slate-700"
        >
          Rij erbij
        </button>
      </div>

      <label className="flex items-center gap-2 text-[12px] text-slate-600">
        <input
          type="checkbox"
          checked={diagram.toonWaarden !== false}
          onChange={(e) => wijzig({ toonWaarden: e.target.checked })}
          className="accent-violet-600"
        />
        Waarden bij de punten tonen
      </label>
    </div>
  );
}
