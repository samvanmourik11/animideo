"use client";

import { useEffect, useRef, useState } from "react";
import StoryScene from "./StoryScene";
import { storyLayers, storyWindows, kenBurns } from "@/lib/infographics/story-layout";
import { storyAspectRatio } from "@/lib/infographics/canvas-size";
import type { StorySpec } from "@/lib/infographics/story-schema";

// Achtergrond-clip van een scene. Is de scene langer dan de clip (Seedance levert
// ~5s), dan vertragen we de clip zodat hij de hele scene vult in plaats van te
// herhalen (geen loop). Korter dan de clip: gewoon op snelheid, niet versnellen.
function SceneVideo({ src, duration }: { src: string; duration: number }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  function onMeta() {
    const v = ref.current;
    if (!v || !v.duration || !isFinite(v.duration) || duration <= 0) return;
    v.playbackRate = Math.max(0.1, Math.min(1, v.duration / duration));
  }
  return (
    <video
      ref={ref}
      src={src}
      autoPlay
      muted
      playsInline
      onLoadedMetadata={onMeta}
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
}

// Speelt het verhaal af als animatievideo: scenes met crossfades, subtiele
// camerabeweging (Ken Burns) op het beeld, tekst die inanimeert, en één
// doorlopende voice-over synchroon met de tijdlijn.
export default function StoryPlayer({
  spec,
  navy = "#16243f",
  accent = "#e8643c",
}: {
  spec: StorySpec;
  navy?: string;
  accent?: string;
}) {
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
    if (m && m.src) { m.volume = spec.musicVolume ?? 0.18; try { m.currentTime = t; } catch {} m.play().catch(() => {}); }
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
    if (t >= total) { setT(0); setPlaying(true); return; }
    setPlaying((p) => !p);
  }
  function restart() { setT(0); setPlaying(true); }
  function seek(frac: number) {
    const nt = Math.max(0, Math.min(total, frac * total));
    setT(nt);
    startRef.current = performance.now() - nt * 1000;
    if (audioRef.current && audioRef.current.src) { try { audioRef.current.currentTime = nt; } catch {} }
    if (musicRef.current && musicRef.current.src) { try { musicRef.current.currentTime = nt; } catch {} }
  }

  const { layers } = storyLayers(spec.scenes, t);
  const { windows } = storyWindows(spec.scenes);
  const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
  const tm = Math.floor(total / 60), ts = Math.floor(total % 60);

  return (
    <div>
      <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#f3f1ec]" style={{ aspectRatio: aspect }}>
        {layers.map((l) => {
          const scene = spec.scenes[l.index];
          const kb = kenBurns(l.index, l.p);
          return (
            <div key={l.index} className="absolute inset-0" style={{ opacity: l.opacity }}>
              {scene?.videoUrl ? (
                <SceneVideo src={scene.videoUrl} duration={windows[l.index]?.duration ?? 5} />
              ) : scene?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={scene.imageUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ transform: `scale(${kb.scale}) translate(${kb.tx}%, ${kb.ty}%)`, transformOrigin: "center" }}
                />
              ) : null}
              <StoryScene scene={scene} format={spec.format} navy={navy} accent={accent} enter={l.enter} />
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
      {spec.musicUrl && <audio ref={musicRef} src={spec.musicUrl} preload="auto" />}
    </div>
  );
}
