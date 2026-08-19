"use client";

import { useCallback, useSyncExternalStore } from "react";
import { applyOp, type Op, type OpError, type OpResult } from "./core/ops";
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

/** Waar de store zijn bewerkingen naartoe meldt (de versiegeschiedenis). */
export interface StoreHooks {
  onOp?: (op: Op, summary: string, bron: "user" | "ai") => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export interface EditorState {
  doc: TimelineDoc;
  currentTime: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  pxPerSec: number; // timeline-zoom
  saveState: "idle" | "saving" | "saved" | "error";
  /** Laatste geweigerde bewerking, zodat de UI kan zeggen wát er niet kon. */
  lastOpError: OpError | null;
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
  // Waar bewerkingen naartoe gaan: de op-log in Supabase (en straks de
  // activiteitenfeed van de AI-chat). Ongezet = alleen lokaal bewerken.
  private hooks: StoreHooks;
  // Stand van vóór een sleepbeweging. Tijdens het slepen updaten we het
  // document direct (dat moet vloeiend zijn), maar bij loslaten zetten we die
  // stand terug en doen we de héle beweging als één op. Anders zou één sleep
  // tweehonderd regels in de geschiedenis opleveren.
  private sleep: { doc: TimelineDoc; clipId: string; trackId: string } | null = null;

  constructor(
    doc: TimelineDoc,
    persist?: (doc: TimelineDoc) => Promise<void>,
    hooks: StoreHooks = {}
  ) {
    this.state = {
      doc,
      currentTime: 0,
      isPlaying: false,
      selectedClipId: null,
      pxPerSec: 80,
      saveState: "idle",
      lastOpError: null,
    };
    this.persist = persist;
    this.hooks = hooks;
  }

  /** Begin van een sleep- of trimbeweging: onthoud waar we vandaan komen. */
  beginDrag(clipId: string) {
    const spoor = this.spoorVan(clipId);
    if (!spoor) return;
    this.sleep = { doc: this.state.doc, clipId, trackId: spoor.id };
  }

  /**
   * Einde van de beweging: één op die precies beschrijft wat er gebeurde.
   *
   * De op gaat over de stand van vóór het slepen, zodat EditorCore hem valideert
   * en het videospoor magnetisch blijft — het resultaat kan dus iets afwijken
   * van waar de muis losliet, en dat is de bedoeling.
   */
  commitDrag() {
    const sessie = this.sleep;
    this.sleep = null;
    if (!sessie) return;

    const voor = this.clipIn(sessie.doc, sessie.clipId);
    const na = this.find(sessie.clipId);
    const spoorNu = this.spoorVan(sessie.clipId);
    if (!voor || !na || !spoorNu) return;

    // Naar een andere laag gesleept: dat kent de commandolaag nog niet, dus
    // laten we staan zoals het is (het document klopt, alleen de geschiedenis
    // slaat deze stap over).
    if (spoorNu.id !== sessie.trackId) return;

    const dStart = na.start - voor.start;
    const dDuur = na.duration - voor.duration;
    const eps = 1e-3;
    if (Math.abs(dStart) < eps && Math.abs(dDuur) < eps) return; // klik zonder beweging

    const doelStart = na.start;
    this.state.doc = sessie.doc; // terug naar vóór het slepen

    if (Math.abs(dDuur) > eps && Math.abs(dStart + dDuur) < eps) {
      // Voorkant versleept: start en lengte bewegen tegengesteld.
      this.dispatch({ op: "trim_clip", clipId: sessie.clipId, edge: "in", deltaSeconds: dStart });
    } else if (Math.abs(dDuur) > eps) {
      this.dispatch({ op: "trim_clip", clipId: sessie.clipId, edge: "out", deltaSeconds: -dDuur });
    } else if (this.isHoofdspoor(sessie.trackId)) {
      // Op het videospoor bepaalt de volgorde de plek: waar is hij neergelegd?
      const anderen = sessie.doc.tracks
        .find((t) => t.id === sessie.trackId)!
        .clips.filter((c) => c.id !== sessie.clipId)
        .sort((a, b) => a.start - b.start);
      const doel = anderen.find((c) => doelStart < c.start + c.duration / 2);
      this.dispatch({ op: "reorder_clip", clipId: sessie.clipId, beforeClipId: doel?.id ?? null });
    } else {
      this.dispatch({ op: "move_clip", clipId: sessie.clipId, start: doelStart });
    }
  }

  private clipIn(doc: TimelineDoc, id: string): Clip | null {
    for (const t of doc.tracks) {
      const c = t.clips.find((x) => x.id === id);
      if (c) return c;
    }
    return null;
  }

  private spoorVan(clipId: string): Track | null {
    return this.state.doc.tracks.find((t) => t.clips.some((c) => c.id === clipId)) ?? null;
  }

  private isHoofdspoor(trackId: string): boolean {
    return this.state.doc.tracks.find((t) => t.kind === "video")?.id === trackId;
  }

  /**
   * Zet een eerdere versie terug (vanuit het versiepaneel). De huidige stand
   * gaat op de undo-stapel, zodat terugzetten zelf ook ongedaan te maken is.
   */
  herstelNaar(doc: TimelineDoc) {
    this.past.push(this.state.doc);
    this.future = [];
    this.pendingPast = null;
    this.state.doc = doc;
    if (!this.find(this.state.selectedClipId)) this.state.selectedClipId = null;
    this.notify();
    this.schedulePersist();
  }

  /**
   * Vul de undo-stapel met eerdere standen uit de opgeslagen geschiedenis.
   * Daarmee werkt ongedaan maken ook ná een refresh — voorheen begon je dan
   * met een lege stapel en was alles van vóór het herladen onbereikbaar.
   */
  hydrate(eerdereDocs: TimelineDoc[]) {
    if (eerdereDocs.length === 0) return;
    this.past = [...eerdereDocs];
    this.future = [];
    this.notify();
  }

  /**
   * De enige weg waarlangs het document hoort te veranderen.
   *
   * EditorCore valideert de op, houdt het videospoor magnetisch en weigert wat
   * de tijdlijn kapot zou maken. Lukt het niet, dan blijft het document staan
   * zoals het was en komt de melding in `lastOpError` — de UI (en straks de
   * AI-chat) kan die tonen.
   */
  dispatch(op: Op, bron: "user" | "ai" = "user"): OpResult {
    const res = applyOp(this.state.doc, op);
    if (res.ok) {
      this.state.lastOpError = null;
      this.setDoc(res.doc);
      this.hooks.onOp?.(op, res.summary, bron);
    } else {
      this.state.lastOpError = res.error;
      this.notify();
    }
    return res;
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
    this.hooks.onUndo?.();
    this.notify();
    this.schedulePersist();
  }
  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.state.doc);
    this.state.doc = next;
    if (!this.find(this.state.selectedClipId)) this.state.selectedClipId = null;
    this.hooks.onRedo?.();
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

  /**
   * Kopie op dezelfde plek in de tijd, iets verschoven in beeld.
   *
   * `duplicateClip` zet de kopie ná het origineel op de tijdlijn; dat klopt voor
   * een scène, maar niet voor een element dat je over die scène wilt herhalen —
   * dan verdwijnt de kopie uit beeld. Vandaar deze aparte variant.
   */
  dupliceerOpZelfdePlek(id: string) {
    const doc = this.state.doc;
    for (const track of doc.tracks) {
      const clip = track.clips.find((c) => c.id === id);
      if (!clip) continue;
      const t = { ...DEFAULT_TRANSFORM, ...clip.transform };
      const kopie = {
        ...clip,
        id: crypto.randomUUID(),
        transform: { ...t, x: Math.min(0.96, t.x + 0.03), y: Math.min(0.96, t.y + 0.03) },
      } as Clip;
      this.setDoc({
        ...doc,
        tracks: doc.tracks.map((tr) =>
          tr.id === track.id
            ? { ...tr, clips: tr.clips.flatMap((c) => (c.id === id ? [c, kopie] : [c])) }
            : tr
        ),
      });
      this.select(kopie.id);
      return kopie.id;
    }
    return null;
  }

  /**
   * Een gekopieerde clip terugzetten. Hij landt op de tijd waar de speelkop
   * staat, niet waar hij vandaan kwam — anders plak je iets buiten beeld en
   * denk je dat er niets gebeurt.
   */
  plakClip(bron: Clip, spoor?: TrackKind) {
    const doc = this.state.doc;
    // Het soort spoor komt van de plek waar je kopieerde, niet van het type
    // clip: een afbeelding kan een scène zijn (videospoor) óf een element dat
    // erover ligt (overlay). Op type alleen zou een gekopieerd icoon als nieuwe
    // scène achteraan belanden.
    const kind = spoor ?? TRACK_FOR_KIND[bron.type];
    let track = doc.tracks.find((t) => t.kind === kind);
    let tracks = doc.tracks;
    if (!track) {
      track = { id: crypto.randomUUID(), kind, name: kind, clips: [] };
      tracks = [...doc.tracks, track];
    }
    const t = { ...DEFAULT_TRANSFORM, ...bron.transform };
    const nieuw = {
      ...bron,
      id: crypto.randomUUID(),
      start: kind === "video" ? track.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0) : this.state.currentTime,
      transform: { ...t, x: Math.min(0.96, t.x + 0.03), y: Math.min(0.96, t.y + 0.03) },
    } as Clip;
    this.setDoc({
      ...doc,
      tracks: tracks.map((tr) => (tr.id === track!.id ? { ...tr, clips: [...tr.clips, nieuw] } : tr)),
    });
    this.select(nieuw.id);
    return nieuw.id;
  }

  /** Laagvolgorde binnen het spoor; 'vooraan'/'achteraan' gaan in één keer door. */
  zetLaag(id: string, waar: "voor" | "achter" | "vooraan" | "achteraan") {
    const doc = this.state.doc;
    this.setDoc({
      ...doc,
      tracks: doc.tracks.map((t) => {
        const i = t.clips.findIndex((c) => c.id === id);
        if (i < 0) return t;
        const clips = [...t.clips];
        const [clip] = clips.splice(i, 1);
        const j =
          waar === "voor" ? Math.min(clips.length, i + 1)
          : waar === "achter" ? Math.max(0, i - 1)
          : waar === "vooraan" ? clips.length
          : 0;
        clips.splice(j, 0, clip);
        return { ...t, clips };
      }),
    });
  }

  /**
   * Uitlijnen op het beeld. De halve breedte/hoogte komt van de compositor,
   * want die weet pas hoe groot het element in beeld staat — met alleen de
   * transform zou 'tegen de linkerrand' een gok zijn.
   */
  lijnUit(
    id: string,
    richting: "links" | "midden" | "rechts" | "boven" | "centraal" | "onder",
    maat: { halfW: number; halfH: number } | null
  ) {
    const hw = maat?.halfW ?? 0;
    const hh = maat?.halfH ?? 0;
    const patch =
      richting === "links" ? { x: hw }
      : richting === "midden" ? { x: 0.5 }
      : richting === "rechts" ? { x: 1 - hw }
      : richting === "boven" ? { y: hh }
      : richting === "centraal" ? { y: 0.5 }
      : { y: 1 - hh };
    this.setTransform(id, patch);
  }

  /** Op welk soort spoor staat deze clip nu? Nodig om er weer op te plakken. */
  spoorKindVan(id: string): TrackKind | null {
    for (const t of this.state.doc.tracks) if (t.clips.some((c) => c.id === id)) return t.kind;
    return null;
  }

  /** Vergrendelen: aanklikken mag, verslepen niet. */
  zetVergrendeld(id: string, aan: boolean) {
    this.updateClip(id, { locked: aan } as Partial<Clip>);
  }

  removeClip(id: string) {
    // Let op: op het videospoor schuift de rest nu automatisch door. Een gat in
    // de video is zwart beeld, en dat mag een niet-editor nooit overkomen.
    const res = this.dispatch({ op: "delete_clip", clipId: id });
    if (res.ok && this.state.selectedClipId === id) this.select(null);
  }

  moveClip(id: string, newStart: number) {
    const doc = this.state.doc;
    // Contentgrens: het verste eindpunt van alle ANDERE clips (in de praktijk de
    // doorlopende voice-over). Een clip mag niet voorbij die lengte gesleept
    // worden — geen oneindig slepen in lege ruimte.
    let bound = 0;
    let dur = 0;
    for (const tr of doc.tracks) {
      for (const c of tr.clips) {
        if (c.id === id) dur = c.duration;
        else bound = Math.max(bound, c.start + c.duration);
      }
    }
    const maxStart = Math.max(0, bound - dur);
    const clamped = Math.max(0, Math.min(newStart, maxStart));
    this.setDoc(this.mapClip(id, (c) => ({ ...c, start: clamped })));
  }

  /**
   * Zet of verwijdert een overgang op de grens tussen twee clips: uitfade op de
   * linker, infade op de rechter. De compositor rendert dat als opacity-fade, en
   * omdat de export diezelfde compositor opneemt komt het identiek in de MP4.
   *
   * Twee ops, want elke op raakt één clip — zo is ook elke helft los terug te
   * draaien in de geschiedenis.
   */
  setBoundaryTransition(leftId: string, rightId: string, on: boolean) {
    const kind = on ? ("fade" as const) : null;
    const links = this.dispatch({ op: "set_transition", clipId: leftId, edge: "out", kind, duration: 0.5 });
    if (links.ok) this.dispatch({ op: "set_transition", clipId: rightId, edge: "in", kind, duration: 0.5 });
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

  /** Knip de clip op absolute tijd t in twee; de tweede helft wordt geselecteerd. */
  splitClip(id: string, t: number) {
    const nieuweId = crypto.randomUUID();
    const res = this.dispatch({ op: "split_clip", clipId: id, at: t, newClipId: nieuweId });
    if (res.ok) this.select(nieuweId);
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
