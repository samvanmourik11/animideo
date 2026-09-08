"use client";

import { logoBox } from "@/lib/infographics/story-layout";
import { storyCanvasSize } from "@/lib/infographics/canvas-size";

// Overlay van één storytelling-scene. Sinds de koppen, accentwoorden en grote
// getallen eruit zijn (ze vielen weg in de volledig ingetekende illustraties)
// ligt er nog maar één element over het beeld: het merklogo rechtsboven.
// `enter` (0..1) stuurt de inanimatie voor de player en de video-export.
// Zonder logo rendert dit niets — het beeld zelf is dan de hele scene.

export default function StoryScene({
  format,
  logoUrl,
  enter = 1,
}: {
  format: "16:9" | "9:16";
  logoUrl?: string | null;
  enter?: number;
}) {
  if (!logoUrl) return null;
  const logo = logoBox(format);
  const { width: W, height: H } = storyCanvasSize(format);
  const e = Math.max(0, Math.min(1, enter));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="absolute inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ pointerEvents: "none" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <image href={logoUrl} x={logo.x} y={logo.y} width={logo.w} height={logo.h} preserveAspectRatio="xMaxYMin meet" opacity={e} />
    </svg>
  );
}
