"use client";

import type { DialogueSpec } from "@/lib/infographics/dialogue-schema";
import {
  FOUT_LABEL, herstelKosten, herstelUitleg, versieVan, type ControleFout,
} from "@/lib/infographics/video-controle";

// "Laat je video controleren op fouten": één knop die elk shot laat bekijken en naast
// het verhaal legt, en een lijst met fouten die je elk met één klik herstelt — of
// allemaal tegelijk. Het herstellen zelf gebeurt op de pagina: die past het draaiboek
// aan en maakt daarna alleen wat daardoor opnieuw moet.

export default function VideoControle({
  spec,
  bezig,
  disabled = false,
  onControleer,
  onHerstel,
  onNegeer,
}: {
  spec: DialogueSpec;
  /** De controle loopt. */
  bezig: boolean;
  /** Er wordt iets gemaakt; dan niet herstellen. */
  disabled?: boolean;
  onControleer: () => void;
  onHerstel: (fouten: ControleFout[]) => void;
  onNegeer: (fout: ControleFout) => void;
}) {
  const controle = spec.controle ?? null;
  const actueel = !!controle && controle.versie === versieVan(spec);
  const open = (controle?.fouten ?? []).filter((f) => !f.hersteld && !f.genegeerd);
  const hersteld = (controle?.fouten ?? []).filter((f) => f.hersteld).length;
  const heeftShots = spec.scenes.some((s) => s.lines.some((l) => l.shotImageUrl));
  const totaal = open.length ? herstelKosten(spec, open) : 0;

  const knop = (
    <button
      onClick={onControleer}
      disabled={bezig || disabled || actueel || !heeftShots}
      title={actueel ? "Deze versie is al gecontroleerd. Verander of herstel iets, dan kan het opnieuw." : undefined}
      className="text-sm rounded px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-40 transition"
    >
      {bezig ? "Bezig met controleren…" : controle ? "Opnieuw controleren" : "🔍 Laat je video controleren op fouten"}
    </button>
  );

  return (
    <div className="border-t border-white/10 pt-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-white">Controle op fouten</h3>
          <p className="text-[11px] text-slate-500">
            {bezig
              ? "Een AI bekijkt nu elk shot en legt het naast je verhaal. Reken op een halve tot een hele minuut."
              : controle
                ? `${controle.shotsBekeken} shots bekeken · ${open.length} ${open.length === 1 ? "fout" : "fouten"} open${hersteld ? ` · ${hersteld} hersteld` : ""}${actueel ? "" : " · de video is sindsdien veranderd"}`
                : "Gratis. Een AI bekijkt elk shot en legt het naast je verhaal: wie er in beeld hoort, of iedereen er nog hetzelfde uitziet, of de plek klopt en of je verhaal te zien is."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {open.length > 1 && (
            <button
              onClick={() => onHerstel(open)}
              disabled={disabled || bezig}
              className="text-sm rounded px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white font-medium disabled:opacity-40 transition"
            >
              Alles herstellen ({totaal} credits)
            </button>
          )}
          {knop}
        </div>
      </div>

      {controle && open.length === 0 && (
        <p className="text-xs text-emerald-300">
          {controle.fouten.length === 0 ? "Geen fouten gevonden." : "Alle fouten zijn hersteld of genegeerd."}
          {!actueel && " Wil je zeker weten dat het nu klopt, controleer dan opnieuw."}
        </p>
      )}

      {open.length > 0 && (
        <ul className="space-y-2">
          {open.map((f) => {
            const scene = spec.scenes[f.scene];
            const regel = f.regel !== null ? scene?.lines[f.regel] : undefined;
            const plaatje = regel?.shotImageUrl || scene?.twoShotUrl || null;
            const kosten = herstelKosten(spec, [f]);
            return (
              <li key={f.id} className="flex flex-wrap sm:flex-nowrap gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                {plaatje && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={plaatje} alt="" className="w-28 max-w-full h-auto rounded border border-white/10 shrink-0 self-start" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="rounded-full bg-sky-500/15 text-sky-300 px-1.5 py-0.5">{FOUT_LABEL[f.soort]}</span>
                    <span className="text-slate-500">
                      Scène {f.scene + 1}{f.regel !== null ? ` · shot ${f.regel + 1}` : ""}
                    </span>
                  </div>
                  <p className="text-sm text-white mt-1">{f.wat}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{herstelUitleg(spec, f)}</p>
                </div>
                <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                  <button
                    onClick={() => onHerstel([f])}
                    disabled={disabled || bezig}
                    className="text-xs rounded px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white font-medium disabled:opacity-40 transition"
                  >
                    Herstel ({kosten} {kosten === 1 ? "credit" : "credits"})
                  </button>
                  <button
                    onClick={() => onNegeer(f)}
                    disabled={disabled || bezig}
                    className="text-[11px] text-slate-500 hover:text-white disabled:opacity-40"
                  >
                    Negeer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
