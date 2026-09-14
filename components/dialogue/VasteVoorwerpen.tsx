"use client";

import { useState } from "react";
import Link from "next/link";
import type { DialogueVoorwerp } from "@/lib/infographics/dialogue-schema";
import { MAX_VOORWERPEN, naarDialoogVoorwerp, type BibliotheekVoorwerp } from "@/lib/infographics/voorwerp-bibliotheek";

// Voorwerpen die in het verhaal terugkomen, met hoe ze eruitzien. Staat zowel in
// de opzet als bij de beeldregie van het draaiboek, net als de tekenstijl: je ziet
// pas dat de wagen elke keer anders is als de beelden er zijn.
//
// Een voorwerp uit de voorwerpenbibliotheek is in elke video hetzelfde. Een nieuw
// voorwerp bewaar je daar met één klik, zodat de volgende video hem ook zo tekent.

export default function VasteVoorwerpen({
  voorwerpen,
  onChange,
  styleId,
  disabled = false,
}: {
  voorwerpen: DialogueVoorwerp[];
  onChange: (v: DialogueVoorwerp[]) => void;
  /** De tekenstijl van deze video: een blad hoort bij één stijl. */
  styleId?: string | null;
  disabled?: boolean;
}) {
  const [bibliotheek, setBibliotheek] = useState<BibliotheekVoorwerp[] | null>(null);
  const [kiezen, setKiezen] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [bewaartIndex, setBewaartIndex] = useState<number | null>(null);

  // Een andere naam of beschrijving maakt het getekende blad ongeldig: dat wordt bij
  // het volgende storyboard opnieuw gemaakt. Bij een bibliotheekvoorwerp is het dan
  // ook niet meer hetzelfde voorwerp, dus het laat de bibliotheek los.
  const zet = (i: number, velden: Partial<DialogueVoorwerp>) =>
    onChange(voorwerpen.map((v, x) => (x !== i ? v : { ...v, ...velden, bladUrl: null, bibliotheekId: null, voorbeeldUrl: null })));

  async function openBibliotheek() {
    setKiezen(true);
    setMelding(null);
    if (bibliotheek) return;
    try {
      const r = await fetch("/api/voorwerpen");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Bibliotheek laden mislukt");
      if (d.nietActief) setMelding("De voorwerpenbibliotheek is nog niet actief.");
      setBibliotheek(d.voorwerpen ?? []);
    } catch (e) {
      setMelding(e instanceof Error ? e.message : String(e));
      setBibliotheek([]);
    }
  }

  function kies(v: BibliotheekVoorwerp) {
    onChange([...voorwerpen, naarDialoogVoorwerp(v, styleId)]);
    setKiezen(false);
  }

  async function bewaarInBibliotheek(i: number) {
    const v = voorwerpen[i];
    setBewaartIndex(i);
    setMelding(null);
    try {
      const r = await fetch("/api/voorwerpen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naam: v.naam, uiterlijk: v.uiterlijk, styleId, bladUrl: v.bladUrl ?? undefined }),
      });
      const d = await r.json();
      if (!r.ok || !d.voorwerp) throw new Error(d.error || "Bewaren mislukt");
      onChange(voorwerpen.map((x, j) => (j !== i ? x : { ...x, bibliotheekId: d.voorwerp.id })));
      setBibliotheek((lijst) => (lijst ? [d.voorwerp, ...lijst] : lijst));
    } catch (e) {
      setMelding(e instanceof Error ? e.message : String(e));
    } finally {
      setBewaartIndex(null);
    }
  }

  const gekozen = new Set(voorwerpen.map((v) => v.bibliotheekId).filter(Boolean));
  const beschikbaar = (bibliotheek ?? []).filter((v) => !gekozen.has(v.id));

  return (
    <div>
      <span className="block text-[11px] text-slate-400 mb-1">Voorwerpen die terugkomen</span>
      <p className="text-[11px] text-slate-500 mb-1.5">
        Zo zien ze er in élk beeld uit. Elk voorwerp wordt één keer getekend (1 credit) en dat beeld gaat mee naar
        de scènes waarin het genoemd wordt. Uit je <Link href="/voorwerpen" className="underline hover:text-slate-300">voorwerpenbibliotheek</Link> zijn
        ze in elke video hetzelfde.
      </p>
      {voorwerpen.length > 0 && (
        <ul className="space-y-1.5 mb-1.5">
          {voorwerpen.map((v, i) => (
            <li key={i} className="flex items-start gap-1.5">
              {v.bladUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.bladUrl} alt={v.naam} className="w-14 h-10 object-contain rounded border border-white/10 bg-slate-900 shrink-0" />
              ) : (
                <div className="w-14 h-10 rounded border border-dashed border-white/10 shrink-0" title="Wordt getekend bij het storyboard" />
              )}
              <div className="w-28 shrink-0 flex flex-col gap-0.5">
                <input
                  value={v.naam}
                  onChange={(e) => zet(i, { naam: e.target.value })}
                  disabled={disabled}
                  placeholder="naam"
                  className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-slate-600 disabled:opacity-50"
                />
                {v.bibliotheekId ? (
                  <span className="text-[10px] text-emerald-400">uit je bibliotheek</span>
                ) : (
                  v.naam.trim() && v.uiterlijk.trim() && (
                    <button
                      type="button"
                      onClick={() => bewaarInBibliotheek(i)}
                      disabled={disabled || bewaartIndex !== null}
                      className="text-left text-[10px] text-slate-400 hover:text-emerald-400 disabled:opacity-40"
                    >
                      {bewaartIndex === i ? "Bewaren…" : "Bewaar in bibliotheek"}
                    </button>
                  )
                )}
              </div>
              <textarea
                value={v.uiterlijk}
                onChange={(e) => zet(i, { uiterlijk: e.target.value })}
                disabled={disabled}
                rows={2}
                placeholder="hoe het eruitziet: vorm, kleuren, materiaal (het liefst in het Engels)"
                className="flex-1 min-w-0 bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-slate-600 disabled:opacity-50 resize-y"
              />
              <button
                type="button"
                onClick={() => onChange(voorwerpen.filter((_, x) => x !== i))}
                disabled={disabled}
                title="Voorwerp verwijderen"
                className="text-xs text-slate-500 hover:text-red-400 disabled:opacity-30 mt-1"
              >✕</button>
            </li>
          ))}
        </ul>
      )}

      {kiezen && (
        <div className="mb-1.5 rounded border border-white/10 bg-slate-900/60 p-2">
          {bibliotheek === null ? (
            <p className="text-[11px] text-slate-500">Bibliotheek laden…</p>
          ) : beschikbaar.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              {bibliotheek.length ? "Alle voorwerpen uit je bibliotheek staan er al." : "Je bibliotheek heeft nog geen voorwerpen."}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {beschikbaar.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => kies(v)}
                    title={v.uiterlijk}
                    className="text-[11px] rounded-full border border-white/10 px-2 py-0.5 text-slate-300 hover:border-emerald-400/50 hover:text-emerald-300"
                  >
                    {v.naam}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setKiezen(false)} className="mt-1.5 text-[10px] text-slate-500 hover:text-white">
            Sluiten
          </button>
        </div>
      )}

      {melding && <p className="text-[11px] text-amber-300 mb-1">{melding}</p>}

      {voorwerpen.length < MAX_VOORWERPEN && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onChange([...voorwerpen, { naam: "", uiterlijk: "", bladUrl: null }])}
            disabled={disabled}
            className="text-[11px] text-slate-400 hover:text-emerald-400 disabled:opacity-30"
          >+ nieuw voorwerp</button>
          <button
            type="button"
            onClick={openBibliotheek}
            disabled={disabled}
            className="text-[11px] text-slate-400 hover:text-emerald-400 disabled:opacity-30"
          >+ uit je bibliotheek</button>
        </div>
      )}
    </div>
  );
}
