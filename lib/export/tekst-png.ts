// Tekst in beeld zonder ffmpeg's drawtext. De ffmpeg-static-build op Vercel heeft geen
// drawtext (geen freetype): "No such filter: 'drawtext'" (UGC-proef 26-10-2026). Lokaal op
// de Mac zat hij er wél in, daarom werkten de montages hier en mislukten ze live. De
// Storytelling-export liep er nooit tegenaan: die tekent tekst als SVG met resvg en legt
// het plaatje over de video. Hetzelfde doen we nu voor alle montages.
//
// Elke tekstlaag is een doorzichtige PNG van precies het videoformaat; in ffmpeg gaat hij
// er met `overlay` overheen (eventueel met `enable` of een fade). Alleen op de server.

import { Resvg } from "@resvg/resvg-js";
import path from "node:path";

const MAP = path.join(process.cwd(), "lib/export");

export type Lettertype = "Poppins" | "Arvo" | "Inter";
const BESTAND: Record<Lettertype, string> = { Poppins: "Poppins-Bold.ttf", Arvo: "Arvo-Bold.ttf", Inter: "Inter-Bold.ttf" };

export interface TekstLaag {
  /** Eén regel, of meerdere regels onder elkaar (wordt niet zelf afgebroken). */
  regels: string[];
  breedte: number;
  hoogte: number;
  grootte: number;
  lettertype?: Lettertype;
  kleur?: string;
  /** Midden van het tekstblok, in pixels van boven. Standaard het midden van het beeld. */
  midden?: number;
  /** Afstand tussen de middens van twee regels; standaard 1,25 × de lettergrootte. */
  regelafstand?: number;
  /** Rand om de letters, zoals de ondertitels op TikTok. */
  rand?: { dikte: number; kleur: string };
  /** Een gekleurd vlak achter elke regel. */
  vlak?: string;
  /** Een zachte schaduw onder de letters. */
  schaduw?: boolean;
}

function xml(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Een kleur als "black@0.9" (ffmpeg-schrijfwijze) of "#rrggbb" naar SVG-kleur + doorzichtigheid. */
function kleurEn(k: string): { kleur: string; dekking: number } {
  const [kleur, a] = k.split("@");
  return { kleur, dekking: a ? Number(a) : 1 };
}

export function tekstSvg(l: TekstLaag): string {
  const familie = l.lettertype ?? "Poppins";
  const stap = l.regelafstand ?? Math.round(l.grootte * 1.25);
  const midden = l.midden ?? l.hoogte / 2;
  const eerste = midden - ((l.regels.length - 1) * stap) / 2;
  const tekst = kleurEn(l.kleur ?? "white");
  const delen: string[] = [];
  l.regels.forEach((regel, i) => {
    const y = Math.round(eerste + i * stap);
    if (l.vlak) {
      // Een schatting van de breedte volstaat: het vlak hoeft niet op de pixel te kloppen.
      const vlak = kleurEn(l.vlak);
      const b = Math.min(l.breedte, regel.length * l.grootte * 0.62 + l.grootte * 0.7);
      const h = l.grootte * 1.35;
      delen.push(`<rect x="${(l.breedte - b) / 2}" y="${y - h / 2}" width="${b}" height="${h}" rx="${l.grootte * 0.15}" fill="${vlak.kleur}" fill-opacity="${vlak.dekking}"/>`);
    }
    const rand = l.rand ? kleurEn(l.rand.kleur) : null;
    const randAttr = rand ? ` stroke="${rand.kleur}" stroke-opacity="${rand.dekking}" stroke-width="${l.rand!.dikte * 2}" stroke-linejoin="round" paint-order="stroke"` : "";
    const schaduw = l.schaduw ? ` filter="url(#s)"` : "";
    delen.push(
      `<text x="${l.breedte / 2}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="${familie}" font-size="${l.grootte}" fill="${tekst.kleur}" fill-opacity="${tekst.dekking}"${randAttr}${schaduw}>${xml(regel)}</text>`,
    );
  });
  const defs = l.schaduw ? `<defs><filter id="s" x="-10%" y="-30%" width="120%" height="160%"><feDropShadow dx="2" dy="2" stdDeviation="1.5" flood-color="black" flood-opacity="0.6"/></filter></defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${l.breedte}" height="${l.hoogte}" viewBox="0 0 ${l.breedte} ${l.hoogte}">${defs}${delen.join("")}</svg>`;
}

export function tekstPng(l: TekstLaag): Buffer {
  const familie = l.lettertype ?? "Poppins";
  return new Resvg(tekstSvg(l), {
    fitTo: { mode: "width", value: l.breedte },
    background: "rgba(0,0,0,0)",
    font: { fontFiles: [path.join(MAP, BESTAND[familie])], defaultFontFamily: familie, loadSystemFonts: false },
  })
    .render()
    .asPng();
}
