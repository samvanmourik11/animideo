"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FILM_KOSTEN_USD, SCENE_STATUS_LABEL, creditsVoorKosten, type Film, type SceneStatus } from "@/lib/film/types";

// De filmstudio: films van een paar minuten, samen met de Regisseur gebouwd. Hier zie je je
// films met per scène de stand; het maken zelf gebeurt in het gesprek met de Regisseur.

interface FilmRij {
  id: string;
  titel: string;
  regie_project_id: string | null;
  data: Partial<Film>;
  updated_at: string;
}

const STATUS_KLEUR: Record<SceneStatus, string> = {
  concept: "bg-paneel-2 text-tekst-3",
  bezig: "bg-blue-500/15 text-blue-500",
  ter_keuring: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  goedgekeurd: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  feedback: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  mislukt: "bg-red-500/15 text-red-600 dark:text-red-300",
};

const START = "Ik wil een film maken. ";

export default function FilmStudio() {
  const [films, setFilms] = useState<FilmRij[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/films")
      .then((r) => r.json())
      .then((d) => (d.error ? setFout(d.error) : setFilms(d.films)))
      .catch(() => setFout("Films laden mislukt."));
  }, []);

  // Wat een gemiddeld shot kost, voor de uitleg (dezelfde berekening als bij het maken).
  const stilShot = creditsVoorKosten(FILM_KOSTEN_USD.beeld + FILM_KOSTEN_USD.beweging);
  const praatShot = creditsVoorKosten(FILM_KOSTEN_USD.beeld + 4 * FILM_KOSTEN_USD.lipsyncPerSec);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-tekst tracking-tight">🎬 Filmstudio</h1>
        <p className="text-tekst-3 mt-1">Maak samen met de Regisseur een film van een paar minuten: verhaal, personages met een vaste stem, scène voor scène goedkeuren, en aan het eind de hele film.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Link href={`/regisseur?start=${encodeURIComponent(START)}`} className="n-kaart hover:border-blue-500/50 transition-colors block">
          <div className="text-2xl">🎬</div>
          <div className="font-bold text-tekst mt-1">Nieuwe film</div>
          <p className="text-sm text-tekst-3 mt-1">Vertel je verhaal of upload je eigen script (pdf, Word of tekst). De Regisseur werkt het met je uit en stuurt elke scène ter keuring.</p>
        </Link>
        <Link href="/studios/trailer" className="n-kaart hover:border-blue-500/50 transition-colors block">
          <div className="text-2xl">🎞️</div>
          <div className="font-bold text-tekst mt-1">Trailer</div>
          <p className="text-sm text-tekst-3 mt-1">Een filmtrailer van 1-1,5 minuut in één keer, met een echte trailerstem.</p>
        </Link>
      </div>

      <p className="text-xs text-tekst-3">
        Prijs naar wat er gemaakt wordt: ± {stilShot} credits per shot met beweging, ± {praatShot} per shot waarin iemand praat (met lipsync). Een scène van een halve minuut is ongeveer 80-100 credits; bij feedback betaal je alleen de shots die opnieuw moeten.
      </p>

      <div>
        <h2 className="text-sm font-semibold text-tekst-2 mb-3">Jouw films</h2>
        {fout && <p className="text-sm text-red-600 dark:text-red-300">{fout}</p>}
        {films === null && !fout && <p className="text-sm text-tekst-3">Laden…</p>}
        {films?.length === 0 && <p className="text-sm text-tekst-3">Nog geen films. Begin hierboven met een nieuwe film.</p>}
        <div className="space-y-4">
          {films?.map((f) => {
            const scenes = f.data.scenes ?? [];
            const klaar = scenes.filter((s) => s.status === "goedgekeurd").length;
            return (
              <div key={f.id} className="n-kaart space-y-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-tekst text-lg">{f.titel}</div>
                    {f.data.logline && <p className="text-sm text-tekst-3 mt-0.5">{f.data.logline}</p>}
                    <p className="text-[11px] text-tekst-3 mt-1">
                      {scenes.length} scène{scenes.length === 1 ? "" : "s"} · {klaar} goedgekeurd · {(f.data.cast ?? []).length} in de cast
                    </p>
                  </div>
                  {f.regie_project_id && (
                    <Link href={`/regisseur?project=${f.regie_project_id}`} className="btn-primary !py-2 text-sm shrink-0">
                      Verder met de Regisseur →
                    </Link>
                  )}
                </div>
                {(f.data.cast ?? []).some((c) => c.portret) && (
                  <div className="flex gap-2 overflow-x-auto">
                    {(f.data.cast ?? []).filter((c) => c.portret).map((c) => (
                      <div key={c.naam} className="shrink-0 text-center w-16">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.portret} alt={c.naam} className="w-16 h-16 rounded-xl object-cover" />
                        <div className="text-[10px] text-tekst-2 truncate mt-0.5">{c.naam}</div>
                      </div>
                    ))}
                  </div>
                )}
                {scenes.length > 0 && (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {scenes.map((s) => (
                      <div key={s.nummer} className="rounded-xl border border-rand p-2 space-y-1.5">
                        {s.video ? (
                          <video src={s.video} controls preload="metadata" playsInline className="w-full rounded-lg bg-black aspect-video" />
                        ) : (
                          <div className="w-full rounded-lg bg-paneel-2 aspect-video flex items-center justify-center text-xs text-tekst-3">{s.shots.length} shots in het script</div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-tekst truncate flex-1">{s.nummer}. {s.titel}</span>
                          <span className={`text-[10px] rounded-full px-2 py-0.5 shrink-0 ${STATUS_KLEUR[s.status]}`}>{SCENE_STATUS_LABEL[s.status]}</span>
                        </div>
                        {s.feedback && <p className="text-[11px] text-tekst-3 line-clamp-2">✏️ {s.feedback}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
