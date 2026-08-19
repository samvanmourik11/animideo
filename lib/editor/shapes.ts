// ── Vormen om iets aan te wijzen ─────────────────────────────────────────────
//
// Een cirkel om de prijs, een pijl naar het bordje, een kader om een detail.
// Dit is het aanwijsgereedschap van een vormgever, en het hoort wiskunde te
// zijn: een getekende cirkel is altijd een perfecte cirkel, op elke resolutie,
// elke keer hetzelfde. Geen model dat er iets van maakt.
//
// We bouwen SVG en rasteren dat met resvg (zat al in het project voor de
// story-export). De vormen krijgen een transparante achtergrond, zodat ze als
// losse laag over de video kunnen.

import { Resvg } from "@resvg/resvg-js";

export type VormSoort = "cirkel" | "kader" | "pijl" | "onderstreping";

export interface VormOpties {
  /** Breedte van het te tekenen vlak in pixels. Hoogte volgt uit de verhouding. */
  breedtePx: number;
  hoogtePx: number;
  kleur: string;
  /** Lijndikte als fractie van de kleinste zijde; default 0,06. */
  dikte?: number;
}

/**
 * Handgetekend gevoel zonder handwerk: een cirkel die niet perfect sluit leest
 * als "iemand heeft dit aangewezen", terwijl een wiskundig perfecte ellips als
 * een UI-element leest. Daarom laten we hem net iets open.
 */
function cirkelSvg({ breedtePx, hoogtePx, kleur, dikte = 0.06 }: VormOpties): string {
  const lijn = Math.max(3, Math.min(breedtePx, hoogtePx) * dikte);
  const rx = breedtePx / 2 - lijn;
  const ry = hoogtePx / 2 - lijn;
  const cx = breedtePx / 2;
  const cy = hoogtePx / 2;
  // Een ellips-pad dat bij ~80% ophoudt: de opening zit rechtsboven.
  const start = -0.35 * Math.PI;
  const eind = 1.5 * Math.PI;
  const punten: string[] = [];
  const stappen = 64;
  for (let i = 0; i <= stappen; i++) {
    const t = start + ((eind - start) * i) / stappen;
    punten.push(`${(cx + rx * Math.cos(t)).toFixed(1)},${(cy + ry * Math.sin(t)).toFixed(1)}`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${breedtePx}" height="${hoogtePx}" viewBox="0 0 ${breedtePx} ${hoogtePx}">
    <polyline points="${punten.join(" ")}" fill="none" stroke="${kleur}" stroke-width="${lijn.toFixed(1)}" stroke-linecap="round" />
  </svg>`;
}

function kaderSvg({ breedtePx, hoogtePx, kleur, dikte = 0.05 }: VormOpties): string {
  const lijn = Math.max(3, Math.min(breedtePx, hoogtePx) * dikte);
  const r = Math.min(breedtePx, hoogtePx) * 0.08;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${breedtePx}" height="${hoogtePx}" viewBox="0 0 ${breedtePx} ${hoogtePx}">
    <rect x="${(lijn / 2).toFixed(1)}" y="${(lijn / 2).toFixed(1)}"
          width="${(breedtePx - lijn).toFixed(1)}" height="${(hoogtePx - lijn).toFixed(1)}"
          rx="${r.toFixed(1)}" fill="none" stroke="${kleur}" stroke-width="${lijn.toFixed(1)}" />
  </svg>`;
}

/** Wijst naar rechts; de plaatsing draait hem naar het doel toe. */
function pijlSvg({ breedtePx, hoogtePx, kleur }: VormOpties): string {
  const h = hoogtePx;
  const w = breedtePx;
  const staafHoogte = h * 0.34;
  const kopBreedte = w * 0.38;
  const midden = h / 2;
  const punten = [
    `0,${midden - staafHoogte / 2}`,
    `${w - kopBreedte},${midden - staafHoogte / 2}`,
    `${w - kopBreedte},${0}`,
    `${w},${midden}`,
    `${w - kopBreedte},${h}`,
    `${w - kopBreedte},${midden + staafHoogte / 2}`,
    `0,${midden + staafHoogte / 2}`,
  ].join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polygon points="${punten}" fill="${kleur}" stroke="none" />
  </svg>`;
}

/** Dikke streep onder iets, zoals met een marker. */
function onderstrepingSvg({ breedtePx, hoogtePx, kleur }: VormOpties): string {
  const lijn = Math.max(4, hoogtePx * 0.5);
  const y = hoogtePx / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${breedtePx}" height="${hoogtePx}" viewBox="0 0 ${breedtePx} ${hoogtePx}">
    <line x1="${(lijn / 2).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(breedtePx - lijn / 2).toFixed(1)}" y2="${y.toFixed(1)}"
          stroke="${kleur}" stroke-width="${lijn.toFixed(1)}" stroke-linecap="round" opacity="0.85" />
  </svg>`;
}

export function bouwVormSvg(soort: VormSoort, opties: VormOpties): string {
  switch (soort) {
    case "cirkel": return cirkelSvg(opties);
    case "kader": return kaderSvg(opties);
    case "pijl": return pijlSvg(opties);
    case "onderstreping": return onderstrepingSvg(opties);
  }
}

/** SVG naar PNG met transparante achtergrond. */
export function tekenVorm(soort: VormSoort, opties: VormOpties): Buffer {
  const svg = bouwVormSvg(soort, opties);
  const resvg = new Resvg(svg, { background: "rgba(0,0,0,0)" });
  return Buffer.from(resvg.render().asPng());
}
