import React from "react";

// Kleine ingebouwde set zakelijke SVG-iconen (geen library). Paden op een
// 24x24 grid, stroke-based zodat ze schaalbaar en kleurbaar blijven. Onbekende
// keywords vallen terug op een neutrale stip.

const PATHS: Record<string, string> = {
  chart: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
  growth: "M3 17l6-6 4 4 8-8 M21 7v6h-6",
  decline: "M3 7l6 6 4-4 8 8 M21 17v-6h-6",
  check: "M20 6L9 17l-5-5",
  clock: "M12 7v5l3 2 M12 21a9 9 0 100-18 9 9 0 000 18z",
  target: "M12 21a9 9 0 100-18 9 9 0 000 18z M12 16a4 4 0 100-8 4 4 0 000 8z M12 12h.01",
  users: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M22 21v-2a4 4 0 00-3-3.87",
  money: "M12 1v22 M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  idea: "M9 18h6 M10 22h4 M12 2a7 7 0 00-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0012 2z",
  warning: "M12 9v4 M12 17h.01 M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  star: "M12 2l3 6.3 6.9 1-5 4.9 1.2 6.9L12 18l-6.1 3.1L7 14.2l-5-4.9 6.9-1L12 2z",
  globe: "M12 21a9 9 0 100-18 9 9 0 000 18z M3 12h18 M12 3a14 14 0 000 18 14 14 0 000-18z",
  document: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M8 13h8 M8 17h8",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  rocket: "M5 16c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8a2 2 0 00-3 0z M9 13l-3-3a13 13 0 016-7 9 9 0 015 0 13 13 0 01-7 6l-3-3z M15 9a1 1 0 100-2 1 1 0 000 2z",
};

export function hasIcon(name?: string | null): boolean {
  return !!name && name in PATHS;
}

export function Icon({
  name,
  x,
  y,
  size,
  color,
  strokeWidth = 2,
}: {
  name?: string | null;
  x: number;
  y: number;
  size: number;
  color: string;
  strokeWidth?: number;
}) {
  const scale = size / 24;
  const d = name && PATHS[name];
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      {d ? (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <circle cx={12} cy={12} r={5} fill={color} />
      )}
    </g>
  );
}
