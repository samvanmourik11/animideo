"use client";

import { useState } from "react";
import type { DialogueSpec, DialogueLine } from "@/lib/infographics/dialogue-schema";
import { isActie, regelKlaar, VERTELLER_ID } from "@/lib/infographics/dialogue-schema";
import { CREDIT_COSTS } from "@/lib/credit-costs";

// Aanpassen vanuit het videoscherm, per moment of meerdere tegelijk.
//
// Eén knop: opnieuw. Er stonden hier knoppen voor "beweging", "beeld aanpassen" en
// "alles opnieuw", maar wie een fragment niet goed vindt, weet meestal niet of het
// aan het beeld of aan de beweging ligt — en hoort dat ook niet te hoeven weten. De
// achterkant kijkt eerst zelf wat er mis is (dialogue-diagnose), maakt dan alleen
// opnieuw wat nodig is, en de stem blijft staan zolang de tekst niet veranderd is.
//
// Het beeld van een hele scène pas je aan in het storyboard.
//
// Meerdere regels tegelijk: vink ze aan, of een hele scène, en druk onderaan op
// opnieuw.

export interface RegelPlek {
  si: number;
  li: number;
}

// Wat opnieuw maken kost hangt af van wat er mis blijkt: alleen de beweging, of ook
// het beeld. Een regel zonder stem krijgt er een stem bij.
const MIN = CREDIT_COSTS.VIDEO_GENERATION;
const MAX = CREDIT_COSTS.IMAGE_GENERATION + CREDIT_COSTS.VIDEO_GENERATION;

const sleutel = (si: number, li: number) => `${si}-${li}`;
const plekVan = (k: string): RegelPlek => {
  const [si, li] = k.split("-").map(Number);
  return { si, li };
};

export default function FragmentEditor({
  spec,
  onSpec,
  onOpnieuw,
  bezigMet,
  disabled = false,
}: {
  spec: DialogueSpec;
  onSpec: (spec: DialogueSpec) => void;
  /** Maakt deze regels opnieuw. */
  onOpnieuw: (regels: RegelPlek[]) => void;
  /** "si-li" van de regels die nu opnieuw gemaakt worden. */
  bezigMet: string[];
  disabled?: boolean;
}) {
  const [gekozen, setGekozen] = useState<Set<string>>(new Set());
  // Zolang er iets opnieuw gemaakt wordt, start je niets nieuws: de uitkomsten
  // komen anders door elkaar in het draaiboek terecht.
  const bezigIets = bezigMet.length > 0;

  const naam = (id: string) =>
    id === VERTELLER_ID ? "Verteller" : spec.cast.find((c) => c.id === id)?.name ?? id;

  const wijzig = (si: number, li: number, velden: Partial<DialogueLine>) => {
    const scenes = spec.scenes.map((s, i) =>
      i !== si ? s : { ...s, lines: s.lines.map((l, j) => (j === li ? { ...l, ...velden } : l)) }
    );
    onSpec({ ...spec, scenes });
  };

  const wisselRegel = (k: string) =>
    setGekozen((prev) => {
      const nieuw = new Set(prev);
      if (nieuw.has(k)) nieuw.delete(k);
      else nieuw.add(k);
      return nieuw;
    });

  const wisselScene = (si: number) =>
    setGekozen((prev) => {
      const regels = spec.scenes[si].lines.map((_, li) => sleutel(si, li));
      const alles = regels.every((k) => prev.has(k));
      const nieuw = new Set(prev);
      for (const k of regels) {
        if (alles) nieuw.delete(k);
        else nieuw.add(k);
      }
      return nieuw;
    });

  const gekozenPlekken = [...gekozen]
    .map(plekVan)
    .filter(({ si, li }) => spec.scenes[si]?.lines[li])
    .sort((a, b) => a.si - b.si || a.li - b.li);

  const opnieuw = (regels: RegelPlek[]) => {
    onOpnieuw(regels);
    setGekozen(new Set());
  };

  return (
    <div className="space-y-4">
      {spec.scenes.map((scene, si) => {
        const regelsVanScene = scene.lines.map((_, li) => sleutel(si, li));
        const heleScene = regelsVanScene.length > 0 && regelsVanScene.every((k) => gekozen.has(k));
        return (
          <div key={si} className="space-y-2">
            <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={heleScene}
                onChange={() => wisselScene(si)}
                disabled={disabled || bezigIets}
                className="accent-orange-500"
              />
              <span className="font-medium text-slate-300">Scène {si + 1}</span>
              <span className="text-slate-600">— hele scène kiezen</span>
            </label>

            {scene.lines.map((l, li) => {
              const k = sleutel(si, li);
              const bezig = bezigMet.includes(k);
              const klaar = regelKlaar(l);
              const actie = isActie(l);
              const waarschuwingen = l.beeldWaarschuwingen ?? [];

              return (
                <div
                  key={k}
                  className={`rounded-lg border p-2 transition ${
                    gekozen.has(k)
                      ? "border-orange-400/50 bg-orange-500/[0.06]"
                      : waarschuwingen.length || l.sprekerZeker === false
                        ? "border-amber-400/40 bg-amber-500/[0.05]"
                        : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  <div className="flex gap-3">
                    <input
                      type="checkbox"
                      checked={gekozen.has(k)}
                      onChange={() => wisselRegel(k)}
                      disabled={disabled || bezigIets}
                      aria-label={`Regel ${li + 1} van scène ${si + 1} kiezen`}
                      className="accent-orange-500 mt-1 shrink-0"
                    />

                    {/* Het bronbeeld: waar de clip uit gemaakt is. Tijdens opnieuw
                        maken alleen een laadteken, niet het oude beeld. */}
                    {bezig ? (
                      <div className="w-24 sm:w-28 aspect-video rounded border border-orange-400/30 shrink-0 flex items-center justify-center text-[10px] text-orange-300 animate-pulse">
                        opnieuw…
                      </div>
                    ) : l.shotImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={l.shotImageUrl}
                        alt=""
                        className="w-24 sm:w-28 aspect-video object-cover rounded border border-white/10 shrink-0"
                      />
                    ) : (
                      <div className="w-24 sm:w-28 aspect-video rounded border border-dashed border-white/15 shrink-0 flex items-center justify-center text-[10px] text-slate-600">
                        nog geen beeld
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {actie ? (
                          <span className="text-[10px] text-sky-300">🎬 actiebeeld</span>
                        ) : (
                          <span className="text-[11px] text-orange-300">{naam(l.characterId)}</span>
                        )}
                        {klaar && !bezig && waarschuwingen.length === 0 && l.sprekerZeker !== false && (
                          <span className="text-emerald-400 text-xs">✓</span>
                        )}
                        {!bezig && (waarschuwingen.length > 0 || l.sprekerZeker === false) && (
                          <span className="text-[10px] text-amber-300">
                            ⚠ {waarschuwingen.length ? waarschuwingen.join("; ") : "spreker onzeker"}
                          </span>
                        )}
                      </div>

                      {/* Wat je ziet: alleen bij een actiebeeld te wijzigen. */}
                      {actie && (
                        <textarea
                          value={l.actie ?? ""}
                          onChange={(e) =>
                            wijzig(si, li, { actie: e.target.value, shotImageUrl: null, videoUrl: null })
                          }
                          disabled={disabled || bezig}
                          rows={1}
                          placeholder="wat gebeurt er? (Engels)"
                          className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white resize-y mb-1 disabled:opacity-60"
                        />
                      )}

                      {/* Wat je hoort: dialoog of voice-over. Wijzigen betekent opnieuw
                          inspreken, dus de stem vervalt hier bewust mee. */}
                      {(!actie || (l.text ?? "").trim()) && (
                        <textarea
                          value={l.text}
                          onChange={(e) =>
                            wijzig(si, li, {
                              text: e.target.value,
                              audioUrl: null,
                              audioDuration: null,
                              videoUrl: null,
                            })
                          }
                          disabled={disabled || bezig}
                          rows={1}
                          placeholder={actie ? "voice-over over dit beeld" : "wat zegt dit personage?"}
                          className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white resize-y disabled:opacity-60"
                        />
                      )}

                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <button
                          onClick={() => opnieuw([{ si, li }])}
                          disabled={disabled || bezigIets}
                          className="text-[10px] text-slate-300 hover:text-white border border-white/15 rounded px-2 py-0.5 disabled:opacity-30 transition"
                        >
                          ↻ opnieuw <span className="text-slate-600">{MIN}–{MAX} cr.</span>
                        </button>
                        {bezig && <span className="text-[10px] text-orange-300">bezig…</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Meerdere tegelijk. Blijft onderin beeld staan terwijl je door de lijst scrolt. */}
      {gekozenPlekken.length > 0 && (
        <div className="sticky bottom-2 z-10 rounded-lg border border-orange-400/40 bg-slate-900/95 p-2.5 flex flex-wrap items-center gap-2 shadow-lg">
          <span className="text-[11px] text-white font-medium">
            {gekozenPlekken.length} {gekozenPlekken.length === 1 ? "regel" : "regels"} gekozen
          </span>
          <button onClick={() => setGekozen(new Set())} className="text-[11px] text-slate-500 hover:text-white underline">
            keuze wissen
          </button>
          <button
            onClick={() => opnieuw(gekozenPlekken)}
            disabled={disabled || bezigIets}
            className="ml-auto bg-orange-500 hover:bg-orange-400 disabled:opacity-30 text-white text-[11px] rounded px-3 py-1 transition"
          >
            ↻ opnieuw · {gekozenPlekken.length * MIN}–{gekozenPlekken.length * MAX} cr.
          </button>
        </div>
      )}
    </div>
  );
}
