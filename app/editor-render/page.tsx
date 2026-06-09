"use client";

import { useEffect } from "react";
import { Compositor } from "@/lib/editor/compositor";
import { computeDuration, type TimelineDoc } from "@/lib/editor/timeline";

// Kale render-host voor de server-side export. Geen data en geen auth: de
// headless browser (Playwright) injecteert het Timeline Document en neemt het
// canvas in realtime op (MediaRecorder). Zo draait exact dezelfde compositor
// als de preview, maar dan zo snel als de GPU het beeld kan afspelen.
type RenderWindow = {
  __editorReady?: boolean;
  __editorProgress?: number;
  __editorRecord?: (doc: TimelineDoc) => Promise<string>; // base64 webm
};

function pickMime(): string {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "video/webm";
}

export default function EditorRenderPage() {
  useEffect(() => {
    const w = window as unknown as RenderWindow;

    w.__editorRecord = async (doc) => {
      const host = document.getElementById("render-host");
      if (!host) throw new Error("Geen render-host");
      const fps = doc.fps || 30;
      const duration = computeDuration(doc);

      const comp = await Compositor.createForExport(host, doc);
      await comp.preloadAll();

      const stream = comp.canvas.captureStream(fps);
      const rec = new MediaRecorder(stream, {
        mimeType: pickMime(),
        videoBitsPerSecond: 12_000_000,
      });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      const stopped = new Promise<void>((res) => (rec.onstop = () => res()));
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      // Eerste frame tekenen en de recorder laten opstarten op t=0, zodat het
      // begin niet wegvalt door opstartlatentie.
      comp.tick(0);
      rec.start(200);
      await sleep(350);

      comp.setExportPlaying(true);
      const t0 = performance.now();
      await new Promise<void>((res) => {
        const loop = () => {
          const t = (performance.now() - t0) / 1000;
          comp.tick(Math.min(t, duration));
          w.__editorProgress = Math.min(100, Math.round((t / duration) * 100));
          if (t >= duration) {
            res();
            return;
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });

      comp.setExportPlaying(false);
      comp.tick(duration); // laatste frame vasthouden
      await sleep(250);
      rec.stop();
      await stopped;
      comp.destroy();

      const blob = new Blob(chunks, { type: "video/webm" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    };

    w.__editorReady = true;
  }, []);

  return <div id="render-host" style={{ position: "fixed", inset: 0 }} />;
}
