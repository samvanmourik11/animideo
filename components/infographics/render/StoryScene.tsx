"use client";

import { computeStoryLayout } from "@/lib/infographics/story-layout";
import type { StoryScene as Scene } from "@/lib/infographics/story-schema";

// Statische (niet-interactieve) renderer van één storytelling-scene-overlay:
// kop (met accentwoord) + groot getal + label, in SVG over de illustratie.
// `enter` (0..1) stuurt de inanimatie (fade + lichte opkomst) voor de player en
// de video-export. Gebruikt dezelfde layout als de editor (computeStoryLayout).

export default function StoryScene({
  scene,
  format,
  navy = "#16243f",
  accent = "#e8643c",
  enter = 1,
}: {
  scene: Scene;
  format: "16:9" | "9:16";
  navy?: string;
  accent?: string;
  enter?: number;
}) {
  const L = computeStoryLayout(scene, format);
  const e = Math.max(0, Math.min(1, enter));

  return (
    <svg viewBox={`0 0 ${L.W} ${L.H}`} className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" style={{ pointerEvents: "none" }}>
      <g opacity={e} transform={`translate(0, ${(1 - e) * 30})`}>
        {L.lines.map((line, li) => (
          <text key={li} x={L.hx} y={L.hy + L.hSize + li * L.lineH} fontFamily="Inter, system-ui, sans-serif" fontSize={L.hSize} fontWeight={800} fill={navy}>
            {line.split(" ").map((w, wi, arr) => (
              <tspan key={wi} fill={L.emph && w.toLowerCase().replace(/[.,:;!?]/g, "") === L.emph ? accent : navy}>
                {w}{wi < arr.length - 1 ? " " : ""}
              </tspan>
            ))}
          </text>
        ))}

        {L.num && (
          <>
            <text x={L.nx} y={L.ny + L.nSize} fontFamily="Inter, system-ui, sans-serif" fontSize={L.nSize} fontWeight={800} fill={accent}>
              {L.num}
            </text>
            {scene.numberLabel && (
              <text x={L.nx} y={L.ny + L.nSize + 44} fontFamily="Inter, system-ui, sans-serif" fontSize={36} fontWeight={600} fill={navy}>
                {scene.numberLabel}
              </text>
            )}
          </>
        )}
      </g>
    </svg>
  );
}
