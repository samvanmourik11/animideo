"use client";

import { useEffect, useRef } from "react";
import { Compositor } from "@/lib/editor/compositor";
import type { EditorStore } from "@/lib/editor/store";
import type { Ratio } from "@/lib/editor/timeline";
import CanvasOverlay from "./CanvasOverlay";
import TekenLaag from "./TekenLaag";
import type { PenStijl } from "@/lib/editor/tekening";

const ASPECT: Record<Ratio, string> = {
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
  "1:1": "aspect-square",
};

export default function PreviewCanvas({
  store,
  ratio,
  pen,
  onTekening,
  onContext,
  registreerMaat,
}: {
  store: EditorStore;
  ratio: Ratio;
  /** Actieve pen; zolang die er is vangt de tekenlaag alle klikken af. */
  pen?: PenStijl | null;
  onTekening?: (bericht: string) => void;
  /**
   * Rechtsklik op het beeld. De maat komt mee omdat alleen de compositor weet
   * hoe groot het element in beeld staat — nodig om tegen een rand uit te lijnen.
   */
  onContext?: (
    punt: { x: number; y: number },
    clipId: string,
    maat: { halfW: number; halfH: number } | null
  ) => void;
  /** Geeft de shell een manier om de maat van de selectie op te vragen. */
  registreerMaat?: (fn: () => { halfW: number; halfH: number } | null) => void;
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

  useEffect(() => {
    registreerMaat?.(() => {
      const id = store.getState().selectedClipId;
      const l = id ? compRef.current?.getClipLayout(id) : null;
      return l ? { halfW: l.halfW, halfH: l.halfH } : null;
    });
  }, [registreerMaat, store]);

  // Rechtsklik selecteert eerst wat eronder ligt en opent dan het menu daarvoor;
  // anders krijg je een menu over de vorige selectie.
  function onCanvasContext(e: React.MouseEvent) {
    const host = hostRef.current;
    const comp = compRef.current;
    if (!host || !comp || !onContext) return;
    e.preventDefault();
    const rect = host.getBoundingClientRect();
    const { doc } = store.getState();
    const id = comp.hitTest(
      ((e.clientX - rect.left) / rect.width) * doc.width,
      ((e.clientY - rect.top) / rect.height) * doc.height
    );
    if (!id) return;
    store.select(id);
    const l = comp.getClipLayout(id);
    onContext({ x: e.clientX, y: e.clientY }, id, l ? { halfW: l.halfW, halfH: l.halfH } : null);
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center bg-[#e8edf7] p-6 overflow-hidden">
      <div
        className={`${ASPECT[ratio]} relative max-h-full max-w-full bg-black rounded-lg overflow-hidden shadow-[0_2px_24px_rgba(15,23,42,0.18)]`}
        style={{
          width: ratio === "16:9" ? "100%" : "auto",
          height: ratio === "16:9" ? "auto" : "100%",
        }}
      >
        <div
          ref={hostRef}
          className="w-full h-full"
          onPointerDown={onCanvasPointerDown}
          onContextMenu={onCanvasContext}
        />
        {/* Tijdens het tekenen geen selectiekader: dan zou elke streep meteen een
            sleep-actie op de vorige worden. */}
        {pen ? (
          <TekenLaag store={store} pen={pen} onKlaar={(b) => onTekening?.(b)} />
        ) : (
          <CanvasOverlay
            store={store}
            getLayout={(id) => compRef.current?.getClipLayout(id) ?? null}
            onMenu={(punt) => {
              const id = store.getState().selectedClipId;
              if (!id || !onContext) return;
              const l = compRef.current?.getClipLayout(id);
              onContext(punt, id, l ? { halfW: l.halfW, halfH: l.halfH } : null);
            }}
          />
        )}
      </div>
    </div>
  );
}
