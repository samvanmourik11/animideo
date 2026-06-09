"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  computeDuration,
  DEFAULT_TEXT_STYLE,
  DEFAULT_TRANSFORM,
  keyframeValueAt,
  NEUTRAL_EFFECT,
  staticValue,
  type Clip,
  type EffectKind,
  type KeyframeProperty,
  type TextClip,
  type TextStyle,
  type TimelineDoc,
  type Track,
  type TrackKind,
  type Transform,
} from "./timeline";

const KF_EPS = 0.05; // s: keyframes binnen deze afstand gelden als "op de playhead"

// Centrale editor-store. Bewust een lichte external store (geen extra
// dependency) i.p.v. React context: de afspeel-klok werkt currentTime elke
// frame bij en alleen componenten die op tijd selecteren hoeven dan te
// hertekenen. De compositor leest de state imperatief in zijn eigen ticker.

export interface EditorState {
  doc: TimelineDoc;
  currentTime: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  pxPerSec: number; // timeline-zoom
  saveState: "idle" | "saving" | "saved" | "error";
}

type Listener = () => void;
const MIN_CLIP = 0.1; // s

const TRACK_FOR_KIND: Record<Clip["type"], TrackKind> = {
  video: "video",
  image: "video",
  text: "text",
  audio: "audio",
};

export class EditorStore {
  private state: EditorState;
  private listeners = new Set<Listener>();
  private raf = 0;
  private lastTs = 0;
  private persist?: (doc: TimelineDoc) => Promise<void>;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  // Undo/redo. Doc is altijd immutable vervangen, dus snapshots zijn gewoon
  // referenties. Een burst van wijzigingen (bv. één sleep) wordt tot één stap
  // samengevoegd via een korte debounce.
  private past: TimelineDoc[] = [];
  private future: TimelineDoc[] = [];
  private histTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPast: TimelineDoc | null = null;

  constructor(doc: TimelineDoc, persist?: (doc: TimelineDoc) => Promise<void>) {
    this.state = {
      doc,
      currentTime: 0,
      isPlaying: false,
      selectedClipId: null,
      pxPerSec: 80,
      saveState: "idle",
    };
    this.persist = persist;
  }

  // ── External store wiring ──────────────────────────────────
  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getState = (): EditorState => this.state;
  private notify() {
    this.listeners.forEach((l) => l());
  }

  duration(): number {
    return computeDuration(this.state.doc);
  }

  // ── Playback-klok ──────────────────────────────────────────
  play() {
    if (this.state.isPlaying) return;
    if (this.state.currentTime >= this.duration()) this.state.currentTime = 0;
    this.state.isPlaying = true;
    this.lastTs = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    this.notify();
  }
  pause() {
    if (!this.state.isPlaying) return;
    this.state.isPlaying = false;
    cancelAnimationFrame(this.raf);
    this.notify();
  }
  togglePlay() {
    this.state.isPlaying ? this.pause() : this.play();
  }
  seek(t: number) {
    this.state.currentTime = Math.max(0, Math.min(this.duration(), t));
    this.notify();
  }
  private tick = (ts: number) => {
    const dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    let t = this.state.currentTime + dt;
    const dur = this.duration();
    if (t >= dur) {
      t = dur;
      this.state.currentTime = t;
      this.pause();
      return;
    }
    this.state.currentTime = t;
    this.notify();
    if (this.state.isPlaying) this.raf = requestAnimationFrame(this.tick);
  };

  // ── Selectie & zoom ────────────────────────────────────────
  select(id: string | null) {
    this.state.selectedClipId = id;
    this.notify();
  }
  setZoom(pxPerSec: number) {
    this.state.pxPerSec = Math.max(20, Math.min(400, pxPerSec));
    this.notify();
  }

  // ── Doc-mutaties (immutable) ───────────────────────────────
  private setDoc(doc: TimelineDoc, persist = true) {
    // Bewaar de huidige staat voor undo, samengevoegd per burst.
    if (this.pendingPast === null) this.pendingPast = this.state.doc;
    if (this.histTimer) clearTimeout(this.histTimer);
    this.histTimer = setTimeout(() => this.commitHistory(), 500);
    this.state.doc = doc;
    this.notify();
    if (persist) this.schedulePersist();
  }

  private commitHistory() {
    if (this.histTimer) {
      clearTimeout(this.histTimer);
      this.histTimer = null;
    }
    if (this.pendingPast === null) return; // niets te committen; redo-stack intact laten
    this.past.push(this.pendingPast);
    if (this.past.length > 100) this.past.shift();
    this.pendingPast = null;
    this.future = [];
  }

  canUndo() {
    return this.past.length > 0 || this.pendingPast !== null;
  }
  undo() {
    this.commitHistory();
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.state.doc);
    this.state.doc = prev;
    if (!this.find(this.state.selectedClipId)) this.state.selectedClipId = null;
    this.notify();
    this.schedulePersist();
  }
  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.state.doc);
    this.state.doc = next;
    if (!this.find(this.state.selectedClipId)) this.state.selectedClipId = null;
    this.notify();
    this.schedulePersist();
  }

  private mapClip(id: string, fn: (c: Clip) => Clip): TimelineDoc {
    const doc = this.state.doc;
    return {
      ...doc,
      tracks: doc.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === id ? fn(c) : c)),
      })),
    };
  }

  find(id: string | null): Clip | null {
    if (!id) return null;
    for (const t of this.state.doc.tracks) {
      const c = t.clips.find((x) => x.id === id);
      if (c) return c;
    }
    return null;
  }

  updateClip(id: string, patch: Partial<Clip>) {
    this.setDoc(this.mapClip(id, (c) => ({ ...c, ...patch } as Clip)));
  }

  /** Voeg een tekstclip toe op de tekst-track, op de huidige playhead. */
  addTextClip() {
    const doc = this.state.doc;
    const clip: TextClip = {
      id: crypto.randomUUID(),
      type: "text",
      text: "Jouw tekst",
      style: { ...DEFAULT_TEXT_STYLE },
      preset: "fade-in",
      start: this.state.currentTime,
      duration: 3,
      transform: { ...DEFAULT_TRANSFORM, y: 0.84 }, // standaard onderin (ondertitel)
      opacity: 1,
    };
    let track = doc.tracks.find((t) => t.kind === "text");
    let tracks = doc.tracks;
    if (!track) {
      track = { id: crypto.randomUUID(), kind: "text", name: "Tekst", clips: [] };
      tracks = [...doc.tracks, track];
    }
    this.setDoc({
      ...doc,
      tracks: tracks.map((t) =>
        t.id === track!.id ? { ...t, clips: [...t.clips, clip] } : t
      ),
    });
    this.select(clip.id);
  }

  /** Werk de tekststijl bij (merge). */
  setTextStyle(id: string, patch: Partial<TextStyle>) {
    this.setDoc(
      this.mapClip(id, (c) =>
        c.type === "text" ? { ...c, style: { ...c.style, ...patch } } : c
      )
    );
  }

  /** Stel een effect in (upsert; verwijder bij neutrale waarde). */
  setEffect(id: string, kind: EffectKind, amount: number) {
    this.setDoc(
      this.mapClip(id, (c) => {
        const others = (c.effects ?? []).filter((e) => e.kind !== kind);
        const effects =
          amount === NEUTRAL_EFFECT[kind] ? others : [...others, { kind, amount }];
        return { ...c, effects };
      })
    );
  }

  // ── Keyframes ──────────────────────────────────────────────
  isAnimated(id: string | null, property: KeyframeProperty): boolean {
    const clip = this.find(id);
    return !!clip?.keyframes?.some((k) => k.property === property);
  }

  /** Heeft de eigenschap een keyframe precies op de playhead? */
  keyframeAtPlayhead(id: string | null, property: KeyframeProperty): boolean {
    const clip = this.find(id);
    if (!clip) return false;
    const local = this.state.currentTime - clip.start;
    return !!clip.keyframes?.some(
      (k) => k.property === property && Math.abs(k.time - local) < KF_EPS
    );
  }

  /** Effectieve (eventueel geïnterpoleerde) waarde op de playhead. */
  effectiveValue(id: string | null, property: KeyframeProperty): number {
    const clip = this.find(id);
    if (!clip) return 0;
    const local = this.state.currentTime - clip.start;
    return keyframeValueAt(clip, property, local, staticValue(clip, property));
  }

  /**
   * Zet een waarde. Is de eigenschap geanimeerd, dan schrijft dit een keyframe
   * op de playhead; anders past het de statische waarde aan.
   */
  setAnimatable(id: string, property: KeyframeProperty, value: number) {
    this.setDoc(
      this.mapClip(id, (c) => {
        const animated = !!c.keyframes?.some((k) => k.property === property);
        if (!animated) {
          if (property === "opacity") return { ...c, opacity: value };
          return {
            ...c,
            transform: { ...DEFAULT_TRANSFORM, ...c.transform, [property]: value },
          };
        }
        const local = Math.max(0, Math.min(c.duration, this.state.currentTime - c.start));
        const kfs = (c.keyframes ?? []).filter(
          (k) => !(k.property === property && Math.abs(k.time - local) < KF_EPS)
        );
        kfs.push({ property, time: local, value });
        return { ...c, keyframes: kfs };
      })
    );
  }

  /** Zet/verwijder een keyframe voor een eigenschap op de playhead. */
  toggleKeyframe(id: string, property: KeyframeProperty) {
    this.setDoc(
      this.mapClip(id, (c) => {
        const local = Math.max(0, Math.min(c.duration, this.state.currentTime - c.start));
        const existing = c.keyframes?.find(
          (k) => k.property === property && Math.abs(k.time - local) < KF_EPS
        );
        if (existing) {
          return { ...c, keyframes: (c.keyframes ?? []).filter((k) => k !== existing) };
        }
        const value = keyframeValueAt(c, property, local, staticValue(c, property));
        return { ...c, keyframes: [...(c.keyframes ?? []), { property, time: local, value }] };
      })
    );
  }

  /** Werk de transform bij (merge met defaults). */
  setTransform(id: string, patch: Partial<Transform>) {
    this.setDoc(
      this.mapClip(id, (c) => ({
        ...c,
        transform: { ...DEFAULT_TRANSFORM, ...c.transform, ...patch },
      }))
    );
  }

  /** Verplaats een clip naar een andere (visuele) track, bv. Video <-> Overlay. */
  moveClipToTrack(id: string, kind: TrackKind) {
    const doc = this.state.doc;
    let moving: Clip | null = null;
    const stripped = doc.tracks.map((t) => {
      const found = t.clips.find((c) => c.id === id);
      if (found) moving = found;
      return { ...t, clips: t.clips.filter((c) => c.id !== id) };
    });
    if (!moving) return;
    let target = stripped.find((t) => t.kind === kind);
    let tracks = stripped;
    if (!target) {
      target = { id: crypto.randomUUID(), kind, name: kind, clips: [] };
      tracks = [...stripped, target];
    }
    this.setDoc({
      ...doc,
      tracks: tracks.map((t) =>
        t.id === target!.id ? { ...t, clips: [...t.clips, moving!] } : t
      ),
    });
  }

  /** Verschuif een clip in de teken-volgorde binnen zijn track (z-volgorde). */
  reorderClip(id: string, dir: "forward" | "backward") {
    const doc = this.state.doc;
    this.setDoc({
      ...doc,
      tracks: doc.tracks.map((t) => {
        const i = t.clips.findIndex((c) => c.id === id);
        if (i < 0) return t;
        const j = dir === "forward" ? i + 1 : i - 1;
        if (j < 0 || j >= t.clips.length) return t;
        const clips = [...t.clips];
        [clips[i], clips[j]] = [clips[j], clips[i]];
        return { ...t, clips };
      }),
    });
  }

  /** Verplaats een clip naar een specifieke track (op id), met behoud van start. */
  moveClipToTrackById(id: string, trackId: string) {
    const doc = this.state.doc;
    let moving: Clip | null = null;
    const stripped = doc.tracks.map((t) => {
      const found = t.clips.find((c) => c.id === id);
      if (found) moving = found;
      return { ...t, clips: t.clips.filter((c) => c.id !== id) };
    });
    if (!moving || !stripped.some((t) => t.id === trackId)) return;
    this.setDoc({
      ...doc,
      tracks: stripped.map((t) =>
        t.id === trackId ? { ...t, clips: [...t.clips, moving!] } : t
      ),
    });
  }

  /** Voeg een nieuwe overlay-laag toe (boven bestaande overlays). Geeft id terug. */
  addOverlayTrack(): string {
    const doc = this.state.doc;
    const id = crypto.randomUUID();
    const n = doc.tracks.filter((t) => t.kind === "overlay").length + 1;
    const track: Track = { id, kind: "overlay", name: `Overlay ${n}`, clips: [] };
    const overlayIdxs = doc.tracks
      .map((t, i) => (t.kind === "overlay" ? i : -1))
      .filter((i) => i >= 0);
    const videoIdx = doc.tracks.findIndex((t) => t.kind === "video");
    const insertIdx =
      overlayIdxs.length > 0
        ? overlayIdxs[overlayIdxs.length - 1] + 1
        : videoIdx >= 0
          ? videoIdx + 1
          : doc.tracks.length;
    this.setDoc({
      ...doc,
      tracks: [
        ...doc.tracks.slice(0, insertIdx),
        track,
        ...doc.tracks.slice(insertIdx),
      ],
    });
    return id;
  }

  /** Zet een clip op een verse eigen overlay-laag (en ruim lege lagen op). */
  clipToNewLayer(id: string) {
    const newId = this.addOverlayTrack();
    this.moveClipToTrackById(id, newId);
    this.pruneEmptyTracks();
  }

  /** Verwijder lege overlay-lagen (basistracks video/tekst/audio blijven staan). */
  pruneEmptyTracks() {
    const doc = this.state.doc;
    const tracks = doc.tracks.filter((t) => t.kind !== "overlay" || t.clips.length > 0);
    if (tracks.length !== doc.tracks.length) this.setDoc({ ...doc, tracks });
  }

  /** Dupliceer een clip net na het origineel op dezelfde track. */
  duplicateClip(id: string) {
    const doc = this.state.doc;
    for (const track of doc.tracks) {
      const clip = track.clips.find((c) => c.id === id);
      if (!clip) continue;
      const copy = {
        ...clip,
        id: crypto.randomUUID(),
        start: clip.start + clip.duration,
      } as Clip;
      this.setDoc({
        ...doc,
        tracks: doc.tracks.map((t) =>
          t.id === track.id
            ? { ...t, clips: t.clips.flatMap((c) => (c.id === id ? [c, copy] : [c])) }
            : t
        ),
      });
      this.select(copy.id);
      return;
    }
  }

  /** Voeg een clip toe aan de juiste track, achteraan om overlap te vermijden. */
  addClip(clip: Clip) {
    const kind = TRACK_FOR_KIND[clip.type];
    const doc = this.state.doc;
    let track = doc.tracks.find((t) => t.kind === kind);
    let tracks = doc.tracks;
    if (!track) {
      track = { id: crypto.randomUUID(), kind, name: kind, clips: [] };
      tracks = [...doc.tracks, track];
    }
    const end = track.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
    const placed = { ...clip, start: end };
    this.setDoc({
      ...doc,
      tracks: tracks.map((t) =>
        t.id === track!.id ? { ...t, clips: [...t.clips, placed] } : t
      ),
    });
    this.select(placed.id);
    // Spring naar de nieuwe clip zodat hij meteen in de preview zichtbaar is.
    this.seek(placed.start + 0.01);
  }

  removeClip(id: string) {
    const doc = this.state.doc;
    this.setDoc({
      ...doc,
      tracks: doc.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== id),
      })),
    });
    if (this.state.selectedClipId === id) this.select(null);
  }

  moveClip(id: string, newStart: number) {
    this.setDoc(this.mapClip(id, (c) => ({ ...c, start: Math.max(0, newStart) })));
  }

  /** Linker trim-handle: verschuift start + bronpositie, behoudt eindpunt. */
  trimStart(id: string, newStart: number) {
    this.setDoc(
      this.mapClip(id, (c) => {
        const clampedStart = Math.max(0, newStart);
        const delta = clampedStart - c.start;
        const newDuration = c.duration - delta;
        if (newDuration < MIN_CLIP) return c;
        const next = { ...c, start: clampedStart, duration: newDuration } as Clip;
        if ("trimIn" in c && (c.type === "video" || c.type === "audio")) {
          next.trimIn = Math.max(0, (c.trimIn ?? 0) + delta);
        }
        return next;
      })
    );
  }

  /** Rechter trim-handle: past lengte aan, met respect voor de bronlengte. */
  trimEnd(id: string, newDuration: number) {
    this.setDoc(
      this.mapClip(id, (c) => {
        let dur = Math.max(MIN_CLIP, newDuration);
        if (c.type === "video" && c.naturalDuration) {
          dur = Math.min(dur, c.naturalDuration - (c.trimIn ?? 0));
        }
        return { ...c, duration: dur } as Clip;
      })
    );
  }

  /** Knip de clip op absolute tijd t in twee. */
  splitClip(id: string, t: number) {
    const doc = this.state.doc;
    for (const track of doc.tracks) {
      const clip = track.clips.find((c) => c.id === id);
      if (!clip) continue;
      const local = t - clip.start;
      if (local <= MIN_CLIP || local >= clip.duration - MIN_CLIP) return;
      const first = { ...clip, duration: local } as Clip;
      const second = {
        ...clip,
        id: crypto.randomUUID(),
        start: clip.start + local,
        duration: clip.duration - local,
      } as Clip;
      if (second.type === "video" || second.type === "audio") {
        second.trimIn = (clip.type === "video" || clip.type === "audio" ? clip.trimIn ?? 0 : 0) + local;
      }
      this.setDoc({
        ...doc,
        tracks: doc.tracks.map((tr) =>
          tr.id === track.id
            ? {
                ...tr,
                clips: tr.clips.flatMap((c) => (c.id === id ? [first, second] : [c])),
              }
            : tr
        ),
      });
      this.select(second.id);
      return;
    }
  }

  // ── Opslaan (gedebounced) ──────────────────────────────────
  private schedulePersist() {
    if (!this.persist) return;
    this.state.saveState = "saving";
    this.notify();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      try {
        await this.persist!(this.state.doc);
        this.state.saveState = "saved";
      } catch {
        this.state.saveState = "error";
      }
      this.notify();
    }, 800);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.histTimer) clearTimeout(this.histTimer);
    this.listeners.clear();
  }
}

// ── React-hooks ──────────────────────────────────────────────
export function useEditor<T>(store: EditorStore, selector: (s: EditorState) => T): T {
  const getSnapshot = useCallback(() => selector(store.getState()), [store, selector]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
