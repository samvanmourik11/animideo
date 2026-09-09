import { computeStoryLayout, logoBox } from "@/lib/infographics/story-layout";
import { resolveStoryFont } from "@/lib/infographics/story-fonts";
import type { StoryScene } from "@/lib/infographics/story-schema";

// Server-side variant van components/infographics/render/StoryScene.tsx: bouwt
// exact dezelfde overlay als SVG-string, zodat de MP4-export die met resvg kan
// rasteren ZONDER browser (betrouwbaar op Vercel). Houd dit in sync met
// StoryScene; beide gebruiken computeStoryLayout, dus de posities zijn identiek.
//
// `tekst` is dezelfde keuze als in de preview (zie tekstInBeeldAan). Staat hij
// uit, dan blijft alleen het logo over — en zonder logo valt er niets te
// rasteren, dus geeft deze functie dan null terug en slaat de export de laag over.

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
  accent = "#e8643c",
  opts?: { fontFamily?: string | null; logoDataUri?: string | null; tekst?: boolean }
): string | null {
  const toonTekst = opts?.tekst === true;
  if (!toonTekst && !opts?.logoDataUri) return null;
  const L = computeStoryLayout(scene, format);
  const font = resolveStoryFont(opts?.fontFamily);
  let body = "";
  // De lichte gloed onder de letters, gelijk aan die in de preview: zonder deze
  // verdwijnt een donkere kop in een druk beeld.
  const gloed =
    `<filter id="gloed" x="-20%" y="-40%" width="140%" height="200%">` +
    `<feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#ffffff" flood-opacity="0.85"/>` +
    `<feDropShadow dx="0" dy="0" stdDeviation="14" flood-color="#ffffff" flood-opacity="0.6"/>` +
    `</filter>`;

  // Kop met accentwoord (zelfde regel-/woordlogica als StoryScene).
  for (let li = 0; toonTekst && li < L.lines.length; li++) {
    const y = L.hy + L.hSize + li * L.lineH;
    const words = L.lines[li].split(" ");
    const tspans = words
      .map((w, wi) => {
        const isEmph = L.emph && w.toLowerCase().replace(/[.,:;!?]/g, "") === L.emph;
        const txt = esc(w) + (wi < words.length - 1 ? " " : "");
        return `<tspan fill="${isEmph ? accent : navy}">${txt}</tspan>`;
      })
      .join("");
    body += `<text x="${L.hx}" y="${y}" font-family="${font}" font-size="${L.hSize}" font-weight="800" fill="${navy}" xml:space="preserve">${tspans}</text>`;
  }

  // Groot getal + label.
  if (toonTekst && L.num) {
    body += `<text x="${L.nx}" y="${L.ny + L.nSize}" font-family="${font}" font-size="${L.nSize}" font-weight="800" fill="${accent}">${esc(L.num)}</text>`;
    if (scene.numberLabel) {
      body += `<text x="${L.nx}" y="${L.ny + L.nSize + 44}" font-family="${font}" font-size="36" font-weight="600" fill="${navy}">${esc(scene.numberLabel)}</text>`;
    }
  }

  const tekstBlok = body ? `${gloed}<g filter="url(#gloed)">${body}</g>` : "";
  body = tekstBlok;

  // Merklogo rechtsboven (optioneel; als data-URI meegegeven).
  if (opts?.logoDataUri) {
    const b = logoBox(format);
    body += `<image x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" href="${opts.logoDataUri}" preserveAspectRatio="xMaxYMin meet" />`;
  }

  return `<svg viewBox="0 0 ${L.W} ${L.H}" width="${L.W}" height="${L.H}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
