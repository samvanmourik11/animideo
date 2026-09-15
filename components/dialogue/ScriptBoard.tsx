"use client";

import { useMemo, useState } from "react";
import DialogueBuddy from "./DialogueBuddy";
import type { DialogueSpec, DialogueLine, DialogueScene } from "@/lib/infographics/dialogue-schema";
import { KADERS, STANDAARD_KADER, kaderLabel, kaderUitleg, type Kader } from "@/lib/infographics/verhaal-kaders";
import { LICHTSOORTEN, STANDAARD_LICHT, lichtLabel, lichtUitleg, type Lichtsoort } from "@/lib/infographics/verhaal-licht";
import {
  regelKlaar, isActie, actieDuur, heeftStem, voorwerpenInScene, bruikbareRegel, VERTELLER_ID,
  ACTIE_MIN_SEC, ACTIE_MAX_SEC, ACTIE_STANDAARD_SEC,
} from "@/lib/infographics/dialogue-schema";
import { creditTekst, schatCredits, schatStoryboardCredits } from "@/lib/infographics/dialoog-credits";
import { deelLabel } from "@/lib/infographics/verhaallijn";

// Het draaiboek: de gebruiker heeft hier het laatste woord over wat er gezegd
// wordt, door wie, en waar het zich afspeelt. De AI levert een eerste versie, maar
// niets hier is definitief tot er op genereren wordt gedrukt.
//
// Bewust met de kosten en duur ERBIJ in beeld: elke regel is een clip, en een
// regel toevoegen is dus geld. Dat hoor je te zien vóór je op genereren drukt,
// niet erna.

// Een gesproken regel duurt ruwweg dit aantal woorden per seconde.
const WOORDEN_PER_SEC = 2.6;
const EMOTIES = ["neutraal", "blij", "verrast", "bezorgd", "enthousiast", "nadenkend", "stellig"];

export function schatDuur(spec: DialogueSpec): number {
  return spec.scenes.reduce(
    (a, s) => a + s.lines.reduce(
      (b, l) => b + (isActie(l) ? actieDuur(l) : (l.audioDuration ?? l.text.split(/\s+/).length / WOORDEN_PER_SEC)),
      0
    ),
    0
  );
}

// De schattingen staan bij de tarieven (dialoog-credits.ts), zodat de knop en de
// afschrijving uit dezelfde regels komen. Hier doorgegeven voor wie ze hier zocht.
export { schatCredits, schatStoryboardCredits };

/**
 * Het camerakader van één shot, aanpasbaar.
 *
 * Zonder dit koop je een plan dat je niet hebt gelezen: de regisseur kiest per
 * shot een close-up, een totaalbeeld of een blik van achteren, en dat bepaalt
 * hoe de video eruitziet. Hier zie je wat hij koos en kun je het omzetten
 * vóórdat er een beeld gemaakt wordt.
 */
function KaderKeuze({
  waarde,
  onChange,
  disabled,
}: {
  waarde: Kader | null | undefined;
  onChange: (k: Kader) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={waarde ?? STANDAARD_KADER}
      onChange={(e) => onChange(e.target.value as Kader)}
      disabled={disabled}
      title={kaderUitleg(waarde)}
      className="bg-slate-900/60 border border-white/10 rounded px-1 py-0.5 text-[10px] text-slate-300 disabled:opacity-50"
    >
      {KADERS.map((k) => (
        <option key={k} value={k}>{kaderLabel(k)}</option>
      ))}
    </select>
  );
}

export default function ScriptBoard({
  spec,
  onChange,
  disabled = false,
}: {
  spec: DialogueSpec;
  onChange: (spec: DialogueSpec) => void;
  disabled?: boolean;
}) {
  const duur = useMemo(() => schatDuur(spec), [spec]);
  const credits = useMemo(() => schatCredits(spec), [spec]);
  const regelAantal = spec.scenes.reduce((a, s) => a + s.lines.length, 0);
  // Wat er nog te doen staat, en hoe lang dat ongeveer duurt. Bij een video van
  // vijf minuten gaat het om tientallen clips; dat hoor je te zien vóór je begint.
  const teDoen = spec.scenes.flatMap((s) => s.lines).filter((l) => !regelKlaar(l)).length;
  const shotsTeDoen = spec.scenes.filter((s) => !s.twoShotUrl).length;
  const wachtMinuten = Math.max(1, Math.round(((teDoen * 35) / 3 + shotsTeDoen * 12) / 60));
  // Welke scène heeft de buddy openstaan. Eén tegelijk houdt het rustig.
  const [buddyBij, setBuddyBij] = useState<number | null>(null);

  const wijzigScene = (si: number, velden: Partial<DialogueScene>) => {
    const scenes = spec.scenes.map((s, i) => (i === si ? { ...s, ...velden } : s));
    onChange({ ...spec, scenes });
  };

  const wijzigRegel = (si: number, li: number, velden: Partial<DialogueLine>) => {
    const scenes = spec.scenes.map((s, i) =>
      i !== si ? s : { ...s, lines: s.lines.map((l, j) => (j === li ? { ...l, ...velden } : l)) }
    );
    onChange({ ...spec, scenes });
  };

  // Tekst of spreker wijzigen maakt een al gerenderde clip ongeldig — die gaat
  // immers over de oude zin. We gooien het resultaat dan weg zodat er opnieuw
  // gemaakt wordt, in plaats van stilletjes de verkeerde clip te houden.
  const wijzigInhoud = (si: number, li: number, velden: Partial<DialogueLine>) =>
    // Ook wat je in het shot ziet: dat kwam uit de oude zin, en de beeldregie maakt
    // het bij het storyboard opnieuw.
    wijzigRegel(si, li, { ...velden, audioUrl: null, audioDuration: null, shotImageUrl: null, videoUrl: null, mouthStart: null, beeld: null });

  const verwijderRegel = (si: number, li: number) => {
    const scenes = spec.scenes
      .map((s, i) => (i !== si ? s : { ...s, lines: s.lines.filter((_, j) => j !== li) }))
      .filter((s) => s.lines.length > 0);
    onChange({ ...spec, scenes });
  };

  const verplaatsRegel = (si: number, li: number, richting: -1 | 1) => {
    const doel = li + richting;
    const scene = spec.scenes[si];
    if (doel < 0 || doel >= scene.lines.length) return;
    const lines = [...scene.lines];
    [lines[li], lines[doel]] = [lines[doel], lines[li]];
    wijzigScene(si, { lines });
  };

  const voegRegelToe = (si: number, na: number) => {
    const scene = spec.scenes[si];
    // Standaard de ander aan het woord: een gesprek wisselt af.
    const vorige = scene.lines[na]?.characterId;
    const volgende = spec.cast.find((c) => c.id !== vorige)?.id ?? spec.cast[0]?.id ?? "";
    const lines = [...scene.lines];
    lines.splice(na + 1, 0, { characterId: volgende, text: "", emotion: "neutraal" });
    wijzigScene(si, { lines });
  };

  // Een actiebeeld: geen tekst, wel een handeling. Dit is wat een reeks pratende
  // koppen tot een video maakt, dus het moet net zo makkelijk toe te voegen zijn
  // als een dialoogregel.
  const voegActieToe = (si: number, na: number) => {
    const scene = spec.scenes[si];
    const lines = [...scene.lines];
    lines.splice(na + 1, 0, {
      kind: "actie", characterId: spec.cast[0]?.id ?? "", text: "", emotion: "",
      actie: "", seconden: ACTIE_STANDAARD_SEC,
    });
    wijzigScene(si, { lines });
  };

  const voegSceneToe = () => {
    const nieuw: DialogueScene = {
      id: `scene-${Date.now()}`,
      setting: "",
      lines: [{ characterId: spec.cast[0]?.id ?? "", text: "", emotion: "neutraal" }],
    };
    onChange({ ...spec, scenes: [...spec.scenes, nieuw] });
  };

  /**
   * Alles van deze scène opnieuw laten maken: het twee-shot én elke clip erin.
   * Nodig omdat hervatten regels overslaat die al "klaar" zijn — zonder dit bleef
   * een scène die er verkeerd uitkwam staan hoe vaak je ook op genereren drukte.
   * De ingesproken stemmen blijven: de tekst verandert immers niet, en opnieuw
   * inspreken zou alleen geld kosten.
   */
  const sceneOpnieuw = (si: number) => {
    const scene = spec.scenes[si];
    wijzigScene(si, {
      twoShotUrl: null,
      lines: scene.lines.map((l) => ({ ...l, shotImageUrl: null, videoUrl: null, mouthStart: null, sprekerZeker: null })),
    });
  };

  const verwijderScene = (si: number) =>
    onChange({ ...spec, scenes: spec.scenes.filter((_, i) => i !== si) });

  const naam = (id: string) => spec.cast.find((c) => c.id === id)?.name ?? "?";

  return (
    <div className="space-y-5">
      {/* Overzicht */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 bg-slate-900/40 border border-white/10 rounded-lg px-3 py-2">
        <span><span className="text-white font-medium">{spec.scenes.length}</span> scènes</span>
        <span><span className="text-white font-medium">{regelAantal}</span> regels</span>
        <span>≈ <span className="text-white font-medium">{Math.round(duur)}s</span> video</span>
        <span className="ml-auto">
          nog te maken: <span className="text-orange-300 font-medium">{creditTekst(credits)}</span>
          {teDoen > 0 && <> · ongeveer <span className="text-white font-medium">{wachtMinuten} min</span></>}
        </span>
      </div>

      {spec.scenes.map((scene, si) => (
        <div key={scene.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-start gap-2 mb-2">
            <div className="mt-2 shrink-0 flex flex-col items-start gap-0.5">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">Scène {si + 1}</span>
              {/* Bij welk deel van het verhaal deze scène hoort. Zo zie je in het
                  draaiboek waar de omslag valt, en of er iets te vroeg opgelost wordt. */}
              {!!scene.deel && !!spec.verhaallijn?.[scene.deel - 1] && (
                <span
                  title={spec.verhaallijn?.[scene.deel - 1]?.wat}
                  className="text-[10px] rounded-full bg-orange-500/15 text-orange-300 px-1.5 py-0.5 max-w-[7rem] truncate"
                >
                  {deelLabel(spec.verhaallijn?.[scene.deel - 1], scene.deel - 1)}
                </span>
              )}
            </div>
            <div className="flex-1">
              <input
                value={scene.setting}
                onChange={(e) => wijzigScene(si, { setting: e.target.value, twoShotUrl: null })}
                disabled={disabled}
                placeholder="omgeving in het Engels, bijv. a modern office with a desk and a laptop"
                className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-slate-600 disabled:opacity-60"
              />
              <div className="flex items-center gap-2 mt-1">
                {/* Het licht hoort bij de scene, niet bij het shot: binnen één plek
                    en één moment verandert het niet. Het staat hier omdat het net
                    zoveel voor de sfeer doet als de omgeving zelf. */}
                <select
                  value={scene.licht ?? STANDAARD_LICHT}
                  onChange={(e) => wijzigScene(si, { licht: e.target.value as Lichtsoort, twoShotUrl: null })}
                  disabled={disabled}
                  title={lichtUitleg(scene.licht)}
                  className="bg-slate-900/60 border border-white/10 rounded px-1 py-0.5 text-[10px] text-slate-300 disabled:opacity-50"
                >
                  {LICHTSOORTEN.map((l) => (
                    <option key={l} value={l}>{lichtLabel(l)}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-600">
                  Alleen de plek. Wie er staat en hoe, bepaalt de cast.
                </p>
              </div>
            </div>
            {scene.twoShotUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={scene.twoShotUrl} alt="" className="w-20 rounded border border-white/10 shrink-0" />
            )}
            {!disabled && scene.lines.some((l) => regelKlaar(l)) && (
              <button
                onClick={() => sceneOpnieuw(si)}
                title="Deze hele scène opnieuw laten maken: nieuw twee-shot en alle clips"
                className="text-[11px] text-slate-500 hover:text-orange-300 rounded px-1.5 py-0.5 mt-2 shrink-0 transition"
              >↻ scène</button>
            )}
            {!disabled && (
              <button
                onClick={() => setBuddyBij(buddyBij === si ? null : si)}
                title="Laat de assistent deze scène aanpassen"
                className={`text-[11px] rounded px-1.5 py-0.5 mt-2 shrink-0 transition ${
                  buddyBij === si ? "bg-orange-500/20 text-orange-300" : "text-slate-500 hover:text-orange-300"
                }`}
              >
                ✨ AI
              </button>
            )}
            {!disabled && spec.scenes.length > 1 && (
              <button onClick={() => verwijderScene(si)} className="text-[11px] text-slate-600 hover:text-red-400 mt-2">✕</button>
            )}
          </div>

          {/* Aanpassen in gewone taal: "verplaats naar een kantine", "laat hem dit
              feller zeggen". Raakt alleen deze scène; de rest blijft staan. */}
          {buddyBij === si && !disabled && (
            <div className="mb-3 rounded-lg border border-orange-400/30 bg-orange-500/[0.06] p-2.5">
              <DialogueBuddy
                spec={spec}
                sceneIndex={si}
                onSpec={onChange}
                compact
              />
            </div>
          )}

          <div className="space-y-1.5">
            {scene.lines.map((l, li) => {
              const klaar = regelKlaar(l);
              const waarschuwingen = l.beeldWaarschuwingen ?? [];
              const status = klaar ? (
                waarschuwingen.length > 0 ? (
                  <span className="text-amber-400 text-xs mt-1.5 shrink-0" title={`Beeldcontrole: ${waarschuwingen.join("; ")} — maak deze clip opnieuw`}>⚠</span>
                ) : l.sprekerZeker === false ? (
                  <span className="text-amber-400 text-xs mt-1.5 shrink-0" title="Niet zeker of de juiste persoon praat — maak deze regel opnieuw">⚠</span>
                ) : (
                  <span className="text-emerald-400 text-xs mt-1.5 shrink-0" title="clip staat klaar">✓</span>
                )
              ) : null;

              const knoppen = !disabled ? (
                <div className="flex gap-0.5 shrink-0 mt-1">
                  {/* Alleen déze regel opnieuw. Zonder dit bleef een mislukte clip
                      staan: hervatten slaat regels over die al "klaar" zijn, dus
                      opnieuw genereren veranderde er niets aan. */}
                  {klaar && (
                    <button
                      onClick={() => wijzigRegel(si, li, { shotImageUrl: null, videoUrl: null, mouthStart: null, sprekerZeker: null, beeldWaarschuwingen: null })}
                      className="text-[10px] text-slate-600 hover:text-orange-300 px-0.5"
                      title="Alleen deze clip opnieuw maken"
                    >↻</button>
                  )}
                  <button onClick={() => verplaatsRegel(si, li, -1)} disabled={li === 0} className="text-[10px] text-slate-600 hover:text-white disabled:opacity-25 px-0.5" title="omhoog">▲</button>
                  <button onClick={() => verplaatsRegel(si, li, 1)} disabled={li === scene.lines.length - 1} className="text-[10px] text-slate-600 hover:text-white disabled:opacity-25 px-0.5" title="omlaag">▼</button>
                  <button onClick={() => voegRegelToe(si, li)} className="text-[10px] text-slate-600 hover:text-emerald-400 px-0.5" title="dialoogregel eronder">+</button>
                  <button onClick={() => voegActieToe(si, li)} className="text-[10px] text-slate-600 hover:text-sky-400 px-0.5" title="actiebeeld eronder">🎬</button>
                  <button onClick={() => verwijderRegel(si, li)} className="text-[10px] text-slate-600 hover:text-red-400 px-0.5" title="verwijderen">✕</button>
                </div>
              ) : null;

              // Een actiebeeld heeft geen spreker en geen tekst, maar een handeling
              // en een lengte. Eigen rij dus, met een kleur die opvalt zodat je het
              // ritme van de video in één oogopslag ziet.
              if (isActie(l)) {
                const metStem = heeftStem(l);
                return (
                  <div key={li} className="bg-sky-500/[0.07] border border-sky-400/20 rounded px-1.5 py-1 space-y-1">
                  <div className="flex items-start gap-1.5">
                    <span className="text-[11px] text-sky-300 w-28 shrink-0 mt-1 flex items-center gap-1">
                      🎬
                      <KaderKeuze
                        waarde={l.kader}
                        onChange={(k) => wijzigRegel(si, li, { kader: k, shotImageUrl: null, videoUrl: null })}
                        disabled={disabled}
                      />
                    </span>
                    <textarea
                      value={l.actie ?? ""}
                      onChange={(e) => wijzigInhoud(si, li, { actie: e.target.value })}
                      disabled={disabled}
                      rows={1}
                      placeholder="wat gebeurt er? in het Engels, bijv. the two of them drive along a country road"
                      className="flex-1 bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white resize-y min-h-[28px] placeholder:text-slate-600 disabled:opacity-60"
                    />
                    {/* Zonder stem bepaalt dit veld de lengte; met voice-over doet de
                        zin dat, dus dan is het getal betekenisloos en verbergen we het. */}
                    {!metStem && (
                      <input
                        type="number"
                        min={ACTIE_MIN_SEC}
                        max={ACTIE_MAX_SEC}
                        value={actieDuur(l)}
                        onChange={(e) => wijzigInhoud(si, li, { seconden: Number(e.target.value) })}
                        disabled={disabled}
                        title="lengte in seconden"
                        className="bg-slate-800 border border-white/10 rounded px-1 py-1 text-[10px] text-slate-400 w-12 shrink-0 disabled:opacity-60"
                      />
                    )}
                    {status}
                    {knoppen}
                  </div>

                  {/* Optionele voice-over: het beeld staat er, iemand praat eroverheen.
                      Dat is levendiger dan twee pratende poppetjes, en het is dezelfde
                      regel — alleen zie je iets anders dan de sprekers. */}
                  <div className="flex items-start gap-1.5">
                    <span className="text-[11px] text-sky-300/70 w-28 shrink-0 mt-1">
                      {!metStem ? "🎵 je hoort" : l.characterId === VERTELLER_ID ? "🎙 verteller" : "🔊 je hoort"}
                    </span>
                    {metStem ? (
                      <select
                        value={l.characterId}
                        onChange={(e) => wijzigInhoud(si, li, { characterId: e.target.value })}
                        disabled={disabled}
                        className={`bg-slate-800 border border-white/10 rounded px-1.5 py-1 text-[11px] w-28 shrink-0 disabled:opacity-60 ${
                          l.characterId === VERTELLER_ID ? "text-violet-300" : "text-orange-300"
                        }`}
                      >
                        {spec.cast.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        {/* De verteller staat buiten het verhaal en heeft een eigen
                            stem, zodat je hem niet verwart met een personage. */}
                        <option value={VERTELLER_ID}>Verteller</option>
                      </select>
                    ) : null}
                    <textarea
                      value={l.text}
                      onChange={(e) => wijzigInhoud(si, li, { text: e.target.value })}
                      disabled={disabled}
                      rows={1}
                      placeholder="leeg = alleen muziek; typ hier een zin voor een voice-over over dit beeld"
                      className="flex-1 bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white resize-y min-h-[28px] placeholder:text-slate-600 disabled:opacity-60"
                    />
                  </div>

                  {/* Waarom dit beeld er staat. De assistent moet dat opschrijven;
                      klopt de redenering niet, dan hoort het beeld er niet. */}
                  {(l.verband ?? "").trim() && (
                    <p className="text-[10px] text-sky-300/70 ml-[7.25rem]">↳ {l.verband}</p>
                  )}
                  </div>
                );
              }

              return (
                <div key={li} className="flex items-start gap-1.5">
                  <select
                    value={l.characterId}
                    onChange={(e) => wijzigInhoud(si, li, { characterId: e.target.value })}
                    disabled={disabled}
                    className="bg-slate-800 border border-white/10 rounded px-1.5 py-1 text-[11px] text-orange-300 w-28 shrink-0 disabled:opacity-60"
                  >
                    {spec.cast.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    {!spec.cast.some((c) => c.id === l.characterId) && (
                      <option value={l.characterId}>{naam(l.characterId)}</option>
                    )}
                  </select>

                  <textarea
                    value={l.text}
                    onChange={(e) => wijzigInhoud(si, li, { text: e.target.value })}
                    disabled={disabled}
                    rows={1}
                    placeholder="wat zegt dit personage?"
                    className="flex-1 bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white resize-y min-h-[28px] placeholder:text-slate-600 disabled:opacity-60"
                  />

                  <select
                    value={l.emotion}
                    onChange={(e) => wijzigRegel(si, li, { emotion: e.target.value })}
                    disabled={disabled}
                    className="bg-slate-800 border border-white/10 rounded px-1 py-1 text-[10px] text-slate-400 w-24 shrink-0 disabled:opacity-60"
                  >
                    {[...new Set([l.emotion, ...EMOTIES])].filter(Boolean).map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>

                  {/* Het camerakader. Verander je het, dan moet het beeld opnieuw —
                      daarom gooien we de bestaande clip weg. */}
                  <KaderKeuze
                    waarde={l.kader}
                    onChange={(k) => wijzigRegel(si, li, { kader: k, shotImageUrl: null, videoUrl: null })}
                    disabled={disabled}
                  />

                  {status}
                  {knoppen}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!disabled && (
        <button onClick={voegSceneToe} className="text-xs text-slate-400 hover:text-white border border-dashed border-white/15 rounded-lg px-3 py-2 w-full transition">
          + scène toevoegen
        </button>
      )}
    </div>
  );
}
