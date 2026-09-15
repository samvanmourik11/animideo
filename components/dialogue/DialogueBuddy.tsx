"use client";

import { useState } from "react";
import type { DialogueSpec } from "@/lib/infographics/dialogue-schema";

// De AI-buddy die een BESTAAND draaiboek aanpast. Twee smaken, dezelfde route:
// het hele verhaal, of één scène.
//
// Verschil met de chat in stap 1: die bouwt iets nieuws, deze kent wat er al staat.
// Daarom gaat de spec altijd mee — zonder die context beantwoordde de assistent
// "Marc moet afsluiten met het telefoonnummer" met "waar moet het gesprek over gaan?".

const VOORBEELDEN_SCENE = [
  "Verplaats dit naar een kantine",
  "Laat hem dit feller zeggen",
  "Voeg een afsluitende regel toe",
];

export default function DialogueBuddy({
  spec,
  sceneIndex,
  onSpec,
  disabled = false,
  compact = false,
}: {
  spec: DialogueSpec;
  /** Weglaten = het hele draaiboek aanpassen. */
  sceneIndex?: number;
  onSpec: (spec: DialogueSpec) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [instructie, setInstructie] = useState("");
  const [bezig, setBezig] = useState(false);
  const [antwoord, setAntwoord] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function stuur(tekst: string) {
    const schoon = tekst.trim();
    if (!schoon || bezig) return;
    setBezig(true);
    setFout(null);
    setAntwoord(null);
    try {
      const res = await fetch("/api/infographics/dialogue-revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec, instructie: schoon, sceneIndex }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || d.error || "Aanpassen mislukt");
      setAntwoord(d.reply);
      if (d.spec) {
        onSpec(d.spec as DialogueSpec);
        setInstructie("");
      }
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  }

  const plaatshouder = sceneIndex === undefined
    ? "Wat wil je aan het draaiboek veranderen? Bijv.: laat Marc afsluiten met het telefoonnummer en de website."
    : "Wat moet er in deze scène anders?";

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <div className="flex gap-2">
        <textarea
          value={instructie}
          onChange={(e) => setInstructie(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void stuur(instructie);
            }
          }}
          disabled={disabled || bezig}
          rows={compact ? 2 : 3}
          placeholder={plaatshouder}
          className="flex-1 bg-slate-900/60 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 resize-none disabled:opacity-60"
        />
        <button
          onClick={() => void stuur(instructie)}
          disabled={disabled || bezig || !instructie.trim()}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-medium rounded px-3 transition"
        >
          {bezig ? "…" : "Pas aan"}
        </button>
      </div>

      {compact && !instructie && !bezig && (
        <div className="flex flex-wrap gap-1">
          {VOORBEELDEN_SCENE.map((v) => (
            <button
              key={v}
              onClick={() => setInstructie(v)}
              className="text-[10px] text-slate-500 hover:text-slate-300 border border-white/10 rounded-full px-2 py-0.5 transition"
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {bezig && <p className="text-[11px] text-slate-500">De assistent kijkt ernaar…</p>}
      {antwoord && <p className="text-[11px] text-emerald-300">{antwoord}</p>}
      {fout && <p className="text-[11px] text-red-400">{fout}</p>}
    </div>
  );
}
