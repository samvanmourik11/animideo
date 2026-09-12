"use client";

import { Fragment, useState } from "react";
import { regelKlaar, isActie, VERTELLER_ID, type DialogueSpec, type DialogueScene } from "@/lib/infographics/dialogue-schema";
import { LICHTSOORTEN, STANDAARD_LICHT, lichtLabel, type Lichtsoort } from "@/lib/infographics/verhaal-licht";
import { FASEN, FASE_INFO } from "@/lib/infographics/verhaallijn";
import { CREDIT_COSTS } from "@/lib/credit-costs";

// HET STORYBOARD — één basisbeeld per scène, vóór er één clip gemaakt wordt.
//
// Elke regel in een scène is een bewerking van dat basisbeeld. Klopt het beeld niet
// (verkeerde kamer, iemand dubbel in beeld, dag terwijl het nacht hoort te zijn),
// dan erven alle clips van die scène die fout. Tot nu toe zag je dat pas als de
// clips al betaald waren. Hier zie je het voor een credit per beeld, en maak je
// alleen dat ene beeld opnieuw — zoals de scènes in de infographics-tool.

export interface HertekenWijziging {
  setting: string;
  licht: Lichtsoort | null;
  aanwijzing: string;
}

function SceneKaart({
  spec,
  scene,
  si,
  bezig,
  geblokkeerd,
  onOpnieuw,
}: {
  spec: DialogueSpec;
  scene: DialogueScene;
  si: number;
  bezig: boolean;
  geblokkeerd: boolean;
  onOpnieuw: (si: number, wijziging: HertekenWijziging) => void;
}) {
  // Concept per kaart: pas bij "opnieuw maken" gaat het naar de spec. Anders zou
  // elke toetsaanslag in de omgeving het bestaande beeld ongeldig maken.
  const [setting, setSetting] = useState(scene.setting);
  const [licht, setLicht] = useState<Lichtsoort>(scene.licht ?? STANDAARD_LICHT);
  const [aanwijzing, setAanwijzing] = useState(scene.beeldAanwijzing ?? "");

  const gewijzigd = setting.trim() !== scene.setting.trim() || licht !== (scene.licht ?? STANDAARD_LICHT);
  const clips = scene.lines.filter(regelKlaar).length;
  const naam = (id: string) =>
    id === VERTELLER_ID ? "Verteller" : spec.cast.find((c) => c.id === id)?.name ?? "?";

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">Scène {si + 1}</span>
        {scene.lines.length > 0 && (
          <span className="text-[10px] text-slate-600">{scene.lines.length} {scene.lines.length === 1 ? "shot" : "shots"}</span>
        )}
      </div>

      {scene.twoShotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={scene.twoShotUrl}
          alt={`Basisbeeld van scène ${si + 1}`}
          className={`w-full h-auto rounded border border-white/10 ${bezig ? "opacity-40" : ""} ${spec.format === "9:16" ? "max-h-[420px] object-contain" : ""}`}
        />
      ) : (
        <div className={`w-full max-w-full rounded border border-dashed border-white/15 bg-slate-900/40 flex items-center justify-center text-[11px] text-slate-500 ${spec.format === "9:16" ? "aspect-[9/16] max-h-[420px]" : "aspect-video"}`}>
          {bezig ? "Beeld maken…" : "Nog geen beeld"}
        </div>
      )}
      {bezig && scene.twoShotUrl && <p className="text-[11px] text-blue-300">Nieuw beeld maken…</p>}

      <ul className="space-y-0.5">
        {scene.lines.map((l, li) => (
          <li key={li} className="text-[11px] text-slate-400 truncate">
            {isActie(l) && !l.text.trim() ? (
              <span className="text-sky-300">🎬 {l.actie}</span>
            ) : (
              <>
                {isActie(l) && <span className="text-sky-300">🎬 </span>}
                <span className={l.characterId === VERTELLER_ID ? "text-violet-300" : "text-orange-300"}>{naam(l.characterId)}</span>
                : {l.text}
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-1.5">
        <input
          value={setting}
          onChange={(e) => setSetting(e.target.value)}
          disabled={geblokkeerd}
          title="De omgeving, in het Engels"
          className="flex-1 min-w-0 bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-[11px] text-white disabled:opacity-50"
        />
        <select
          value={licht}
          onChange={(e) => setLicht(e.target.value as Lichtsoort)}
          disabled={geblokkeerd}
          className="bg-slate-900/60 border border-white/10 rounded px-1 py-1 text-[10px] text-slate-300 disabled:opacity-50"
        >
          {LICHTSOORTEN.map((ls) => <option key={ls} value={ls}>{lichtLabel(ls)}</option>)}
        </select>
      </div>

      <textarea
        value={aanwijzing}
        onChange={(e) => setAanwijzing(e.target.value)}
        disabled={geblokkeerd}
        rows={2}
        placeholder="Wat moet er anders aan dit beeld? Bijv. ‘de kerstboom links, buiten is het al donker’"
        className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-[11px] text-white placeholder:text-slate-600 disabled:opacity-50 resize-y"
      />

      {gewijzigd && scene.twoShotUrl && (
        <p className="text-[10px] text-amber-300">Omgeving of licht aangepast. Maak het beeld opnieuw om het te zien.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onOpnieuw(si, { setting, licht, aanwijzing })}
          disabled={geblokkeerd}
          className="text-xs rounded px-3 py-1.5 bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 disabled:opacity-40 transition"
        >
          {bezig ? "Bezig…" : scene.twoShotUrl ? `↻ Opnieuw maken (${CREDIT_COSTS.IMAGE_GENERATION} credit)` : `Beeld maken (${CREDIT_COSTS.IMAGE_GENERATION} credit)`}
        </button>
        {clips > 0 && (
          <span className="text-[10px] text-slate-500">
            {clips === 1 ? "De clip" : `De ${clips} clips`} van deze scène {clips === 1 ? "wordt" : "worden"} daarna opnieuw gemaakt.
          </span>
        )}
      </div>
    </div>
  );
}

export default function Storyboard({
  spec,
  onOpnieuw,
  bezigMet,
  disabled = false,
}: {
  spec: DialogueSpec;
  onOpnieuw: (si: number, wijziging: HertekenWijziging) => void;
  /** Index van de scène waarvan nu een nieuw beeld gemaakt wordt. */
  bezigMet: number | null;
  disabled?: boolean;
}) {
  return (
    <div className={`grid grid-cols-1 gap-4 ${spec.format === "9:16" ? "sm:grid-cols-2 md:grid-cols-3" : "md:grid-cols-2"}`}>
      {spec.scenes.map((scene, si) => {
        // Boven de eerste scène van elk verhaaldeel staat wat er in dat deel
        // gebeurt. Zo lees je het bord als een verhaal, niet als losse plaatjes.
        const fase = scene.deel ? FASEN[scene.deel - 1] : undefined;
        const nieuwDeel = !!fase && scene.deel !== spec.scenes[si - 1]?.deel;
        const deel = scene.deel ? spec.verhaallijn?.[scene.deel - 1] : undefined;
        return (
          <Fragment key={scene.id}>
            {nieuwDeel && fase && (
              <div className="col-span-full pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-300">
                  {scene.deel}. {FASE_INFO[fase].label}
                </h3>
                {deel?.wat && <p className="text-[11px] text-slate-500 mt-0.5">{deel.wat}</p>}
              </div>
            )}
            <SceneKaart
              spec={spec}
              scene={scene}
              si={si}
              bezig={bezigMet === si}
              geblokkeerd={disabled || bezigMet !== null}
              onOpnieuw={onOpnieuw}
            />
          </Fragment>
        );
      })}
    </div>
  );
}
