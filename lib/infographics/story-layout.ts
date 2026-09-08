import { storyCanvasSize } from "@/lib/infographics/canvas-size";
import type { StoryScene } from "@/lib/infographics/story-schema";

// Gedeelde reken-helpers voor de storytelling-infographic: de positie van het
// merklogo, de tijdlijn (scene-duur, crossfades, Ken Burns) en de verdeling van
// één doorlopende voice-over over de scenes. De editor, de player en de
// MP4-export gebruiken alle drie deze functies, zodat preview en export gelijk
// lopen.
//
// De tekst-overlay (kop, accentwoord, groot getal) is vervallen: de beelden zijn
// nu volledig ingetekend en die typografie viel er sowieso in weg. Daarmee is ook
// de layout-berekening ervoor verdwenen — er ligt nog maar één element over het
// beeld, en dat is het logo.

// Positie/grootte van het merklogo (rechtsboven), gedeeld door preview, editor en
// export. Met preserveAspectRatio="xMaxYMin meet" past het logo binnen deze box
// zonder vervorming, uitgelijnd op de rechterbovenhoek.
export function logoBox(format: "16:9" | "9:16"): { x: number; y: number; w: number; h: number } {
  const { width: W } = storyCanvasSize(format);
  const pad = format === "9:16" ? 50 : 70;
  const h = format === "9:16" ? 96 : 84;
  const w = format === "9:16" ? 300 : 340;
  return { x: W - pad - w, y: pad, w, h };
}

// Crossfade-duur tussen scenes en de framerate voor de MP4-export.
export const STORY_CROSS = 0.5;
export const STORY_FPS = 24;

// Duur per scene: bij een (per scene toegewezen) voice-over-aandeel volgt de
// scene die lengte; anders een schatting op spreektempo (~2,6 woorden/sec).
export function sceneDuration(scene: StoryScene): number {
  if (scene.voiceDuration && scene.voiceDuration > 0) return scene.voiceDuration;
  const words = (scene.voiceover || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2.6, Math.min(13, words / 2.6));
}

// Cumulatieve tijdlijn (geen overlap-aftrek), zodat één doorlopende voice-over
// exact over de scenes valt. De crossfade is puur visueel (zie storyLayers).
export interface StoryWindow { index: number; start: number; duration: number; }
export function storyWindows(scenes: StoryScene[]): { windows: StoryWindow[]; total: number } {
  let cursor = 0;
  const windows = scenes.map((s, index) => {
    const duration = sceneDuration(s);
    const w = { index, start: cursor, duration };
    cursor += duration;
    return w;
  });
  return { windows, total: cursor };
}

// Verdeelt een totale audioduur over de scenes naar rato van het aantal woorden
// in de voice-over. Geeft de duur per scene terug (sommeert tot ~total).
export function splitVoiceDurations(scenes: StoryScene[], total: number): number[] {
  const words = scenes.map((s) => Math.max(1, (s.voiceover || "").trim().split(/\s+/).filter(Boolean).length));
  const sum = words.reduce((a, b) => a + b, 0) || 1;
  return words.map((w) => Math.max(1.8, (total * w) / sum));
}

// Subtiele camerabeweging (Ken Burns) per scene, afhankelijk van de index en de
// voortgang p (0..1). Houdt scale > 1 zodat object-cover geen randen toont.
export function kenBurns(index: number, p: number): { scale: number; tx: number; ty: number } {
  const dir = index % 2 === 0 ? 1 : -1;
  return {
    scale: 1.08 + 0.06 * p,
    tx: dir * 2 * p,
    ty: (index % 3 === 0 ? -1.5 : 1) * p,
  };
}

// Welke scene-lagen op tijd t zichtbaar zijn, met opacity (crossfade), de
// inanimatie-voortgang (enter) en de bewegings-voortgang p. Max 2 lagen.
export interface StoryLayer { index: number; opacity: number; enter: number; p: number; }
export function storyLayers(scenes: StoryScene[], t: number): { layers: StoryLayer[]; total: number } {
  const { windows, total } = storyWindows(scenes);
  if (windows.length === 0) return { layers: [], total: 0 };
  const tc = Math.max(0, Math.min(total - 0.0001, t));
  let active = 0;
  for (let i = 0; i < windows.length; i++) if (tc >= windows[i].start) active = i;
  const w = windows[active];
  const localT = tc - w.start;
  const fadeIn = w.start > 0 ? Math.min(1, localT / STORY_CROSS) : 1;
  const layers: StoryLayer[] = [];
  if (fadeIn < 1 && active > 0) {
    layers.push({ index: active - 1, opacity: 1, enter: 1, p: 1 });
  }
  layers.push({
    index: active,
    opacity: fadeIn,
    enter: Math.max(0, Math.min(1, (localT - 0.1) / 0.6)),
    p: Math.max(0, Math.min(1, localT / w.duration)),
  });
  return { layers, total };
}
