// ── Timeline Document ────────────────────────────────────────────────────────
//
// Dit is het hart van de nieuwe editor: één JSON-document dat de volledige
// compositie beschrijft. Twee dingen lezen exact dit document:
//   1. de live preview-compositor in de browser (real-time)
//   2. de server-render (frame-server + FFmpeg) voor de uiteindelijke MP4
//
// Daardoor geldt: wat je in de preview ziet, is wat je exporteert.
//
// Alle posities/tijden zijn in SECONDEN. Transform-coördinaten zijn fracties
// van de compositie (0..1), zodat een document resolutie-onafhankelijk is en
// preview (bv. 960px breed) en render (bv. 1920px breed) identiek uitpakken.
//
// LET OP: dit schema is versioned. Bestaande documenten worden via
// migrateTimeline() opgehoogd. Breek dit contract nooit zonder de versie te
// verhogen en een migratie toe te voegen.

export const TIMELINE_VERSION = 1;

export type Ratio = "16:9" | "9:16" | "1:1";

/** Resolutie en fps per beeldverhouding. Render gebruikt deze als bron van waarheid. */
export const RATIO_PRESETS: Record<Ratio, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

// ── Compositie ───────────────────────────────────────────────────────────────

export interface TimelineDoc {
  version: number;
  ratio: Ratio;
  width: number; // compositie-resolutie in px (render-doel)
  height: number;
  fps: number;
  background: string; // hex, achter alle lagen
  tracks: Track[];
}

export type TrackKind = "video" | "overlay" | "text" | "audio";

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted?: boolean; // alleen audio/video
  hidden?: boolean; // visuele tracks tijdelijk verbergen
  locked?: boolean; // tegen bewerken beschermen
  clips: Clip[];
}

// ── Clips ────────────────────────────────────────────────────────────────────

interface ClipBase {
  id: string;
  start: number; // positie op de timeline (s)
  duration: number; // lengte op de timeline (s)
  trimIn?: number; // seconden in de bron waar afspelen begint (video/audio)
  transform?: Transform;
  opacity?: number; // 0..1
  fadeIn?: number; // s, in-faden vanaf clipbegin
  fadeOut?: number; // s, uit-faden voor clipeinde
  keyframes?: Keyframe[];
  effects?: Effect[];
  transitionIn?: Transition;
  transitionOut?: Transition;
}

export interface VideoClip extends ClipBase {
  type: "video";
  src: string;
  naturalDuration?: number; // werkelijke lengte van de bron (s), voor trim-limieten
  volume?: number; // 0..1
  speed?: number; // 1 = normaal
}

export interface ImageClip extends ClipBase {
  type: "image";
  src: string;
}

export interface TextClip extends ClipBase {
  type: "text";
  text: string;
  style: TextStyle;
  preset?: AnimationPreset; // geanimeerde caption-stijl
}

export interface AudioClip extends ClipBase {
  type: "audio";
  src: string;
  volume?: number; // 0..1
  speed?: number;
}

export type Clip = VideoClip | ImageClip | TextClip | AudioClip;

// ── Transform, keyframes, effecten ─────────────────────────────────────────────

/** Coördinaten zijn fracties van de compositie. x=0.5,y=0.5 = gecentreerd. */
export interface Transform {
  x: number; // 0..1, midden van het element
  y: number; // 0..1
  scale: number; // 1 = passend ingevuld
  rotation: number; // graden
  crop?: { top: number; right: number; bottom: number; left: number }; // fracties
}

export const DEFAULT_TRANSFORM: Transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };

export type KeyframeProperty = "x" | "y" | "scale" | "rotation" | "opacity";
export type Easing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export interface Keyframe {
  property: KeyframeProperty;
  time: number; // s, relatief aan het begin van de clip
  value: number;
  easing?: Easing;
}

export type EffectKind =
  | "blur"
  | "brightness"
  | "contrast"
  | "saturation"
  | "grayscale";

export interface Effect {
  kind: EffectKind;
  amount: number; // betekenis hangt af van kind; zie NEUTRAL_EFFECT
}

/** Waarde waarbij een effect geen zichtbaar verschil maakt (slider-nulpunt). */
export const NEUTRAL_EFFECT: Record<EffectKind, number> = {
  blur: 0,
  brightness: 1,
  contrast: 0,
  saturation: 0,
  grayscale: 0,
};

export type TransitionKind =
  | "fade"
  | "dissolve"
  | "slide-left"
  | "slide-right"
  | "zoom-in";

export interface Transition {
  kind: TransitionKind;
  duration: number; // s
}

// ── Tekst ──────────────────────────────────────────────────────────────────────

export interface TextStyle {
  fontFamily: string;
  fontSize: number; // px op compositie-schaal
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  background?: string; // achtergrondbalk
  stroke?: { color: string; width: number };
  shadow?: { color: string; blur: number; x: number; y: number };
}

export type AnimationPreset =
  | "none"
  | "fade-in"
  | "pop"
  | "slide-up"
  | "typewriter"
  | "word-by-word";

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: "sans-serif",
  fontSize: 80, // px op compositie-schaal (1920 breed)
  fontWeight: 700,
  color: "#ffffff",
  align: "center",
  stroke: { color: "#000000", width: 6 },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return crypto.randomUUID();
}

/** Maak een leeg document voor een gegeven beeldverhouding. */
export function createEmptyTimeline(ratio: Ratio = "16:9"): TimelineDoc {
  const { width, height } = RATIO_PRESETS[ratio];
  return {
    version: TIMELINE_VERSION,
    ratio,
    width,
    height,
    fps: 30,
    background: "#000000",
    tracks: [
      { id: uid(), kind: "video", name: "Video", clips: [] },
      { id: uid(), kind: "overlay", name: "Overlay", clips: [] },
      { id: uid(), kind: "text", name: "Tekst", clips: [] },
      { id: uid(), kind: "audio", name: "Audio", clips: [] },
    ],
  };
}

/** Totale lengte van de compositie (s): het verste eindpunt over alle clips. */
export function computeDuration(doc: TimelineDoc): number {
  let end = 0;
  for (const track of doc.tracks) {
    for (const clip of track.clips) {
      end = Math.max(end, clip.start + clip.duration);
    }
  }
  return end;
}

/**
 * Lichte runtime-validatie. Geeft een lijst problemen terug (leeg = geldig).
 * Bewust dependency-vrij gehouden. Zwaardere validatie kan later via zod.
 */
export function validateTimeline(doc: unknown): string[] {
  const errors: string[] = [];
  if (typeof doc !== "object" || doc === null) {
    return ["Document is geen object"];
  }
  const d = doc as Partial<TimelineDoc>;
  if (typeof d.version !== "number") errors.push("version ontbreekt");
  if (typeof d.width !== "number" || typeof d.height !== "number")
    errors.push("width/height ontbreekt");
  if (typeof d.fps !== "number" || d.fps <= 0) errors.push("fps ongeldig");
  if (!Array.isArray(d.tracks)) {
    errors.push("tracks ontbreekt");
    return errors;
  }
  d.tracks.forEach((track, ti) => {
    if (!Array.isArray(track.clips)) {
      errors.push(`track ${ti}: clips ontbreekt`);
      return;
    }
    track.clips.forEach((clip, ci) => {
      if (typeof clip.start !== "number" || clip.start < 0)
        errors.push(`track ${ti} clip ${ci}: start ongeldig`);
      if (typeof clip.duration !== "number" || clip.duration <= 0)
        errors.push(`track ${ti} clip ${ci}: duration ongeldig`);
    });
  });
  return errors;
}

/**
 * Hoog een ouder document op naar de huidige versie. Nu nog een no-op behalve
 * het zetten van defaults, maar dit is de centrale plek voor toekomstige
 * schema-migraties zodat bestaande projecten nooit breken.
 */
// ── Keyframe-interpolatie ────────────────────────────────────────────────────

export function easeT(f: number, easing?: Easing): number {
  switch (easing) {
    case "ease-in":
      return f * f;
    case "ease-out":
      return 1 - (1 - f) * (1 - f);
    case "ease-in-out":
      return f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
    default:
      return f; // linear
  }
}

/** Statische (niet-geanimeerde) waarde van een eigenschap. */
export function staticValue(clip: Clip, property: KeyframeProperty): number {
  if (property === "opacity") return clip.opacity ?? 1;
  const tf = { ...DEFAULT_TRANSFORM, ...clip.transform };
  return tf[property];
}

/**
 * Waarde van een eigenschap op lokale clip-tijd, geïnterpoleerd over keyframes.
 * Zonder keyframes voor die eigenschap geeft het de fallback (statische waarde).
 */
export function keyframeValueAt(
  clip: Clip,
  property: KeyframeProperty,
  localTime: number,
  fallback: number
): number {
  const kfs = (clip.keyframes ?? [])
    .filter((k) => k.property === property)
    .sort((a, b) => a.time - b.time);
  if (kfs.length === 0) return fallback;
  if (localTime <= kfs[0].time) return kfs[0].value;
  const last = kfs[kfs.length - 1];
  if (localTime >= last.time) return last.value;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (localTime >= a.time && localTime <= b.time) {
      const f = b.time === a.time ? 1 : (localTime - a.time) / (b.time - a.time);
      return a.value + (b.value - a.value) * easeT(f, b.easing);
    }
  }
  return fallback;
}

export function migrateTimeline(doc: TimelineDoc): TimelineDoc {
  if (!doc || typeof doc !== "object") return createEmptyTimeline();
  const merged = {
    ...createEmptyTimeline(doc.ratio ?? "16:9"),
    ...doc,
    version: TIMELINE_VERSION,
  };
  // Fase 2: zorg dat bestaande projecten een overlay-track hebben (boven video,
  // onder tekst) zodat picture-in-picture en lagen werken.
  if (Array.isArray(merged.tracks) && !merged.tracks.some((t) => t.kind === "overlay")) {
    const vi = merged.tracks.findIndex((t) => t.kind === "video");
    const overlay: Track = {
      id: uid(),
      kind: "overlay",
      name: "Overlay",
      clips: [],
    };
    const idx = vi >= 0 ? vi + 1 : 0;
    merged.tracks = [
      ...merged.tracks.slice(0, idx),
      overlay,
      ...merged.tracks.slice(idx),
    ];
  }
  return merged;
}
