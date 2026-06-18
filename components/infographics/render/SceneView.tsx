import React from "react";
import type { InfographicSpec } from "@/lib/types";
import type { VideoScene } from "@/lib/infographics/video";
import { canvasSize } from "@/lib/infographics/canvas-size";
import { easeOut } from "@/lib/infographics/timeline";
import { mutedText } from "@/lib/infographics/colors";
import {
  StatRow,
  BarChart,
  PieChart,
  LineChart,
  ProcessSteps,
  ComparisonTable,
  BulletList,
} from "./blocks";

// Rendert één scene full-screen. `progress` (0→1) stuurt de inanimatie van de
// inhoud; de opacity (crossfade) wordt door InfographicVideo op de groep gezet.

function blockBody(spec: InfographicSpec, blockIndex: number, box: { x: number; y: number; w: number; h: number }, progress: number) {
  const original = spec.blocks[blockIndex];
  // De scene-kop tonen we los en groot; daarom strippen we de eigen titel.
  const block = { ...original, title: undefined } as typeof original;
  // Block-componenten tekenen vanaf origin (0,0); we verschuiven de groep naar de box.
  const common = { x: 0, y: 0, width: box.w, height: box.h, theme: spec.theme, progress };
  let inner: React.ReactNode = null;
  switch (block.type) {
    case "stat": inner = <StatRow block={block} {...common} />; break;
    case "barChart": inner = <BarChart block={block} {...common} />; break;
    case "pieChart": inner = <PieChart block={block} {...common} />; break;
    case "lineChart": inner = <LineChart block={block} {...common} />; break;
    case "process": inner = <ProcessSteps block={block} {...common} />; break;
    case "comparison": inner = <ComparisonTable block={block} {...common} />; break;
    case "list": inner = <BulletList block={block} {...common} />; break;
    default: return null;
  }
  return <g transform={`translate(${box.x}, ${box.y})`}>{inner}</g>;
}

export default function SceneView({ spec, scene, progress }: { spec: InfographicSpec; scene: VideoScene; progress: number }) {
  const { width: W, height: H } = canvasSize(spec.format);
  const { theme } = spec;
  const font = theme.fontFamily || "Inter, system-ui, sans-serif";
  const e = easeOut(progress);
  const slide = (1 - e) * 36; // subtiele opkomst van onderen

  if (scene.kind === "intro") {
    return (
      <g transform={`translate(0, ${slide})`}>
        <rect x={W / 2 - 44} y={H * 0.34} width={88} height={10} rx={5} fill={theme.primary} />
        <text x={W / 2} y={H * 0.34 + 90} textAnchor="middle" fontFamily={font} fontSize={W >= 1920 ? 84 : 64} fontWeight={800} fill={theme.textColor}>
          {spec.title}
        </text>
        {spec.subtitle && (
          <text x={W / 2} y={H * 0.34 + 150} textAnchor="middle" fontFamily={font} fontSize={W >= 1920 ? 36 : 30} fontWeight={500} fill={mutedText(theme)}>
            {spec.subtitle}
          </text>
        )}
      </g>
    );
  }

  if (scene.kind === "outro") {
    return (
      <g transform={`translate(0, ${slide})`}>
        {spec.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <image href={spec.logoUrl} x={W / 2 - 130} y={H * 0.3} width={260} height={120} preserveAspectRatio="xMidYMid meet" />
        )}
        <text x={W / 2} y={spec.logoUrl ? H * 0.3 + 200 : H * 0.42} textAnchor="middle" fontFamily={font} fontSize={W >= 1920 ? 60 : 48} fontWeight={800} fill={theme.textColor}>
          {spec.title}
        </text>
        {spec.source && (
          <text x={W / 2} y={(spec.logoUrl ? H * 0.3 + 200 : H * 0.42) + 56} textAnchor="middle" fontFamily={font} fontSize={26} fontWeight={500} fill={mutedText(theme)}>
            {spec.source}
          </text>
        )}
      </g>
    );
  }

  // block-scene: grote gecentreerde kop + het blok groot in beeld
  const original = spec.blocks[scene.blockIndex];
  const heading = "title" in original ? original.title : undefined;
  const marginX = W * 0.09;
  const headingY = H * 0.17;
  const boxTop = heading ? H * 0.27 : H * 0.2;
  const box = { x: marginX, y: boxTop, w: W - marginX * 2, h: H * 0.84 - boxTop };

  return (
    <g transform={`translate(0, ${slide})`}>
      {heading && (
        <text x={W / 2} y={headingY} textAnchor="middle" fontFamily={font} fontSize={W >= 1920 ? 52 : 42} fontWeight={800} fill={theme.textColor}>
          {heading}
        </text>
      )}
      {blockBody(spec, scene.blockIndex, box, e)}
    </g>
  );
}
