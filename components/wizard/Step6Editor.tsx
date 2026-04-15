"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { Project, Scene, TransitionType } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────
const PX_PER_SEC  = 80;
const LABEL_W     = 60;   // fixed left label column
const MARKER_H    = 20;   // time ruler
const VIDEO_H     = 64;   // video clips row
const VOICE_H     = 36;   // voice-over waveform row
const MUSIC_H     = 36;   // background music row
const ROW_GAP     = 4;    // gap between rows
const TRANS_DUR   = 0.5;  // seconds for all transitions

// TIMELINE_H = 20 + 64 + 4 + 36 + 4 + 36 + 4 = 168
const TIMELINE_H  = MARKER_H + VIDEO_H + ROW_GAP + VOICE_H + ROW_GAP + MUSIC_H + ROW_GAP;

const CLIP_COLORS = [
  "#1d4ed8","#0369a1","#0f766e","#15803d","#7e22ce",
  "#be185d","#b45309","#1e40af","#065f46","#6b21a8",
];

// ─── Transition definitions ───────────────────────────────────────────────────
interface TransitionDef {
  id: TransitionType;
  label: string;
  ffmpeg: string;
  preview: React.ReactNode;
}

const TRANSITIONS: TransitionDef[] = [
  {
    id: "cut", label: "Cut", ffmpeg: "",
    preview: (
      <div className="w-full h-full flex overflow-hidden rounded">
        <div className="flex-1 bg-blue-600" />
        <div className="w-0.5 bg-white/40" />
        <div className="flex-1 bg-violet-600" />
      </div>
    ),
  },
  {
    id: "fade", label: "Fade to Black", ffmpeg: "fade",
    preview: (
      <div className="w-full h-full flex overflow-hidden rounded relative">
        <div className="flex-1 bg-blue-600" />
        <div className="flex-1 bg-violet-600" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black to-transparent opacity-90" />
      </div>
    ),
  },
  {
    id: "dissolve", label: "Cross Dissolve", ffmpeg: "dissolve",
    preview: (
      <div className="w-full h-full flex overflow-hidden rounded relative">
        <div className="absolute inset-0 bg-blue-600" />
        <div className="absolute inset-0 bg-violet-600 opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-violet-600 opacity-60" />
      </div>
    ),
  },
  {
    id: "slide-left", label: "Slide Left", ffmpeg: "slideleft",
    preview: (
      <div className="w-full h-full flex overflow-hidden rounded relative">
        <div className="absolute inset-0 bg-blue-600" />
        <div className="absolute inset-y-0 right-0 w-1/2 bg-violet-600" />
        <div className="absolute inset-y-0 left-0 w-1/2 flex items-center justify-end pr-1">
          <span className="text-white text-[8px]">←</span>
        </div>
      </div>
    ),
  },
  {
    id: "slide-right", label: "Slide Right", ffmpeg: "slideright",
    preview: (
      <div className="w-full h-full flex overflow-hidden rounded relative">
        <div className="absolute inset-0 bg-violet-600" />
        <div className="absolute inset-y-0 left-0 w-1/2 bg-blue-600" />
        <div className="absolute inset-y-0 right-0 w-1/2 flex items-center justify-start pl-1">
          <span className="text-white text-[8px]">→</span>
        </div>
      </div>
    ),
  },
  {
    id: "zoom-in", label: "Zoom In", ffmpeg: "zoomin",
    preview: (
      <div className="w-full h-full flex items-center justify-center overflow-hidden rounded relative bg-blue-600">
        <div className="absolute inset-0 bg-violet-600 opacity-70 scale-50 rounded" />
        <div className="absolute inset-0 border-4 border-white/20 rounded" />
      </div>
    ),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ds = Math.floor((t % 1) * 10);
  return `${m}:${String(s).padStart(2, "0")}.${ds}`;
}

/**
 * cubic-bezier(0.4, 0, 0.2, 1) — cinematic ease used for all transitions.
 * Approximated via Bézier evaluation (same curve as Material Design "standard").
 */
function easeCinematic(t: number): number {
  // cubic-bezier(0.4, 0, 0.2, 1) — solve for y given x=t via numerical Newton
  // P0=(0,0) P1=(0.4,0) P2=(0.2,1) P3=(1,1)
  const cx = 3 * 0.4;            // 1.2
  const bx = 3 * (0.2 - 0.4) - cx; // -1.8
  const ax = 1 - cx - bx;        // 1.6
  const cy = 0;
  const by = 3 * (1 - 0) - cy;   // 3
  const ay = 1 - cy - by;        // -2

  // solve t_b from x(t_b)=t using Newton iterations
  let tb = t;
  for (let i = 0; i < 8; i++) {
    const xv = ((ax * tb + bx) * tb + cx) * tb - t;
    const dxv = (3 * ax * tb + 2 * bx) * tb + cx;
    if (Math.abs(dxv) < 1e-6) break;
    tb -= xv / dxv;
  }
  return ((ay * tb + by) * tb + cy) * tb;
}

function computeBoundaries(scenes: Scene[]) {
  let t = 0;
  return scenes.map((s) => {
    const start = t;
    const dur = Math.max(s.duration, 0.5);
    t += dur;
    return { start, end: t, duration: dur };
  });
}

async function fetchAsBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onBack: () => void;
  plan?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Step6Editor({ project, onUpdate, onBack, plan = "free" }: Props) {
  const [scenes, setScenes] = useState<Scene[]>(() =>
    (project.scenes ?? []).map((s) => ({ ...s, duration: Math.max(s.duration ?? 5, 1) }))
  );
  const [selectedIdx,       setSelectedIdx]       = useState(0);
  const [isPlaying,         setIsPlaying]         = useState(false);
  const [displayTime,       setDisplayTime]       = useState(0);
  const [bgMusicUrl,        setBgMusicUrl]        = useState(project.bg_music_url ?? "");
  const [voiceVol,          setVoiceVol]          = useState(1);
  const [musicVol,          setMusicVol]          = useState(0.5);
  const [exporting,         setExporting]         = useState(false);
  const [exportPct,         setExportPct]         = useState(0);
  const [exportUrl,         setExportUrl]         = useState("");
  const [exportError,       setExportError]       = useState("");
  const [uploadingMusic,    setUploadingMusic]    = useState(false);
  const [dragOverIdx,       setDragOverIdx]       = useState<number | null>(null);
  const [showUpgradeModal,  setShowUpgradeModal]  = useState(false);
  const [trimDrag,        setTrimDrag]        = useState<{ idx: number; startX: number; startDur: number } | null>(null);
  const [transitionPopup, setTransitionPopup] = useState<{ sceneIdx: number } | null>(null);
  const [voiceOffsetSec,  setVoiceOffsetSec]  = useState(0);
  const [musicOffsetSec,  setMusicOffsetSec]  = useState(0);
  const [audioDrag,       setAudioDrag]       = useState<{ track: "voice" | "music"; startX: number; startOffset: number } | null>(null);
  const [selectedLayer,   setSelectedLayer]   = useState<"video" | "voice" | "music" | null>("video");

  // ── Refs ─────────────────────────────────────────────────────────────────
  // Two video elements — one "active" (visible), one "standby" (preloading next)
  const videoARef       = useRef<HTMLVideoElement>(null);
  const videoBRef       = useRef<HTMLVideoElement>(null);
  const activeIsARef    = useRef(true); // true → A is active, B is standby
  const audioRef        = useRef<HTMLAudioElement>(null);
  const bgMusicRef      = useRef<HTMLAudioElement>(null);
  const timelineRef     = useRef<HTMLDivElement>(null);
  const playheadRef     = useRef<HTMLDivElement>(null);
  const waveformRef     = useRef<HTMLCanvasElement>(null);
  const currentTimeRef  = useRef(0);
  const isPlayingRef    = useRef(false);
  const activeIdxRef    = useRef(0);
  const transitionActiveRef = useRef(false);
  const animCancelRef   = useRef(false);  // set true to abort a running transition anim
  const rafTickRef      = useRef<number>();
  const lastTickTsRef   = useRef<number | null>(null);
  const autoSaveRef     = useRef<ReturnType<typeof setInterval>>();
  const dragIdxRef      = useRef<number | null>(null);
  // Cache: video URL → source duration (seconds) detected via loadedmetadata
  const sourceDurRef    = useRef<Record<string, number>>({});
  // Stable refs for tick closure (avoid stale captures)
  const scenesRef       = useRef([] as typeof scenes);
  const boundariesRef   = useRef([] as ReturnType<typeof computeBoundaries>);
  const totalDurRef     = useRef(0);

  const boundaries    = useMemo(() => computeBoundaries(scenes), [scenes]);
  const totalDuration = boundaries.at(-1)?.end ?? 0;
  const timelineWidth = Math.max(totalDuration * PX_PER_SEC, 800);

  // Keep stable refs in sync so tick closure never goes stale
  useEffect(() => { scenesRef.current = scenes; }, [scenes]);
  useEffect(() => { boundariesRef.current = boundaries; totalDurRef.current = boundaries.at(-1)?.end ?? 0; }, [boundaries]);

  // ── Active scene index ───────────────────────────────────────────────────
  const getActiveIdx = useCallback(
    (t: number) => {
      for (let i = boundaries.length - 1; i >= 0; i--) {
        if (t >= boundaries[i].start) return i;
      }
      return 0;
    },
    [boundaries]
  );

  // ── A/B video element helpers ─────────────────────────────────────────────
  function getActive()  { return activeIsARef.current ? videoARef.current : videoBRef.current; }
  function getStandby() { return activeIsARef.current ? videoBRef.current : videoARef.current; }
  function swapAB()     { activeIsARef.current = !activeIsARef.current; }

  /** Compute playback rate: sourceDuration / editorDuration.
   *  Source duration is cached from loadedmetadata; falls back to editorDuration → rate 1. */
  function rateFor(url: string, editorDur: number): number {
    const src = sourceDurRef.current[url];
    if (!src || !isFinite(src) || src <= 0) return 1;
    return src / editorDur;
  }

  /** Preload next clip into the standby element without playing it. */
  function preloadNext(currentIdx: number) {
    const next = scenesRef.current[currentIdx + 1];
    if (!next?.video_url) return;
    const standby = getStandby();
    if (!standby || standby.getAttribute("data-src") === next.video_url) return;
    standby.src = next.video_url;
    standby.setAttribute("data-src", next.video_url);
    standby.muted = true;
    standby.preload = "auto";
    standby.load();
    standby.style.opacity = "0";
    const onMeta = () => {
      standby.removeEventListener("loadedmetadata", onMeta);
      if (isFinite(standby.duration) && standby.duration > 0)
        sourceDurRef.current[next.video_url!] = standby.duration;
    };
    standby.addEventListener("loadedmetadata", onMeta);
  }

  /** Load a clip into a video element and apply the correct playbackRate.
   *  Waits for loadedmetadata if src is being changed. Returns via callback. */
  function loadClipInto(
    el: HTMLVideoElement,
    url: string,
    editorDur: number,
    videoTime: number,
    onReady: () => void
  ) {
    const apply = () => {
      const src = isFinite(el.duration) && el.duration > 0 ? el.duration : editorDur;
      sourceDurRef.current[url] = src;
      el.playbackRate = src / editorDur;
      el.currentTime = Math.max(0, videoTime);
      onReady();
    };
    if (el.getAttribute("data-src") === url) {
      apply();
    } else {
      el.src = url;
      el.setAttribute("data-src", url);
      el.muted = true;
      el.load();
      const onMeta = () => {
        el.removeEventListener("loadedmetadata", onMeta);
        el.removeEventListener("error", onMeta);
        apply();
      };
      if (el.readyState >= 1) { apply(); return; }
      el.addEventListener("loadedmetadata", onMeta);
      el.addEventListener("error", onMeta);
      setTimeout(apply, 4000); // safety fallback
    }
  }

  /** Reset video element animation styles after a transition finishes.
   *  Does NOT clear opacity (caller must set it explicitly to avoid a flash). */
  function resetVideoStyle(el: HTMLVideoElement | null) {
    if (!el) return;
    el.style.transform = "";
    el.style.zIndex = "";
    el.style.transition = "";
  }

  /** RAF-based animation engine for all transition types. */
  function animateTransition(
    type: TransitionType,
    active: HTMLVideoElement,
    standby: HTMLVideoElement,
    onComplete: () => void
  ) {
    const TOTAL_MS = type === "dissolve" ? 800
                   : type === "fade"    ? 700   // 350ms out + 350ms in
                   : type === "zoom-in" ? 600
                   : 600;                        // slide-left / slide-right
    const start = performance.now();
    let phase2Started = false;

    // Ensure standby is invisible and behind active before animation starts
    standby.style.opacity    = "0";
    standby.style.transform  = "";
    active.style.zIndex      = "1";
    standby.style.zIndex     = "2";

    // Type-specific initial positions
    if (type === "slide-left") {
      standby.style.transform = "translateX(100%)";
      standby.style.opacity   = "1";
    } else if (type === "slide-right") {
      standby.style.transform = "translateX(-100%)";
      standby.style.opacity   = "1";
    } else if (type === "zoom-in") {
      // Start at 1.08 — subtle zoom, not dramatic
      standby.style.transform = "scale(1.08)";
    }

    const frame = (now: number) => {
      if (animCancelRef.current) {
        resetVideoStyle(active);
        resetVideoStyle(standby);
        return;
      }
      const elapsed  = now - start;
      const progress = Math.min(elapsed / TOTAL_MS, 1);
      const e        = easeCinematic(progress);

      switch (type) {
        case "dissolve":
          active.style.opacity  = String(1 - e);
          standby.style.opacity = String(e);
          break;

        case "fade": {
          // Two equal phases: 350ms fade-out, 350ms fade-in
          const half = TOTAL_MS / 2;
          if (elapsed < half) {
            active.style.opacity  = String(1 - easeCinematic(elapsed / half));
            standby.style.opacity = "0";
          } else {
            if (!phase2Started) { phase2Started = true; active.style.opacity = "0"; }
            standby.style.opacity = String(easeCinematic((elapsed - half) / half));
          }
          break;
        }

        case "slide-left":
          active.style.transform  = `translateX(${-e * 100}%)`;
          standby.style.transform = `translateX(${(1 - e) * 100}%)`;
          standby.style.opacity   = "1";
          break;

        case "slide-right":
          active.style.transform  = `translateX(${e * 100}%)`;
          standby.style.transform = `translateX(${-(1 - e) * 100}%)`;
          standby.style.opacity   = "1";
          break;

        case "zoom-in":
          // ease-out feel: scale zooms from 1.08 → 1.0 as standby fades in
          active.style.opacity    = String(1 - e);
          standby.style.opacity   = String(e);
          standby.style.transform = `scale(${1.08 - e * 0.08})`;
          break;
      }

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        resetVideoStyle(active);
        resetVideoStyle(standby);
        standby.style.opacity = "1"; // ensure fully visible
        onComplete();
      }
    };
    requestAnimationFrame(frame);
  }

  // ── Seek ─────────────────────────────────────────────────────────────────
  function seekTo(t: number) {
    const clamped = Math.max(0, Math.min(t, totalDurRef.current || totalDuration));
    currentTimeRef.current = clamped;
    setDisplayTime(clamped);
    if (playheadRef.current) playheadRef.current.style.left = `${clamped * PX_PER_SEC}px`;

    // Cancel any in-flight transition animation
    animCancelRef.current = true;
    transitionActiveRef.current = false;
    lastTickTsRef.current = null;

    const bs   = boundariesRef.current.length ? boundariesRef.current : boundaries;
    const sc   = scenesRef.current.length ? scenesRef.current : scenes;
    const idx  = (() => {
      for (let i = bs.length - 1; i >= 0; i--) { if (clamped >= bs[i].start) return i; }
      return 0;
    })();
    activeIdxRef.current = idx;
    setSelectedIdx(idx);

    const scene  = sc[idx];
    const active  = getActive();
    const standby = getStandby();

    // Reset standby to invisible
    if (standby) { standby.style.opacity = "0"; standby.style.transform = ""; standby.pause(); }

    if (!scene?.video_url || !active) { if (active) active.style.opacity = "0"; return; }

    const editorDur   = scene.duration;
    const clipLocal   = clamped - (bs[idx]?.start ?? 0);

    active.style.opacity = "1";
    active.style.transform = "";
    loadClipInto(active, scene.video_url, editorDur, clipLocal * rateFor(scene.video_url, editorDur), () => {
      active.style.opacity = "1";
      if (isPlayingRef.current) active.play().catch(() => {});
      else active.pause();
    });

    if (audioRef.current) audioRef.current.currentTime = Math.max(0, clamped - voiceOffsetSec);
    if (bgMusicRef.current && bgMusicUrl) bgMusicRef.current.currentTime = Math.max(0, clamped - musicOffsetSec);

    preloadNext(idx);
    animCancelRef.current = false;
  }

  // ── RAF tick (delta-time, smooth 60 fps) ─────────────────────────────────
  function tick(timestamp: number) {
    if (!isPlayingRef.current) return;

    const delta = lastTickTsRef.current !== null ? (timestamp - lastTickTsRef.current) / 1000 : 0;
    lastTickTsRef.current = timestamp;

    const total = totalDurRef.current;
    const newT  = Math.min(currentTimeRef.current + delta, total);
    currentTimeRef.current = newT;

    // Playhead + auto-scroll (direct DOM, no React)
    if (playheadRef.current) playheadRef.current.style.left = `${newT * PX_PER_SEC}px`;
    if (timelineRef.current) {
      const ph = newT * PX_PER_SEC;
      const { scrollLeft, clientWidth } = timelineRef.current;
      if (ph > scrollLeft + clientWidth - 80)
        timelineRef.current.scrollLeft = ph - clientWidth + 120;
    }

    const bs     = boundariesRef.current;
    const sc     = scenesRef.current;
    const curIdx = activeIdxRef.current;

    // Check if it's time to start the next transition
    if (!transitionActiveRef.current && curIdx < sc.length - 1) {
      const transType: TransitionType = sc[curIdx]?.transition_out ?? "cut";
      const transDur = transType === "cut" ? 0 : TRANS_DUR;
      const clipEnd  = bs[curIdx]?.end ?? Infinity;
      if (newT >= clipEnd - transDur) {
        const nextIdx = curIdx + 1;
        transitionActiveRef.current = true;
        activeIdxRef.current = nextIdx;
        setSelectedIdx(nextIdx);
        executeTransition(curIdx, nextIdx);
      }
    }

    // End of timeline
    if (newT >= total) { handlePlaybackEnd(); return; }

    // Throttled React display (~10 fps)
    if (Math.round(newT * 10) !== Math.round((newT - delta) * 10)) setDisplayTime(newT);

    rafTickRef.current = requestAnimationFrame(tick);
  }

  function handlePlaybackEnd() {
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (rafTickRef.current) cancelAnimationFrame(rafTickRef.current);
    lastTickTsRef.current = null;
    animCancelRef.current = true;
    transitionActiveRef.current = false;

    videoARef.current?.pause();
    videoBRef.current?.pause();
    audioRef.current?.pause();
    bgMusicRef.current?.pause();

    // Reset to start — show first frame of first clip in active element
    currentTimeRef.current = 0;
    setDisplayTime(0);
    if (playheadRef.current) playheadRef.current.style.left = "0px";

    const firstScene = scenesRef.current[0];
    const active     = getActive();
    const standby    = getStandby();
    if (standby) { standby.style.opacity = "0"; standby.style.transform = ""; }
    if (active && firstScene?.video_url) {
      if (active.getAttribute("data-src") !== firstScene.video_url) {
        active.src = firstScene.video_url;
        active.setAttribute("data-src", firstScene.video_url);
        active.load();
      }
      active.currentTime = 0;
      active.playbackRate = 1;
      active.style.opacity = "1";
      active.style.transform = "";
    }
    activeIdxRef.current = 0;
    setSelectedIdx(0);
    animCancelRef.current = false;
  }

  function stopPlayback() {
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (rafTickRef.current) cancelAnimationFrame(rafTickRef.current);
    lastTickTsRef.current = null;
    getActive()?.pause();
    getStandby()?.pause();
    audioRef.current?.pause();
    bgMusicRef.current?.pause();
    setDisplayTime(currentTimeRef.current);
  }

  function togglePlay() {
    if (isPlaying) { stopPlayback(); return; }

    // If at end, reset first
    if (currentTimeRef.current >= (totalDurRef.current || totalDuration)) {
      currentTimeRef.current = 0;
      if (playheadRef.current) playheadRef.current.style.left = "0px";
    }

    isPlayingRef.current = true;
    setIsPlaying(true);
    lastTickTsRef.current = null;
    animCancelRef.current = false;

    const bs    = boundariesRef.current.length ? boundariesRef.current : boundaries;
    const sc    = scenesRef.current.length ? scenesRef.current : scenes;
    const t     = currentTimeRef.current;
    const idx   = (() => { for (let i = bs.length - 1; i >= 0; i--) { if (t >= bs[i].start) return i; } return 0; })();
    activeIdxRef.current = idx;
    setSelectedIdx(idx);

    const scene   = sc[idx];
    const active  = getActive();
    const standby = getStandby();

    // Reset standby
    if (standby) { standby.style.opacity = "0"; standby.style.transform = ""; }

    if (scene?.video_url && active) {
      const editorDur = scene.duration;
      const clipLocal = t - (bs[idx]?.start ?? 0);
      loadClipInto(active, scene.video_url, editorDur, clipLocal * rateFor(scene.video_url, editorDur), () => {
        active.style.opacity = "1";
        active.style.transform = "";
        if (isPlayingRef.current) active.play().catch(() => {});
      });
    }

    // Start audio
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, t - voiceOffsetSec);
      audioRef.current.volume = voiceVol;
      if (t >= voiceOffsetSec) audioRef.current.play().catch(() => {});
    }
    if (bgMusicRef.current && bgMusicUrl) {
      bgMusicRef.current.currentTime = Math.max(0, t - musicOffsetSec);
      bgMusicRef.current.volume = musicVol;
      if (t >= musicOffsetSec) bgMusicRef.current.play().catch(() => {});
    }

    preloadNext(idx);
    rafTickRef.current = requestAnimationFrame(tick);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (rafTickRef.current) cancelAnimationFrame(rafTickRef.current);
    clearInterval(autoSaveRef.current);
    animCancelRef.current = true;
  }, []);

  // ── Initial video load ────────────────────────────────────────────────────
  useEffect(() => {
    const first = scenes.find((s) => s.video_url);
    const active = getActive();
    if (first?.video_url && active) {
      active.src = first.video_url;
      active.setAttribute("data-src", first.video_url);
      active.muted = true;
      active.load();
      active.style.opacity = "1";
      const onMeta = () => {
        active.removeEventListener("loadedmetadata", onMeta);
        if (isFinite(active.duration) && active.duration > 0)
          sourceDurRef.current[first.video_url!] = active.duration;
        active.playbackRate = rateFor(first.video_url!, first.duration);
        active.currentTime = 0;
      };
      active.addEventListener("loadedmetadata", onMeta);
      // Preload scene 2 into standby
      preloadNext(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-save every 30s ───────────────────────────────────────────────────
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      fetch("/api/save-project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, scenes }),
      });
    }, 30000);
    return () => clearInterval(autoSaveRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes]);

  // ── Voice-over waveform (Web Audio decode) ────────────────────────────────
  useEffect(() => {
    if (!project.voice_audio_url || !waveformRef.current) return;
    const cvs = waveformRef.current;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    (async () => {
      try {
        const res = await fetch(project.voice_audio_url!);
        const buf = await res.arrayBuffer();
        const audioCtx = new AudioContext();
        const decoded = await audioCtx.decodeAudioData(buf);
        const data = decoded.getChannelData(0);
        const w = cvs.width, h = cvs.height;
        const step = Math.ceil(data.length / w);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#60a5fa";
        for (let x = 0; x < w; x++) {
          let max = 0;
          for (let j = 0; j < step; j++) {
            const v = Math.abs(data[x * step + j] ?? 0);
            if (v > max) max = v;
          }
          const barH = Math.max(2, max * h * 0.88);
          ctx.fillRect(x, (h - barH) / 2, 1, barH);
        }
      } catch {
        if (!ctx) return;
        // Fallback: sine wave placeholder
        ctx.strokeStyle = "#60a5fa";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x < cvs.width; x++) {
          const y = cvs.height / 2 + Math.sin(x * 0.12) * 9 + Math.sin(x * 0.05) * 5;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.voice_audio_url, timelineWidth]);

  // ── Timeline markers ──────────────────────────────────────────────────────
  const markerStep = totalDuration > 60 ? 10 : totalDuration > 20 ? 5 : 1;
  const markers = useMemo(() => {
    const arr: number[] = [];
    for (let t = 0; t <= totalDuration; t += markerStep) arr.push(t);
    return arr;
  }, [totalDuration, markerStep]);

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-noseek]")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
    seekTo(Math.max(0, x / PX_PER_SEC));
  }

  // ── Clip drag-reorder ─────────────────────────────────────────────────────
  function handleDragStart(e: React.DragEvent, i: number) {
    e.dataTransfer.effectAllowed = "move";
    dragIdxRef.current = i;
  }
  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    setDragOverIdx(i);
  }
  function handleDrop(e: React.DragEvent, target: number) {
    e.preventDefault();
    const from = dragIdxRef.current;
    setDragOverIdx(null);
    if (from === null || from === target) return;
    const arr = [...scenes];
    const [m] = arr.splice(from, 1);
    arr.splice(target, 0, m);
    const updated = arr.map((s, i) => ({ ...s, number: i + 1 }));
    setScenes(updated);
    setSelectedIdx(target);
    dragIdxRef.current = null;
    save(updated);
    onUpdate({ scenes: updated });
  }

  // ── Trim drag ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!trimDrag) return;
    function onMove(e: MouseEvent) {
      const dx = e.clientX - trimDrag!.startX;
      const newDur = Math.max(1, Math.round((trimDrag!.startDur + dx / PX_PER_SEC) * 2) / 2);
      setScenes((prev) => prev.map((s, i) => i === trimDrag!.idx ? { ...s, duration: newDur } : s));
    }
    function onUp() {
      setTrimDrag(null);
      setScenes((prev) => { save(prev); return prev; });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimDrag]);

  // ── Audio track offset drag ───────────────────────────────────────────────
  useEffect(() => {
    if (!audioDrag) return;
    function onMove(e: MouseEvent) {
      const dx = e.clientX - audioDrag!.startX;
      const newOffset = Math.max(0, Math.min(totalDuration - 1, audioDrag!.startOffset + dx / PX_PER_SEC));
      if (audioDrag!.track === "voice") setVoiceOffsetSec(newOffset);
      else setMusicOffsetSec(newOffset);
    }
    function onUp() { setAudioDrag(null); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [audioDrag, totalDuration]);

  // ── Transitions ───────────────────────────────────────────────────────────
  function applyTransition(sceneIdx: number, t: TransitionType) {
    const updated = scenes.map((s, i) => i === sceneIdx ? { ...s, transition_out: t } : s);
    setScenes(updated);
    save(updated);
    onUpdate({ scenes: updated });
    setTransitionPopup(null);
  }

  function getTransition(sceneIdx: number): TransitionType {
    return scenes[sceneIdx]?.transition_out ?? "cut";
  }

  // ── Transition engine ─────────────────────────────────────────────────────
  // Called by tick when it detects we've entered the transition window.
  // activeIdxRef is already set to toIdx before this is called.
  function executeTransition(fromIdx: number, toIdx: number) {
    const sc       = scenesRef.current;
    const toScene  = sc[toIdx];
    const transType: TransitionType = sc[fromIdx]?.transition_out ?? "cut";

    const active  = getActive();   // old clip, currently playing
    const standby = getStandby();  // new clip, preloaded

    if (!toScene?.video_url || !active || !standby) {
      transitionActiveRef.current = false;
      return;
    }

    // Set up standby with correct rate and start it playing
    const editorDur = toScene.duration;
    const srcDur    = sourceDurRef.current[toScene.video_url] ?? editorDur;
    standby.playbackRate = srcDur / editorDur;
    standby.currentTime  = 0;

    if (standby.getAttribute("data-src") !== toScene.video_url) {
      standby.src = toScene.video_url;
      standby.setAttribute("data-src", toScene.video_url);
      standby.muted = true;
      standby.load();
    }

    if (transType === "cut") {
      // Instant swap
      active.style.opacity  = "0";
      active.pause();
      standby.style.opacity = "1";
      standby.style.transform = "";
      standby.style.zIndex  = "2";
      active.style.zIndex   = "1";
      standby.play().catch(() => {});
      swapAB();
      preloadNext(toIdx);
      transitionActiveRef.current = false;
      return;
    }

    standby.play().catch(() => {});
    animCancelRef.current = false;
    animateTransition(transType, active, standby, () => {
      // Transition complete: old clip invisible, new clip fully visible
      active.style.opacity = "0";
      active.style.transform = "";
      active.pause();
      standby.style.opacity = "1";
      standby.style.transform = "";
      swapAB();
      preloadNext(toIdx);
      transitionActiveRef.current = false;
    });
  }

  // ── Save helper ───────────────────────────────────────────────────────────
  function save(s: Scene[]) {
    fetch("/api/save-project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, scenes: s }),
    });
  }

  // ── Properties helpers ────────────────────────────────────────────────────
  function updateScene(idx: number, field: keyof Scene, value: unknown) {
    const updated = scenes.map((s, i) => i === idx ? { ...s, [field]: value } : s);
    setScenes(updated);
    save(updated);
  }

  // ── Music upload ──────────────────────────────────────────────────────────
  async function handleMusicUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMusic(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const sb = createClient();
      const ext = file.name.split(".").pop();
      const path = `${project.user_id}/${project.id}/bgmusic.${ext}`;
      await sb.storage.from("audio").upload(path, file, { upsert: true });
      const { data } = sb.storage.from("audio").getPublicUrl(path);
      setBgMusicUrl(data.publicUrl);
      onUpdate({ bg_music_url: data.publicUrl });
    } catch (err) { console.error(err); }
    finally { setUploadingMusic(false); }
  }

  // ── Export MP4 ────────────────────────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    setExportError("");
    setExportUrl("");
    setExportPct(0);

    const writtenFiles: string[] = [];

    try {
      if (typeof SharedArrayBuffer === "undefined") {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        throw new Error(
          isIOS
            ? "Exporteren werkt nog niet in Safari op iPhone/iPad. Gebruik Chrome op je computer om de video te exporteren."
            : "Export niet mogelijk in deze browser. Probeer Chrome of Firefox op je computer."
        );
      }

      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { toBlobURL } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();

      // ── Load ffmpeg.wasm core from CDN ───────────────────────────────
      setExportPct(2);
      const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
      try {
        await ffmpeg.load({
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
        });
      } catch (loadErr) {
        throw new Error(
          `Failed to load ffmpeg.wasm: ${loadErr instanceof Error ? loadErr.message : String(loadErr)}`
        );
      }
      setExportPct(10);

      // ── Validate ─────────────────────────────────────────────────────
      const videoScenes = scenes.filter((s) => s.video_url);
      if (videoScenes.length === 0) {
        throw new Error("No video clips found. Complete Motion Review (Step 4) first.");
      }

      // ── Fetch each clip and write to ffmpeg FS ───────────────────────
      for (let i = 0; i < videoScenes.length; i++) {
        const name = `clip${i}.mp4`;
        setExportPct(10 + Math.round(((i + 1) / videoScenes.length) * 15));
        const bytes = await fetchAsBytes(videoScenes[i].video_url!);
        await ffmpeg.writeFile(name, bytes);
        writtenFiles.push(name);
      }

      // ── Trim / loop each clip to the user-edited scene duration ──────
      // Using -stream_loop -1 handles both:
      //   shorter scene (clips trimmed) and longer scene (clip looped).
      const scaleFilter =
        "scale=1920:1080:force_original_aspect_ratio=decrease," +
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black";

      const trimmedNames: string[] = [];
      let totalExpectedDuration = 0;
      for (let i = 0; i < videoScenes.length; i++) {
        const sceneDur = videoScenes[i].duration;
        totalExpectedDuration += sceneDur;
        const srcName = `clip${i}.mp4`;
        const dstName = `clip${i}_trimmed.mp4`;
        setExportPct(25 + Math.round(((i + 1) / videoScenes.length) * 20));
        await ffmpeg.exec([
          "-stream_loop", "-1",
          "-i", srcName,
          "-t", String(sceneDur),
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
          "-vf", scaleFilter,
          "-an",
          "-y",
          dstName,
        ]);
        writtenFiles.push(dstName);
        trimmedNames.push(dstName);
      }

      // ── Fetch voiceover ──────────────────────────────────────────────
      let hasVoice = false;
      if (project.voice_audio_url) {
        try {
          const voiceBytes = await fetchAsBytes(project.voice_audio_url);
          await ffmpeg.writeFile("voiceover.mp3", voiceBytes);
          writtenFiles.push("voiceover.mp3");
          hasVoice = true;
        } catch (e) {
          console.warn("[Export] Voice audio fetch failed — exporting without audio:", e);
        }
      }

      // ── Fetch background music ───────────────────────────────────────
      let hasBgMusic = false;
      if (bgMusicUrl) {
        try {
          const musicBytes = await fetchAsBytes(bgMusicUrl);
          await ffmpeg.writeFile("bgmusic.mp3", musicBytes);
          writtenFiles.push("bgmusic.mp3");
          hasBgMusic = true;
        } catch (e) {
          console.warn("[Export] Background music fetch failed — exporting without bg music:", e);
        }
      }

      setExportPct(50);

      // ── Determine if any non-cut transitions are used ────────────────
      const xfadeMap: Record<string, string> = {
        "fade":        "fadeblack",
        "dissolve":    "dissolve",
        "slide-left":  "slideleft",
        "slide-right": "slideright",
        "zoom-in":     "zoomin",
      };
      const hasNonCutTransition = videoScenes.length > 1 &&
        videoScenes.slice(0, -1).some(s => (s.transition_out ?? "cut") !== "cut");

      // ── Build ffmpeg command ─────────────────────────────────────────
      let cmd: string[];

      if (hasNonCutTransition) {
        // ── xfade path: chain transitions between clips ──────────────
        // All trimmed clips are inputs; chain xfade filters for non-cut transitions.
        const videoInputs: string[] = [];
        for (const name of trimmedNames) videoInputs.push("-i", name);

        // Build video filter_complex with chained xfade
        let vFilter = "";
        let prevLabel = "[0:v]";
        let cumOffset = 0;
        for (let i = 0; i < videoScenes.length - 1; i++) {
          const trans = videoScenes[i].transition_out ?? "cut";
          const td = trans !== "cut" ? Math.min(TRANS_DUR, videoScenes[i].duration * 0.4, videoScenes[i+1].duration * 0.4) : 0;
          const xType = td > 0 ? (xfadeMap[trans] ?? "dissolve") : "fade";
          const safeTd = Math.max(td, 0.001);
          const offset = Math.max(0, cumOffset + videoScenes[i].duration - safeTd);
          const outLabel = i === videoScenes.length - 2 ? "[vout]" : `[xv${i}]`;
          vFilter += `${prevLabel}[${i + 1}:v]xfade=transition=${xType}:duration=${safeTd}:offset=${offset}${outLabel};`;
          prevLabel = outLabel;
          cumOffset += videoScenes[i].duration - safeTd;
        }
        vFilter = vFilter.replace(/;$/, "");

        // Recalculate total duration accounting for overlaps
        let xfadeTotalDur = 0;
        for (let i = 0; i < videoScenes.length; i++) {
          const trans = i < videoScenes.length - 1 ? (videoScenes[i].transition_out ?? "cut") : "cut";
          const td = trans !== "cut" ? Math.min(TRANS_DUR, videoScenes[i].duration * 0.4) : 0;
          xfadeTotalDur += videoScenes[i].duration - td;
        }
        xfadeTotalDur += Math.min(TRANS_DUR, (videoScenes.at(-1)?.duration ?? 0) * 0.4);

        const n = videoScenes.length; // first audio input index
        if (hasBgMusic && hasVoice) {
          const af = `[${n}:a]volume=0.4[bg];[${n+1}:a]volume=1.0[vo];[bg][vo]amix=inputs=2:duration=longest[aout]`;
          cmd = [...videoInputs, "-i", "bgmusic.mp3", "-i", "voiceover.mp3",
            "-filter_complex", `${vFilter};${af}`,
            "-map", "[vout]", "-map", "[aout]",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
            "-c:a", "aac", "-movflags", "+faststart", "-t", String(xfadeTotalDur), "output.mp4"];
        } else if (hasBgMusic) {
          cmd = [...videoInputs, "-i", "bgmusic.mp3",
            "-filter_complex", `${vFilter};[${n}:a]volume=0.4[aout]`,
            "-map", "[vout]", "-map", "[aout]",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
            "-c:a", "aac", "-movflags", "+faststart", "-t", String(xfadeTotalDur), "output.mp4"];
        } else if (hasVoice) {
          cmd = [...videoInputs, "-i", "voiceover.mp3",
            "-filter_complex", vFilter,
            "-map", "[vout]", `-map`, `${n}:a`,
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
            "-c:a", "aac", "-movflags", "+faststart", "-t", String(xfadeTotalDur), "output.mp4"];
        } else {
          cmd = [...videoInputs,
            "-filter_complex", vFilter,
            "-map", "[vout]",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
            "-movflags", "+faststart", "-t", String(xfadeTotalDur), "output.mp4"];
        }
      } else {
        // ── Simple concat path (all cuts — faster, no re-encode) ─────
        const concatContent = trimmedNames.map(n => `file '${n}'`).join("\n");
        await ffmpeg.writeFile("concat.txt", new TextEncoder().encode(concatContent));
        writtenFiles.push("concat.txt");

        if (hasBgMusic && hasVoice) {
          cmd = [
            "-f", "concat", "-safe", "0", "-i", "concat.txt",
            "-i", "bgmusic.mp3", "-i", "voiceover.mp3",
            "-filter_complex", "[1:a]volume=0.4[bg];[2:a]volume=1.0[vo];[bg][vo]amix=inputs=2:duration=longest[aout]",
            "-map", "0:v", "-map", "[aout]",
            "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart",
            "-t", String(totalExpectedDuration), "output.mp4",
          ];
        } else if (hasBgMusic) {
          cmd = [
            "-f", "concat", "-safe", "0", "-i", "concat.txt", "-i", "bgmusic.mp3",
            "-map", "0:v", "-map", "1:a",
            "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart",
            "-t", String(totalExpectedDuration), "output.mp4",
          ];
        } else if (hasVoice) {
          cmd = [
            "-f", "concat", "-safe", "0", "-i", "concat.txt", "-i", "voiceover.mp3",
            "-map", "0:v", "-map", "1:a",
            "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart",
            "-t", String(totalExpectedDuration), "output.mp4",
          ];
        } else {
          cmd = [
            "-f", "concat", "-safe", "0", "-i", "concat.txt",
            "-c:v", "copy", "-movflags", "+faststart",
            "-t", String(totalExpectedDuration), "output.mp4",
          ];
        }
      }

      await ffmpeg.exec(cmd);
      writtenFiles.push("output.mp4");

      // ── Watermark for free plan (Canvas PNG overlay — no CDN deps) ──────
      let finalOutputFile = "output.mp4";
      if (plan === "free") {
        setExportPct(88);
        try {
          // Generate watermark PNG using browser Canvas API
          const wmCanvas = document.createElement("canvas");
          wmCanvas.width = 480; wmCanvas.height = 56;
          const ctx = wmCanvas.getContext("2d")!;
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(0, 0, wmCanvas.width, wmCanvas.height, 10);
          } else {
            ctx.rect(0, 0, wmCanvas.width, wmCanvas.height);
          }
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.font = "bold 26px Arial, Helvetica, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("jouwanimatievideo.nl", wmCanvas.width / 2, wmCanvas.height / 2);

          const wmBlob = await new Promise<Blob>((resolve) =>
            wmCanvas.toBlob((b) => resolve(b!), "image/png")
          );
          const wmBytes = new Uint8Array(await wmBlob.arrayBuffer());
          await ffmpeg.writeFile("watermark.png", wmBytes);
          writtenFiles.push("watermark.png");

          await ffmpeg.exec([
            "-i", "output.mp4",
            "-i", "watermark.png",
            "-filter_complex", "[0:v][1:v]overlay=(W-w)/2:(H-h)/2",
            "-c:a", "copy",
            "-c:v", "libx264", "-preset", "fast",
            "watermarked.mp4",
          ]);
          writtenFiles.push("watermarked.mp4");
          finalOutputFile = "watermarked.mp4";
        } catch (wmErr) {
          console.warn("[Export] Watermark pass failed:", wmErr);
        }
        setExportPct(95);
      }

      // ── Read output ──────────────────────────────────────────────────
      const raw = await ffmpeg.readFile(finalOutputFile);
      const blob = new Blob(
        [(raw as Uint8Array).buffer as ArrayBuffer],
        { type: "video/mp4" }
      );
      const exportedUrl = URL.createObjectURL(blob);
      setExportUrl(exportedUrl);
      setExportPct(100);

      // ── Duration sanity check ────────────────────────────────────────
      try {
        const checkVid = document.createElement("video");
        checkVid.src = exportedUrl;
        await new Promise<void>((resolve) => {
          checkVid.onloadedmetadata = () => resolve();
          setTimeout(resolve, 3000); // fallback timeout
        });
        const exportedDuration = checkVid.duration;
        if (isFinite(exportedDuration) && Math.abs(exportedDuration - totalExpectedDuration) > 0.5) {
          console.warn(
            `[Export] Duration mismatch: exported ${exportedDuration.toFixed(2)}s, ` +
            `expected ${totalExpectedDuration.toFixed(2)}s ` +
            `(diff: ${Math.abs(exportedDuration - totalExpectedDuration).toFixed(2)}s)`
          );
        }
        checkVid.src = "";
      } catch (durationCheckErr) {
        console.warn("[Export] Could not verify output duration:", durationCheckErr);
      }

      // ── Save project status ──────────────────────────────────────────
      await fetch("/api/save-project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, status: "Done" }),
      });
      onUpdate({ status: "Done" });

      // Show upgrade prompt for free users after export
      if (plan === "free") {
        setShowUpgradeModal(true);
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setExportError(msg);
      console.error("[Export]", err);
    } finally {
      setExporting(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentScene = scenes[selectedIdx];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0f0f0f] text-white overflow-hidden">

      {/* Post-export upgrade modal for free users */}
      {showUpgradeModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-gray-900">
            <div className="text-center mb-5">
              <div className="text-5xl mb-3">🎉</div>
              <h2 className="text-xl font-bold mb-2">Goed bezig!</h2>
              <p className="text-gray-500 text-sm">
                Je video is klaar. Upgrade naar <strong>Starter</strong> om het watermark
                te verwijderen en toegang te krijgen tot meer credits.
              </p>
            </div>
            <div className="space-y-3">
              <Link
                href="/pricing"
                className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Upgrade naar Starter →
              </Link>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="block w-full text-center text-gray-500 hover:text-gray-700 text-sm py-2 transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden audio elements — always in DOM, refs are always valid */}
      <audio ref={audioRef}   src={project.voice_audio_url ?? undefined} preload="auto" className="hidden" />
      <audio ref={bgMusicRef} src={bgMusicUrl || undefined} preload="auto" loop className="hidden" />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex-none flex items-center justify-between px-4 h-11 bg-[#161616] border-b border-[#2a2a2a]">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Back
          </button>
          <div className="w-px h-4 bg-[#2a2a2a]" />
          <span className="text-sm font-medium text-gray-200 truncate max-w-xs">{project.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {exportUrl ? (
            <a
              href={exportUrl}
              download={`${project.title.replace(/\s+/g, "-")}.mp4`}
              className="bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
            >
              ↓ Download MP4
            </a>
          ) : (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-60 text-white text-sm font-semibold px-5 py-1.5 rounded-lg transition-colors"
            >
                {exporting ? `Exporting… ${exportPct}%` : "Export MP4"}
            </button>
          )}
        </div>
      </div>

      {/* Export progress bar */}
      {exporting && (
        <div className="flex-none h-0.5 bg-[#222]">
          <div className="h-full bg-[#3b82f6] transition-all" style={{ width: `${exportPct}%` }} />
        </div>
      )}

      {/* Export error — shows full error text */}
      {exportError && (
        <div className="flex-none bg-red-950/80 border-b border-red-700/60 px-4 py-2.5 flex items-start gap-3">
          <span className="text-red-400 text-lg leading-none flex-none mt-0.5">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-300 mb-0.5">Export failed</p>
            <p className="text-xs text-red-400 break-all font-mono">{exportError}</p>
          </div>
          <button onClick={() => setExportError("")} className="text-red-500 hover:text-red-300 text-lg leading-none flex-none">×</button>
        </div>
      )}

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">

        {/* ── Main column: Preview + Timeline ─────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">

          {/* ── Preview Player ──────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col bg-[#0a0a0a] min-h-0">
            {/* Video frame: always 16:9, fills available space */}
            <div className="flex-1 flex items-center justify-center px-4 pt-4 min-h-0 overflow-hidden">
              {/*
                The container is always 16:9. Inside, videos use object-contain so:
                  • 16:9 source → fills frame edge-to-edge (Runway clips are ~5:3, tiny bars)
                  • 9:16 source → centred with black pillarbox bars left/right
                aspect-ratio + maxHeight lets the browser pick the tightest constraint.
              */}
              <div
                className="relative bg-black rounded-xl shadow-2xl overflow-hidden flex-none"
                style={{
                  aspectRatio: "16 / 9",
                  width: "100%",
                  maxWidth: 640,
                  maxHeight: "100%",
                }}
              >
                {/* Image fallback — shown when no video clip is active */}
                {currentScene?.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentScene.image_url}
                    alt=""
                    crossOrigin="anonymous"
                    style={{
                      position: "absolute",
                      top: "50%", left: "50%",
                      transform: "translate(-50%, -50%)",
                      maxWidth: "100%", maxHeight: "100%",
                      width: "auto", height: "auto",
                      objectFit: "contain",
                      zIndex: 0,
                    }}
                  />
                ) : (
                  <span className="text-gray-700 text-sm" style={{ position: "absolute", zIndex: 0 }}>
                    No preview available
                  </span>
                )}

                {/* Watermark overlay for free plan */}
                {plan === "free" && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
                    <span className="text-white/50 text-sm font-semibold bg-black/30 px-3 py-1 rounded backdrop-blur-sm">
                      jouwanimatievideo.nl
                    </span>
                  </div>
                )}

                {/*
                  Two video elements — videoA (active) and videoB (standby).
                  Both use inset:0 so they always fill the container exactly.
                  No centering transform is needed, so resetVideoStyle() clearing
                  transform never causes a mispositioned element.
                  The standby is always opacity:0 + pointer-events:none until
                  a transition begins. Container is bg-black so fade-to-black
                  works by making both transparent simultaneously.
                */}
                <video
                  ref={videoARef}
                  playsInline
                  preload="auto"
                  muted
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    zIndex: 2,
                    opacity: 1,
                    pointerEvents: "none",
                  }}
                />
                <video
                  ref={videoBRef}
                  playsInline
                  preload="auto"
                  muted
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    zIndex: 1,
                    opacity: 0,
                    pointerEvents: "none",
                  }}
                />
              </div>
            </div>

            {/* Playback controls — fixed height row below preview */}
            <div className="flex-none flex items-center justify-center gap-4 py-3">
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-[#3b82f6] hover:bg-[#2563eb] flex items-center justify-center transition-colors shadow-lg"
              >
                {isPlaying ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                    <rect x="3" y="2" width="4" height="12" rx="1" />
                    <rect x="9" y="2" width="4" height="12" rx="1" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M4 2.5v11l9-5.5-9-5.5z" />
                  </svg>
                )}
              </button>
              <span className="text-sm font-mono text-gray-300 tabular-nums">
                {fmt(displayTime)} / {fmt(totalDuration)}
              </span>
            </div>
          </div>

          {/* ── Timeline ────────────────────────────────────────────────── */}
          <div
            className="flex-none bg-[#111] border-t border-[#2a2a2a] select-none"
            style={{ height: TIMELINE_H }}
          >
            <div className="flex h-full">

              {/* Fixed left label column */}
              <div
                className="flex-none bg-[#141414] border-r border-[#2a2a2a] flex flex-col"
                style={{ width: LABEL_W }}
              >
                {/* Align with time ruler */}
                <div style={{ height: MARKER_H }} />
                {/* Video label */}
                <div
                  className="flex items-center justify-end pr-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider"
                  style={{ height: VIDEO_H }}
                >
                  Video
                </div>
                {/* Gap */}
                <div style={{ height: ROW_GAP }} />
                {/* Voice-over label */}
                <div
                  className={`flex items-center justify-end pr-2 text-[10px] font-semibold uppercase tracking-wider cursor-pointer transition-colors
                    ${selectedLayer === "voice" ? "text-blue-400" : "text-gray-500 hover:text-gray-300"}`}
                  style={{ height: VOICE_H }}
                  onClick={() => setSelectedLayer("voice")}
                >
                  Voice-over
                </div>
                {/* Gap */}
                <div style={{ height: ROW_GAP }} />
                {/* Music label */}
                <div
                  className={`flex items-center justify-end pr-2 text-[10px] font-semibold uppercase tracking-wider cursor-pointer transition-colors
                    ${selectedLayer === "music" ? "text-green-400" : "text-gray-500 hover:text-gray-300"}`}
                  style={{ height: MUSIC_H }}
                  onClick={() => setSelectedLayer("music")}
                >
                  Muziek
                </div>
              </div>

              {/* Scrollable timeline content */}
              <div
                ref={timelineRef}
                className="flex-1 overflow-x-auto overflow-y-hidden cursor-pointer"
                onClick={handleTimelineClick}
                onDragLeave={() => setDragOverIdx(null)}
              >
                <div className="relative" style={{ width: timelineWidth, height: "100%" }}>

                  {/* ── Time ruler ──────────────────────────────────────── */}
                  {markers.map((t) => (
                    <div key={t} className="absolute top-0 flex items-end" style={{ left: t * PX_PER_SEC }}>
                      <div className="absolute top-0 w-px bg-[#2a2a2a]" style={{ height: MARKER_H }} />
                      <span
                        className="ml-1 text-[9px] text-gray-600 tabular-nums"
                        style={{ lineHeight: `${MARKER_H}px` }}
                      >
                        {t}s
                      </span>
                    </div>
                  ))}

                  {/* ── Video clips row ──────────────────────────────────── */}
                  <div
                    className="absolute left-0 right-0"
                    style={{ top: MARKER_H, height: VIDEO_H }}
                    onClick={() => setSelectedLayer("video")}
                  >
                    {scenes.map((scene, i) => {
                      const b       = boundaries[i];
                      const color   = CLIP_COLORS[i % CLIP_COLORS.length];
                      const isSelected = i === selectedIdx;
                      const trans   = getTransition(i);
                      const hasTrans = trans !== "cut";

                      return (
                        <div key={scene.id}>
                          {/* Clip block */}
                          <div
                            data-noseek=""
                            draggable
                            onDragStart={(e) => handleDragStart(e, i)}
                            onDragOver={(e) => handleDragOver(e, i)}
                            onDrop={(e) => handleDrop(e, i)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedIdx(i);
                              setSelectedLayer("video");
                              seekTo(b.start);
                            }}
                            className="absolute top-1 rounded-lg overflow-hidden border-2 transition-colors"
                            style={{
                              left: b.start * PX_PER_SEC + 1,
                              width: Math.max(b.duration * PX_PER_SEC - 2, 24),
                              height: VIDEO_H - 8,
                              background: color,
                              borderColor: isSelected ? "#60a5fa" : dragOverIdx === i ? "#93c5fd" : "transparent",
                              boxShadow: isSelected ? "0 0 0 1px #60a5fa" : "none",
                            }}
                          >
                            {/* Thumbnail */}
                            <div className="relative overflow-hidden" style={{ height: VIDEO_H - 28 }}>
                              {scene.image_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={scene.image_url}
                                  alt=""
                                  crossOrigin="anonymous"
                                  className="w-full h-full object-cover opacity-55"
                                />
                              )}
                            </div>
                            {/* Label */}
                            <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/50 flex justify-between items-center">
                              <span className="text-[9px] font-semibold text-white/90 truncate">#{scene.number}</span>
                              <span className="text-[9px] text-white/50 tabular-nums ml-1">{b.duration}s</span>
                            </div>
                            {/* Trim handle */}
                            <div
                              data-noseek=""
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setTrimDrag({ idx: i, startX: e.clientX, startDur: b.duration });
                              }}
                              className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize flex items-center justify-center hover:bg-white/20 z-10"
                              title="Drag to trim"
                            >
                              <div className="w-0.5 h-5 bg-white/40 rounded-full" />
                            </div>
                          </div>

                          {/* Diamond transition button (between this clip and next) */}
                          {i < scenes.length - 1 && (
                            <button
                              data-noseek=""
                              onClick={(e) => {
                                e.stopPropagation();
                                setTransitionPopup({ sceneIdx: i });
                              }}
                              className="absolute z-20 flex items-center justify-center transition-transform hover:scale-110"
                              style={{
                                left: boundaries[i].end * PX_PER_SEC - 11,
                                top: (VIDEO_H - 8) / 2 - 10,
                                width: 22,
                                height: 22,
                              }}
                              title={`Transition: ${getTransition(i)}`}
                            >
                              <svg viewBox="0 0 20 20" className="w-full h-full drop-shadow-md">
                                <path
                                  d="M10 1 L19 10 L10 19 L1 10 Z"
                                  fill={hasTrans ? "#3b82f6" : "#374151"}
                                  stroke={hasTrans ? "#60a5fa" : "#4b5563"}
                                  strokeWidth="1.5"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Gap ─────────────────────────────────────────────── */}
                  <div
                    className="absolute left-0 right-0 bg-[#0d0d0d]"
                    style={{ top: MARKER_H + VIDEO_H, height: ROW_GAP }}
                  />

                  {/* ── Voice-over row ───────────────────────────────────── */}
                  <div
                    className="absolute left-0"
                    style={{ top: MARKER_H + VIDEO_H + ROW_GAP, height: VOICE_H, width: timelineWidth }}
                    onClick={(e) => { e.stopPropagation(); setSelectedLayer("voice"); }}
                  >
                    {/* Background */}
                    <div className={`absolute inset-0 rounded-sm transition-colors ${selectedLayer === "voice" ? "bg-blue-950/40" : "bg-[#0d0d0d]"}`} />

                    {project.voice_audio_url ? (
                      /* Draggable waveform bar */
                      <div
                        data-noseek=""
                        className="absolute top-1 bottom-1 rounded cursor-grab active:cursor-grabbing bg-blue-900/30 border border-blue-700/30 overflow-hidden"
                        style={{
                          left: voiceOffsetSec * PX_PER_SEC,
                          width: timelineWidth - voiceOffsetSec * PX_PER_SEC,
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setAudioDrag({ track: "voice", startX: e.clientX, startOffset: voiceOffsetSec });
                        }}
                      >
                        <canvas
                          ref={waveformRef}
                          width={timelineWidth}
                          height={VOICE_H - 8}
                          className="w-full h-full opacity-80"
                        />
                      </div>
                    ) : (
                      <div className="absolute inset-1 rounded border border-dashed border-gray-700/40 flex items-center px-3">
                        <span className="text-[10px] text-gray-600">No voice-over uploaded</span>
                      </div>
                    )}
                  </div>

                  {/* ── Gap ─────────────────────────────────────────────── */}
                  <div
                    className="absolute left-0 right-0 bg-[#0d0d0d]"
                    style={{ top: MARKER_H + VIDEO_H + ROW_GAP + VOICE_H, height: ROW_GAP }}
                  />

                  {/* ── Background music row ─────────────────────────────── */}
                  <div
                    className="absolute left-0"
                    style={{ top: MARKER_H + VIDEO_H + ROW_GAP + VOICE_H + ROW_GAP, height: MUSIC_H, width: timelineWidth }}
                    onClick={(e) => { e.stopPropagation(); setSelectedLayer("music"); }}
                  >
                    {/* Background */}
                    <div className={`absolute inset-0 rounded-sm transition-colors ${selectedLayer === "music" ? "bg-green-950/40" : "bg-[#0d0d0d]"}`} />

                    {bgMusicUrl ? (
                      /* Draggable music bar */
                      <div
                        data-noseek=""
                        className="absolute top-1 bottom-1 rounded cursor-grab active:cursor-grabbing bg-green-900/50 border border-green-700/40 flex items-center px-2 gap-1.5 overflow-hidden"
                        style={{
                          left: musicOffsetSec * PX_PER_SEC,
                          width: timelineWidth - musicOffsetSec * PX_PER_SEC,
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setAudioDrag({ track: "music", startX: e.clientX, startOffset: musicOffsetSec });
                        }}
                      >
                        {/* Music waveform placeholder pattern */}
                        <svg className="h-full w-full opacity-50" preserveAspectRatio="none" viewBox="0 0 100 20">
                          {Array.from({ length: 50 }, (_, i) => {
                            const h = 4 + Math.sin(i * 0.6) * 6 + Math.sin(i * 0.17) * 4;
                            return <rect key={i} x={i * 2} y={(20 - h) / 2} width="1.2" height={h} fill="#4ade80" />;
                          })}
                        </svg>
                      </div>
                    ) : (
                      <div className="absolute inset-1 rounded border border-dashed border-gray-700/40 flex items-center px-3">
                        <span className="text-[10px] text-gray-600">No background music — upload in sidebar</span>
                      </div>
                    )}
                  </div>

                  {/* ── Playhead ─────────────────────────────────────────── */}
                  <div
                    ref={playheadRef}
                    className="absolute top-0 pointer-events-none z-30"
                    style={{ left: 0, width: 2, height: "100%", background: "#3b82f6" }}
                  >
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-[#3b82f6] rotate-45" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Properties sidebar ────────────────────────────────────────── */}
        <div className="w-64 flex-none bg-[#161616] border-l border-[#2a2a2a] overflow-y-auto flex flex-col">

          {/* Clip section */}
          {currentScene && (
            <section className="border-b border-[#2a2a2a] p-4 space-y-3">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Clip</p>
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">Scene</label>
                <input
                  className="w-full bg-[#222] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm text-gray-400 focus:outline-none"
                  value={`Scene ${currentScene.number}`}
                  readOnly
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-500 block mb-1">Duration (seconds)</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  className="w-full bg-[#222] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[#3b82f6]"
                  value={currentScene.duration}
                  onChange={(e) => updateScene(selectedIdx, "duration", parseInt(e.target.value) || currentScene.duration)}
                />
              </div>
            </section>
          )}

          {/* Transition section */}
          {currentScene && selectedIdx < scenes.length - 1 && (
            <section className="border-b border-[#2a2a2a] p-4 space-y-3">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
                Transition after this scene
              </p>
              <button
                onClick={() => setTransitionPopup({ sceneIdx: selectedIdx })}
                className="w-full flex items-center gap-2 bg-[#222] border border-[#2a2a2a] hover:border-[#3b82f6] rounded-lg px-3 py-2 transition-colors"
              >
                <svg viewBox="0 0 16 16" className={`w-4 h-4 flex-none ${getTransition(selectedIdx) !== "cut" ? "text-[#3b82f6]" : "text-gray-500"}`}>
                  <path d="M8 0L16 8L8 16L0 8Z" fill="currentColor" />
                </svg>
                <span className="text-sm text-gray-300 capitalize">
                  {TRANSITIONS.find(t => t.id === getTransition(selectedIdx))?.label ?? "Cut"}
                </span>
              </button>
            </section>
          )}

          {/* Audio section */}
          <section className="p-4 space-y-4 border-b border-[#2a2a2a]">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Audio</p>
            {project.voice_audio_url && (
              <div>
                <div className="flex justify-between text-[11px] text-gray-500 mb-1.5">
                  <span>Voice Volume</span>
                  <span>{Math.round(voiceVol * 100)}%</span>
                </div>
                <input
                  type="range" min={0} max={1} step={0.01} value={voiceVol}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVoiceVol(v);
                    if (audioRef.current) audioRef.current.volume = v;
                  }}
                  className="w-full accent-[#3b82f6]"
                />
                <div className="flex justify-between text-[11px] text-gray-600 mt-1">
                  <span>Offset</span>
                  <span>{voiceOffsetSec.toFixed(1)}s</span>
                </div>
              </div>
            )}
            <div>
              <label className="text-[11px] text-gray-500 block mb-1.5">Background Music</label>
              <label className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] hover:border-[#555] text-xs text-gray-400 hover:text-gray-200 cursor-pointer transition-colors">
                <input type="file" accept="audio/*" className="hidden" onChange={handleMusicUpload} />
                {uploadingMusic ? "Uploading…" : bgMusicUrl ? "Change Music" : "Upload MP3"}
              </label>
              {bgMusicUrl && (
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between text-[11px] text-gray-500">
                    <span>Music Volume</span>
                    <span>{Math.round(musicVol * 100)}%</span>
                  </div>
                  <input
                    type="range" min={0} max={1} step={0.01} value={musicVol}
                    onChange={(e) => setMusicVol(parseFloat(e.target.value))}
                    className="w-full accent-green-500"
                  />
                  <div className="flex justify-between text-[11px] text-gray-600">
                    <span>Offset</span>
                    <span>{musicOffsetSec.toFixed(1)}s</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Scene list */}
          <section className="p-4 flex-1">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-3">All Scenes</p>
            <div className="space-y-1.5">
              {scenes.map((s, i) => {
                const hasTrans = getTransition(i) !== "cut";
                return (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedIdx(i); setSelectedLayer("video"); seekTo(boundaries[i].start); }}
                    className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors text-left
                      ${i === selectedIdx ? "bg-[#1e3a5f]/60 border border-[#3b82f6]/40" : "hover:bg-[#1e1e1e] border border-transparent"}`}
                  >
                    <div className="w-8 h-5 rounded overflow-hidden flex-none bg-gray-800">
                      {s.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.image_url} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-300 truncate">Scene {s.number}</p>
                      <p className="text-[10px] text-gray-600">{boundaries[i].duration}s</p>
                    </div>
                    {hasTrans && (
                      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-[#3b82f6] flex-none">
                        <path d="M6 0L12 6L6 12L0 6Z" fill="currentColor" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* ── Transition popup ──────────────────────────────────────────────── */}
      {transitionPopup && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          onClick={() => setTransitionPopup(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-[#1a1a1a] border border-[#333] rounded-2xl shadow-2xl p-5 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">
                Transition — after Scene {scenes[transitionPopup.sceneIdx]?.number}
              </h3>
              <button
                onClick={() => setTransitionPopup(null)}
                className="text-gray-500 hover:text-white text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {TRANSITIONS.map((t) => {
                const active = getTransition(transitionPopup.sceneIdx) === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => applyTransition(transitionPopup.sceneIdx, t.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition-colors border-2
                      ${active
                        ? "border-[#3b82f6] bg-[#1e3a5f]/40"
                        : "border-transparent hover:border-[#333] bg-[#222] hover:bg-[#2a2a2a]"
                      }`}
                  >
                    <div className="w-full rounded-lg overflow-hidden" style={{ height: 44 }}>
                      {t.preview}
                    </div>
                    <span className={`text-[10px] font-medium leading-tight text-center ${active ? "text-[#60a5fa]" : "text-gray-400"}`}>
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
