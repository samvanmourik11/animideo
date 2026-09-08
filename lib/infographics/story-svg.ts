import { logoBox } from "@/lib/infographics/story-layout";
import { storyCanvasSize } from "@/lib/infographics/canvas-size";

// Server-side variant van components/infographics/render/StoryScene.tsx: bouwt
// exact dezelfde overlay als SVG-string, zodat de MP4-export die met resvg kan
// rasteren ZONDER browser (betrouwbaar op Vercel). Houd dit in sync met
// StoryScene.
//
// Sinds de koppen en grote getallen eruit zijn, bestaat de overlay alleen nog uit
// het merklogo. Zonder logo is er niets te rasteren: dan geeft dit null terug en
// slaat de export de overlay-laag over.

export function buildSceneSvg(
  format: "16:9" | "9:16",
  logoDataUri?: string | null
): string | null {
  if (!logoDataUri) return null;
  const { width: W, height: H } = storyCanvasSize(format);
  const b = logoBox(format);
  const body = `<image x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" href="${logoDataUri}" preserveAspectRatio="xMaxYMin meet" />`;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
