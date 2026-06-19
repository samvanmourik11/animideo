import React from "react";

// Flat icoon-set voor de explainer (stroke op 24x24 grid). Wit/currentColor op een
// gekleurde badge. Onbekende keywords vallen terug op een stip. De keys hier zijn
// de bron voor EXPLAINER_ICONS in schema.ts (houd ze in sync).

const PATHS: Record<string, string> = {
  // mensen / transport
  people: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M22 21v-2a4 4 0 00-3-3.87",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8z M4 21v-1a6 6 0 0116 0v1",
  truck: "M1 16V6h13v10 M14 9h4l3 3v4h-6 M2 16h12 M6 19a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2z M18 19a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2z",
  plane: "M21 15.5L13.5 11V5a1.5 1.5 0 00-3 0v6L3 15.5V17l7.5-2v3.5L8.5 20v1.3l3.5-1 3.5 1V20l-2-1.5V15l7.5 2v-1.5z",
  ship: "M3 15h18l-2.5 5H5.5L3 15z M6 15V9h9l3.5 6 M9 9V6h3v3",
  building: "M3 21V8l6-4 6 4 M9 21V11h6v10 M21 21V12l-6-4 M7 14h.01 M7 17h.01 M12 14h.01 M12 17h.01",
  factory: "M3 21V11l5 3v-3l5 3V7l5 3v11H3z M7 17h.01 M12 17h.01 M17 17h.01",
  box: "M21 8l-9-5-9 5 9 5 9-5z M3 8v8l9 5 9-5V8 M12 13v8",
  rocket: "M12 2c2.8 2.2 4 5.5 4 9l-1.8 4H9.8L8 11c0-3.5 1.2-6.8 4-9z M9.5 15l-2.5 4.5 M14.5 15l2.5 4.5 M12 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  // sensoren / navigatie
  thermometer: "M14 14.8V5a2 2 0 10-4 0v9.8a4 4 0 104 0z M12 9v6",
  gauge: "M12 13a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2z M12 11l3.5-3.5 M4.5 19a9 9 0 1115 0z",
  bulb: "M9 18h6 M10 22h4 M12 2a7 7 0 00-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0012 2z",
  shock: "M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.6 4.6L6.7 6.7 M17.3 17.3l2.1 2.1 M19.4 4.6L17.3 6.7 M6.7 17.3l-2.1 2.1",
  gps: "M12 21s-7-7.5-7-12a7 7 0 0114 0c0 4.5-7 12-7 12z M12 11a2 2 0 100-4 2 2 0 000 4z",
  motion: "M3 9h11 M3 15h8 M14 6l4 6-4 6",
  compass: "M12 21a9 9 0 100-18 9 9 0 000 18z M16 8l-2 6-6 2 2-6 6-2z",
  globe: "M12 21a9 9 0 100-18 9 9 0 000 18z M3 12h18 M12 3a14 14 0 000 18 14 14 0 000-18z",
  layers: "M12 3l9 5-9 5-9-5 9-5z M3 13l9 5 9-5 M3 17l9 5 9-5",
  clock: "M12 7v5l3 2 M12 21a9 9 0 100-18 9 9 0 000 18z",
  calendar: "M3 5h18v16H3z M3 9h18 M8 3v4 M16 3v4",
  // beveiliging
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 018 0v4",
  unlock: "M5 11h14v10H5z M8 11V7a4 4 0 017-2.6",
  key: "M14 7a4 4 0 11-5.7 3.6L3 16v3h3l1-1h2v-2h2l1.3-1.3A4 4 0 0114 7z M15.5 7.5h.01",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z M12 15a3 3 0 100-6 3 3 0 000 6z",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16z M21 21l-4.3-4.3",
  glass: "M8 22h8 M12 15v7 M6 3h12l-1.2 6.2a5 5 0 01-9.6 0L6 3z",
  // verbinding
  wifi: "M5 13a10 10 0 0114 0 M8.5 16.5a5 5 0 017 0 M12 20h.02",
  signal: "M3 20h.01 M8 20v-5 M13 20v-9 M18 20V6",
  cloud: "M18 16a4 4 0 000-8 5 5 0 00-9.6-1A4 4 0 006 16z",
  battery: "M3 8h14v8H3z M17 11h2v2h-2 M6 11v2",
  link: "M9 15l6-6 M10.5 6.5l1-1a4 4 0 015.7 5.7l-1 1 M13.5 17.5l-1 1a4 4 0 01-5.7-5.7l1-1",
  refresh: "M21 12a9 9 0 11-2.6-6.4L21 8 M21 3v5h-5",
  // geld / commercie
  money: "M12 1v22 M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  euro: "M18 7a6 6 0 100 10 M5 10h8 M5 14h7",
  percent: "M19 5L5 19 M7.5 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M16.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  creditcard: "M3 6h18v12H3z M3 10h18",
  cart: "M3 4h2l2.5 12h11l2-8H6 M9 21a1 1 0 100-2 1 1 0 000 2z M18 21a1 1 0 100-2 1 1 0 000 2z",
  tag: "M3 3h8l10 10-8 8L3 11V3z M7.5 7.5h.01",
  // data / groei
  chart: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
  growth: "M3 17l6-6 4 4 8-8 M21 7v6h-6",
  decline: "M3 7l6 6 4-4 8 8 M21 17v-6h-6",
  target: "M12 21a9 9 0 100-18 9 9 0 000 18z M12 16a4 4 0 100-8 4 4 0 000 8z M12 12h.01",
  star: "M12 2l3 6.3 6.9 1-5 4.9 1.2 6.9L12 18l-6.1 3.1L7 14.2l-5-4.9 6.9-1L12 2z",
  award: "M12 14a6 6 0 100-12 6 6 0 000 12z M8.5 13L7 22l5-3 5 3-1.5-9",
  heart: "M12 21s-8-4.5-8-10a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 5.5-8 10-8 10z",
  thumbsup: "M7 11v9H3v-9h4z M7 11l4-8a2 2 0 013 2l-1 4h5a2 2 0 012 2.3l-1.5 7A2 2 0 0118 20H7",
  // communicatie / acties
  document: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M8 13h8 M8 17h8",
  mail: "M3 5h18v14H3z M3 6l9 7 9-7",
  phone: "M5 3h4l2 5-3 2a14 14 0 006 6l2-3 5 2v4a2 2 0 01-2 2A18 18 0 013 5a2 2 0 012-2z",
  chat: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  send: "M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z",
  bell: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 01-3.4 0",
  gear: "M3 7h6 M13 7h8 M9 5v4 M3 12h2 M9 12h12 M5 10v4 M3 17h10 M17 17h4 M13 15v4",
  download: "M12 3v12 M7 10l5 5 5-5 M5 21h14",
  upload: "M12 21V9 M7 14l5-5 5 5 M5 3h14",
  video: "M3 6h12v12H3z M15 10l6-3v10l-6-3",
  camera: "M3 7h4l2-3h6l2 3h4v12H3z M12 16a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  image: "M3 4h18v16H3z M8 11a2 2 0 100-4 2 2 0 000 4z M21 16l-6-5L5 20",
  check: "M20 6L9 17l-5-5",
  warning: "M12 9v4 M12 17h.01 M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18z M12 11v5 M12 8h.01",
  flag: "M5 21V4 M5 4h12l-2 4 2 4H5",
  leaf: "M4 20s2-12 16-16c0 0 1 13-7 16-5 1.9-9 0-9 0z M4 20c3-6 7-9 10-10",
};

export const ICON_NAMES = Object.keys(PATHS);

export function ExIcon({
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
        <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <circle cx={12} cy={12} r={5} fill={color} />
      )}
    </g>
  );
}
