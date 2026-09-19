"use client";

import { useState } from "react";
import Link from "next/link";
import type { Omgeving } from "@/lib/infographics/omgeving";
import { hoofdbeeld } from "@/lib/infographics/omgeving";
import {
  heeftStijl, omgevingVoorStijl, beeldUitAndereStijl, type BibliotheekOmgeving,
} from "@/lib/infographics/omgeving-bibliotheek";

// DE PLEK VAN EEN SCÈNE, MET EEN PLAATJE.
//
// Tot nu toe was de plek alleen een zin ("a soccer field in the park") en verzon het
// beeldmodel er per shot een veld bij: andere bomen, het doel aan de andere kant. Hier
// kies of maak je de plek één keer; daarna gaat dat beeld als referentie mee naar elk
// shot van die scène.

export default function OmgevingKiezer({
  omgeving,
  setting,
  styleId,
  onKies,
  onVastleggen,
  bezig = false,
  disabled = false,
}: {
  omgeving?: Omgeving | null;
  /** De geschreven plek van deze scène; waar "vastleggen" mee begint. */
  setting: string;
  styleId?: string | null;
  onKies: (omgeving: Omgeving | null) => void;
  /** Deze plek tekenen en in de bibliotheek zetten. Geeft de nieuwe omgeving terug. */
  onVastleggen: (naam: string) => void;
  bezig?: boolean;
  disabled?: boolean;
}) {
  const [bibliotheek, setBibliotheek] = useState<BibliotheekOmgeving[] | null>(null);
  const [kiezen, setKiezen] = useState(false);
  const [naam, setNaam] = useState("");
  const [melding, setMelding] = useState<string | null>(null);

  async function openBibliotheek() {
    setKiezen(true);
    setMelding(null);
    if (bibliotheek) return;
    try {
      const r = await fetch("/api/omgevingen");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Bibliotheek laden mislukt");
      if (d.nietActief) setMelding("De omgevingenbibliotheek is nog niet actief.");
      setBibliotheek(d.omgevingen ?? []);
    } catch (e) {
      setMelding(e instanceof Error ? e.message : String(e));
      setBibliotheek([]);
    }
  }

  const beeld = omgeving ? hoofdbeeld(omgeving) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        {beeld ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={beeld} alt="" className="w-20 h-12 object-cover rounded border border-white/10" />
        ) : (
          <div className="w-20 h-12 rounded border border-dashed border-white/15 grid place-items-center text-[10px] text-slate-500">
            geen plek
          </div>
        )}
        <div className="min-w-0 flex-1">
          {omgeving ? (
            <>
              <p className="text-xs text-slate-200 truncate">{omgeving.naam}</p>
              <p className="text-[10px] text-slate-500">
                {omgeving.varianten.length} beeld{omgeving.varianten.length === 1 ? "" : "en"} van deze plek
              </p>
            </>
          ) : (
            <p className="text-[10px] text-slate-500 leading-snug">
              Zonder vaste plek tekent hij elke keer een nieuwe omgeving. Leg hem vast, dan blijft de achtergrond
              in elk beeld gelijk.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <button
              type="button"
              disabled={disabled || bezig || !setting.trim()}
              onClick={() => onVastleggen(naam.trim() || setting.trim().slice(0, 60))}
              className="text-[11px] text-emerald-300 hover:text-emerald-200 disabled:opacity-40"
            >
              {bezig ? "Bezig met tekenen…" : omgeving ? "↻ Opnieuw tekenen" : "Deze plek vastleggen"}
            </button>
            <button
              type="button"
              disabled={disabled || bezig}
              onClick={() => (kiezen ? setKiezen(false) : void openBibliotheek())}
              className="text-[11px] text-slate-300 hover:text-white disabled:opacity-40"
            >
              {kiezen ? "sluiten" : "uit je bibliotheek"}
            </button>
            {omgeving && (
              <button
                type="button"
                disabled={disabled || bezig}
                onClick={() => onKies(null)}
                className="text-[11px] text-slate-500 hover:text-slate-300 disabled:opacity-40"
              >
                losmaken
              </button>
            )}
          </div>
        </div>
      </div>

      {!omgeving && !kiezen && (
        <input
          value={naam}
          onChange={(e) => setNaam(e.target.value)}
          disabled={disabled || bezig}
          placeholder="Naam van deze plek, bijv. Het voetbalveld"
          className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-slate-200"
        />
      )}

      {kiezen && (
        <div className="rounded border border-white/10 bg-slate-900/60 p-2 space-y-2">
          {melding && <p className="text-[11px] text-amber-300">{melding}</p>}
          {!bibliotheek ? (
            <p className="text-[11px] text-slate-400">Laden…</p>
          ) : bibliotheek.length === 0 ? (
            <p className="text-[11px] text-slate-400">
              Je hebt nog geen plekken bewaard. Leg deze plek vast, dan staat hij er de volgende keer.{" "}
              <Link href="/omgevingen" className="underline">Je omgevingen</Link>
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {bibliotheek.map((b) => {
                const eigenStijl = heeftStijl(b, styleId);
                const voorbeeld = variantBeeld(b, styleId);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => { onKies(omgevingVoorStijl(b, styleId)); setKiezen(false); }}
                    className="text-left rounded border border-white/10 hover:border-orange-400/60 overflow-hidden"
                    title={b.beschrijving}
                  >
                    {voorbeeld ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={voorbeeld} alt="" className="w-full h-16 object-cover" />
                    ) : (
                      <div className="w-full h-16 bg-slate-800" />
                    )}
                    <span className="block px-1.5 py-1 text-[11px] text-slate-200 truncate">{b.naam}</span>
                    {!eigenStijl && (
                      // Een plek uit een andere tekenstijl past niet tussen deze beelden; die
                      // wordt opnieuw getekend (zelfde afspraak als bij de voorwerpen).
                      <span className="block px-1.5 pb-1 text-[10px] text-amber-300/80">andere tekenstijl</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Het beeld dat we van een bibliotheekplek laten zien: liefst uit deze tekenstijl. */
function variantBeeld(b: BibliotheekOmgeving, styleId?: string | null): string | null {
  const eigen = omgevingVoorStijl(b, styleId);
  return hoofdbeeld(eigen) ?? beeldUitAndereStijl(b, styleId);
}
