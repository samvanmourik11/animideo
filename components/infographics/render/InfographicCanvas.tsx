import React from "react";
import type { InfographicSpec } from "@/lib/types";
import { layoutSpec, type PlacedBlock } from "@/lib/infographics/layout";
import { blockTimings, blockProgress } from "@/lib/infographics/timeline";
import { cardFill, cardStroke, mutedText, shade } from "@/lib/infographics/colors";
import InfographicDefs from "./defs";
import {
  StatRow,
  BarChart,
  PieChart,
  LineChart,
  ProcessSteps,
  ComparisonTable,
  BulletList,
} from "./blocks";

// De deterministische renderer: één <svg> op vaste pixelmaat, met cards,
// gradients, schaduw en gloed. Dezelfde component dient als live preview én als
// render-host voor de PNG-export. `frame`/`totalFrames` zijn fase-2 haken; zonder
// die props rendert hij het volledige eindbeeld (progress = 1).

function blockBody(p: PlacedBlock, spec: InfographicSpec, progress: number) {
  const common = { x: 0, y: 0, width: p.width, height: p.height, theme: spec.theme, progress };
  switch (p.block.type) {
    case "stat":
      return <StatRow block={p.block} {...common} />;
    case "barChart":
      return <BarChart block={p.block} {...common} />;
    case "pieChart":
      return <PieChart block={p.block} {...common} />;
    case "lineChart":
      return <LineChart block={p.block} {...common} />;
    case "process":
      return <ProcessSteps block={p.block} {...common} />;
    case "comparison":
      return <ComparisonTable block={p.block} {...common} />;
    case "list":
      return <BulletList block={p.block} {...common} />;
    default:
      return null;
  }
}

export default function InfographicCanvas({
  spec,
  frame,
  totalFrames,
  className,
  style,
}: {
  spec: InfographicSpec;
  frame?: number;
  totalFrames?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const layout = layoutSpec(spec);
  const { theme } = spec;
  const font = theme.fontFamily || "Inter, system-ui, sans-serif";
  const timings = blockTimings(spec);

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      height={layout.height}
      className={className}
      style={{ display: "block", ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <InfographicDefs theme={theme} />

      {/* Achtergrond + zachte accent-blobs voor levendigheid */}
      <rect x={0} y={0} width={layout.width} height={layout.height} fill={theme.background} />
      <circle cx={layout.width - 40} cy={layout.height * 0.08} r={layout.width * 0.26} fill={theme.primary} opacity={0.06} />
      <circle cx={20} cy={layout.height * 0.92} r={layout.width * 0.3} fill={theme.accent} opacity={0.06} />

      {/* Header: accentbalk + titel + subtitle */}
      <rect x={layout.header.x} y={layout.header.y} width={72} height={9} rx={5} fill={theme.primary} />
      <text
        x={layout.header.x}
        y={layout.header.y + 66}
        fontFamily={font}
        fontSize={spec.format === "16:9" ? 58 : 52}
        fontWeight={800}
        fill={theme.textColor}
      >
        {spec.title}
      </text>
      {spec.subtitle && (
        <text x={layout.header.x} y={layout.header.y + 112} fontFamily={font} fontSize={28} fontWeight={500} fill={mutedText(theme)}>
          {spec.subtitle}
        </text>
      )}
      {spec.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <image
          href={spec.logoUrl}
          x={layout.header.x + layout.contentWidth - 180}
          y={layout.header.y}
          width={180}
          height={80}
          preserveAspectRatio="xMaxYMin meet"
        />
      )}

      {/* Blocks. Het stat-blok is de hero-journey: die rendert los op het doek
          (geen card). Overige blokken blijven in een lichte flat-card. */}
      {layout.blocks.map((p) => {
        const progress = blockProgress(timings[p.index], frame, totalFrames);
        const isHero = p.block.type === "stat";
        return (
          <g key={p.block.id} transform={`translate(${p.x}, ${p.y}) scale(${p.scale})`}>
            {!isHero && (
              <rect
                x={0}
                y={0}
                width={p.width}
                height={p.height}
                rx={26}
                fill={cardFill(theme)}
                stroke={cardStroke(theme)}
                strokeWidth={1.5}
                filter="url(#ig-shadow)"
              />
            )}
            {blockBody(p, spec, progress)}
          </g>
        );
      })}

      {/* Bron-footer */}
      {layout.footer && spec.source && (
        <text x={layout.footer.x} y={layout.footer.y + 34} fontFamily={font} fontSize={20} fill={mutedText(theme)}>
          {spec.source}
        </text>
      )}
    </svg>
  );
}
