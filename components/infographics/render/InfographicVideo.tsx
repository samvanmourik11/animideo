import React from "react";
import type { InfographicSpec } from "@/lib/types";
import { canvasSize } from "@/lib/infographics/canvas-size";
import { frameState } from "@/lib/infographics/video";
import InfographicDefs from "./defs";
import SceneView from "./SceneView";

// De geanimeerde infographic-video als één <svg>, gerenderd op een bepaald frame.
// Dezelfde component voedt de browser-preview (requestAnimationFrame) én de
// server-side frame-voor-frame MP4-export, zodat ze identiek zijn.
export default function InfographicVideo({
  spec,
  frame,
  totalFrames,
  className,
  style,
}: {
  spec: InfographicSpec;
  frame: number;
  totalFrames: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { width, height } = canvasSize(spec.format);
  const active = frameState(spec, frame, totalFrames);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      style={{ display: "block", ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <InfographicDefs theme={spec.theme} />
      <rect x={0} y={0} width={width} height={height} fill={spec.theme.background} />
      {active.map((a) => (
        <g key={a.index} opacity={a.opacity}>
          <SceneView spec={spec} scene={a.scene} progress={a.progress} />
        </g>
      ))}
    </svg>
  );
}
