"use client";

import { useRef, useState } from "react";
import { computeStoryLayout, logoBox } from "@/lib/infographics/story-layout";
import { storyFontStack } from "@/lib/infographics/story-fonts";
import type { StoryScene as Scene } from "@/lib/infographics/story-schema";

// Canva-stijl bewerkbare scene-overlay: de kop en het grote getal zijn los te
// selecteren, te verslepen en aan de hoek te schalen. De transforms worden via
// onChange teruggegeven en op de scene opgeslagen (hx/hy/hSize, nx/ny/nSize).
// Layout is gedeeld met de statische renderer en player (computeStoryLayout).

type El = "head" | "num";
interface Drag {
  mode: "move" | "resize";
  el: El;
  startX: number; startY: number;
  ox: number; oy: number; oSize: number;
  startDist: number;
}

export default function EditableStoryScene({
  scene,
  format,
  navy = "#16243f",
  accent = "#e8643c",
  fontFamily,
  logoUrl,
  onChange,
}: {
  scene: Scene;
  format: "16:9" | "9:16";
  navy?: string;
  accent?: string;
  fontFamily?: string | null;
  logoUrl?: string | null;
  onChange: (patch: Partial<Scene>) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [sel, setSel] = useState<El | null>(null);

  const L = computeStoryLayout(scene, format);
  const { W, H, emph, lines, hx, hy, hSize, lineH, headW, headH, num, nx, ny, nSize, numW, numH } = L;
  const font = storyFontStack(fontFamily);
  const logo = logoUrl ? logoBox(format) : null;

  function toSvg(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function startMove(el: El, e: React.PointerEvent) {
    e.stopPropagation();
    setSel(el);
    const p = toSvg(e.clientX, e.clientY);
    const ox = el === "head" ? hx : nx;
    const oy = el === "head" ? hy : ny;
    drag.current = { mode: "move", el, startX: p.x, startY: p.y, ox, oy, oSize: 0, startDist: 0 };
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  function startResize(el: El, e: React.PointerEvent) {
    e.stopPropagation();
    setSel(el);
    const p = toSvg(e.clientX, e.clientY);
    const ox = el === "head" ? hx : nx;
    const oy = el === "head" ? hy : ny;
    const oSize = el === "head" ? hSize : nSize;
    const startDist = Math.hypot(p.x - ox, p.y - oy) || 1;
    drag.current = { mode: "resize", el, startX: p.x, startY: p.y, ox, oy, oSize, startDist };
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = toSvg(e.clientX, e.clientY);
    if (d.mode === "move") {
      const nxv = Math.round(d.ox + (p.x - d.startX));
      const nyv = Math.round(d.oy + (p.y - d.startY));
      onChange(d.el === "head" ? { hx: nxv, hy: nyv } : { nx: nxv, ny: nyv });
    } else {
      const dist = Math.hypot(p.x - d.ox, p.y - d.oy);
      const size = Math.max(20, Math.min(420, Math.round((d.oSize * dist) / d.startDist)));
      onChange(d.el === "head" ? { hSize: size } : { nSize: size });
    }
  }

  function onUp(e: React.PointerEvent) {
    drag.current = null;
    try { svgRef.current?.releasePointerCapture(e.pointerId); } catch {}
  }

  const handleR = 16;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="absolute inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerDown={() => setSel(null)}
      style={{ touchAction: "none" }}
    >
      {/* ── Merklogo (rechtsboven, niet-interactief) ──────────── */}
      {logo && logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <image href={logoUrl} x={logo.x} y={logo.y} width={logo.w} height={logo.h} preserveAspectRatio="xMaxYMin meet" style={{ pointerEvents: "none" }} />
      )}

      {/* ── Kop ───────────────────────────────────────────────── */}
      {lines.length > 0 && (
        <g>
          {lines.map((line, li) => (
            <text key={li} x={hx} y={hy + hSize + li * lineH} fontFamily={font} fontSize={hSize} fontWeight={800} fill={navy} style={{ pointerEvents: "none" }}>
              {line.split(" ").map((w, wi, arr) => (
                <tspan key={wi} fill={emph && w.toLowerCase().replace(/[.,:;!?]/g, "") === emph ? accent : navy}>
                  {w}{wi < arr.length - 1 ? " " : ""}
                </tspan>
              ))}
            </text>
          ))}
          <rect x={hx} y={hy} width={headW} height={headH} fill="transparent" style={{ cursor: "move" }} onPointerDown={(e) => startMove("head", e)} />
          {sel === "head" && (
            <>
              <rect x={hx} y={hy} width={headW} height={headH} fill="none" stroke={accent} strokeWidth={2} strokeDasharray="8 6" style={{ pointerEvents: "none" }} />
              <circle cx={hx + headW} cy={hy + headH} r={handleR} fill="#fff" stroke={accent} strokeWidth={3} style={{ cursor: "nwse-resize" }} onPointerDown={(e) => startResize("head", e)} />
            </>
          )}
        </g>
      )}

      {/* ── Groot getal (+ label) ─────────────────────────────── */}
      {num && (
        <g>
          <text x={nx} y={ny + nSize} fontFamily={font} fontSize={nSize} fontWeight={800} fill={accent} style={{ pointerEvents: "none" }}>
            {num}
          </text>
          {scene.numberLabel && (
            <text x={nx} y={ny + nSize + 44} fontFamily={font} fontSize={36} fontWeight={600} fill={navy} style={{ pointerEvents: "none" }}>
              {scene.numberLabel}
            </text>
          )}
          <rect x={nx} y={ny} width={numW} height={numH} fill="transparent" style={{ cursor: "move" }} onPointerDown={(e) => startMove("num", e)} />
          {sel === "num" && (
            <>
              <rect x={nx} y={ny} width={numW} height={numH} fill="none" stroke={accent} strokeWidth={2} strokeDasharray="8 6" style={{ pointerEvents: "none" }} />
              <circle cx={nx + numW} cy={ny + numH} r={handleR} fill="#fff" stroke={accent} strokeWidth={3} style={{ cursor: "nwse-resize" }} onPointerDown={(e) => startResize("num", e)} />
            </>
          )}
        </g>
      )}
    </svg>
  );
}
