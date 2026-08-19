"use client";

import { useState } from "react";
import type { DialogueSpec, DialogueLine } from "@/lib/infographics/dialogue-schema";
import { isActie, regelKlaar, VERTELLER_ID } from "@/lib/infographics/dialogue-schema";
import { CREDIT_COSTS } from "@/lib/credit-costs";

// Aanpassen vanuit het videoscherm, per moment.
//
// Een regel bestaat uit drie dingen die los kapot kunnen: de STEM, het BRONBEELD
// en de BEWEGING. In het draaiboek kon je ze alleen samen weggooien, en dan betaal
// je opnieuw voor onderdelen die prima waren. Hier kies je wat er mis is:
//
//   beweging opnieuw   → beeld en stem blijven          (alleen de clip)
//   beeld aanpassen    → stem blijft, clip volgt        (beeld + clip)
//   tekst wijzigen     → alles opnieuw                  (stem + beeld + clip)
//
// Dat scheelt niet alleen geld maar ook tijd: je houdt het beeld dat je net goed
// vond in plaats van te hopen dat het opnieuw goed uitpakt.

export type HerstelActie =
  | { soort: "beweging" }
  | { soort: "beeld"; instructie: string }
  | { soort: "alles" };

const KOSTEN = {
  beweging: CREDIT_COSTS.VIDEO_GENERATION,
  beeld: CREDIT_COSTS.IMAGE_GENERATION + CREDIT_COSTS.VIDEO_GENERATION,
  alles: CREDIT_COSTS.VOICE + CREDIT_COSTS.IMAGE_GENERATION + CREDIT_COSTS.VIDEO_GENERATION,
};

export default function FragmentEditor({
  spec,
  onSpec,
  onHerstel,
  bezigMet,
  disabled = false,
}: {
  spec: DialogueSpec;
  onSpec: (spec: DialogueSpec) => void;
  /** Voert de gekozen actie uit voor deze regel. */
  onHerstel: (si: number, li: number, actie: HerstelActie) => void;
  /** "si-li" van de regel die nu opnieuw gemaakt wordt, of null. */
  bezigMet: string | null;
  disabled?: boolean;
}) {
  const [openBij, setOpenBij] = useState<string | null>(null);
  const [instructie, setInstructie] = useState("");

  const naam = (id: string) =>
    id === VERTELLER_ID ? "Verteller" : spec.cast.find((c) => c.id === id)?.name ?? id;

  const wijzig = (si: number, li: number, velden: Partial<DialogueLine>) => {
    const scenes = spec.scenes.map((s, i) =>
      i !== si ? s : { ...s, lines: s.lines.map((l, j) => (j === li ? { ...l, ...velden } : l)) }
    );
    onSpec({ ...spec, scenes });
  };

  return (
    <div className="space-y-2">
      {spec.scenes.map((scene, si) =>
        scene.lines.map((l, li) => {
          const sleutel = `${si}-${li}`;
          const open = openBij === sleutel;
          const bezig = bezigMet === sleutel;
          const klaar = regelKlaar(l);
          const actie = isActie(l);
          const waarschuwingen = l.beeldWaarschuwingen ?? [];

          return (
            <div
              key={sleutel}
              className={`rounded-lg border p-2 transition ${
                waarschuwingen.length || l.sprekerZeker === false
                  ? "border-amber-400/40 bg-amber-500/[0.05]"
                  : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="flex gap-3">
                {/* Het bronbeeld: waar de clip uit gemaakt is. */}
                {l.shotImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.shotImageUrl}
                    alt=""
                    className="w-28 aspect-video object-cover rounded border border-white/10 shrink-0"
                  />
                ) : (
                  <div className="w-28 aspect-video rounded border border-dashed border-white/15 shrink-0 flex items-center justify-center text-[10px] text-slate-600">
                    nog geen beeld
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] text-slate-500">scène {si + 1}</span>
                    {actie ? (
                      <span className="text-[10px] text-sky-300">🎬 actiebeeld</span>
                    ) : (
                      <span className="text-[11px] text-orange-300">{naam(l.characterId)}</span>
                    )}
                    {klaar && waarschuwingen.length === 0 && l.sprekerZeker !== false && (
                      <span className="text-emerald-400 text-xs">✓</span>
                    )}
                    {(waarschuwingen.length > 0 || l.sprekerZeker === false) && (
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
                      onClick={() => onHerstel(si, li, { soort: "beweging" })}
                      disabled={disabled || bezig || !l.shotImageUrl}
                      title="Zelfde beeld, nieuwe beweging"
                      className="text-[10px] text-slate-400 hover:text-white border border-white/10 rounded px-2 py-0.5 disabled:opacity-30 transition"
                    >
                      ↻ beweging <span className="text-slate-600">{KOSTEN.beweging} cr.</span>
                    </button>
                    <button
                      onClick={() => { setOpenBij(open ? null : sleutel); setInstructie(""); }}
                      disabled={disabled || bezig}
                      className={`text-[10px] border rounded px-2 py-0.5 transition disabled:opacity-30 ${
                        open ? "border-orange-400/60 text-orange-300" : "border-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      ✎ beeld aanpassen <span className="text-slate-600">{KOSTEN.beeld} cr.</span>
                    </button>
                    <button
                      onClick={() => onHerstel(si, li, { soort: "alles" })}
                      disabled={disabled || bezig}
                      title="Stem, beeld en beweging opnieuw"
                      className="text-[10px] text-slate-500 hover:text-white border border-white/10 rounded px-2 py-0.5 disabled:opacity-30 transition"
                    >
                      alles opnieuw <span className="text-slate-600">{KOSTEN.alles} cr.</span>
                    </button>
                    {bezig && <span className="text-[10px] text-orange-300">bezig…</span>}
                  </div>

                  {/* Gerichte correctie op dít beeld. */}
                  {open && (
                    <div className="mt-2 flex gap-1.5">
                      <input
                        value={instructie}
                        onChange={(e) => setInstructie(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && instructie.trim()) {
                            onHerstel(si, li, { soort: "beeld", instructie: instructie.trim() });
                            setOpenBij(null);
                          }
                        }}
                        disabled={bezig}
                        placeholder="wat moet er anders? bijv. zet ze bij het raam, haal de laptop weg"
                        className="flex-1 bg-slate-900/60 border border-orange-400/30 rounded px-2 py-1 text-xs text-white placeholder:text-slate-600"
                      />
                      <button
                        onClick={() => {
                          onHerstel(si, li, { soort: "beeld", instructie: instructie.trim() });
                          setOpenBij(null);
                        }}
                        disabled={bezig || !instructie.trim()}
                        className="bg-orange-500 hover:bg-orange-400 disabled:opacity-30 text-white text-[11px] rounded px-3 transition"
                      >
                        Maak
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
