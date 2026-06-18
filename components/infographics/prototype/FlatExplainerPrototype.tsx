import React from "react";
import { Icon } from "../render/icons";

// PROTOTYPE (niet in productie): flat explainer-infographic met icoon-badges en
// een verbindend pad als rode draad. Hardcoded Bloomwear-data om de stijlrichting
// te tonen. Doel: laten zien hoe het eruit kan zien, daarna pas porten.

const W = 1080;
const H = 1920;

type Node = {
  value: string;
  label: string;
  sub: string;
  icon: string;
  color: string;
};

const TITLE = "Jaarcijfers 2025";
const SUBTITLE = "Bloomwear B.V.";
const SOURCE = "Bron: Jaarverslag Bloomwear 2025";

const NODES: Node[] = [
  { value: "+38%", label: "Omzetgroei", sub: "naar 12,4 mln euro", icon: "money", color: "#F97316" },
  { value: "14.200", label: "Actieve klanten", sub: "was 8.500", icon: "users", color: "#14B8A6" },
  { value: "8,6", label: "Klanttevredenheid (NPS)", sub: "was 7,2", icon: "star", color: "#8B5CF6" },
  { value: "3,4%", label: "Webshop-conversie", sub: "was 2,1%", icon: "target", color: "#3B82F6" },
  { value: "7%", label: "Retourpercentage", sub: "was 12%", icon: "decline", color: "#22C55E" },
];

const INK = "#0F172A";
const MUTED = "#64748B";
const BG = "#F6F8FC";
const PATH = "#E2E8F0";

const PAD_X = 90;
const X_LEFT = 320;
const X_RIGHT = W - 320;
const BADGE_R = 78;

function nodePositions() {
  const top = 470;
  const bottom = 1660;
  const gap = (bottom - top) / (NODES.length - 1);
  return NODES.map((n, i) => ({
    ...n,
    cx: i % 2 === 0 ? X_LEFT : X_RIGHT,
    cy: Math.round(top + i * gap),
    side: i % 2 === 0 ? "left" : "right",
  }));
}

function buildPath(pts: { cx: number; cy: number }[]): string {
  let d = `M ${pts[0].cx} ${pts[0].cy}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const my = (a.cy + b.cy) / 2;
    d += ` C ${a.cx} ${my} ${b.cx} ${my} ${b.cx} ${b.cy}`;
  }
  return d;
}

export default function FlatExplainerPrototype() {
  const pts = nodePositions();
  const pathD = buildPath(pts);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      <defs>
        <filter id="pt-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#0F172A" floodOpacity="0.18" />
        </filter>
        <linearGradient id="pt-path" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#CBD5E1" />
          <stop offset="1" stopColor="#E2E8F0" />
        </linearGradient>
      </defs>

      {/* Achtergrond + zachte accent-blobs voor levendigheid */}
      <rect x={0} y={0} width={W} height={H} fill={BG} />
      <circle cx={W - 60} cy={120} r={260} fill="#F97316" opacity={0.07} />
      <circle cx={40} cy={H - 120} r={300} fill="#3B82F6" opacity={0.07} />

      {/* Header */}
      <rect x={PAD_X} y={150} width={84} height={12} rx={6} fill="#F97316" />
      <text x={PAD_X} y={250} fontFamily="Inter, sans-serif" fontSize={84} fontWeight={800} fill={INK}>
        {TITLE}
      </text>
      <text x={PAD_X} y={312} fontFamily="Inter, sans-serif" fontSize={40} fontWeight={600} fill={MUTED}>
        {SUBTITLE}
      </text>

      {/* Verbindend pad: de rode draad */}
      <path d={pathD} fill="none" stroke="url(#pt-path)" strokeWidth={20} strokeLinecap="round" />

      {/* Nodes */}
      {pts.map((n, i) => {
        const textRight = n.side === "left"; // tekst aan binnenzijde (richting midden)
        const tx = textRight ? n.cx + BADGE_R + 56 : n.cx - BADGE_R - 56;
        const anchor = textRight ? "start" : "end";
        return (
          <g key={i}>
            {/* witte ring zodat de badge los op het pad ligt */}
            <circle cx={n.cx} cy={n.cy} r={BADGE_R + 12} fill={BG} />
            <circle cx={n.cx} cy={n.cy} r={BADGE_R} fill={n.color} filter="url(#pt-shadow)" />
            <Icon
              name={n.icon}
              x={n.cx - 40}
              y={n.cy - 40}
              size={80}
              color="#FFFFFF"
              strokeWidth={2.4}
            />
            {/* klein volgnummer-chipje */}
            <circle cx={n.cx + BADGE_R - 6} cy={n.cy - BADGE_R + 6} r={26} fill={INK} />
            <text
              x={n.cx + BADGE_R - 6}
              y={n.cy - BADGE_R + 15}
              fontFamily="Inter, sans-serif"
              fontSize={26}
              fontWeight={800}
              fill="#FFFFFF"
              textAnchor="middle"
            >
              {i + 1}
            </text>

            {/* Tekst: groot cijfer + label + sub */}
            <text x={tx} y={n.cy - 6} fontFamily="Inter, sans-serif" fontSize={104} fontWeight={800} fill={n.color} textAnchor={anchor}>
              {n.value}
            </text>
            <text x={tx} y={n.cy + 50} fontFamily="Inter, sans-serif" fontSize={40} fontWeight={700} fill={INK} textAnchor={anchor}>
              {n.label}
            </text>
            <text x={tx} y={n.cy + 96} fontFamily="Inter, sans-serif" fontSize={30} fontWeight={500} fill={MUTED} textAnchor={anchor}>
              {n.sub}
            </text>
          </g>
        );
      })}

      {/* Footer */}
      <text x={PAD_X} y={H - 70} fontFamily="Inter, sans-serif" fontSize={28} fill={MUTED}>
        {SOURCE}
      </text>
    </svg>
  );
}
