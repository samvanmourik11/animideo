import type { InfographicBlock, InfographicSpec } from "@/lib/types";
import { canvasSize } from "./canvas-size";

// Kolom-gebaseerde card-layout. Geen DOM, geen tekstmeting: hoogtes worden
// geschat uit het aantal datapunten. Liggend (16:9) gebruikt 2 kolommen,
// staand (9:16) één kolom, zodat de hele canvas gevuld wordt i.p.v. een smal
// kolommetje in het midden. Elk block zit in een card; de card wordt op
// natuurlijke grootte gerenderd en als geheel uniform geschaald (zie
// InfographicCanvas), waardoor tekst en afstanden meeschalen en niets overlapt.

export const CARD_PAD = 44;

export interface PlacedBlock {
  block: InfographicBlock;
  index: number;
  x: number;       // canvas-positie linksboven (na schaling)
  y: number;
  scale: number;   // uniforme groepsschaal
  width: number;   // natuurlijke card-breedte (= kolombreedte)
  height: number;  // natuurlijke card-hoogte
}

export interface Layout {
  width: number;
  height: number;
  padX: number;
  contentWidth: number;
  header: { x: number; y: number; width: number; height: number };
  footer: { x: number; y: number; width: number; height: number } | null;
  blocks: PlacedBlock[];
}

/** Geschatte natuurlijke INHOUD-hoogte (px), exclusief card-padding. */
function contentHeight(block: InfographicBlock): number {
  const titleH = "title" in block && block.title ? 54 : 0;
  switch (block.type) {
    case "stat":
      // Journey met icoon-badges: elke node heeft verticale ruimte nodig,
      // plus kopruimte voor het grote cijfer en voetruimte voor label + sub.
      return block.items.length * 160 + 110;
    case "barChart":
      return titleH + (block.orientation === "horizontal" ? block.data.length * 68 + 30 : 330);
    case "pieChart":
      return titleH + 360;
    case "lineChart":
      return titleH + 330;
    case "process":
      return titleH + block.steps.length * 124;
    case "comparison":
      return titleH + 84 + block.rows.length * 72;
    case "list":
      return titleH + block.items.length * 86 + 10;
    default:
      return 220;
  }
}

export function layoutSpec(spec: InfographicSpec): Layout {
  const { width, height } = canvasSize(spec.format);
  const padX = Math.round(width * 0.06);
  const padTop = Math.round(height * 0.045);
  const padBottom = Math.round(height * 0.035);
  const contentWidth = width - padX * 2;

  const headerH = spec.subtitle ? 188 : 136;
  const footerH = spec.source ? 50 : 0;
  const header = { x: padX, y: padTop, width: contentWidth, height: headerH };

  const top = padTop + headerH + 16;
  const bottom = height - padBottom - (footerH ? footerH + 8 : 0);
  const available = bottom - top;

  const cols = spec.format === "16:9" ? 2 : 1;
  const colGap = 40;
  const colWidth = (contentWidth - colGap * (cols - 1)) / cols;
  const gutter = 34;

  // Card-hoogtes (inhoud + padding).
  const cardH = spec.blocks.map((b) => contentHeight(b) + CARD_PAD * 2);

  // Greedy verdelen over de kolommen (steeds naar de kortste kolom).
  const colHeights = new Array(cols).fill(0);
  const colItems: number[][] = Array.from({ length: cols }, () => []);
  spec.blocks.forEach((_, i) => {
    let c = 0;
    for (let k = 1; k < cols; k++) if (colHeights[k] < colHeights[c]) c = k;
    colItems[c].push(i);
    colHeights[c] += cardH[i] + gutter;
  });

  const maxColRaw = Math.max(...colHeights.map((h) => h - gutter), 0);
  const scale = Math.min(1, available / maxColRaw);

  const blocks: PlacedBlock[] = [];
  colItems.forEach((items, c) => {
    const colX = padX + c * (colWidth + colGap);
    const used = items.reduce((a, i) => a + cardH[i] * scale, 0) + gutter * scale * Math.max(0, items.length - 1);
    const extra = Math.max(0, (available - used) / (items.length + 1));
    let y = top + extra;
    items.forEach((i) => {
      // Card vult de VOLLE kolombreedte: we geven een grotere natuurlijke breedte
      // op (colWidth / scale) zodat hij na de uniforme schaling exact colWidth
      // breed is. Zo geen horizontale dode ruimte; fonts schalen netjes mee.
      blocks.push({ block: spec.blocks[i], index: i, x: colX, y, scale, width: colWidth / scale, height: cardH[i] });
      y += cardH[i] * scale + gutter * scale + extra;
    });
  });

  return {
    width,
    height,
    padX,
    contentWidth,
    header,
    footer: footerH ? { x: padX, y: height - padBottom - footerH, width: contentWidth, height: footerH } : null,
    blocks,
  };
}
