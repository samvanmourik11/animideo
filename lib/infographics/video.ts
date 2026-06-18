import type { InfographicBlock, InfographicSpec } from "@/lib/types";

// Bouwt een infographic-VIDEO uit een spec: een titel-intro, één scene per blok,
// en een outro met logo. Puur (geen DOM): zowel de browser-preview als de
// server-side frame-voor-frame export gebruiken dezelfde timing, zodat ze
// identiek zijn. Scenes overlappen kort voor een crossfade.

export const FPS = 30;
const OVERLAP = 0.45; // crossfade-duur (seconden)
const ENTER = 0.9;    // tijd waarin de inhoud van een scene inanimeert
const ENTER_DELAY = 0.12;

export type VideoScene =
  | { kind: "intro"; duration: number }
  | { kind: "block"; blockIndex: number; duration: number }
  | { kind: "outro"; duration: number };

function blockDuration(b: InfographicBlock): number {
  switch (b.type) {
    case "stat": return 3;
    case "barChart": return 3.6;
    case "pieChart": return 3.6;
    case "lineChart": return 3.6;
    case "process": return Math.min(6.5, 2.4 + b.steps.length * 0.7);
    case "comparison": return Math.min(6, 2.6 + b.rows.length * 0.55);
    case "list": return Math.min(6, 2.4 + b.items.length * 0.7);
    default: return 3.2;
  }
}

export function buildScenes(spec: InfographicSpec): VideoScene[] {
  const scenes: VideoScene[] = [{ kind: "intro", duration: 2.8 }];
  spec.blocks.forEach((b, i) => scenes.push({ kind: "block", blockIndex: i, duration: blockDuration(b) }));
  scenes.push({ kind: "outro", duration: 2.8 });
  return scenes;
}

export interface SceneWindow {
  scene: VideoScene;
  index: number;
  start: number;
  duration: number;
}

export function sceneWindows(scenes: VideoScene[]): { windows: SceneWindow[]; total: number } {
  let cursor = 0;
  const windows = scenes.map((scene, index) => {
    const w: SceneWindow = { scene, index, start: cursor, duration: scene.duration };
    cursor += scene.duration - OVERLAP;
    return w;
  });
  const last = windows[windows.length - 1];
  const total = last ? last.start + last.duration : 0;
  return { windows, total };
}

export function totalDuration(spec: InfographicSpec): number {
  return sceneWindows(buildScenes(spec)).total;
}

export interface ActiveScene {
  index: number;
  scene: VideoScene;
  opacity: number;
  progress: number;
}

/** Welke scene(s) zichtbaar zijn op een bepaald frame, met opacity (crossfade) en progress. */
export function frameState(spec: InfographicSpec, frame: number, totalFrames: number): ActiveScene[] {
  const { windows, total } = sceneWindows(buildScenes(spec));
  const t = totalFrames > 0 ? (frame / totalFrames) * total : 0;
  const active: ActiveScene[] = [];
  for (const w of windows) {
    const localT = t - w.start;
    if (localT < -0.0001 || localT >= w.duration) continue;
    let opacity = Math.min(1, localT / OVERLAP); // fade in (ook de intro, vanaf de achtergrond)
    if (w.index < windows.length - 1) {
      opacity = Math.min(opacity, Math.min(1, (w.duration - localT) / OVERLAP)); // fade out, behalve de laatste
    }
    const progress = Math.max(0, Math.min(1, (localT - ENTER_DELAY) / ENTER));
    active.push({ index: w.index, scene: w.scene, opacity: Math.max(0, Math.min(1, opacity)), progress });
  }
  return active;
}
