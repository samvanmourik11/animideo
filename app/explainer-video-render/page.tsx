"use client";

import { useEffect, useState } from "react";
import type { ExplainerSpec } from "@/lib/explainer/spec";
import ExplainerVideo from "@/components/explainer/ExplainerVideo";

// Kale render-host voor de server-side video-export. Playwright opent deze pagina
// met de spec (base64), zet per frame window.__exvSetFrame(f) en screenshot.

type RenderWindow = { __exvReady?: boolean; __exvSetFrame?: (f: number) => void };

function decodeSpec(b64: string): ExplainerSpec | null {
  try {
    const json = decodeURIComponent(
      atob(b64).split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
    );
    return JSON.parse(json) as ExplainerSpec;
  } catch {
    return null;
  }
}

export default function ExplainerVideoRenderPage() {
  const [spec, setSpec] = useState<ExplainerSpec | null>(null);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setSpec(decodeSpec(p.get("spec") ?? ""));
    (window as unknown as RenderWindow).__exvSetFrame = (f) => setFrame(f);
  }, []);

  useEffect(() => {
    if (spec) {
      const id = requestAnimationFrame(() => {
        (window as unknown as RenderWindow).__exvReady = true;
      });
      return () => cancelAnimationFrame(id);
    }
  }, [spec]);

  if (!spec) return <div id="exv-host" style={{ margin: 0 }} />;
  return (
    <div id="exv-host" style={{ margin: 0, padding: 0, lineHeight: 0 }}>
      <ExplainerVideo spec={spec} frame={frame} />
    </div>
  );
}
