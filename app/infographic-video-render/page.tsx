"use client";

import { useEffect, useState } from "react";
import type { InfographicSpec } from "@/lib/types";
import InfographicVideo from "@/components/infographics/render/InfographicVideo";
import { totalDuration, FPS } from "@/lib/infographics/video";

// Kale render-host voor de server-side MP4-export. Geen auth, geen app-chrome.
// Playwright opent deze pagina met de spec als base64 query-param, leest
// window.__igvTotalFrames, en zet per frame window.__igvSetFrame(frame) gevolgd
// door een screenshot. Zo wordt de video deterministisch frame-voor-frame
// gerenderd (geen text-to-video).

type RenderWindow = {
  __igvReady?: boolean;
  __igvTotalFrames?: number;
  __igvSetFrame?: (frame: number) => void;
};

function decodeSpec(b64: string): InfographicSpec | null {
  try {
    const json = decodeURIComponent(
      atob(b64).split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
    );
    return JSON.parse(json) as InfographicSpec;
  } catch {
    return null;
  }
}

export default function InfographicVideoRenderPage() {
  const [spec, setSpec] = useState<InfographicSpec | null>(null);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const data = params.get("spec");
    if (data) setSpec(decodeSpec(data));
  }, []);

  useEffect(() => {
    if (!spec) return;
    const w = window as RenderWindow;
    w.__igvTotalFrames = Math.max(1, Math.round(totalDuration(spec) * FPS));
    w.__igvSetFrame = (f: number) => setFrame(f);
    const id = requestAnimationFrame(() => { w.__igvReady = true; });
    return () => cancelAnimationFrame(id);
  }, [spec]);

  if (!spec) return <div id="igv-host" style={{ margin: 0 }} />;

  const totalFrames = Math.max(1, Math.round(totalDuration(spec) * FPS));
  return (
    <div id="igv-host" style={{ margin: 0, padding: 0, lineHeight: 0 }}>
      <InfographicVideo spec={spec} frame={frame} totalFrames={totalFrames} />
    </div>
  );
}
