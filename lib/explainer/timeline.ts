import type { ExplainerSpec } from "./spec";

// Tijdlijn-helpers voor de video-render. Scenes overlappen XFADE_SEC zodat de
// browser de crossfade per frame rendert (outgoing fade-out + incoming fade-in).

export const FPS = 30;
export const ANIM_SEC = 1.2; // animatie speelt in de eerste ~1.2s, daarna hold
export const XFADE_SEC = 0.5;

/** Starttijd (s) van elke scene op de tijdlijn: start_k = sum_{i<k}(d_i - T). */
export function sceneStarts(spec: ExplainerSpec): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const s of spec.scenes) {
    starts.push(acc);
    acc += s.durationSec - XFADE_SEC;
  }
  return starts;
}

export function totalDuration(spec: ExplainerSpec): number {
  const starts = sceneStarts(spec);
  const n = spec.scenes.length;
  if (n === 0) return 0;
  return starts[n - 1] + spec.scenes[n - 1].durationSec;
}

export interface ActiveScene {
  index: number;
  progress: number;
  opacity: number;
}

/** Welke scene(s) zijn op tijd t zichtbaar, met hun animatie-progress en opacity. */
export function activeScenes(spec: ExplainerSpec, t: number): ActiveScene[] {
  const starts = sceneStarts(spec);
  const n = spec.scenes.length;
  const out: ActiveScene[] = [];
  for (let k = 0; k < n; k++) {
    const d = spec.scenes[k].durationSec;
    const s0 = starts[k];
    const s1 = s0 + d;
    if (t < s0 || t > s1) continue;
    let op = 1;
    if (k > 0 && t < s0 + XFADE_SEC) op = (t - s0) / XFADE_SEC; // fade-in
    if (k < n - 1 && t > s1 - XFADE_SEC) op = Math.min(op, (s1 - t) / XFADE_SEC); // fade-out
    op = Math.max(0, Math.min(1, op));
    if (op <= 0) continue;
    out.push({ index: k, progress: Math.max(0, Math.min(1, (t - s0) / ANIM_SEC)), opacity: op });
  }
  return out;
}
