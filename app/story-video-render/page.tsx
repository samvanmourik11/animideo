"use client";

import { useEffect, useState } from "react";
import StoryScene from "@/components/infographics/render/StoryScene";
import { storyCanvasSize } from "@/lib/infographics/canvas-size";
import type { StorySpec } from "@/lib/infographics/story-schema";

// Headless render-doel voor de MP4-export. Twee modi:
// - default: één scene (illustratie + tekst) statisch, voor stills.
// - ?textonly=1: ALLEEN de tekst-overlay op transparante achtergrond, zodat de
//   export die laag over de (bewegende) video of het beeld kan leggen.
// Playwright zet per scene window.__storySetScene(i) en maakt een screenshot.
export default function StoryVideoRender() {
  const [spec, setSpec] = useState<StorySpec | null>(null);
  const [navy, setNavy] = useState("#16243f");
  const [accent, setAccent] = useState("#e8643c");
  const [idx, setIdx] = useState(0);
  const [textOnly, setTextOnly] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNavy(params.get("navy") || "#16243f");
    setAccent(params.get("accent") || "#e8643c");
    const to = params.get("textonly") === "1";
    setTextOnly(to);
    if (to) {
      // Transparante achtergrond afdwingen, ondanks de globale (donkere) CSS.
      document.documentElement.style.background = "transparent";
      document.body.style.background = "transparent";
    }
    const p = params.get("spec");
    if (!p) return;
    try {
      const s = JSON.parse(decodeURIComponent(escape(atob(p)))) as StorySpec;
      setSpec(s);
      const w = window as unknown as { __storySetScene?: (i: number) => void; __storyReady?: boolean };
      w.__storySetScene = (i: number) => setIdx(i);
      if (to) { w.__storyReady = true; return; }
      const urls = s.scenes.map((sc) => sc.imageUrl).filter(Boolean) as string[];
      if (urls.length === 0) { w.__storyReady = true; return; }
      let loaded = 0;
      urls.forEach((u) => {
        const im = new Image();
        im.onload = im.onerror = () => { loaded++; if (loaded >= urls.length) w.__storyReady = true; };
        im.src = u;
      });
    } catch { /* ignore */ }
  }, []);

  if (!spec) return null;
  const { width: W, height: H } = storyCanvasSize(spec.format);
  const scene = spec.scenes[idx];

  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: W, height: H, background: textOnly ? "transparent" : "#f3f1ec", overflow: "hidden" }}>
      {!textOnly && scene?.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={scene.imageUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      {scene && <StoryScene scene={scene} format={spec.format} navy={navy} accent={accent} enter={1} />}
    </div>
  );
}
