"use client";

import { useEffect, useRef, useState } from "react";
import StoryScene from "./StoryScene";
import OverheidSceneView from "./OverheidSceneView";
import { storyLayers, storyWindows, kenBurns } from "@/lib/infographics/story-layout";
import { storyAspectRatio } from "@/lib/infographics/canvas-size";
import { tekstInBeeldAan, type StorySpec } from "@/lib/infographics/story-schema";

// Achtergrond-clip van een scene. Is de scene langer dan de clip (Seedance levert
// ~5s), dan vertragen we de clip zodat hij de hele scene vult in plaats van te
// herhalen (geen loop). Korter dan de clip: gewoon op snelheid, niet versnellen.
//
// HAPEREN (Sam, 13-10-2026): een clip werd pas aangemaakt — en dus pas geladen —
// op het moment dat zijn scene in beeld kwam. De eerste keer afspelen stond het
// beeld dan stil tot de clip binnen was; na terugslepen zat alles in de cache en
// liep het wél vloeiend. Daarom staan nu alle clips vanaf het begin klaar (verborgen
// tot hun beurt), en volgt elke clip de tijdlijn in plaats van los te lopen: na
// een seek of een haperend netwerk springt hij terug naar het juiste moment.
const SYNC_MARGE = 0.4; // seconden verschil voordat we bijsturen
function SceneVideo({ src, duration, playing, actief, localT }: {
  src: string;
  duration: number;
  playing: boolean;
  /** Is deze scene nu (deels) in beeld? */
  actief: boolean;
  /** Tijd sinds het begin van deze scene op de tijdlijn (mag negatief zijn). */
  localT: number;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const laatsteSync = useRef(0);
  function snelheid(v: HTMLVideoElement): number {
    if (!v.duration || !isFinite(v.duration) || duration <= 0) return 1;
    return Math.max(0.1, Math.min(1, v.duration / duration));
  }
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const rate = snelheid(v);
    if (v.playbackRate !== rate) v.playbackRate = rate;
    const eind = v.duration && isFinite(v.duration) ? Math.max(0, v.duration - 0.05) : Infinity;
    const gewenst = Math.max(0, Math.min(eind, localT * rate));
    if (!actief) {
      // Niet in beeld: stil, en klaar op het eerste frame voor zijn beurt.
      if (!v.paused) v.pause();
      if (localT <= 0 && v.currentTime > 0.05) { try { v.currentTime = 0; } catch {} }
      return;
    }
    if (!playing) {
      if (!v.paused) v.pause();
      // Pauze of slepen: het juiste frame laten zien.
      if (Math.abs(v.currentTime - gewenst) > 0.05) { try { v.currentTime = gewenst; } catch {} }
      return;
    }
    // Niet elk frame bijsturen: een seek laat de clip zelf weer even laden.
    const nu = performance.now();
    if (Math.abs(v.currentTime - gewenst) > SYNC_MARGE && nu - laatsteSync.current > 1000) {
      laatsteSync.current = nu;
      try { v.currentTime = gewenst; } catch {}
    }
    if (v.paused && gewenst < eind) v.play().catch(() => {});
  });
  return (
    <video
      ref={ref}
      src={src}
      muted
      playsInline
      preload="auto"
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
}

// Speelt het verhaal af als animatievideo: scenes met crossfades, subtiele
// camerabeweging (Ken Burns) op het beeld en één doorlopende voice-over
// synchroon met de tijdlijn.
// Waar het muziekbed staat op tijdstip t. De bibliotheeknummers zijn korter of
// langer dan de video; korter betekent doorlussen (net als in de export), dus
// rekenen we modulo de nummerlengte. Zonder dit springt een seek voorbij het
// einde van het nummer en valt de muziek stil.
function muziekTijd(el: HTMLAudioElement, t: number): number {
  const d = el.duration;
  return Number.isFinite(d) && d > 0 ? t % d : t;
}

export default function StoryPlayer({
  spec,
  logoUrl,
  navy,
  accent,
  fontFamily,
}: {
  spec: StorySpec;
  logoUrl?: string | null;
  /** Huisstijlkleuren: tekst in beeld én het palet van de overheidsscenes. */
  navy?: string | null;
  accent?: string | null;
  fontFamily?: string | null;
}) {
  // Eén regel voor de hele video, zodat preview en export niet uit elkaar lopen.
  const toonTekst = tekstInBeeldAan(spec);
  const aspect = storyAspectRatio(spec.format);
  const { total } = storyLayers(spec.scenes, 0);

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const startRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!playing) { audioRef.current?.pause(); musicRef.current?.pause(); return; }
    startRef.current = performance.now() - t * 1000;
    const a = audioRef.current;
    if (a && a.src) { try { a.currentTime = t; } catch {} a.play().catch(() => {}); }
    const m = musicRef.current;
    if (m && m.src) { m.volume = spec.musicVolume ?? 0.18; try { m.currentTime = muziekTijd(m, t); } catch {} m.play().catch(() => {}); }
    const tick = () => {
      const now = (performance.now() - startRef.current) / 1000;
      if (now >= total) { setT(total); setPlaying(false); audioRef.current?.pause(); musicRef.current?.pause(); return; }
      setT(now);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Volume live bijregelen terwijl de slider beweegt (ook tijdens het afspelen).
  useEffect(() => {
    if (musicRef.current) musicRef.current.volume = spec.musicVolume ?? 0.18;
  }, [spec.musicVolume]);

  function toggle() {
    if (playing) { setPlaying(false); return; }
    if (t >= total) { setT(0); setPlaying(true); return; }
    setPlaying(true);
  }
  function restart() {
    // Speelt hij al, dan herstart het effect hierboven niet: de klok dus zelf terugzetten.
    startRef.current = performance.now();
    if (audioRef.current && audioRef.current.src) { try { audioRef.current.currentTime = 0; } catch {} }
    if (musicRef.current && musicRef.current.src) { try { musicRef.current.currentTime = 0; } catch {} }
    setT(0);
    setPlaying(true);
  }
  function seek(frac: number) {
    const nt = Math.max(0, Math.min(total, frac * total));
    setT(nt);
    startRef.current = performance.now() - nt * 1000;
    if (audioRef.current && audioRef.current.src) { try { audioRef.current.currentTime = nt; } catch {} }
    if (musicRef.current && musicRef.current.src) { try { musicRef.current.currentTime = muziekTijd(musicRef.current, nt); } catch {} }
  }

  const { layers } = storyLayers(spec.scenes, t);
  const { windows } = storyWindows(spec.scenes);
  const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
  const tm = Math.floor(total / 60), ts = Math.floor(total % 60);

  return (
    <div>
      <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#f3f1ec]" style={{ aspectRatio: aspect }}>
        {spec.scenes.map((scene, index) => {
          // Alle clips staan er vanaf het begin (zie SceneVideo): zo zijn ze al
          // geladen als hun scene aan de beurt is. Alleen de zichtbare krijgt opacity.
          if (scene?.layout || !scene?.videoUrl) return null;
          const laag = layers.find((l) => l.index === index);
          const w = windows[index];
          return (
            <div key={`video-${index}`} className="absolute inset-0" style={{ opacity: laag?.opacity ?? 0, zIndex: laag ? (laag.opacity < 1 ? 2 : 1) : 0 }}>
              <SceneVideo
                src={scene.videoUrl}
                duration={w?.duration ?? 5}
                playing={playing}
                actief={!!laag}
                localT={t - (w?.start ?? 0)}
              />
            </div>
          );
        })}
        {layers.map((l) => {
          const scene = spec.scenes[l.index];
          const kb = kenBurns(l.index, l.p);
          return (
            <div key={l.index} className="absolute inset-0" style={{ opacity: l.opacity, zIndex: l.opacity < 1 ? 2 : 1 }}>
              {scene?.layout ? (
                // Overheidsmodus: de scene wordt hier zelf getekend en beweegt op
                // zijn eigen tijdlijn. Geen Ken Burns — die hoort bij een foto,
                // niet bij een diagram dat al uit zichzelf beweegt.
                <OverheidSceneView
                  layout={scene.layout}
                  format={spec.format}
                  t={l.p * (windows[l.index]?.duration ?? 5)}
                  duur={windows[l.index]?.duration ?? 5}
                  voiceover={scene.voiceover}
                  navy={navy}
                  accent={accent}
                  logoUrl={logoUrl}
                />
              ) : scene?.videoUrl ? null : scene?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={scene.imageUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ transform: `scale(${kb.scale}) translate(${kb.tx}%, ${kb.ty}%)`, transformOrigin: "center" }}
                />
              ) : null}
              {!scene?.layout && (
                <StoryScene
                  scene={scene}
                  format={spec.format}
                  tekst={toonTekst}
                  navy={navy ?? undefined}
                  accent={accent ?? undefined}
                  fontFamily={fontFamily}
                  logoUrl={logoUrl}
                  enter={l.enter}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-3">
        <button onClick={toggle} className="btn-primary text-sm px-4">{playing ? "Pauze" : t >= total ? "Opnieuw" : "Afspelen"}</button>
        <button onClick={restart} className="text-sm text-slate-400 hover:text-white">Herstart</button>
        <div className="flex-1 h-2 bg-white/10 rounded-full cursor-pointer" onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          seek((e.clientX - r.left) / r.width);
        }}>
          <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${total > 0 ? (t / total) * 100 : 0}%` }} />
        </div>
        <span className="text-xs text-slate-500 tabular-nums">
          {mm}:{String(ss).padStart(2, "0")} / {tm}:{String(ts).padStart(2, "0")}
        </span>
      </div>

      {spec.voiceUrl && <audio ref={audioRef} src={spec.voiceUrl} preload="auto" />}
      {spec.musicUrl && <audio ref={musicRef} src={spec.musicUrl} preload="auto" loop />}
    </div>
  );
}
