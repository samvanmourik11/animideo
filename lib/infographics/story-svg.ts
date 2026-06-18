import { computeStoryLayout } from "@/lib/infographics/story-layout";
import type { StoryScene } from "@/lib/infographics/story-schema";

// Server-side variant van components/infographics/render/StoryScene.tsx: bouwt
// exact dezelfde tekst-overlay als SVG-string, zodat de MP4-export die met resvg
// kan rasteren ZONDER browser (betrouwbaar op Vercel). Houd dit in sync met
// StoryScene; beide gebruiken computeStoryLayout, dus de posities zijn identiek.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Eén scene-overlay als compleet SVG-document (transparante achtergrond). De
// export rendert dit per scene op de exacte canvasmaat. enter=1 (geen
// inanimatie): de timing/fade zit in de ffmpeg-laag.
export function buildSceneSvg(
  scene: StoryScene,
  format: "16:9" | "9:16",
  navy = "#16243f",
  accent = "#e8643c"
): string {
  const L = computeStoryLayout(scene, format);
  let body = "";

  // Kop met accentwoord (zelfde regel-/woordlogica als StoryScene).
  for (let li = 0; li < L.lines.length; li++) {
    const y = L.hy + L.hSize + li * L.lineH;
    const words = L.lines[li].split(" ");
    const tspans = words
      .map((w, wi) => {
        const isEmph = L.emph && w.toLowerCase().replace(/[.,:;!?]/g, "") === L.emph;
        const txt = esc(w) + (wi < words.length - 1 ? " " : "");
        return `<tspan fill="${isEmph ? accent : navy}">${txt}</tspan>`;
      })
      .join("");
    body += `<text x="${L.hx}" y="${y}" font-family="Inter" font-size="${L.hSize}" font-weight="800" fill="${navy}" xml:space="preserve">${tspans}</text>`;
  }

  // Groot getal + label.
  if (L.num) {
    body += `<text x="${L.nx}" y="${L.ny + L.nSize}" font-family="Inter" font-size="${L.nSize}" font-weight="800" fill="${accent}">${esc(L.num)}</text>`;
    if (scene.numberLabel) {
      body += `<text x="${L.nx}" y="${L.ny + L.nSize + 44}" font-family="Inter" font-size="36" font-weight="600" fill="${navy}">${esc(scene.numberLabel)}</text>`;
    }
  }

  return `<svg viewBox="0 0 ${L.W} ${L.H}" width="${L.W}" height="${L.H}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
