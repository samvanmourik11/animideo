"use client";

import { useRef } from "react";
import { computeDuration, type Clip } from "@/lib/editor/timeline";
import { useEditor, type EditorStore } from "@/lib/editor/store";

const ROW_H = 48;
const RULER_H = 24;
const LABEL_W = 96;

const CLIP_COLOR: Record<Clip["type"], string> = {
  video: "bg-blue-600/70 border-blue-400/50",
  image: "bg-emerald-600/70 border-emerald-400/50",
  text: "bg-amber-600/70 border-amber-400/50",
  audio: "bg-fuchsia-600/70 border-fuchsia-400/50",
};

function Playhead({ store }: { store: EditorStore }) {
  const t = useEditor(store, (s) => s.currentTime);
  const pxPerSec = useEditor(store, (s) => s.pxPerSec);
  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-red-500 z-20 pointer-events-none"
      style={{ left: t * pxPerSec }}
    >
      <div className="absolute -top-0 -left-[5px] w-[11px] h-[11px] rounded-sm bg-red-500" />
    </div>
  );
}

export default function Timeline({ store }: { store: EditorStore }) {
  const doc = useEditor(store, (s) => s.doc);
  const pxPerSec = useEditor(store, (s) => s.pxPerSec);
  const selectedId = useEditor(store, (s) => s.selectedClipId);
  const scrollRef = useRef<HTMLDivElement>(null);

  const duration = computeDuration(doc);
  const contentW = Math.max(duration, 10) * pxPerSec;

  // Weergavevolgorde: bovenste rij = bovenste laag. Visuele tracks omgekeerd
  // (de compositor tekent latere tracks bovenop), audio onderaan.
  const visualTracks = doc.tracks.filter((t) => t.kind !== "audio");
  const audioTracks = doc.tracks.filter((t) => t.kind === "audio");
  const displayTracks = [...visualTracks].reverse().concat(audioTracks);

  function seekFromEvent(clientX: number) {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    store.seek(x / pxPerSec);
  }

  function startScrub(e: React.PointerEvent) {
    seekFromEvent(e.clientX);
    const move = (ev: PointerEvent) => seekFromEvent(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startClipDrag(
    e: React.PointerEvent,
    clip: Clip,
    mode: "move" | "trim-l" | "trim-r"
  ) {
    e.stopPropagation();
    store.select(clip.id);
    const startX = e.clientX;
    const orig = { start: clip.start, duration: clip.duration };
    const pps = store.getState().pxPerSec;
    const movable = clip.type === "video" || clip.type === "image";
    let curTrackId =
      doc.tracks.find((t) => t.clips.some((c) => c.id === clip.id))?.id ?? null;
    let createdTop = false;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / pps;
      if (mode === "move") {
        // Verticaal slepen tussen lagen. Boven alle rijen = nieuwe laag bovenop.
        const el = scrollRef.current;
        if (movable && el) {
          const rect = el.getBoundingClientRect();
          const idx = Math.floor((ev.clientY - rect.top - RULER_H) / ROW_H);
          const cur = store.getState().doc;
          const disp = [...cur.tracks.filter((t) => t.kind !== "audio")]
            .reverse()
            .concat(cur.tracks.filter((t) => t.kind === "audio"));
          if (idx < 0) {
            if (!createdTop) {
              const nid = store.addOverlayTrack();
              store.moveClipToTrackById(clip.id, nid);
              curTrackId = nid;
              createdTop = true;
            }
          } else if (idx < disp.length) {
            const target = disp[idx];
            if (
              (target.kind === "video" || target.kind === "overlay") &&
              target.id !== curTrackId
            ) {
              store.moveClipToTrackById(clip.id, target.id);
              curTrackId = target.id;
            }
          }
        }
        store.moveClip(clip.id, orig.start + dx);
      } else if (mode === "trim-l") store.trimStart(clip.id, orig.start + dx);
      else store.trimEnd(clip.id, orig.duration + dx);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      store.pruneEmptyTracks();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Liniaal-markeringen, dynamisch op zoom
  const step = pxPerSec < 40 ? 5 : pxPerSec < 100 ? 1 : 0.5;
  const ticks: number[] = [];
  for (let s = 0; s <= Math.max(duration, 10); s += step) ticks.push(s);

  return (
    <section className="h-60 border-t border-white/10 shrink-0 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-white/10">
        <button
          onClick={() => {
            const id = store.getState().selectedClipId;
            if (id) store.splitClip(id, store.getState().currentTime);
          }}
          disabled={!selectedId}
          className="btn-secondary text-xs py-1 px-3 disabled:opacity-40"
        >
          Splitsen
        </button>
        <button
          onClick={() => {
            const id = store.getState().selectedClipId;
            if (id) store.removeClip(id);
          }}
          disabled={!selectedId}
          className="btn-secondary text-xs py-1 px-3 disabled:opacity-40"
        >
          Verwijderen
        </button>
        <button
          onClick={() => store.addTextClip()}
          className="btn-secondary text-xs py-1 px-3"
          title="Tekst toevoegen op de playhead"
        >
          + Tekst
        </button>
        <button
          onClick={() => {
            const id = store.getState().selectedClipId;
            if (id) store.clipToNewLayer(id);
            else store.addOverlayTrack();
          }}
          className="btn-secondary text-xs py-1 px-3"
          title="Nieuwe overlay-laag (verplaatst de selectie ernaartoe)"
        >
          + Laag
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-slate-500">Zoom</span>
          <input
            type="range"
            min={20}
            max={300}
            value={pxPerSec}
            onChange={(e) => store.setZoom(Number(e.target.value))}
            className="w-28"
          />
        </div>
      </div>

      {/* Tracks */}
      <div className="flex flex-1 min-h-0 overflow-y-auto">
        {/* Labels */}
        <div className="shrink-0 border-r border-white/10" style={{ width: LABEL_W }}>
          <div style={{ height: RULER_H }} className="border-b border-white/10" />
          {displayTracks.map((t) => (
            <div
              key={t.id}
              style={{ height: ROW_H }}
              className="px-3 flex items-center text-[11px] text-slate-400 border-b border-white/5"
            >
              {t.name}
            </div>
          ))}
        </div>

        {/* Scrollbaar werkvlak */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden relative">
          <div style={{ width: contentW }} className="relative">
            {/* Liniaal */}
            <div
              style={{ height: RULER_H }}
              className="relative border-b border-white/10 cursor-pointer select-none"
              onPointerDown={startScrub}
            >
              {ticks.map((s) => (
                <div
                  key={s}
                  className="absolute top-0 bottom-0 border-l border-white/10"
                  style={{ left: s * pxPerSec }}
                >
                  <span className="absolute top-0.5 left-1 text-[9px] text-slate-500 tabular-nums">
                    {s}s
                  </span>
                </div>
              ))}
            </div>

            {/* Track-rijen */}
            {displayTracks.map((track) => (
              <div
                key={track.id}
                style={{ height: ROW_H }}
                className="relative border-b border-white/5"
                onPointerDown={startScrub}
              >
                {track.clips.map((clip) => {
                  const selected = clip.id === selectedId;
                  return (
                    <div
                      key={clip.id}
                      onPointerDown={(e) => startClipDrag(e, clip, "move")}
                      style={{
                        left: clip.start * pxPerSec,
                        width: Math.max(8, clip.duration * pxPerSec),
                        top: 6,
                        height: ROW_H - 12,
                      }}
                      className={`absolute rounded-md border cursor-grab active:cursor-grabbing overflow-hidden ${
                        CLIP_COLOR[clip.type]
                      } ${selected ? "ring-2 ring-white" : ""}`}
                    >
                      <div className="px-2 py-1 text-[10px] text-white/90 truncate pointer-events-none">
                        {clip.type === "text" ? "Tekst" : clip.type}
                      </div>
                      {/* Trim-handles */}
                      <div
                        onPointerDown={(e) => startClipDrag(e, clip, "trim-l")}
                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/20 hover:bg-black/40"
                      />
                      <div
                        onPointerDown={(e) => startClipDrag(e, clip, "trim-r")}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/20 hover:bg-black/40"
                      />
                      {clip.keyframes?.map((k, i) => (
                        <div
                          key={i}
                          className="absolute bottom-0.5 w-1.5 h-1.5 rotate-45 bg-white/80 pointer-events-none"
                          style={{ left: k.time * pxPerSec - 3 }}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}

            <Playhead store={store} />
          </div>
        </div>
      </div>
    </section>
  );
}
