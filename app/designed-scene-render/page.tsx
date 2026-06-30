"use client";

// Render-host voor ontworpen studio-scènes. Decodeert een base64-spec uit de
// query, rendert DesignedSceneStage en stelt window.__setDesigned(progress) +
// window.__designedReady beschikbaar, zodat de server (Playwright) frame voor
// frame kan screenshotten voor de MP4-export. Ook handig als losse preview.

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import DesignedSceneStage from "@/components/studio/designed/DesignedSceneStage";
import { DESIGNED_SIZES, type DesignedScene } from "@/lib/studio/designed-scene";

declare global {
  interface Window {
    __setDesigned?: (progress: number) => void;
    __designedReady?: boolean;
  }
}

function DesignedRender() {
  const params = useSearchParams();
  const [progress, setProgress] = useState(1);

  const scene = useMemo<DesignedScene | null>(() => {
    const b64 = params.get("spec");
    if (!b64) return null;
    try {
      const json = typeof window !== "undefined" ? atob(b64) : Buffer.from(b64, "base64").toString("utf-8");
      return JSON.parse(decodeURIComponent(escape(json))) as DesignedScene;
    } catch {
      try {
        return JSON.parse(atob(b64)) as DesignedScene;
      } catch {
        return null;
      }
    }
  }, [params]);

  useEffect(() => {
    window.__setDesigned = (p: number) => setProgress(Math.min(1, Math.max(0, p)));
    window.__designedReady = true;
    return () => {
      window.__designedReady = false;
    };
  }, []);

  if (!scene) {
    return <div style={{ color: "#fff", padding: 24, fontFamily: "sans-serif" }}>Geen geldige scène-spec.</div>;
  }

  const { width, height } = DESIGNED_SIZES[scene.format];

  return (
    <div
      style={{
        width,
        height,
        margin: 0,
        overflow: "hidden",
        background: scene.theme.background,
      }}
    >
      <DesignedSceneStage scene={scene} progress={progress} />
    </div>
  );
}

export default function DesignedSceneRenderPage() {
  return (
    <Suspense fallback={null}>
      <DesignedRender />
    </Suspense>
  );
}
