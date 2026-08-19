"use client";

// Versiepaneel: wat er met deze montage is gebeurd, en één klik terug naar een
// eerdere stand.
//
// Dit is het vangnet dat het rapport "het drielaagse undo-model" noemt. Undo
// dekt de laatste stappen; dit paneel is voor "vanochtend was het nog goed" —
// en straks voor "wat heeft de AI hier precies gedaan", want elke regel draagt
// zijn eigen herkomst.

import { useCallback, useEffect, useState } from "react";
import type { EditorHistory, HistoryEntry } from "@/lib/editor/history";
import type { EditorStore } from "@/lib/editor/store";

export default function HistoryPanel({
  history,
  store,
  onClose,
}: {
  history: EditorHistory;
  store: EditorStore;
  onClose: () => void;
}) {
  const [regels, setRegels] = useState<HistoryEntry[] | null>(null);
  const [bezig, setBezig] = useState<number | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const laden = useCallback(async () => {
    try {
      setRegels(await history.lijst());
    } catch {
      setFout("De geschiedenis kon niet worden geladen.");
    }
  }, [history]);

  useEffect(() => { void laden(); }, [laden]);

  async function herstel(versie: number) {
    setBezig(versie);
    setFout(null);
    try {
      const doc = await history.documentOp(versie);
      if (!doc) {
        setFout("Deze versie is niet meer terug te rekenen.");
        return;
      }
      store.herstelNaar(doc);
      history.zetVersie(versie);
      await laden();
    } finally {
      setBezig(null);
    }
  }

  return (
    <div className="absolute right-0 top-0 z-40 h-full w-72 border-l border-[#2a2a2a] bg-[#141414] flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a2a]">
        <span className="text-xs font-semibold text-slate-200">Versies</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Sluiten"
          className="w-6 h-6 rounded bg-white/5 hover:bg-white/15 text-slate-400 text-xs"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {fout ? <p className="text-[11px] text-amber-300 px-1 py-2">{fout}</p> : null}

        {regels === null ? (
          <p className="text-[11px] text-slate-500 px-1 py-2">Laden…</p>
        ) : regels.length === 0 ? (
          <p className="text-[11px] text-slate-500 px-1 py-2">
            Nog geen bewerkingen. Alles wat je vanaf nu doet komt hier te staan, ook na het sluiten van dit tabblad.
          </p>
        ) : (
          regels.map((r) => (
            <div
              key={r.version}
              className="rounded border border-white/5 bg-white/[0.03] px-2 py-1.5 flex items-start gap-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-slate-200 leading-snug">{r.summary || r.op.op}</p>
                <p className="text-[10px] text-slate-500">
                  v{r.version} · {tijd(r.createdAt)}
                  {r.source === "ai" ? " · AI" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => herstel(r.version)}
                disabled={bezig !== null}
                title={`Zet de montage terug zoals hij was na deze stap`}
                className="shrink-0 text-[10px] px-1.5 py-1 rounded bg-white/10 hover:bg-white/20 text-slate-300 disabled:opacity-40"
              >
                {bezig === r.version ? "…" : "Terug"}
              </button>
            </div>
          ))
        )}
        {regels && regels.length > 0 ? (
          <div className="rounded border border-white/5 bg-white/[0.03] px-2 py-1.5 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-slate-200 leading-snug">Begin</p>
              <p className="text-[10px] text-slate-500">v0 · zoals het project binnenkwam</p>
            </div>
            <button
              type="button"
              onClick={() => herstel(0)}
              disabled={bezig !== null}
              title="Alles terug naar hoe deze montage begon"
              className="shrink-0 text-[10px] px-1.5 py-1 rounded bg-white/10 hover:bg-white/20 text-slate-300 disabled:opacity-40"
            >
              {bezig === 0 ? "…" : "Terug"}
            </button>
          </div>
        ) : null}
      </div>

      <p className="text-[10px] text-slate-500 px-3 py-2 border-t border-[#2a2a2a]">
        Terugzetten is zelf ook ongedaan te maken — je raakt niets kwijt.
      </p>
    </div>
  );
}

function tijd(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
