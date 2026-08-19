"use client";

// ── Rechtermuisknop op een element ───────────────────────────────────────────
//
// Alles wat je op een geselecteerd element wilt doen, op de plek waar je muis al
// staat. Dat is waarom Canva dit heeft: de contextbalk bovenin is voor bewerken,
// dit is voor beheren — kopiëren, laagvolgorde, uitlijnen, vergrendelen.
//
// Het menu werkt op de clip waar je op klikt, niet op wat toevallig geselecteerd
// was. Rechtsklikken selecteert dus eerst, precies zoals je verwacht.

import { useEffect, useRef, useState } from "react";
import { DEFAULT_TRANSFORM, type Clip, type TrackKind } from "@/lib/editor/timeline";
import type { EditorStore } from "@/lib/editor/store";

export interface MenuPlek {
  x: number;
  y: number;
  clipId: string;
}

/** Wat "stijl kopiëren" overneemt: opmaak, niet inhoud, tijd of plek. */
export interface GekopieerdeStijl {
  tekst?: Partial<Clip extends { style: infer S } ? S : never>;
  opacity?: number;
  cornerRadius?: number;
  rotation?: number;
}

export default function ContextMenu({
  store,
  plek,
  onSluit,
  maat,
  klembord,
  onKlembord,
  stijlKlembord,
  onStijlKlembord,
}: {
  store: EditorStore;
  plek: MenuPlek;
  onSluit: () => void;
  /** Halve breedte/hoogte in beeldfracties; nodig om tegen een rand uit te lijnen. */
  maat: { halfW: number; halfH: number } | null;
  klembord: { clip: Clip; spoor: TrackKind } | null;
  onKlembord: (c: { clip: Clip; spoor: TrackKind } | null) => void;
  stijlKlembord: Clip | null;
  onStijlKlembord: (c: Clip | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<"laag" | "uitlijnen" | null>(null);
  const clip = store.find(plek.clipId);

  useEffect(() => {
    function weg(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onSluit();
    }
    function toets(e: KeyboardEvent) {
      if (e.key === "Escape") onSluit();
    }
    // In het volgende tikje registreren, anders sluit de klik die het menu
    // opende hem meteen weer.
    const t = setTimeout(() => {
      window.addEventListener("mousedown", weg);
      window.addEventListener("keydown", toets);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", weg);
      window.removeEventListener("keydown", toets);
    };
  }, [onSluit]);

  if (!clip) return null;

  function doe(fn: () => void) {
    fn();
    onSluit();
  }

  /** Opmaak van de ene laag op de andere plakken, zonder inhoud of timing. */
  function plakStijl() {
    const bron = stijlKlembord;
    if (!bron || !clip) return;
    if (bron.type === "text" && clip.type === "text") {
      store.setTextStyle(clip.id, { ...bron.style });
    }
    const bt = { ...DEFAULT_TRANSFORM, ...bron.transform };
    store.setTransform(clip.id, {
      rotation: bt.rotation,
      cornerRadius: bt.cornerRadius,
      flipH: bt.flipH,
      flipV: bt.flipV,
    });
    store.updateClip(clip.id, { opacity: bron.opacity ?? 1 });
  }

  const vergrendeld = !!clip.locked;

  return (
    <div
      ref={ref}
      style={{ left: plek.x, top: plek.y }}
      className="fixed z-[60] w-64 rounded-xl border border-slate-200 bg-white shadow-xl py-1.5 text-[13px] text-slate-800"
    >
      <Regel
        label="Kopiëren"
        snel="⌘C"
        onClick={() => doe(() => onKlembord({ clip, spoor: store.spoorKindVan(clip.id) ?? "overlay" }))}
      />
      <Regel label="Stijl kopiëren" snel="⌥⌘C" onClick={() => doe(() => onStijlKlembord(clip))} />
      <Regel label="Stijl plakken" uit={!stijlKlembord} onClick={() => doe(plakStijl)} />
      <Regel label="Plakken" snel="⌘V" uit={!klembord} onClick={() => doe(() => klembord && store.plakClip(klembord.clip, klembord.spoor))} />
      <Regel label="Dupliceren" snel="⌘D" onClick={() => doe(() => store.dupliceerOpZelfdePlek(clip.id))} />
      <Regel label="Verwijderen" snel="⌫" gevaar onClick={() => doe(() => store.removeClip(clip.id))} />

      <Streep />

      <Uitklap
        label="Laag"
        open={open === "laag"}
        onWissel={() => setOpen(open === "laag" ? null : "laag")}
      >
        <Regel label="Naar voren" onClick={() => doe(() => store.zetLaag(clip.id, "voor"))} />
        <Regel label="Helemaal naar voren" onClick={() => doe(() => store.zetLaag(clip.id, "vooraan"))} />
        <Regel label="Naar achter" onClick={() => doe(() => store.zetLaag(clip.id, "achter"))} />
        <Regel label="Helemaal naar achter" onClick={() => doe(() => store.zetLaag(clip.id, "achteraan"))} />
      </Uitklap>

      <Uitklap
        label="Uitlijnen met beeld"
        open={open === "uitlijnen"}
        onWissel={() => setOpen(open === "uitlijnen" ? null : "uitlijnen")}
      >
        <Regel label="Links" onClick={() => doe(() => store.lijnUit(clip.id, "links", maat))} />
        <Regel label="Horizontaal midden" onClick={() => doe(() => store.lijnUit(clip.id, "midden", maat))} />
        <Regel label="Rechts" onClick={() => doe(() => store.lijnUit(clip.id, "rechts", maat))} />
        <Regel label="Boven" onClick={() => doe(() => store.lijnUit(clip.id, "boven", maat))} />
        <Regel label="Verticaal midden" onClick={() => doe(() => store.lijnUit(clip.id, "centraal", maat))} />
        <Regel label="Onder" onClick={() => doe(() => store.lijnUit(clip.id, "onder", maat))} />
      </Uitklap>

      <Streep />

      <Regel
        label={vergrendeld ? "Ontgrendelen" : "Vergrendelen"}
        onClick={() => doe(() => store.zetVergrendeld(clip.id, !vergrendeld))}
      />
      <Regel
        label="Timing weergeven"
        onClick={() => doe(() => { store.select(clip.id); store.seek(clip.start + 0.01); })}
      />

      <Streep />
      <p className="px-3 py-1.5 text-[11px] text-slate-500 leading-snug">
        {clip.meta?.label ?? clip.type} · start {clip.start.toFixed(1)}s · {clip.duration.toFixed(1)}s
        {clip.meta?.sceneIndex ? ` · scène ${clip.meta.sceneIndex}` : ""}
      </p>
    </div>
  );
}

function Regel({
  label,
  snel,
  onClick,
  uit,
  gevaar,
}: {
  label: string;
  snel?: string;
  onClick: () => void;
  uit?: boolean;
  gevaar?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={uit}
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-4 px-3 py-1.5 text-left hover:bg-slate-100 disabled:opacity-35 disabled:hover:bg-transparent ${
        gevaar ? "text-red-600 hover:bg-red-50" : ""
      }`}
    >
      <span>{label}</span>
      {snel && <span className="text-[11px] text-slate-400">{snel}</span>}
    </button>
  );
}

function Streep() {
  return <div className="my-1 border-t border-slate-200" />;
}

function Uitklap({
  label,
  open,
  onWissel,
  children,
}: {
  label: string;
  open: boolean;
  onWissel: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onWissel}
        className="w-full flex items-center justify-between gap-4 px-3 py-1.5 text-left hover:bg-slate-100"
      >
        <span>{label}</span>
        <span className="text-slate-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="bg-slate-50/70 border-y border-slate-100">{children}</div>}
    </>
  );
}
