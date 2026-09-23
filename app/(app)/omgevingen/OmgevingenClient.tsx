"use client";

import { useState } from "react";
import { STORY_STYLE_PRESETS } from "@/lib/infographics/story-style";
import {
  MAX_OMGEVING_NAAM, MAX_OMGEVING_BESCHRIJVING, variantenVoorStijl, beeldUitAndereStijl,
  type BibliotheekOmgeving,
} from "@/lib/infographics/omgeving-bibliotheek";
import { OMGEVING_VARIANTEN } from "@/lib/infographics/omgeving";

// De omgevingenbibliotheek: plekken die in elke video dezelfde plek horen te zijn, zoals
// het voetbalveld of oma's woonkamer. Een plek wordt getekend in de video waarin je hem
// vastlegt — drie beelden van dezelfde plek, zodat de camera kan variëren.

const stijlNaam = (id: string) => STORY_STYLE_PRESETS.find((s) => s.id === id)?.name ?? id;

function OmgevingKaart({
  omgeving,
  onBijgewerkt,
  onVerwijderd,
}: {
  omgeving: BibliotheekOmgeving;
  onBijgewerkt: (o: BibliotheekOmgeving) => void;
  onVerwijderd: (id: string) => void;
}) {
  const [bewerken, setBewerken] = useState(false);
  const [naam, setNaam] = useState(omgeving.naam);
  const [beschrijving, setBeschrijving] = useState(omgeving.beschrijving);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const stijlen = Object.keys(omgeving.varianten);
  const beelden = stijlen.length ? variantenVoorStijl(omgeving, stijlen[0]) : [];
  const eerste = beelden[0]?.url ?? beeldUitAndereStijl(omgeving, null);

  async function bewaar() {
    setBezig(true);
    setFout(null);
    try {
      const r = await fetch("/api/omgevingen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: omgeving.id, naam, beschrijving }),
      });
      const d = await r.json();
      if (!r.ok || !d.omgeving) throw new Error(d.error || "Bewaren mislukt");
      onBijgewerkt(d.omgeving);
      setBewerken(false);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  }

  async function verwijder() {
    if (!window.confirm(`"${omgeving.naam}" uit je bibliotheek verwijderen? Video's die deze plek al gebruiken houden hun eigen versie.`)) return;
    setBezig(true);
    const r = await fetch(`/api/omgevingen/${omgeving.id}`, { method: "DELETE" });
    if (r.ok) onVerwijderd(omgeving.id);
    else setFout("Verwijderen mislukt");
    setBezig(false);
  }

  const beschrijvingGewijzigd = beschrijving.trim() !== omgeving.beschrijving.trim();

  return (
    <div className="bg-slate-950/60 border border-white/10 rounded-lg overflow-hidden flex flex-col">
      <div className="aspect-video bg-slate-900 relative flex items-center justify-center">
        {eerste ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={eerste} alt={omgeving.naam} className="w-full h-full object-cover" />
        ) : (
          <p className="text-[10px] text-slate-500 text-center px-3">
            Nog niet getekend. Dat gebeurt in de video waarin je deze plek vastlegt.
          </p>
        )}
        <button
          onClick={verwijder}
          disabled={bezig}
          className="absolute top-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded disabled:opacity-50"
          title="Verwijderen"
        >
          ×
        </button>
      </div>
      {beelden.length > 1 && (
        <div className="flex gap-1 p-1 bg-slate-900/60">
          {OMGEVING_VARIANTEN.map((soort) => {
            const b = beelden.find((v) => v.soort === soort);
            return b ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={soort} src={b.url} alt={soort} title={soort} className="w-1/3 h-10 object-cover rounded" />
            ) : (
              <div key={soort} className="w-1/3 h-10 rounded bg-slate-800" />
            );
          })}
        </div>
      )}
      <div className="p-2 flex flex-col gap-1.5">
        {bewerken ? (
          <>
            <input
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
              maxLength={MAX_OMGEVING_NAAM}
              className="bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white"
            />
            <textarea
              value={beschrijving}
              onChange={(e) => setBeschrijving(e.target.value)}
              maxLength={MAX_OMGEVING_BESCHRIJVING}
              rows={4}
              className="bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-[11px] text-white resize-y"
            />
            {beschrijvingGewijzigd && stijlen.length > 0 && (
              <p className="text-[10px] text-amber-300">
                Een andere beschrijving is een andere plek: de getekende beelden vervallen en worden opnieuw getekend.
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={bewaar}
                disabled={bezig || !naam.trim() || !beschrijving.trim()}
                className="text-[11px] rounded px-2 py-1 bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-40"
              >
                {bezig ? "Bezig…" : "Bewaren"}
              </button>
              <button
                onClick={() => { setBewerken(false); setNaam(omgeving.naam); setBeschrijving(omgeving.beschrijving); }}
                className="text-[10px] text-slate-500 hover:text-white"
              >
                Annuleren
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs font-medium text-white truncate">{omgeving.naam}</p>
            <p className="text-[10px] text-slate-500 line-clamp-3">{omgeving.beschrijving}</p>
            <p className="text-[10px] text-slate-600">
              {stijlen.length ? `Getekend in: ${stijlen.map(stijlNaam).join(", ")}` : "Nog in geen enkele stijl getekend"}
            </p>
            <button onClick={() => setBewerken(true)} className="self-start text-[10px] text-slate-400 hover:text-orange-300">
              ✎ Aanpassen
            </button>
          </>
        )}
        {fout && <p className="text-[10px] text-red-400">{fout}</p>}
      </div>
    </div>
  );
}

export default function OmgevingenClient({
  initialOmgevingen,
  nietActief,
  fout,
}: {
  initialOmgevingen: BibliotheekOmgeving[];
  nietActief: boolean;
  fout: string | null;
}) {
  const [omgevingen, setOmgevingen] = useState(initialOmgevingen);
  const [naam, setNaam] = useState("");
  const [beschrijving, setBeschrijving] = useState("");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(fout);

  async function voegToe(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch("/api/omgevingen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naam, beschrijving }),
      });
      const d = await r.json();
      if (!r.ok || !d.omgeving) throw new Error(d.error || "Bewaren mislukt");
      setOmgevingen((lijst) => [d.omgeving, ...lijst]);
      setNaam("");
      setBeschrijving("");
    } catch (err) {
      setMelding(err instanceof Error ? err.message : String(err));
    } finally {
      setBezig(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Omgevingen</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          De plekken waar je video&rsquo;s zich afspelen: het voetbalveld, de kleedkamer, oma&rsquo;s woonkamer. Een plek
          wordt één keer getekend — van veraf, van halverwege en van dichtbij — en daarna blijft de achtergrond in elk
          beeld dezelfde plek.
        </p>
      </div>

      {nietActief && (
        <div className="mb-4 bg-amber-500/10 border border-amber-400/30 text-amber-200 text-sm rounded-lg px-3 py-2">
          De omgevingenbibliotheek is nog niet actief: de databasetabel moet nog aangemaakt worden.
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-5">
        <h2 className="text-sm font-semibold text-white mb-3">Nieuwe plek</h2>
        <form onSubmit={voegToe} className="flex flex-col gap-2">
          <input
            value={naam}
            onChange={(e) => setNaam(e.target.value)}
            maxLength={MAX_OMGEVING_NAAM}
            placeholder="Naam, bijv. Het voetbalveld"
            disabled={nietActief}
            className="bg-slate-900/60 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder:text-slate-600 disabled:opacity-50"
          />
          <textarea
            value={beschrijving}
            onChange={(e) => setBeschrijving(e.target.value)}
            maxLength={MAX_OMGEVING_BESCHRIJVING}
            rows={3}
            placeholder="Hoe ziet de plek eruit? Noem de grond, de lucht en drie dingen die er altijd staan. Het liefst in het Engels, bijv. a sunny neighbourhood soccer field: green grass with white lines, a small white goal, tall trees and a low hedge around it"
            disabled={nietActief}
            className="bg-slate-900/60 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder:text-slate-600 resize-y disabled:opacity-50"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={bezig || nietActief || !naam.trim() || !beschrijving.trim()}
              className="text-sm rounded px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-40"
            >
              {bezig ? "Bezig…" : "Toevoegen"}
            </button>
            <span className="text-[11px] text-slate-500">
              Kost niets. De plek wordt getekend in de video waarin je hem vastlegt.
            </span>
          </div>
          {melding && <p className="text-xs text-red-400">{melding}</p>}
        </form>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Mijn plekken ({omgevingen.length})</h2>
        {omgevingen.length === 0 ? (
          <p className="text-xs text-slate-500">
            Nog geen plekken. Voeg er hierboven een toe, of leg een plek vast vanuit het storyboard met &ldquo;Deze plek
            vastleggen&rdquo;.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {omgevingen.map((o) => (
              <OmgevingKaart
                key={o.id}
                omgeving={o}
                onBijgewerkt={(nieuw) => setOmgevingen((lijst) => lijst.map((x) => (x.id === nieuw.id ? nieuw : x)))}
                onVerwijderd={(id) => setOmgevingen((lijst) => lijst.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
