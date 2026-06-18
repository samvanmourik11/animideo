import type { InfographicFormat } from "@/lib/types";

// Eén bron van waarheid voor de canvasafmetingen, gedeeld door de renderer
// (preview) en de server-side PNG-export, zodat ze pixel-identiek zijn.
export interface CanvasSize {
  width: number;
  height: number;
}

export const CANVAS_SIZES: Record<InfographicFormat, CanvasSize> = {
  "9:16": { width: 1080, height: 1350 }, // staand, social
  "16:9": { width: 1920, height: 1080 }, // liggend, presentatie
};

export function canvasSize(format: InfographicFormat): CanvasSize {
  return CANVAS_SIZES[format] ?? CANVAS_SIZES["9:16"];
}

// De storytelling-infographic gebruikt volledige illustraties die op ECHTE 9:16
// worden gegenereerd (1080×1920, Reels/Shorts), niet het 4:5 feed-formaat van de
// oude infographic-tool. Daarom een eigen maat, zodat de illustratie het frame
// precies vult en niet uitvergroot/bijgesneden wordt.
export const STORY_CANVAS_SIZES: Record<InfographicFormat, CanvasSize> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
};

export function storyCanvasSize(format: InfographicFormat): CanvasSize {
  return STORY_CANVAS_SIZES[format] ?? STORY_CANVAS_SIZES["9:16"];
}

// CSS aspect-ratio string die exact bij storyCanvasSize hoort, gedeeld door
// player, editor en preview zodat alles dezelfde verhoudingen toont.
export function storyAspectRatio(format: InfographicFormat): string {
  return format === "16:9" ? "16 / 9" : "9 / 16";
}
