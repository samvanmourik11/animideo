"use client";

// ── Muziek ───────────────────────────────────────────────────────────────────
//
// De bibliotheek die er al was (27 nummers, rechtenvrij, op categorie), nu in de
// editor. Beluisteren voordat je kiest, en de lengte wordt vanzelf goed: is het
// nummer korter dan de video, dan lust hij door; is hij langer, dan gebruiken we
// het begin.
//
// Bewust geen AI-muziek. Die klonk altijd net verkeerd, en muziek is nou juist
// iets waar een bibliotheek beter in is dan een model.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MUSIC_CATEGORIES, MUSIC_TRACKS, findMusicTrackByUrl, formatMusicDuration, musicTrackUrl,
  type MusicCategory,
} from "@/lib/music/library";
import { useEditor, type EditorStore } from "@/lib/editor/store";
import { computeDuration } from "@/lib/editor/timeline";
import { Chip, Melding, PaneelKop, Sectie, Zoekbalk } from "../ui";

export default function MuziekPanel({ store, onSluit }: { store: EditorStore; onSluit: () => void }) {
  const [categorie, setCategorie] = useState<MusicCategory | "alle">("alle");
  const [zoek, setZoek] = useState("");
  const [speelt, setSpeelt] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const doc = useEditor(store, (s) => s.doc);

  const bed = doc.tracks.flatMap((t) => t.clips).find((c) => c.meta?.source === "muziek");
  const gekozen = bed && bed.type === "audio" ? findMusicTrackByUrl(bed.src) : null;
  const videoLengte = computeDuration(doc);

  // Het voorbeeld moet stoppen als je het paneel sluit; anders speelt er muziek
  // door terwijl je nergens meer een stopknop ziet.
  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  function beluister(slug: string) {
    if (speelt === slug) {
      audioRef.current?.pause();
      setSpeelt(null);
      return;
    }
    audioRef.current?.pause();
    const a = new Audio(musicTrackUrl(slug));
    a.volume = 0.7;
    a.play().catch(() => setMelding("Afspelen lukte niet."));
    a.addEventListener("ended", () => setSpeelt(null));
    audioRef.current = a;
    setSpeelt(slug);
  }

  function kies(slug: string, titel: string) {
    const res = store.dispatch({ op: "set_muziek", src: musicTrackUrl(slug), titel });
    setMelding(res.ok ? `${titel} staat eronder` : res.error.message);
  }

  function haalWeg() {
    const res = store.dispatch({ op: "set_muziek", src: null });
    setMelding(res.ok ? "Muziek weggehaald" : res.error.message);
  }

  const lijst = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return MUSIC_TRACKS.filter(
      (t) => (categorie === "alle" || t.category === categorie) && (!q || t.title.toLowerCase().includes(q))
    );
  }, [categorie, zoek]);

  return (
    <div className="flex flex-col h-full">
      <PaneelKop titel="Muziek" onSluit={onSluit} />
      <Zoekbalk waarde={zoek} onWijzig={setZoek} hint="Zoek een nummer" />

      {gekozen && (
        <div className="mx-4 mb-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 shrink-0">
          <p className="text-[12px] text-blue-700 font-medium">Staat nu onder de video</p>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span className="text-[14px] text-slate-900 truncate">{gekozen.title}</span>
            <button type="button" onClick={haalWeg} className="text-[12px] text-slate-500 hover:text-red-600 shrink-0">
              Weghalen
            </button>
          </div>
        </div>
      )}

      <div className="px-4 pb-3 flex flex-wrap gap-1.5 shrink-0">
        <Chip actief={categorie === "alle"} onClick={() => setCategorie("alle")} label={`Alles (${MUSIC_TRACKS.length})`} />
        {MUSIC_CATEGORIES.map((c) => (
          <Chip key={c.id} actief={categorie === c.id} onClick={() => setCategorie(c.id)} label={c.label} />
        ))}
      </div>

      <Melding tekst={melding} />

      <div className="flex-1 overflow-y-auto pb-6">
        <Sectie titel={`${lijst.length} nummer${lijst.length === 1 ? "" : "s"}`}>
          <div className="space-y-1">
            {lijst.map((t) => {
              const actief = gekozen?.slug === t.slug;
              return (
                <div
                  key={t.slug}
                  className={`flex items-center gap-2 rounded-xl px-2 py-2 border ${
                    actief ? "border-blue-500 bg-blue-50" : "border-transparent hover:bg-slate-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => beluister(t.slug)}
                    aria-label={speelt === t.slug ? "Stop" : "Beluister"}
                    className="w-9 h-9 rounded-full bg-slate-900 text-white text-[12px] shrink-0 flex items-center justify-center hover:bg-slate-700"
                  >
                    {speelt === t.slug ? "■" : "▶"}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] text-slate-900 truncate">{t.title}</p>
                    <p className="text-[11px] text-slate-500">
                      {formatMusicDuration(t.duration)}
                      {videoLengte > 0 &&
                        ` · ${t.duration >= videoLengte ? "eerste stuk wordt gebruikt" : "wordt doorgelust"}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => kies(t.slug, t.title)}
                    className="text-[12px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-700 text-white shrink-0"
                  >
                    {actief ? "Opnieuw" : "Kies"}
                  </button>
                </div>
              );
            })}
          </div>
        </Sectie>
      </div>
    </div>
  );
}
