"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Character } from "@/lib/types";

// Een personage kiezen uit de eigen bibliotheek.
//
// De storytelling-tool kende alleen "uploaden": wie al personages had aangemaakt
// moest dezelfde afbeelding opnieuw van schijf zoeken. Deze kiezer haalt ze uit
// /api/characters — dezelfde bron die de dialoogmodus gebruikt — zodat een
// personage één keer gemaakt wordt en overal terugkomt.

export default function BibliotheekKiezer({
  onKies,
  onSluit,
  gekozenUrls,
}: {
  onKies: (ch: Character) => void;
  onSluit: () => void;
  /**
   * Portretten die al gekozen zijn. De kiezer blijft open zolang je er meerdere
   * toevoegt (een cast bestaat zelden uit één persoon), dus moet zichtbaar zijn
   * wie er al in staat — anders klik je dezelfde twee keer aan.
   */
  gekozenUrls?: string[];
}) {
  const [lijst, setLijst] = useState<Character[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setLijst((d.characters ?? []) as Character[]);
      })
      .catch((e) => setFout(e instanceof Error ? e.message : String(e)));
  }, []);

  const metBeeld = (lijst ?? []).filter((c) => c.image_url);
  const alGekozen = new Set(gekozenUrls ?? []);

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-slate-900/60 p-2.5 max-w-xl">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-slate-300">
          {gekozenUrls ? "Kies personages" : "Kies een personage"}
        </span>
        <button type="button" onClick={onSluit} className="text-[11px] text-slate-500 hover:text-white">
          sluiten
        </button>
      </div>

      {fout && <p className="text-[11px] text-red-400">{fout}</p>}
      {lijst === null && !fout && <p className="text-[11px] text-slate-500">Laden…</p>}
      {lijst !== null && metBeeld.length === 0 && (
        <p className="text-[11px] text-slate-400">
          Je hebt nog geen personages met een afbeelding.{" "}
          <Link href="/characters" className="text-orange-300 underline hover:text-orange-200">
            Maak er een aan
          </Link>
          .
        </p>
      )}

      <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto">
        {metBeeld.map((ch) => {
          const gekozen = alGekozen.has(ch.image_url!);
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => onKies(ch)}
              disabled={gekozen}
              title={gekozen ? "Staat al in de cast" : ch.description ?? ch.name}
              className={`w-20 rounded-lg border p-1.5 transition text-left ${
                gekozen
                  ? "border-orange-400/60 bg-orange-400/10 cursor-default"
                  : "border-white/10 bg-slate-900/40 hover:border-orange-400/60"
              }`}
            >
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ch.image_url!} alt={ch.name} className={`w-full aspect-square rounded object-cover mb-1 ${gekozen ? "opacity-50" : ""}`} />
                {gekozen && (
                  <span className="absolute inset-0 flex items-center justify-center text-orange-200 text-sm">✓</span>
                )}
              </div>
              <span className="block text-[10px] text-slate-300 truncate">{ch.name}</span>
            </button>
          );
        })}
      </div>

      {metBeeld.length > 0 && (
        <Link href="/characters" className="inline-block mt-2 text-[10px] text-slate-500 hover:text-white">
          + nieuw personage maken
        </Link>
      )}
    </div>
  );
}
