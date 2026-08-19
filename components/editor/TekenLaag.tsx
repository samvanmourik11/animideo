"use client";

// ── Vrij tekenen op het canvas ───────────────────────────────────────────────
//
// Zolang er een pen actief is vangt deze laag alle muisbewegingen af. Je ziet
// je streep meteen (een gewone SVG-polyline in de browser), en zodra je loslaat
// wordt precies dezelfde vorm een element op de tijdlijn.
//
// De streep is dus geen "voorbeeld" dat daarna wordt nagemaakt: het pad dat je
// tijdens het tekenen ziet is letterlijk het pad dat in de export komt.

import { useRef, useState } from "react";
import { alsDataUri, tekeningSvg, type PenStijl, type Punt } from "@/lib/editor/tekening";
import { breedteNaarSchaal } from "@/lib/editor/element-geometry";
import type { EditorStore } from "@/lib/editor/store";
import { huidigeClipId } from "@/lib/editor/plaatsing";

export default function TekenLaag({
  store,
  pen,
  onKlaar,
}: {
  store: EditorStore;
  pen: PenStijl;
  /** Melding terug naar het paneel; ook als het misging. */
  onKlaar: (bericht: string) => void;
}) {
  const vlakRef = useRef<HTMLDivElement>(null);
  const [punten, setPunten] = useState<Punt[]>([]);
  const tekentRef = useRef(false);

  function naarFractie(e: React.PointerEvent | PointerEvent): Punt | null {
    const el = vlakRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  function begin(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const p = naarFractie(e);
    if (!p) return;
    tekentRef.current = true;
    setPunten([p]);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function beweeg(e: React.PointerEvent) {
    if (!tekentRef.current) return;
    const p = naarFractie(e);
    if (p) setPunten((lijst) => [...lijst, p]);
  }

  function eindig() {
    if (!tekentRef.current) return;
    tekentRef.current = false;
    const getrokken = punten;
    setPunten([]);
    if (getrokken.length < 2) return;

    const doc = store.getState().doc;
    const tekening = tekeningSvg(getrokken, pen, doc);
    if (!tekening) return;

    const clipId = huidigeClipId(store);
    if (!clipId) {
      onKlaar("Zet eerst beeld op de tijdlijn.");
      return;
    }
    const res = store.dispatch({
      op: "add_element",
      clipId,
      src: alsDataUri(tekening.svg),
      label: "Tekening",
      x: tekening.midden.x,
      y: tekening.midden.y,
      scale: breedteNaarSchaal(tekening.breedteFractie, tekening.formaat, doc),
    });
    onKlaar(res.ok ? "Tekening toegevoegd — teken gerust nog een streep" : res.error.message);
  }

  const pad = punten.map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`).join(" ");

  return (
    <div
      ref={vlakRef}
      onPointerDown={begin}
      onPointerMove={beweeg}
      onPointerUp={eindig}
      onPointerCancel={eindig}
      className="absolute inset-0 z-20 cursor-crosshair touch-none"
    >
      {punten.length > 1 && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
          <polyline
            points={pad}
            fill="none"
            stroke={pen.kleur}
            // vectorEffect houdt de lijn even dik ongeacht het uitgerekte
            // viewBox; zonder dit wordt een horizontale streep dunner dan een
            // verticale op een 16:9-canvas.
            vectorEffect="non-scaling-stroke"
            strokeWidth={Math.max(1, pen.dikte * (vlakRef.current?.getBoundingClientRect().width ?? 800))}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={pen.dekking ?? 1}
          />
        </svg>
      )}
    </div>
  );
}
