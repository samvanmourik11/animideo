"use client";

import { useEffect, useRef, useState } from "react";
import { Compositor } from "@/lib/editor/compositor";
import type { EditorStore } from "@/lib/editor/store";
import type { Ratio } from "@/lib/editor/timeline";
import CanvasOverlay from "./CanvasOverlay";
import TekenLaag from "./TekenLaag";
import type { PenStijl } from "@/lib/editor/tekening";
import { isOnzeSleep, leesLading } from "@/lib/editor/sleep";
import { huidigeClipId, nieuwId } from "@/lib/editor/plaatsing";

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
  zoom = 1,
  onGeplaatst,
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
  /**
   * Vergroting van het beeld zelf. 1 = passend in het venster; groter laat je
   * inzoomen om precies te kunnen plaatsen, en dan schuift het vlak eromheen.
   */
  zoom?: number;
  /** Melding na een sleep-actie, bijvoorbeeld als er nog geen beeld staat. */
  onGeplaatst?: (bericht: string) => void;
}) {
  const [sleept, setSleept] = useState(false);
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

  /**
   * Iets uit de zijbalk loslaten op het beeld. De plek waar je loslaat wordt de
   * plek van het element — dat is het hele punt van slepen, anders had je net zo
   * goed kunnen klikken.
   */
  function onDrop(e: React.DragEvent) {
    const host = hostRef.current;
    if (!host) return;
    const lading = leesLading(e);
    if (!lading) return;
    e.preventDefault();
    setSleept(false);

    const clipId = huidigeClipId(store);
    if (!clipId) {
      onGeplaatst?.("Zet eerst beeld op de tijdlijn.");
      return;
    }
    const r = host.getBoundingClientRect();
    const x = Math.max(0.02, Math.min(0.98, (e.clientX - r.left) / r.width));
    const y = Math.max(0.02, Math.min(0.98, (e.clientY - r.top) / r.height));

    const id = nieuwId(lading.soort);
    const res =
      lading.soort === "vorm"
        ? store.dispatch({ op: "add_vorm", clipId, vormId: lading.vormId, stijl: lading.stijl, elementId: id, x, y })
        : lading.soort === "diagram"
          ? store.dispatch({ op: "add_diagram", clipId, diagram: lading.diagram, elementId: id, x, y })
          : lading.soort === "tekst"
            ? store.dispatch({ op: "add_text", clipId, text: lading.tekst, textId: id, x, y, style: lading.stijl })
            : store.dispatch({
                op: "add_element", clipId, src: lading.src, label: lading.label,
                elementId: id, x, y, scale: lading.breedte ?? 0.25,
              });
    if (res.ok) store.select(id);
    onGeplaatst?.(res.ok ? "Geplaatst waar je losliet" : res.error.message);
  }

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
    <div className={`flex-1 min-w-0 min-h-0 flex items-center justify-center bg-[#e8edf7] p-6 ${zoom > 1 ? "overflow-auto" : "overflow-hidden"}`}>
      <div
        className={`${ASPECT[ratio]} relative max-h-full max-w-full bg-black rounded-lg overflow-hidden shadow-[0_2px_24px_rgba(15,23,42,0.18)] shrink-0`}
        style={{
          width: ratio === "16:9" ? "100%" : "auto",
          height: ratio === "16:9" ? "auto" : "100%",
          // Vergroten met een transform in plaats van met de breedte: dan hoeft
          // Pixi het canvas niet opnieuw op te bouwen en blijft het scherp.
          transform: zoom === 1 ? undefined : `scale(${zoom})`,
          transformOrigin: "center center",
        }}
      >
        <div
          ref={hostRef}
          className="w-full h-full"
          onPointerDown={onCanvasPointerDown}
          onContextMenu={onCanvasContext}
          onDragOver={(e) => {
            if (!isOnzeSleep(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setSleept(true);
          }}
          onDragLeave={() => setSleept(false)}
          onDrop={onDrop}
        />
        {sleept && (
          <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-blue-500 bg-blue-500/10 rounded-lg" />
        )}
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
