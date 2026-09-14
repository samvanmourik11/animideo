"use client";

import { useState } from "react";
import { STORY_STYLE_PRESETS } from "@/lib/infographics/story-style";
import { MAX_NAAM, MAX_UITERLIJK, type BibliotheekVoorwerp } from "@/lib/infographics/voorwerp-bibliotheek";

// De voorwerpenbibliotheek: voorwerpen die in elke video hetzelfde horen te zijn,
// zoals de Wonderwagen. Een voorwerp wordt getekend in de eerste video waarin het in
// een tekenstijl voorkomt, en dat blad komt hier terug.

const stijlNaam = (id: string) => STORY_STYLE_PRESETS.find((s) => s.id === id)?.name ?? id;

function VoorwerpKaart({
  voorwerp,
  onBijgewerkt,
  onVerwijderd,
}: {
  voorwerp: BibliotheekVoorwerp;
  onBijgewerkt: (v: BibliotheekVoorwerp) => void;
  onVerwijderd: (id: string) => void;
}) {
  const [bewerken, setBewerken] = useState(false);
  const [naam, setNaam] = useState(voorwerp.naam);
  const [uiterlijk, setUiterlijk] = useState(voorwerp.uiterlijk);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const stijlen = Object.keys(voorwerp.bladen);
  const eersteBlad = Object.values(voorwerp.bladen)[0];

  async function bewaar() {
    setBezig(true);
    setFout(null);
    try {
      const r = await fetch("/api/voorwerpen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: voorwerp.id, naam, uiterlijk }),
      });
      const d = await r.json();
      if (!r.ok || !d.voorwerp) throw new Error(d.error || "Bewaren mislukt");
      onBijgewerkt(d.voorwerp);
      setBewerken(false);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  }

  async function verwijder() {
    if (!window.confirm(`"${voorwerp.naam}" uit je bibliotheek verwijderen? Video's die hem al gebruiken houden hun eigen versie.`)) return;
    setBezig(true);
    const r = await fetch(`/api/voorwerpen/${voorwerp.id}`, { method: "DELETE" });
    if (r.ok) onVerwijderd(voorwerp.id);
    else setFout("Verwijderen mislukt");
    setBezig(false);
  }

  const beschrijvingGewijzigd = uiterlijk.trim() !== voorwerp.uiterlijk.trim();

  return (
    <div className="bg-slate-950/60 border border-white/10 rounded-lg overflow-hidden flex flex-col">
      <div className="aspect-video bg-slate-900 relative flex items-center justify-center">
        {eersteBlad ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={eersteBlad} alt={voorwerp.naam} className="w-full h-full object-contain" />
        ) : (
          <p className="text-[10px] text-slate-500 text-center px-3">
            Nog niet getekend. Dat gebeurt in de eerste video waarin hij voorkomt.
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
      <div className="p-2 flex flex-col gap-1.5">
        {bewerken ? (
          <>
            <input
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
              maxLength={MAX_NAAM}
              className="bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white"
            />
            <textarea
              value={uiterlijk}
              onChange={(e) => setUiterlijk(e.target.value)}
              maxLength={MAX_UITERLIJK}
              rows={4}
              className="bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-[11px] text-white resize-y"
            />
            {beschrijvingGewijzigd && stijlen.length > 0 && (
              <p className="text-[10px] text-amber-300">
                Een andere beschrijving is een ander voorwerp: de getekende versies vervallen en worden opnieuw getekend.
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={bewaar}
                disabled={bezig || !naam.trim() || !uiterlijk.trim()}
                className="text-[11px] rounded px-2 py-1 bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-40"
              >
                {bezig ? "Bezig…" : "Bewaren"}
              </button>
              <button
                onClick={() => { setBewerken(false); setNaam(voorwerp.naam); setUiterlijk(voorwerp.uiterlijk); }}
                className="text-[10px] text-slate-500 hover:text-white"
              >
                Annuleren
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs font-medium text-white truncate">{voorwerp.naam}</p>
            <p className="text-[10px] text-slate-500 line-clamp-3">{voorwerp.uiterlijk}</p>
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

export default function VoorwerpenClient({
  initialVoorwerpen,
  nietActief,
  fout,
}: {
  initialVoorwerpen: BibliotheekVoorwerp[];
  nietActief: boolean;
  fout: string | null;
}) {
  const [voorwerpen, setVoorwerpen] = useState(initialVoorwerpen);
  const [naam, setNaam] = useState("");
  const [uiterlijk, setUiterlijk] = useState("");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(fout);

  async function voegToe(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch("/api/voorwerpen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naam, uiterlijk }),
      });
      const d = await r.json();
      if (!r.ok || !d.voorwerp) throw new Error(d.error || "Bewaren mislukt");
      setVoorwerpen((lijst) => [d.voorwerp, ...lijst]);
      setNaam("");
      setUiterlijk("");
    } catch (err) {
      setMelding(err instanceof Error ? err.message : String(err));
    } finally {
      setBezig(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Voorwerpen</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Voorwerpen die in elke video hetzelfde moeten zijn, zoals een wagen, een knuffel of een kaart. In de Dialoogmodus
          kiest de opzet ze uit deze bibliotheek.
        </p>
      </div>

      {nietActief && (
        <div className="mb-4 bg-amber-500/10 border border-amber-400/30 text-amber-200 text-sm rounded-lg px-3 py-2">
          De voorwerpenbibliotheek is nog niet actief: de databasetabel moet nog aangemaakt worden.
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-5">
        <h2 className="text-sm font-semibold text-white mb-3">Nieuw voorwerp</h2>
        <form onSubmit={voegToe} className="flex flex-col gap-2">
          <input
            value={naam}
            onChange={(e) => setNaam(e.target.value)}
            maxLength={MAX_NAAM}
            placeholder="Naam, bijv. Wonderwagen"
            disabled={nietActief}
            className="bg-slate-900/60 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder:text-slate-600 disabled:opacity-50"
          />
          <textarea
            value={uiterlijk}
            onChange={(e) => setUiterlijk(e.target.value)}
            maxLength={MAX_UITERLIJK}
            rows={3}
            placeholder="Hoe ziet het eruit? Wat voor ding, hoofdkleur, twee opvallende details en hoe groot naast de personages. Het liefst in het Engels, bijv. an old wooden covered wagon on four big red wheels, big enough for three people to sit inside"
            disabled={nietActief}
            className="bg-slate-900/60 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder:text-slate-600 resize-y disabled:opacity-50"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={bezig || nietActief || !naam.trim() || !uiterlijk.trim()}
              className="text-sm rounded px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-40"
            >
              {bezig ? "Bezig…" : "Toevoegen"}
            </button>
            <span className="text-[11px] text-slate-500">
              Kost niets. Het voorwerp wordt getekend in de eerste video waarin het voorkomt.
            </span>
          </div>
          {melding && <p className="text-xs text-red-400">{melding}</p>}
        </form>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Mijn voorwerpen ({voorwerpen.length})</h2>
        {voorwerpen.length === 0 ? (
          <p className="text-xs text-slate-500">
            Nog geen voorwerpen. Voeg er hierboven een toe, of bewaar een voorwerp vanuit een video met &ldquo;Bewaar in bibliotheek&rdquo;.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {voorwerpen.map((v) => (
              <VoorwerpKaart
                key={v.id}
                voorwerp={v}
                onBijgewerkt={(nieuw) => setVoorwerpen((lijst) => lijst.map((x) => (x.id === nieuw.id ? nieuw : x)))}
                onVerwijderd={(id) => setVoorwerpen((lijst) => lijst.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
