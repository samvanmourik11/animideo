"use client";

import { useState } from "react";
import type { DialogueSpec, DialogueLine } from "@/lib/infographics/dialogue-schema";
import { isActie, regelKlaar, VERTELLER_ID } from "@/lib/infographics/dialogue-schema";
import { CREDIT_COSTS } from "@/lib/credit-costs";

// Aanpassen vanuit het videoscherm, per moment of meerdere tegelijk.
//
// Een regel bestaat uit drie dingen die los kapot kunnen: de STEM, het BRONBEELD
// en de BEWEGING. In het draaiboek kon je ze alleen samen weggooien, en dan betaal
// je opnieuw voor onderdelen die prima waren. Hier kies je wat er mis is:
//
//   beweging opnieuw   → beeld en stem blijven, met een aanwijzing voor de beweging
//   tekst wijzigen     → alles opnieuw                  (stem + beeld + clip)
//
// Het BEELD zelf pas je aan in het storyboard. Hier stond ook een knop "beeld
// aanpassen", maar dan had je twee plekken waar hetzelfde beeld veranderde, en een
// aanpassing hier gold maar voor één regel terwijl de rest van de scène het oude
// scènebeeld hield.
//
// Meerdere regels tegelijk: vink ze aan, of een hele scène, en kies onderaan wat er
// opnieuw moet. Dat scheelt klikken wanneer een hele scène niet beweegt zoals je wilt.

export type HerstelActie =
  | { soort: "beweging"; instructie?: string }
  | { soort: "alles"; instructie?: string };

export interface RegelPlek {
  si: number;
  li: number;
}

const KOSTEN = {
  beweging: CREDIT_COSTS.VIDEO_GENERATION,
  alles: CREDIT_COSTS.VOICE + CREDIT_COSTS.IMAGE_GENERATION + CREDIT_COSTS.VIDEO_GENERATION,
};

const sleutel = (si: number, li: number) => `${si}-${li}`;
const plekVan = (k: string): RegelPlek => {
  const [si, li] = k.split("-").map(Number);
  return { si, li };
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
  /** Voert de gekozen actie uit voor deze regels. */
  onHerstel: (regels: RegelPlek[], actie: HerstelActie) => void;
  /** "si-li" van de regels die nu opnieuw gemaakt worden. */
  bezigMet: string[];
  disabled?: boolean;
}) {
  const [openBij, setOpenBij] = useState<string | null>(null);
  const [instructie, setInstructie] = useState("");
  const [gekozen, setGekozen] = useState<Set<string>>(new Set());
  const [groepInstructie, setGroepInstructie] = useState("");
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
  // Beweging opnieuw kan alleen waar al een beeld is om te laten bewegen.
  const metBeeld = gekozenPlekken.filter(({ si, li }) => spec.scenes[si].lines[li].shotImageUrl);

  const start = (regels: RegelPlek[], actie: HerstelActie) => {
    onHerstel(regels, actie);
    setGekozen(new Set());
    setGroepInstructie("");
    setOpenBij(null);
    setInstructie("");
  };

  const aanwijzing = (tekst: string) => tekst.trim() || undefined;

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
              const open = openBij === k;
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

                    {/* Het bronbeeld: waar de clip uit gemaakt is. */}
                    {l.shotImageUrl ? (
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
                          onClick={() => { setOpenBij(open ? null : k); setInstructie(""); }}
                          disabled={disabled || bezigIets || !l.shotImageUrl}
                          title="Zelfde beeld, nieuwe beweging"
                          className={`text-[10px] border rounded px-2 py-0.5 transition disabled:opacity-30 ${
                            open ? "border-orange-400/60 text-orange-300" : "border-white/10 text-slate-400 hover:text-white"
                          }`}
                        >
                          ↻ beweging <span className="text-slate-600">{KOSTEN.beweging} cr.</span>
                        </button>
                        <button
                          onClick={() => start([{ si, li }], { soort: "alles" })}
                          disabled={disabled || bezigIets}
                          title="Stem, beeld en beweging opnieuw"
                          className="text-[10px] text-slate-500 hover:text-white border border-white/10 rounded px-2 py-0.5 disabled:opacity-30 transition"
                        >
                          alles opnieuw <span className="text-slate-600">{KOSTEN.alles} cr.</span>
                        </button>
                        {bezig && <span className="text-[10px] text-orange-300">bezig…</span>}
                      </div>

                      {/* Aanwijzing voor de beweging van dít moment. Leeg mag ook. */}
                      {open && (
                        <div className="mt-2 flex gap-1.5">
                          <input
                            value={instructie}
                            onChange={(e) => setInstructie(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") start([{ si, li }], { soort: "beweging", instructie: aanwijzing(instructie) });
                            }}
                            autoFocus
                            placeholder="hoe moet het bewegen? bijv. oma wijst naar de wagen, de camera zoomt langzaam in"
                            className="flex-1 min-w-0 bg-slate-900/60 border border-orange-400/30 rounded px-2 py-1 text-xs text-white placeholder:text-slate-600"
                          />
                          <button
                            onClick={() => start([{ si, li }], { soort: "beweging", instructie: aanwijzing(instructie) })}
                            className="bg-orange-500 hover:bg-orange-400 text-white text-[11px] rounded px-3 transition"
                          >
                            Maak
                          </button>
                        </div>
                      )}
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
        <div className="sticky bottom-2 z-10 rounded-lg border border-orange-400/40 bg-slate-900/95 p-2.5 space-y-2 shadow-lg">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-white font-medium">
              {gekozenPlekken.length} {gekozenPlekken.length === 1 ? "regel" : "regels"} gekozen
            </span>
            <button onClick={() => setGekozen(new Set())} className="text-slate-500 hover:text-white underline">
              keuze wissen
            </button>
          </div>
          <input
            value={groepInstructie}
            onChange={(e) => setGroepInstructie(e.target.value)}
            placeholder="aanwijzing voor de beweging, geldt voor alle gekozen regels (mag leeg)"
            className="w-full bg-slate-900/60 border border-orange-400/30 rounded px-2 py-1 text-xs text-white placeholder:text-slate-600"
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => start(metBeeld, { soort: "beweging", instructie: aanwijzing(groepInstructie) })}
              disabled={disabled || bezigIets || metBeeld.length === 0}
              className="bg-orange-500 hover:bg-orange-400 disabled:opacity-30 text-white text-[11px] rounded px-3 py-1 transition"
            >
              ↻ beweging opnieuw ({metBeeld.length}) · {metBeeld.length * KOSTEN.beweging} cr.
            </button>
            <button
              onClick={() => start(gekozenPlekken, { soort: "alles", instructie: aanwijzing(groepInstructie) })}
              disabled={disabled || bezigIets}
              className="border border-white/15 text-slate-300 hover:text-white disabled:opacity-30 text-[11px] rounded px-3 py-1 transition"
            >
              alles opnieuw ({gekozenPlekken.length}) · {gekozenPlekken.length * KOSTEN.alles} cr.
            </button>
          </div>
          {metBeeld.length < gekozenPlekken.length && (
            <p className="text-[10px] text-slate-500">
              {gekozenPlekken.length - metBeeld.length} gekozen {gekozenPlekken.length - metBeeld.length === 1 ? "regel heeft" : "regels hebben"} nog geen beeld en {gekozenPlekken.length - metBeeld.length === 1 ? "doet" : "doen"} alleen mee met &ldquo;alles opnieuw&rdquo;.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
