"use client";

import { Fragment, useState } from "react";
import {
  regelKlaar, isActie, bruikbareRegel, VERTELLER_ID,
  type DialogueSpec, type DialogueScene, type DialogueLine,
} from "@/lib/infographics/dialogue-schema";
import { LICHTSOORTEN, STANDAARD_LICHT, lichtLabel, type Lichtsoort } from "@/lib/infographics/verhaal-licht";
import { kaderLabel } from "@/lib/infographics/verhaal-kaders";
import { deelLabel } from "@/lib/infographics/verhaallijn";
import { CREDIT_COSTS } from "@/lib/credit-costs";

// HET STORYBOARD — per scène het beeld van de plek, en daaronder één beeld per
// regel. Allemaal vóór er één clip gemaakt wordt.
//
// Eerst stond hier alleen het beeld van de plek. De beelden per regel werden pas
// getekend bij het maken van de clips, dus je zag ze pas als die al betaald waren.
// En wat er in dat ene plekbeeld ontbrak — de bloem waar Tyrell over praat, een
// close-up, iemand die zit — moest het videomodel zelf verzinnen. Nu ligt elk shot
// hier vast, voor een credit per beeld, en voegt de clip alleen nog beweging toe.

export interface HertekenWijziging {
  setting: string;
  licht: Lichtsoort | null;
  aanwijzing: string;
}

function ShotTegel({
  spec,
  regel,
  li,
  bezig,
  geblokkeerd,
  heeftPlek,
  onOpnieuw,
}: {
  spec: DialogueSpec;
  regel: DialogueLine;
  li: number;
  bezig: boolean;
  geblokkeerd: boolean;
  heeftPlek: boolean;
  onOpnieuw: (li: number, aanwijzing: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [aanwijzing, setAanwijzing] = useState(regel.beeldAanwijzing ?? "");
  const naam = (id: string) =>
    id === VERTELLER_ID ? "Verteller" : spec.cast.find((c) => c.id === id)?.name ?? "?";
  const waarschuwingen = regel.beeldWaarschuwingen ?? [];
  const vorm = spec.format === "9:16" ? "aspect-[9/16]" : "aspect-video";
  const tekst = (regel.text ?? "").trim();

  return (
    <div className="rounded border border-white/10 bg-slate-900/40 p-1.5 flex flex-col gap-1 min-w-0">
      {regel.shotImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={regel.shotImageUrl}
          alt={`Shot ${li + 1}`}
          className={`w-full max-w-full ${vorm} object-cover rounded ${bezig ? "opacity-40" : ""}`}
        />
      ) : (
        <div className={`w-full max-w-full ${vorm} rounded border border-dashed border-white/15 flex items-center justify-center text-center px-2 text-[10px] text-slate-500`}>
          {bezig ? "Beeld maken…" : heeftPlek ? "Nog geen beeld" : "Eerst het beeld van de plek"}
        </div>
      )}

      <div className="flex items-center justify-between gap-1 text-[10px] text-slate-500">
        <span>{li + 1}. {kaderLabel(regel.kader)}</span>
        {waarschuwingen.length > 0 && (
          <span className="text-amber-400" title={`Beeldcontrole: ${waarschuwingen.join("; ")}`}>⚠ bekijk dit beeld</span>
        )}
      </div>

      <p className="text-[11px] leading-snug text-slate-400 max-h-[2.6rem] overflow-hidden">
        {isActie(regel) && <span className="text-sky-300">🎬 </span>}
        {tekst ? (
          <>
            <span className={regel.characterId === VERTELLER_ID ? "text-violet-300" : "text-orange-300"}>{naam(regel.characterId)}</span>
            : {tekst}
          </>
        ) : (
          <span className="text-sky-300">{regel.actie}</span>
        )}
      </p>

      {regel.beeldAanwijzingUitleg && (
        <p className="text-[10px] leading-snug text-emerald-300/80" title={regel.beeldAanwijzing ?? undefined}>
          Begrepen: {regel.beeldAanwijzingUitleg}
        </p>
      )}

      {open ? (
        <div className="flex flex-col gap-1">
          <textarea
            value={aanwijzing}
            onChange={(e) => setAanwijzing(e.target.value)}
            disabled={geblokkeerd}
            rows={3}
            placeholder="Wat moet er anders? Je mag naar andere beelden verwijzen, bijv. ‘Lilly's haar zoals in shot 1’"
            className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-[11px] text-white placeholder:text-slate-600 disabled:opacity-50 resize-y"
          />
          {regel.videoUrl && (
            <p className="text-[10px] text-slate-500">De clip van dit shot wordt daarna opnieuw gemaakt.</p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { onOpnieuw(li, aanwijzing); setOpen(false); }}
              disabled={geblokkeerd}
              className="text-[11px] rounded px-2 py-1 bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 disabled:opacity-40 transition"
            >
              ↻ Opnieuw maken ({CREDIT_COSTS.IMAGE_GENERATION_PRO} credits)
            </button>
            <button onClick={() => setOpen(false)} className="text-[10px] text-slate-500 hover:text-white">
              Annuleren
            </button>
          </div>
        </div>
      ) : regel.shotImageUrl ? (
        <button
          onClick={() => setOpen(true)}
          disabled={geblokkeerd}
          className="text-[10px] text-slate-500 hover:text-orange-300 self-start disabled:opacity-40"
        >
          {bezig ? "Bezig…" : "✎ Aanpassen"}
        </button>
      ) : (
        <button
          onClick={() => onOpnieuw(li, aanwijzing)}
          disabled={geblokkeerd || !heeftPlek}
          className="text-[10px] text-slate-400 hover:text-orange-300 self-start disabled:opacity-40"
        >
          {bezig ? "Bezig…" : `Beeld maken (${CREDIT_COSTS.IMAGE_GENERATION_PRO} credits)`}
        </button>
      )}
    </div>
  );
}

function SceneKaart({
  spec,
  scene,
  si,
  bezig,
  geblokkeerd,
  regelsBezig,
  onOpnieuw,
  onRegelOpnieuw,
}: {
  spec: DialogueSpec;
  scene: DialogueScene;
  si: number;
  bezig: boolean;
  geblokkeerd: boolean;
  regelsBezig: string[];
  onOpnieuw: (si: number, wijziging: HertekenWijziging) => void;
  onRegelOpnieuw: (si: number, li: number, aanwijzing: string) => void;
}) {
  // Concept per kaart: pas bij "opnieuw maken" gaat het naar de spec. Anders zou
  // elke toetsaanslag in de omgeving het bestaande beeld ongeldig maken.
  const [setting, setSetting] = useState(scene.setting);
  const [licht, setLicht] = useState<Lichtsoort>(scene.licht ?? STANDAARD_LICHT);
  const [aanwijzing, setAanwijzing] = useState(scene.beeldAanwijzing ?? "");

  const gewijzigd = setting.trim() !== scene.setting.trim() || licht !== (scene.licht ?? STANDAARD_LICHT);
  const regels = scene.lines.map((l, li) => ({ l, li })).filter(({ l }) => bruikbareRegel(l));
  const beelden = regels.filter(({ l }) => l.shotImageUrl).length;
  const clips = scene.lines.filter(regelKlaar).length;
  const eigenBezig = regelsBezig.some((k) => k.startsWith(`${si}-`));

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">Scène {si + 1}</span>
        {regels.length > 0 && (
          <span className="text-[10px] text-slate-600">
            {beelden}/{regels.length} {regels.length === 1 ? "beeld" : "beelden"}
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* De plek: het beeld waar elk shot van deze scène op voortbouwt. */}
        <div className="flex flex-col gap-2 min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-slate-600">De plek</p>
          {scene.twoShotUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={scene.twoShotUrl}
              alt={`De plek van scène ${si + 1}`}
              className={`w-full max-w-full h-auto rounded border border-white/10 ${bezig ? "opacity-40" : ""} ${spec.format === "9:16" ? "max-h-[320px] object-contain" : ""}`}
            />
          ) : (
            <div className={`w-full max-w-full rounded border border-dashed border-white/15 bg-slate-900/40 flex items-center justify-center text-[11px] text-slate-500 ${spec.format === "9:16" ? "aspect-[9/16] max-h-[320px]" : "aspect-video"}`}>
              {bezig ? "Beeld maken…" : "Nog geen beeld"}
            </div>
          )}
          {bezig && scene.twoShotUrl && <p className="text-[11px] text-blue-300">Nieuw beeld maken…</p>}

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
            placeholder="Wat moet er anders aan deze plek? Bijv. ‘een beekje op de achtergrond’"
            className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-[11px] text-white placeholder:text-slate-600 disabled:opacity-50 resize-y"
          />

          {gewijzigd && scene.twoShotUrl && (
            <p className="text-[10px] text-amber-300">Omgeving of licht aangepast. Maak het beeld opnieuw om het te zien.</p>
          )}

          <button
            onClick={() => onOpnieuw(si, { setting, licht, aanwijzing })}
            disabled={geblokkeerd || eigenBezig}
            className="self-start text-xs rounded px-3 py-1.5 bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 disabled:opacity-40 transition"
          >
            {bezig ? "Bezig…" : scene.twoShotUrl ? `↻ Plek opnieuw maken (${CREDIT_COSTS.IMAGE_GENERATION_PRO} credits)` : `Beeld maken (${CREDIT_COSTS.IMAGE_GENERATION_PRO} credits)`}
          </button>
          {scene.twoShotUrl && (beelden > 0 || clips > 0) && (
            <p className="text-[10px] text-slate-500">
              De beelden per zin horen bij deze plek en moeten daarna opnieuw
              {clips > 0 ? `, net als ${clips === 1 ? "de clip" : `de ${clips} clips`}` : ""}.
            </p>
          )}
        </div>

        {/* Eén beeld per regel: dit is wat er straks in de video beweegt. */}
        <div className={`grid gap-2 content-start ${spec.format === "9:16" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
          {regels.map(({ l, li }) => (
            <ShotTegel
              key={`${scene.id}-${li}`}
              spec={spec}
              regel={l}
              li={li}
              bezig={regelsBezig.includes(`${si}-${li}`)}
              geblokkeerd={geblokkeerd || bezig || regelsBezig.includes(`${si}-${li}`)}
              heeftPlek={!!scene.twoShotUrl}
              onOpnieuw={(regelIndex, tekst) => onRegelOpnieuw(si, regelIndex, tekst)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Storyboard({
  spec,
  onOpnieuw,
  onRegelOpnieuw,
  bezigMet,
  regelsBezig,
  disabled = false,
}: {
  spec: DialogueSpec;
  onOpnieuw: (si: number, wijziging: HertekenWijziging) => void;
  onRegelOpnieuw: (si: number, li: number, aanwijzing: string) => void;
  /** Index van de scène waarvan nu een nieuw plekbeeld gemaakt wordt. */
  bezigMet: number | null;
  /** Regels ("scène-regel") waarvan nu een beeld gemaakt wordt. */
  regelsBezig: string[];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      {spec.scenes.map((scene, si) => {
        // Boven de eerste scène van elk verhaaldeel staat wat er in dat deel
        // gebeurt. Zo lees je het bord als een verhaal, niet als losse plaatjes.
        const deel = scene.deel ? spec.verhaallijn?.[scene.deel - 1] : undefined;
        const nieuwDeel = !!deel && scene.deel !== spec.scenes[si - 1]?.deel;
        return (
          <Fragment key={scene.id}>
            {nieuwDeel && !!scene.deel && (
              <div className="pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-300">
                  {scene.deel}. {deelLabel(deel, scene.deel - 1)}
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
              regelsBezig={regelsBezig}
              onOpnieuw={onOpnieuw}
              onRegelOpnieuw={onRegelOpnieuw}
            />
          </Fragment>
        );
      })}
    </div>
  );
}
