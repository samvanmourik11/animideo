"use client";

import { useEffect, useState } from "react";
import type { InfographicSpec } from "@/lib/types";
import InfographicCanvas from "@/components/infographics/render/InfographicCanvas";

// Kale render-host voor de server-side PNG-export. Geen auth, geen app-chrome:
// de headless browser (Playwright) opent deze pagina met de spec als base64
// query-param, wacht op window.__infographicReady en maakt een screenshot.
// Zo is de export pixel-identiek aan de preview in de editor.

type RenderWindow = { __infographicReady?: boolean };

function decodeSpec(b64: string): InfographicSpec | null {
  try {
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json) as InfographicSpec;
  } catch {
    return null;
  }
}

export default function InfographicRenderPage() {
  const [spec, setSpec] = useState<InfographicSpec | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const data = params.get("spec");
    if (data) setSpec(decodeSpec(data));
  }, []);

  useEffect(() => {
    if (spec) {
      // Volgende frame: laat de SVG (incl. fonts/logo) eerst tekenen.
      const id = requestAnimationFrame(() => {
        (window as RenderWindow).__infographicReady = true;
      });
      return () => cancelAnimationFrame(id);
    }
  }, [spec]);

  if (!spec) return <div id="infographic-host" style={{ margin: 0 }} />;

  return (
    <div id="infographic-host" style={{ margin: 0, padding: 0, lineHeight: 0 }}>
      <InfographicCanvas spec={spec} />
    </div>
  );
}
