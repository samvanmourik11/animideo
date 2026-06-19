"use client";

import { useEffect, useState } from "react";
import type { ExplainerSpec } from "@/lib/explainer/spec";
import { CARGOVIEW_SAMPLE } from "@/lib/explainer/spec";
import ExplainerStage from "@/components/explainer/ExplainerStage";

// Kale render-host voor de explainer (geen auth/chrome). Playwright opent
// /explainer-render?scene=2&progress=0.6 (optioneel ?spec=base64) en screenshot
// het frame. Zonder spec valt hij terug op de CargoView-voorbeeldspec.

type RenderWindow = { __explainerReady?: boolean };

function decodeSpec(b64: string): ExplainerSpec | null {
  try {
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json) as ExplainerSpec;
  } catch {
    return null;
  }
}

export default function ExplainerRenderPage() {
  const [state, setState] = useState<{ spec: ExplainerSpec; scene: number; progress: number } | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const specParam = p.get("spec");
    const spec = specParam ? decodeSpec(specParam) ?? CARGOVIEW_SAMPLE : CARGOVIEW_SAMPLE;
    const scene = Math.max(0, Math.min(spec.scenes.length - 1, Number(p.get("scene") ?? 0)));
    const progress = Math.max(0, Math.min(1, Number(p.get("progress") ?? 1)));
    setState({ spec, scene, progress });
    // Snelle frame-capture: zet scene+progress live zonder herladen.
    (window as unknown as { __setExplainer?: (s: number, pr: number) => void }).__setExplainer = (s, pr) =>
      setState((prev) => ({ spec: prev?.spec ?? spec, scene: s, progress: pr }));
  }, []);

  useEffect(() => {
    if (state) {
      const id = requestAnimationFrame(() => {
        (window as RenderWindow).__explainerReady = true;
      });
      return () => cancelAnimationFrame(id);
    }
  }, [state]);

  if (!state) return <div id="explainer-host" style={{ margin: 0 }} />;

  return (
    <div id="explainer-host" style={{ margin: 0, padding: 0, lineHeight: 0 }}>
      <ExplainerStage spec={state.spec} sceneIndex={state.scene} progress={state.progress} />
    </div>
  );
}
