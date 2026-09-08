"use client";

import { useMemo } from "react";
import { bouwOverheidSvg, kleurenUitHuisstijl, type OverheidLayout } from "@/lib/infographics/overheid-scene";
import type { InfographicFormat } from "@/lib/types";

// Toont één scene van de overheidsmodus op tijdstip `t`.
//
// De SVG komt uit dezelfde functie die de MP4-export gebruikt, dus wat je hier
// ziet is per definitie wat er geëxporteerd wordt. Daarom ook geen React-SVG
// maar een string: één bron, geen tweede implementatie die stilletjes uit de pas
// gaat lopen (dezelfde afweging als bij story-svg.ts).

export default function OverheidSceneView({
  layout,
  format,
  t,
  duur,
  voiceover,
  navy,
  accent,
  logoUrl,
  className,
}: {
  layout: OverheidLayout;
  format: InfographicFormat;
  /** Tijd binnen de scene (seconden). Statische preview: gebruik de scene-duur. */
  t: number;
  duur: number;
  voiceover?: string;
  navy?: string | null;
  accent?: string | null;
  logoUrl?: string | null;
  className?: string;
}) {
  const svg = useMemo(
    () =>
      bouwOverheidSvg(layout, {
        format,
        t,
        duur,
        voiceover,
        kleuren: kleurenUitHuisstijl(navy, accent),
        logoUrl,
        // In de browser moet de scene de container vullen, niet op ware grootte
        // staan; de export vraagt om de vaste pixelmaat.
        schaalbaar: true,
      }),
    [layout, format, t, duur, voiceover, navy, accent, logoUrl]
  );

  return (
    <div
      className={className ?? "absolute inset-0 w-full h-full"}
      // De SVG is volledig door onszelf opgebouwd uit een vaste set vormen; de
      // enige tekst die erin komt is via esc() ontsnapt (zie overheid-scene.ts).
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ lineHeight: 0 }}
    />
  );
}
