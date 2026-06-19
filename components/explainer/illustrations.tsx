import React from "react";
import type { ExplainerTheme, Illustration } from "@/lib/explainer/spec";

// Flat illustraties, getekend in een lokale 100x100-ruimte rond (0,0) en
// geschaald op `size`. Bewust simpel flat (geen cartoon-personages), in de
// merkkleuren. Dit is de startbibliotheek; uit te breiden.

const GREY = "#C2CBD4";
const GREY_D = "#9AA6B2";
const CARD = "#E8A33D";
const CARD_D = "#D8902B";

function Monitor({ theme }: { theme: ExplainerTheme }) {
  void theme;
  return (
    <g>
      <rect x={-46} y={-40} width={92} height={62} rx={5} fill="#ffffff" stroke={GREY} strokeWidth={5} />
      <rect x={-30} y={-22} width={44} height={6} rx={3} fill={GREY} />
      <rect x={-30} y={-10} width={52} height={6} rx={3} fill={GREY} />
      <rect x={-30} y={2} width={30} height={6} rx={3} fill={GREY} />
      <rect x={-30} y={14} width={40} height={6} rx={3} fill={GREY} />
      <rect x={-7} y={22} width={14} height={12} fill={GREY_D} />
      <rect x={-24} y={33} width={48} height={8} rx={4} fill={GREY_D} />
    </g>
  );
}

function Boxes({ theme }: { theme: ExplainerTheme }) {
  void theme;
  return (
    <g>
      <rect x={-36} y={-26} width={72} height={62} rx={3} fill={CARD} />
      <rect x={-36} y={-26} width={72} height={16} fill={CARD_D} />
      <rect x={-10} y={-30} width={20} height={20} fill="#ffffff" opacity={0.92} />
      <path d="M-12 24 l6 -10 6 10 M0 24 v-12" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M8 24 l6 -10 6 10 M14 24 v-12" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </g>
  );
}

function Truck({ theme }: { theme: ExplainerTheme }) {
  return (
    <g>
      <rect x={-50} y={-24} width={60} height={44} rx={3} fill={theme.accent} />
      <rect x={-50} y={-24} width={60} height={44} rx={3} fill="none" stroke={CARD_D} strokeWidth={2} />
      <path d={`M10 -16 h22 l10 14 v22 h-32 z`} fill={theme.primary} />
      <rect x={16} y={-10} width={18} height={14} rx={2} fill="#bfe0f5" />
      <circle cx={-28} cy={24} r={9} fill={theme.primary} />
      <circle cx={-28} cy={24} r={3.5} fill={GREY} />
      <circle cx={26} cy={24} r={9} fill={theme.primary} />
      <circle cx={26} cy={24} r={3.5} fill={GREY} />
    </g>
  );
}

function Plane({ theme }: { theme: ExplainerTheme }) {
  return (
    <g>
      <path
        d="M-52 6 L18 -4 L40 -16 a4 4 0 016 6 L36 6 L52 14 L52 22 L34 18 L20 24 L8 24 L14 16 L-8 18 L-20 26 L-26 26 L-22 14 L-52 12 Z"
        fill={theme.primary}
      />
      <circle cx={28} cy={2} r={2.5} fill="#bfe0f5" />
      <circle cx={20} cy={3} r={2.5} fill="#bfe0f5" />
      <circle cx={12} cy={4} r={2.5} fill="#bfe0f5" />
    </g>
  );
}

function Ship({ theme }: { theme: ExplainerTheme }) {
  return (
    <g>
      <path d="M-50 6 H50 L40 28 H-40 Z" fill={theme.primary} />
      <rect x={-38} y={-14} width={58} height={20} fill={theme.accent} />
      <rect x={-38} y={-14} width={20} height={20} fill={CARD_D} />
      <rect x={2} y={-14} width={18} height={20} fill={CARD_D} />
      <rect x={24} y={-26} width={20} height={32} fill={GREY_D} />
      <rect x={28} y={-22} width={5} height={5} fill="#fff" />
      <rect x={36} y={-22} width={5} height={5} fill="#fff" />
    </g>
  );
}

function Building({ theme }: { theme: ExplainerTheme }) {
  void theme;
  return (
    <g>
      <rect x={-46} y={-20} width={30} height={56} fill={GREY_D} />
      <rect x={-12} y={-38} width={34} height={74} fill={GREY} />
      <rect x={26} y={-6} width={22} height={42} fill={GREY_D} />
      {[-32, -2, 32].map((bx, c) =>
        [-30, -16, -2, 12, 26].map((by, r) => (
          <rect key={`${c}-${r}`} x={bx} y={by} width={5} height={7} fill="#ffffff" opacity={0.75} />
        ))
      )}
    </g>
  );
}

function Sensor({ theme }: { theme: ExplainerTheme }) {
  return (
    <g>
      <rect x={-22} y={-6} width={44} height={34} rx={5} fill={theme.primary} />
      <rect x={-14} y={4} width={28} height={6} rx={3} fill={theme.accent} />
      <circle cx={0} cy={20} r={3.5} fill="#fff" />
      <path d="M-18 -14 a26 26 0 0136 0 M-10 -8 a16 16 0 0120 0" stroke={theme.accent} strokeWidth={4} fill="none" strokeLinecap="round" />
    </g>
  );
}

export function CenterIllustration({
  name,
  size,
  theme,
}: {
  name: Illustration;
  size: number;
  theme: ExplainerTheme;
}) {
  if (name === "none") return null;
  const scale = size / 100;
  const map: Record<Exclude<Illustration, "none">, React.ReactNode> = {
    monitor: <Monitor theme={theme} />,
    boxes: <Boxes theme={theme} />,
    truck: <Truck theme={theme} />,
    plane: <Plane theme={theme} />,
    ship: <Ship theme={theme} />,
    building: <Building theme={theme} />,
    sensor: <Sensor theme={theme} />,
  };
  return <g transform={`scale(${scale})`}>{map[name]}</g>;
}
