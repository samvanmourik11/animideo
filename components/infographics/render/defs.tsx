import React from "react";
import type { InfographicTheme } from "@/lib/types";
import { categoryColors, gradientEnd, rgba, shade } from "@/lib/infographics/colors";

// Gedeelde SVG-defs (gradients, schaduw, gloed) voor zowel de statische poster
// als de geanimeerde video. Ids: ig-g0..7 (categoriegradients), ig-area
// (vlak onder de lijngrafiek), filters ig-shadow en ig-glow.
export default function InfographicDefs({ theme }: { theme: InfographicTheme }) {
  const cats = categoryColors(theme, 8);
  return (
    <defs>
      {cats.map((c, i) => (
        <linearGradient key={i} id={`ig-g${i}`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={shade(c, 0.16)} />
          <stop offset="1" stopColor={gradientEnd(c)} />
        </linearGradient>
      ))}
      <linearGradient id="ig-area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={rgba(theme.accent, 0.4)} />
        <stop offset="1" stopColor={rgba(theme.accent, 0)} />
      </linearGradient>
      <filter id="ig-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="6" stdDeviation="14" floodColor="#000000" floodOpacity="0.16" />
      </filter>
      <filter id="ig-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="7" />
      </filter>
    </defs>
  );
}
