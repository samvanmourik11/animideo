"use client";

// Muziekkiezer voor alle tools (Creator Studio, Storytelling, Dialoog).
//
// Vervangt het AI-muziekbed: de klant kiest een nummer uit de vaste
// bibliotheek en kan het eerst beluisteren. Belangrijk detail uit de praktijk:
// je hoort het nummer vóór je kiest, want een bed dat pas ná het exporteren
// blijkt tegen te vallen kost een hele render.
//
// De picker kiest alleen het nummer. Op de videolengte zetten gebeurt bij het
// exporteren (lib/music/bed.ts) — hier tonen we alleen wat er gaat gebeuren.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MUSIC_CATEGORIES,
  MUSIC_TRACKS,
  findMusicTrackByUrl,
  formatMusicDuration,
  musicTrackUrl,
  type MusicCategory,
} from "@/lib/music/library";

export function MusicPicker({
  value,
  onChange,
  videoDuration,
}: {
  /** De opgeslagen muziek-URL van het project (of null). */
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  /** Lengte van de video in seconden — bepaalt het "wordt ingekort/doorgelust"-label. */
  videoDuration?: number | null;
}) {
  const [category, setCategory] = useState<MusicCategory | "alle">("alle");
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const selected = findMusicTrackByUrl(value);
  const tracks = useMemo(
    () => (category === "alle" ? MUSIC_TRACKS : MUSIC_TRACKS.filter((t) => t.category === category)),
    [category]
  );

  // Eén audio-element voor alle previews: zo kan er nooit meer dan één nummer
  // tegelijk spelen, ook niet als je snel door de lijst klikt.
  useEffect(() => {
    const el = new Audio();
    el.preload = "none";
    el.addEventListener("ended", () => setPlaying(null));
    audioRef.current = el;
    return () => { el.pause(); el.src = ""; };
  }, []);

  function togglePreview(slug: string) {
    const el = audioRef.current;
    if (!el) return;
    if (playing === slug) { el.pause(); setPlaying(null); return; }
    el.src = musicTrackUrl(slug);
    el.currentTime = 0;
    el.volume = 0.7;
    el.play().then(() => setPlaying(slug)).catch(() => setPlaying(null));
  }

  function pick(slug: string) {
    const url = musicTrackUrl(slug);
    // Nog een keer op hetzelfde nummer klikken haalt het weer weg.
    onChange(value === url ? null : url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        <CategoryChip active={category === "alle"} onClick={() => setCategory("alle")} label={`Alles (${MUSIC_TRACKS.length})`} />
        {MUSIC_CATEGORIES.map((c) => (
          <CategoryChip
            key={c.id}
            active={category === c.id}
            onClick={() => setCategory(c.id)}
            label={c.label}
            title={c.hint}
          />
        ))}
      </div>

      <div className="max-h-[46vh] overflow-y-auto pr-1 flex flex-col gap-1.5">
        {tracks.map((t) => {
          const url = musicTrackUrl(t.slug);
          const isSelected = value === url;
          const isPlaying = playing === t.slug;
          return (
            <div
              key={t.slug}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                isSelected
                  ? "border-cyan-400/60 bg-cyan-500/10"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              <button
                type="button"
                onClick={() => togglePreview(t.slug)}
                title={isPlaying ? "Stop met luisteren" : "Luister naar dit nummer"}
                aria-label={isPlaying ? `Stop ${t.title}` : `Beluister ${t.title}`}
                className="w-8 h-8 shrink-0 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs"
              >
                {isPlaying ? "❚❚" : "▶"}
              </button>

              <button type="button" onClick={() => pick(t.slug)} className="flex-1 min-w-0 text-left">
                <span className="block text-sm text-white truncate">{t.title}</span>
                <span className="block text-[11px] text-slate-400">
                  {MUSIC_CATEGORIES.find((c) => c.id === t.category)?.label} · {formatMusicDuration(t.duration)}
                  {videoDuration ? ` · ${fitLabel(t.duration, videoDuration)}` : ""}
                </span>
              </button>

              <button
                type="button"
                onClick={() => pick(t.slug)}
                className={`shrink-0 text-xs px-2.5 py-1 rounded-md ${
                  isSelected
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "bg-white/10 text-slate-300 hover:bg-white/20"
                }`}
              >
                {isSelected ? "Gekozen" : "Kies"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-2">
        <p className="text-[11px] text-slate-500">
          {videoDuration
            ? `Het gekozen nummer wordt automatisch op de videolengte (${formatMusicDuration(videoDuration)}) gezet.`
            : "Het gekozen nummer wordt automatisch op de videolengte gezet."}
        </p>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 text-xs px-2.5 py-1 rounded-md bg-white/5 text-slate-400 hover:bg-white/10"
          >
            Geen muziek
          </button>
        ) : null}
      </div>

      {value && !selected ? (
        <p className="text-[11px] text-amber-300/80">
          Dit project gebruikt nu eigen muziek (geen bibliotheeknummer). Kies hierboven een nummer om het te vervangen.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Knop + dialoog om de picker in te openen. Zo past de bibliotheek ook op
 * plekken waar weinig ruimte is (de editor-balk, de dialoog-zijkolom).
 */
export function MusicPickerButton({
  value,
  onChange,
  videoDuration,
  className,
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  videoDuration?: number | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const track = findMusicTrackByUrl(value);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={
          track
            ? `Achtergrondmuziek: ${track.title} — klik om te wisselen`
            : value
              ? "Dit project heeft eigen muziek — klik om een nummer uit de bibliotheek te kiezen"
              : "Kies achtergrondmuziek uit de bibliotheek"
        }
        className={className ?? "px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-sm text-white"}
      >
        🎵 {track ? track.title : "Muziek kiezen"}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold">Achtergrondmuziek</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Sluiten"
                className="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 text-slate-300"
              >
                ✕
              </button>
            </div>
            <MusicPicker value={value} onChange={onChange} videoDuration={videoDuration} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function CategoryChip({
  active, onClick, label, title,
}: { active: boolean; onClick: () => void; label: string; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200"
          : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

function fitLabel(trackDuration: number, videoDuration: number): string {
  if (trackDuration >= videoDuration - 1) return "wordt ingekort";
  return "wordt doorgelust";
}
