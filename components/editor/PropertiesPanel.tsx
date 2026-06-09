"use client";

import {
  DEFAULT_TRANSFORM,
  keyframeValueAt,
  NEUTRAL_EFFECT,
  staticValue,
  type AnimationPreset,
  type KeyframeProperty,
  type TextStyle,
} from "@/lib/editor/timeline";

const ADJUSTMENTS = [
  { kind: "brightness", label: "Helderheid", min: 0, max: 2, step: 0.01 },
  { kind: "contrast", label: "Contrast", min: 0, max: 1, step: 0.01 },
  { kind: "saturation", label: "Verzadiging", min: -1, max: 1, step: 0.01 },
  { kind: "blur", label: "Blur", min: 0, max: 20, step: 0.5 },
] as const;
import { useEditor, type EditorStore } from "@/lib/editor/store";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}

const numCls =
  "w-full bg-[#060d1f] border border-white/10 rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500/50";

export default function PropertiesPanel({ store }: { store: EditorStore }) {
  const selectedId = useEditor(store, (s) => s.selectedClipId);
  const doc = useEditor(store, (s) => s.doc);
  const currentTime = useEditor(store, (s) => s.currentTime);
  const clip = store.find(selectedId);
  const track = doc.tracks.find((t) => t.clips.some((c) => c.id === selectedId));

  const isVisual = clip && (clip.type === "video" || clip.type === "image" || clip.type === "text");

  // Keyframe-ruitje: gevuld = keyframe op de playhead, omlijnd = geanimeerd.
  function Diamond({ property }: { property: KeyframeProperty }) {
    if (!clip) return null;
    const atKf = store.keyframeAtPlayhead(clip.id, property);
    const animated = store.isAnimated(clip.id, property);
    return (
      <button
        onClick={() => store.toggleKeyframe(clip.id, property)}
        title="Keyframe op de playhead aan/uit"
        className={`w-2.5 h-2.5 rotate-45 shrink-0 ${
          atKf ? "bg-blue-400" : animated ? "border border-blue-400" : "border border-slate-600"
        }`}
      />
    );
  }

  // Geanimeerd numeriek veld (toont effectieve waarde op de playhead).
  function AnimField({
    property,
    label,
    pct,
  }: {
    property: KeyframeProperty;
    label: string;
    pct: boolean;
  }) {
    if (!clip) return null;
    const val = keyframeValueAt(
      clip,
      property,
      currentTime - clip.start,
      staticValue(clip, property)
    );
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-1">
          <label className="text-[11px] text-slate-500 truncate">{label}</label>
          <Diamond property={property} />
        </div>
        <input
          type="number"
          className={numCls}
          value={pct ? Math.round(val * 100) : Math.round(val)}
          onChange={(e) =>
            store.setAnimatable(
              clip.id,
              property,
              pct ? Number(e.target.value) / 100 : Number(e.target.value)
            )
          }
        />
      </div>
    );
  }

  return (
    <aside className="w-64 border-l border-white/10 shrink-0 hidden lg:flex flex-col">
      <div className="px-3 h-9 flex items-center text-xs font-medium text-slate-400 border-b border-white/10">
        Eigenschappen
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {!clip ? (
          <p className="text-xs text-slate-600">Selecteer een clip om te bewerken.</p>
        ) : (
          <>
            <div className="text-xs text-slate-400 capitalize">{clip.type}</div>

            {clip.type === "text" && (
              <div className="space-y-3">
                <Row label="Tekst">
                  <textarea
                    rows={2}
                    className={`${numCls} resize-none`}
                    value={clip.text}
                    onChange={(e) => store.updateClip(clip.id, { text: e.target.value })}
                  />
                </Row>
                <div className="grid grid-cols-2 gap-2">
                  <Row label="Grootte">
                    <input
                      type="number"
                      className={numCls}
                      value={clip.style.fontSize}
                      onChange={(e) =>
                        store.setTextStyle(clip.id, { fontSize: Number(e.target.value) })
                      }
                    />
                  </Row>
                  <Row label="Kleur">
                    <input
                      type="color"
                      className="w-full h-8 bg-transparent rounded"
                      value={clip.style.color}
                      onChange={(e) =>
                        store.setTextStyle(clip.id, { color: e.target.value })
                      }
                    />
                  </Row>
                </div>
                <Row label="Lettertype">
                  <select
                    className={numCls}
                    value={clip.style.fontFamily}
                    onChange={(e) =>
                      store.setTextStyle(clip.id, { fontFamily: e.target.value })
                    }
                  >
                    <option value="sans-serif">Sans</option>
                    <option value="Georgia, serif">Serif</option>
                    <option value="Impact, sans-serif">Impact</option>
                    <option value="monospace">Mono</option>
                  </select>
                </Row>
                <div className="grid grid-cols-2 gap-2">
                  <Row label="Dikte">
                    <select
                      className={numCls}
                      value={clip.style.fontWeight}
                      onChange={(e) =>
                        store.setTextStyle(clip.id, { fontWeight: Number(e.target.value) })
                      }
                    >
                      <option value={400}>Normaal</option>
                      <option value={700}>Vet</option>
                      <option value={900}>Extra vet</option>
                    </select>
                  </Row>
                  <Row label="Uitlijning">
                    <select
                      className={numCls}
                      value={clip.style.align}
                      onChange={(e) =>
                        store.setTextStyle(clip.id, {
                          align: e.target.value as TextStyle["align"],
                        })
                      }
                    >
                      <option value="left">Links</option>
                      <option value="center">Midden</option>
                      <option value="right">Rechts</option>
                    </select>
                  </Row>
                </div>
                <Row label={`Rand: ${clip.style.stroke?.width ?? 0}`}>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={clip.style.stroke?.width ?? 0}
                    onChange={(e) =>
                      store.setTextStyle(clip.id, {
                        stroke: {
                          color: clip.style.stroke?.color ?? "#000000",
                          width: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full"
                  />
                </Row>
                <Row label="Animatie">
                  <select
                    className={numCls}
                    value={clip.preset ?? "none"}
                    onChange={(e) =>
                      store.updateClip(clip.id, {
                        preset: e.target.value as AnimationPreset,
                      })
                    }
                  >
                    <option value="none">Geen</option>
                    <option value="fade-in">Infaden</option>
                    <option value="pop">Pop</option>
                    <option value="slide-up">Omhoog schuiven</option>
                    <option value="typewriter">Typemachine</option>
                    <option value="word-by-word">Woord voor woord</option>
                  </select>
                </Row>
              </div>
            )}

            <Row label={`Duur: ${clip.duration.toFixed(1)}s`}>
              <input
                type="range"
                min={0.2}
                max={30}
                step={0.1}
                value={clip.duration}
                onChange={(e) => store.trimEnd(clip.id, Number(e.target.value))}
                className="w-full"
              />
            </Row>

            {isVisual && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <AnimField property="x" label="Positie X %" pct />
                  <AnimField property="y" label="Positie Y %" pct />
                  {clip.type !== "text" && (
                    <AnimField property="scale" label="Schaal %" pct />
                  )}
                  <AnimField property="rotation" label="Rotatie °" pct={false} />
                </div>
                <p className="text-[10px] text-slate-600">
                  Klik op een ruitje om die eigenschap te animeren met keyframes.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      store.setAnimatable(clip.id, "x", 0.5);
                      store.setAnimatable(clip.id, "y", 0.5);
                    }}
                    className="btn-secondary text-[11px] py-1 px-2 flex-1"
                  >
                    Centreren
                  </button>
                  <button
                    onClick={() => store.setTransform(clip.id, DEFAULT_TRANSFORM)}
                    className="btn-secondary text-[11px] py-1 px-2 flex-1"
                  >
                    Reset
                  </button>
                </div>
              </>
            )}

            {(() => {
              const opVal = keyframeValueAt(
                clip,
                "opacity",
                currentTime - clip.start,
                clip.opacity ?? 1
              );
              return (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <label className="text-[11px] text-slate-500">
                      Transparantie: {Math.round(opVal * 100)}%
                    </label>
                    <Diamond property="opacity" />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={opVal}
                    onChange={(e) =>
                      store.setAnimatable(clip.id, "opacity", Number(e.target.value))
                    }
                    className="w-full"
                  />
                </div>
              );
            })()}

            {(clip.type === "video" || clip.type === "audio") && (
              <Row label={`Volume: ${Math.round((clip.volume ?? 1) * 100)}%`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={clip.volume ?? 1}
                  onChange={(e) =>
                    store.updateClip(clip.id, { volume: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </Row>
            )}

            {isVisual && (
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="text-[11px] font-medium text-slate-500">Aanpassingen</div>
                {ADJUSTMENTS.map((f) => {
                  const val =
                    clip.effects?.find((e) => e.kind === f.kind)?.amount ??
                    NEUTRAL_EFFECT[f.kind];
                  return (
                    <Row key={f.kind} label={`${f.label}: ${val}`}>
                      <input
                        type="range"
                        min={f.min}
                        max={f.max}
                        step={f.step}
                        value={val}
                        onChange={(e) =>
                          store.setEffect(clip.id, f.kind, Number(e.target.value))
                        }
                        className="w-full"
                      />
                    </Row>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
              <Row label={`Fade in: ${(clip.fadeIn ?? 0).toFixed(1)}s`}>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={clip.fadeIn ?? 0}
                  onChange={(e) =>
                    store.updateClip(clip.id, { fadeIn: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </Row>
              <Row label={`Fade uit: ${(clip.fadeOut ?? 0).toFixed(1)}s`}>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={clip.fadeOut ?? 0}
                  onChange={(e) =>
                    store.updateClip(clip.id, { fadeOut: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </Row>
            </div>

            {clip.type === "video" && (
              <Row label={`Snelheid: ${(clip.speed ?? 1).toFixed(2)}x`}>
                <input
                  type="range"
                  min={0.25}
                  max={3}
                  step={0.05}
                  value={clip.speed ?? 1}
                  onChange={(e) =>
                    store.updateClip(clip.id, { speed: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </Row>
            )}

            {isVisual && (
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="text-[11px] font-medium text-slate-500">
                  Laag: {track?.name ?? "—"}
                </div>
                <button
                  onClick={() => store.clipToNewLayer(clip.id)}
                  className="btn-secondary text-[11px] py-1 px-2 w-full"
                >
                  Naar nieuwe laag
                </button>
                <p className="text-[10px] text-slate-600">
                  Of sleep de clip omhoog/omlaag in de timeline om te stapelen.
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => store.duplicateClip(clip.id)}
                className="btn-secondary text-xs py-1.5 px-3 flex-1"
              >
                Dupliceren
              </button>
              <button
                onClick={() => store.removeClip(clip.id)}
                className="btn-secondary text-xs py-1.5 px-3 flex-1 text-red-300 hover:text-red-200"
              >
                Verwijderen
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
