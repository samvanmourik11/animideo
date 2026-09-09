"use client";

import { computeStoryLayout, logoBox } from "@/lib/infographics/story-layout";
import { storyCanvasSize } from "@/lib/infographics/canvas-size";
import { storyFontStack } from "@/lib/infographics/story-fonts";
import type { StoryScene as Scene } from "@/lib/infographics/story-schema";

// Overlay van één storytelling-scene: kop (met accentwoord), groot getal met
// label, en het merklogo — in SVG over de illustratie.
//
// `tekst` bepaalt of de typografie meedoet. Die stond een tijd lang vast aan, is
// daarna helemaal weggehaald omdat donkerblauwe koppen wegvielen in de volledig
// ingetekende illustraties, en is nu een keuze per verhaal. Er zijn klanten die
// de tekst juist nodig hebben als ondersteuning in hun e-learnings.
//
// Wat er wél veranderd is sinds toen: de tekst krijgt een zachte lichte gloed
// onder zich (zie SCRIM). Zonder die gloed verdween "Je gezicht als sleutel" in
// een druk beeld, en dat was de oorspronkelijke reden om alles weg te halen.

/**
 * Zachte lichte halo achter de letters. Geen kader en geen balk — dat vecht met
 * de illustratie — maar genoeg contrast om altijd leesbaar te blijven.
 */
const SCRIM = "drop-shadow(0 2px 10px rgba(255,255,255,0.85)) drop-shadow(0 0 22px rgba(255,255,255,0.65))";

export default function StoryScene({
  scene,
  format,
  tekst = false,
  navy = "#16243f",
  accent = "#e8643c",
  fontFamily,
  logoUrl,
  enter = 1,
}: {
  scene?: Scene | null;
  format: "16:9" | "9:16";
  /** Toont deze video tekst in beeld? Zie tekstInBeeldAan() in story-schema. */
  tekst?: boolean;
  navy?: string;
  accent?: string;
  fontFamily?: string | null;
  logoUrl?: string | null;
  enter?: number;
}) {
  const { width: W, height: H } = storyCanvasSize(format);
  const e = Math.max(0, Math.min(1, enter));
  const logo = logoUrl ? logoBox(format) : null;
  const toonTekst = tekst && !!scene;
  if (!logo && !toonTekst) return null;

  const L = toonTekst && scene ? computeStoryLayout(scene, format) : null;
  const font = storyFontStack(fontFamily);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" style={{ pointerEvents: "none" }}>
      {logo && logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <image href={logoUrl} x={logo.x} y={logo.y} width={logo.w} height={logo.h} preserveAspectRatio="xMaxYMin meet" opacity={e} />
      )}
      {L && scene && (
        <g opacity={e} transform={`translate(0, ${(1 - e) * 30})`} style={{ filter: SCRIM }}>
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
      )}
    </svg>
  );
}
