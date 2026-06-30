import React from "react";
import type { ExplainerSpec } from "@/lib/explainer/spec";
import { canvasSize } from "@/lib/infographics/canvas-size";
import { activeScenes, FPS } from "@/lib/explainer/timeline";
import { SceneInner } from "./ExplainerStage";

// Rendert de HELE tijdlijn op een gegeven global frame. Tijdens een crossfade
// liggen twee scenes met opacity over elkaar. Deterministisch per frame zodat de
// server-side frame-export pixel-identiek is.
export default function ExplainerVideo({ spec, frame }: { spec: ExplainerSpec; frame: number }) {
  const { width: W, height: H } = canvasSize(spec.format);
  const t = frame / FPS;
  const actives = activeScenes(spec, t);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect x={0} y={0} width={W} height={H} fill="#000000" />
      {actives.map((a) => (
        <g key={a.index} opacity={a.opacity}>
          <SceneInner spec={spec} sceneIndex={a.index} progress={a.progress} />
        </g>
      ))}
    </svg>
  );
}
