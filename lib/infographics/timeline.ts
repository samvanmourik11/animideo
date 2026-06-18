import type { InfographicSpec } from "@/lib/types";

// Per-block animatie-timing voor fase 2 (animatie naar MP4). In de statische MVP
// is dit inert: de renderer rendert het frame op progress = 1 (volledig getekend).
// De block-componenten lezen `progress` (0→1) zodat de statische render lett
// erlijk het eindframe van de toekomstige animatie is — geen herbouw nodig.

export interface BlockTiming {
  enterAt: number;      // seconden vanaf start
  enterDuration: number; // seconden om volledig te verschijnen
}

export const TOTAL_DURATION_SEC = 6;
const HEADER_HOLD = 0.4;
const STAGGER = 0.5;
const ENTER = 0.8;

/** Stagger-timing per block (block i verschijnt na de vorige). */
export function blockTimings(spec: InfographicSpec): BlockTiming[] {
  return spec.blocks.map((_, i) => ({
    enterAt: HEADER_HOLD + i * STAGGER,
    enterDuration: ENTER,
  }));
}

/** Easing — zachte ease-out cubic. */
export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

/**
 * Voortgang (0→1) van een block op een bepaald frame. Geeft 1 terug wanneer er
 * geen frame/totalFrames is meegegeven (statische render).
 */
export function blockProgress(
  timing: BlockTiming,
  frame: number | undefined,
  totalFrames: number | undefined
): number {
  if (frame === undefined || !totalFrames) return 1;
  const t = (frame / totalFrames) * TOTAL_DURATION_SEC;
  return easeOut((t - timing.enterAt) / timing.enterDuration);
}
