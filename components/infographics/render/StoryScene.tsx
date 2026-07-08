"use client";

import { computeStoryLayout, logoBox } from "@/lib/infographics/story-layout";
import { storyFontStack } from "@/lib/infographics/story-fonts";
import type { StoryScene as Scene } from "@/lib/infographics/story-schema";

// Statische (niet-interactieve) renderer van één storytelling-scene-overlay:
// kop (met accentwoord) + groot getal + label, in SVG over de illustratie.
// `enter` (0..1) stuurt de inanimatie (fade + lichte opkomst) voor de player en
// de video-export. Gebruikt dezelfde layout als de editor (computeStoryLayout).
// fontFamily/logoUrl komen uit de huisstijl (optioneel).

export default function StoryScene({
  scene,
  format,
  navy = "#16243f",
  accent = "#e8643c",
  fontFamily,
  logoUrl,
  enter = 1,
}: {
  scene: Scene;
  format: "16:9" | "9:16";
  navy?: string;
  accent?: string;
  fontFamily?: string | null;
  logoUrl?: string | null;
  enter?: number;
}) {
  const L = computeStoryLayout(scene, format);
  const e = Math.max(0, Math.min(1, enter));
  const font = storyFontStack(fontFamily);
  const logo = logoUrl ? logoBox(format) : null;

  return (
    <svg viewBox={`0 0 ${L.W} ${L.H}`} className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" style={{ pointerEvents: "none" }}>
      {logo && logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <image href={logoUrl} x={logo.x} y={logo.y} width={logo.w} height={logo.h} preserveAspectRatio="xMaxYMin meet" opacity={e} />
      )}
      <g opacity={e} transform={`translate(0, ${(1 - e) * 30})`}>
        {L.lines.map((line, li) => (
          <text key={li} x={L.hx} y={L.hy + L.hSize + li * L.lineH} fontFamily={font} fontSize={L.hSize} fontWeight={800} fill={navy}>
            {line.split(" ").map((w, wi, arr) => (
              <tspan key={wi} fill={L.emph && w.toLowerCase().replace(/[.,:;!?]/g, "") === L.emph ? accent : navy}>
                {w}{wi < arr.length - 1 ? " " : ""}
              </tspan>
            ))}
          </text>
        ))}

        {L.num && (
          <>
            <text x={L.nx} y={L.ny + L.nSize} fontFamily={font} fontSize={L.nSize} fontWeight={800} fill={accent}>
              {L.num}
            </text>
            {scene.numberLabel && (
              <text x={L.nx} y={L.ny + L.nSize + 44} fontFamily={font} fontSize={36} fontWeight={600} fill={navy}>
                {scene.numberLabel}
              </text>
            )}
          </>
        )}
      </g>
    </svg>
  );
}
