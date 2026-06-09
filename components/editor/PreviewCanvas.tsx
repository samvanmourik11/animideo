"use client";

import { useEffect, useRef } from "react";
import { Compositor } from "@/lib/editor/compositor";
import type { EditorStore } from "@/lib/editor/store";
import type { Ratio } from "@/lib/editor/timeline";
import CanvasOverlay from "./CanvasOverlay";

const ASPECT: Record<Ratio, string> = {
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
};

export default function PreviewCanvas({
  store,
  ratio,
}: {
  store: EditorStore;
  ratio: Ratio;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const compRef = useRef<Compositor | null>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    const { doc } = store.getState();
    Compositor.create(host, doc.width, doc.height, doc.background, store.getState)
      .then((c) => {
        if (cancelled) {
          c.destroy();
          return;
        }
        compRef.current = c;
      })
      .catch((e) => console.error("Compositor init mislukt:", e));

    return () => {
      cancelled = true;
      compRef.current?.destroy();
      compRef.current = null;
      host.querySelectorAll("canvas").forEach((c) => c.remove());
    };
  }, [store]);

  // Klik op het canvas: selecteer de bovenste clip onder de cursor (of deselecteer).
  function onCanvasPointerDown(e: React.PointerEvent) {
    const host = hostRef.current;
    const comp = compRef.current;
    if (!host || !comp) return;
    const rect = host.getBoundingClientRect();
    const { doc } = store.getState();
    const compX = ((e.clientX - rect.left) / rect.width) * doc.width;
    const compY = ((e.clientY - rect.top) / rect.height) * doc.height;
    store.select(comp.hitTest(compX, compY));
  }

  return (
    <div className="flex-1 min-w-0 flex items-center justify-center bg-black/40 p-6">
      <div
        className={`${ASPECT[ratio]} relative max-h-full max-w-full bg-black rounded-lg overflow-hidden border border-white/10 shadow-2xl`}
        style={{
          width: ratio === "16:9" ? "100%" : "auto",
          height: ratio === "16:9" ? "auto" : "100%",
        }}
      >
        <div ref={hostRef} className="w-full h-full" onPointerDown={onCanvasPointerDown} />
        <CanvasOverlay store={store} getLayout={(id) => compRef.current?.getClipLayout(id) ?? null} />
      </div>
    </div>
  );
}
