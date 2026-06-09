"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_TRANSFORM } from "@/lib/editor/timeline";
import { useEditor, type EditorStore } from "@/lib/editor/store";

type Box = { cx: number; cy: number; w: number; h: number; rot: number };
type Layout = { cx: number; cy: number; halfW: number; halfH: number; rotation: number } | null;

// Interactieve transform-laag boven het preview-canvas. Tekent een selectiekader
// met handvatten voor de geselecteerde clip en vertaalt sleepacties naar
// transform-waarden in het Timeline Document. De compositor levert de positie
// (in fracties), wij rekenen dat om naar schermpixels.
export default function CanvasOverlay({
  store,
  getLayout,
}: {
  store: EditorStore;
  getLayout: (id: string) => Layout;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const selectedId = useEditor(store, (s) => s.selectedClipId);
  const [box, setBox] = useState<Box | null>(null);
  const [guides, setGuides] = useState({ v: false, h: false });
  const lastRef = useRef<Box | null>(null);

  // Volg de geselecteerde clip elke frame (positie kan wijzigen door bewerken).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = overlayRef.current;
      const id = store.getState().selectedClipId;
      if (el && id) {
        const layout = getLayout(id);
        const rect = el.getBoundingClientRect();
        if (layout && rect.width > 0) {
          const next: Box = {
            cx: layout.cx * rect.width,
            cy: layout.cy * rect.height,
            w: layout.halfW * 2 * rect.width,
            h: layout.halfH * 2 * rect.height,
            rot: (layout.rotation * 180) / Math.PI,
          };
          const p = lastRef.current;
          const changed =
            !p ||
            Math.abs(p.cx - next.cx) > 0.5 ||
            Math.abs(p.cy - next.cy) > 0.5 ||
            Math.abs(p.w - next.w) > 0.5 ||
            Math.abs(p.h - next.h) > 0.5 ||
            Math.abs(p.rot - next.rot) > 0.1;
          if (changed) {
            lastRef.current = next;
            setBox(next);
          }
        } else if (lastRef.current) {
          lastRef.current = null;
          setBox(null);
        }
      } else if (lastRef.current) {
        lastRef.current = null;
        setBox(null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [store, getLayout]);

  function origTransform(id: string) {
    return { ...DEFAULT_TRANSFORM, ...store.find(id)?.transform };
  }
  function center(id: string, rect: DOMRect) {
    const t = origTransform(id);
    return { x: rect.left + t.x * rect.width, y: rect.top + t.y * rect.height };
  }
  function drag(onMove: (e: PointerEvent) => void) {
    const up = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", up);
      setGuides({ v: false, h: false });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", up);
  }

  function onBody(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const id = selectedId;
    const el = overlayRef.current;
    if (!id || !el) return;
    const rect = el.getBoundingClientRect();
    const orig = origTransform(id);
    const sx = e.clientX;
    const sy = e.clientY;
    drag((ev) => {
      let nx = orig.x + (ev.clientX - sx) / rect.width;
      let ny = orig.y + (ev.clientY - sy) / rect.height;
      const g = { v: false, h: false };
      if (Math.abs(nx - 0.5) < 0.012) {
        nx = 0.5;
        g.v = true;
      }
      if (Math.abs(ny - 0.5) < 0.012) {
        ny = 0.5;
        g.h = true;
      }
      store.setAnimatable(id, "x", nx);
      store.setAnimatable(id, "y", ny);
      setGuides(g);
    });
  }

  function onCorner(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const id = selectedId;
    const el = overlayRef.current;
    if (!id || !el) return;
    const rect = el.getBoundingClientRect();
    const orig = origTransform(id);
    const c = center(id, rect);
    // Referentie = de werkelijke halve diagonaal van het kader bij drag-start,
    // niet het exacte klikpunt. Dat maakt schalen stabiel, ook bij kleine kaders.
    const layout = getLayout(id);
    if (!layout) return;
    const startDiag = Math.max(
      8,
      Math.hypot(layout.halfW * rect.width, layout.halfH * rect.height)
    );

    // Tekst heeft één maat: aan de hoeken slepen past de lettergrootte aan
    // (i.p.v. transform-schaal), zodat "Grootte" rechts meeloopt.
    const clip = store.find(id);
    if (clip?.type === "text") {
      const startSize = Math.max(8, Math.round(clip.style.fontSize * orig.scale));
      if (orig.scale !== 1) {
        store.setTextStyle(id, { fontSize: startSize });
        store.setTransform(id, { scale: 1 });
      }
      drag((ev) => {
        const d = Math.hypot(ev.clientX - c.x, ev.clientY - c.y);
        store.setTextStyle(id, {
          fontSize: Math.max(8, Math.round((startSize * d) / startDiag)),
        });
      });
      return;
    }

    drag((ev) => {
      const d = Math.hypot(ev.clientX - c.x, ev.clientY - c.y);
      const next = Math.max(0.05, Math.min(20, (orig.scale * d) / startDiag));
      store.setAnimatable(id, "scale", next);
    });
  }

  function onRotate(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const id = selectedId;
    const el = overlayRef.current;
    if (!id || !el) return;
    const rect = el.getBoundingClientRect();
    const orig = origTransform(id);
    const c = center(id, rect);
    const startAng = Math.atan2(e.clientY - c.y, e.clientX - c.x);
    drag((ev) => {
      const ang = Math.atan2(ev.clientY - c.y, ev.clientX - c.x);
      let nr = orig.rotation + ((ang - startAng) * 180) / Math.PI;
      const snap = Math.round(nr / 15) * 15;
      if (Math.abs(nr - snap) < 4) nr = snap;
      store.setAnimatable(id, "rotation", nr);
    });
  }

  const handle =
    "absolute w-3 h-3 bg-white border border-blue-500 rounded-sm pointer-events-auto";

  return (
    <div ref={overlayRef} className="absolute inset-0 pointer-events-none">
      {guides.v && <div className="absolute top-0 bottom-0 left-1/2 w-px bg-pink-400" />}
      {guides.h && <div className="absolute left-0 right-0 top-1/2 h-px bg-pink-400" />}
      {box && (
        <div
          className="absolute"
          style={{
            left: box.cx,
            top: box.cy,
            width: box.w,
            height: box.h,
            transform: `translate(-50%, -50%) rotate(${box.rot}deg)`,
          }}
        >
          <div
            onPointerDown={onBody}
            className="absolute inset-0 border-2 border-blue-400 pointer-events-auto cursor-move"
          />
          <div onPointerDown={onCorner} className={`${handle} -left-1.5 -top-1.5 cursor-nwse-resize`} />
          <div onPointerDown={onCorner} className={`${handle} -right-1.5 -top-1.5 cursor-nesw-resize`} />
          <div onPointerDown={onCorner} className={`${handle} -left-1.5 -bottom-1.5 cursor-nesw-resize`} />
          <div onPointerDown={onCorner} className={`${handle} -right-1.5 -bottom-1.5 cursor-nwse-resize`} />
          <div
            onPointerDown={onRotate}
            className="absolute left-1/2 -top-7 -translate-x-1/2 w-3 h-3 bg-blue-400 rounded-full pointer-events-auto cursor-grab"
          />
          <div className="absolute left-1/2 -top-4 -translate-x-1/2 w-px h-4 bg-blue-400" />
        </div>
      )}
    </div>
  );
}
