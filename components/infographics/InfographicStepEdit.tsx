"use client";

import { useMemo, useState } from "react";
import { Project, InfographicSpec, InfographicBlock } from "@/lib/types";
import { canvasSize } from "@/lib/infographics/canvas-size";
import { buildScenes, type VideoScene } from "@/lib/infographics/video";
import InfographicDefs from "./render/defs";
import SceneView from "./render/SceneView";

function clone(spec: InfographicSpec): InfographicSpec {
  return JSON.parse(JSON.stringify(spec));
}

const labelCls = "block text-[11px] font-medium text-slate-400 mb-1";
const inputCls = "w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white";

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </label>
  );
}

// Rendert één losse scene als <svg> — zelfde opbouw als InfographicVideo, maar op
// het eindframe (progress=1). Gebruikt voor de thumbnails links én de grote preview.
function ScenePreview({ spec, scene, className, style }: { spec: InfographicSpec; scene: VideoScene; className?: string; style?: React.CSSProperties }) {
  const { width, height } = canvasSize(spec.format);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ display: "block", width: "100%", height: "100%", ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <InfographicDefs theme={spec.theme} />
      <rect x={0} y={0} width={width} height={height} fill={spec.theme.background} />
      <SceneView spec={spec} scene={scene} progress={1} />
    </svg>
  );
}

// Stabiele selectie: blokken via hun id (overleeft herordenen), intro/outro vast.
type Sel = { kind: "intro" } | { kind: "outro" } | { kind: "block"; id: string };
function sceneKey(spec: InfographicSpec, scene: VideoScene): Sel {
  if (scene.kind === "intro") return { kind: "intro" };
  if (scene.kind === "outro") return { kind: "outro" };
  return { kind: "block", id: spec.blocks[scene.blockIndex].id };
}
function keyEq(a: Sel, b: Sel): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "block" && b.kind === "block") return a.id === b.id;
  return true;
}

export default function InfographicStepEdit({
  project,
  onUpdate,
  onBack,
  onNext,
}: {
  project: Project;
  onUpdate: (u: Partial<Project>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const spec = project.infographic_spec!;
  const aspect = useMemo(() => (spec.format === "16:9" ? "16 / 9" : "1080 / 1350"), [spec.format]);
  const scenes = useMemo(() => buildScenes(spec), [spec]);

  const [sel, setSel] = useState<Sel>({ kind: "intro" });
  const selectedScene = scenes.find((s) => keyEq(sceneKey(spec, s), sel)) ?? scenes[0];

  function patch(mut: (s: InfographicSpec) => void) {
    const next = clone(spec);
    mut(next);
    onUpdate({ infographic_spec: next });
  }

  function moveBlock(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= spec.blocks.length) return;
    patch((s) => {
      const [b] = s.blocks.splice(i, 1);
      s.blocks.splice(j, 0, b);
    });
  }

  function deleteBlock(i: number) {
    const removedId = spec.blocks[i].id;
    patch((s) => s.blocks.splice(i, 1));
    if (sel.kind === "block" && sel.id === removedId) setSel({ kind: "intro" });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
      {/* ── Links: scene-lijst ─────────────────────────────────────── */}
      <aside className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">Scenes</h3>
        <div className="space-y-2">
          {scenes.map((scene) => {
            const key = sceneKey(spec, scene);
            const active = keyEq(key, sel);
            const isBlock = scene.kind === "block";
            const bi = scene.kind === "block" ? scene.blockIndex : -1;
            return (
              <div
                key={scene.kind === "block" ? `b-${spec.blocks[scene.blockIndex].id}` : scene.kind}
                onClick={() => setSel(key)}
                className={`group cursor-pointer rounded-lg border p-2 transition ${
                  active ? "border-blue-500 bg-blue-500/10" : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 w-4 shrink-0">{sceneNumber(scenes, scene)}</span>
                  <div className="rounded overflow-hidden border border-white/10 bg-black/30 shrink-0" style={{ width: 72, aspectRatio: aspect }}>
                    <ScenePreview spec={spec} scene={scene} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-medium truncate ${active ? "text-white" : "text-slate-300"}`}>{sceneLabel(spec, scene)}</p>
                    <p className="text-[10px] text-slate-500">{sceneKindLabel(scene)}</p>
                  </div>
                  {isBlock && (
                    <div className="flex flex-col opacity-0 group-hover:opacity-100 transition" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => moveBlock(bi, -1)} disabled={bi === 0} className="text-slate-400 hover:text-white disabled:opacity-30 leading-none text-xs">↑</button>
                      <button onClick={() => moveBlock(bi, 1)} disabled={bi === spec.blocks.length - 1} className="text-slate-400 hover:text-white disabled:opacity-30 leading-none text-xs">↓</button>
                    </div>
                  )}
                  {isBlock && (
                    <button onClick={(e) => { e.stopPropagation(); deleteBlock(bi); }} className="text-red-400/60 hover:text-red-400 opacity-0 group-hover:opacity-100 transition px-1">✕</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Rechts: preview + editor van de geselecteerde scene ──────── */}
      <div className="space-y-4">
        <div className="rounded-xl overflow-hidden border border-white/10 bg-black/20" style={{ aspectRatio: aspect }}>
          <ScenePreview spec={spec} scene={selectedScene} />
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">{sceneLabel(spec, selectedScene)}</h3>
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">{sceneKindLabel(selectedScene)}</span>
          </div>

          {selectedScene.kind === "intro" && (
            <div className="space-y-3">
              <TextInput label="Titel" value={spec.title} onChange={(v) => patch((s) => { s.title = v; })} />
              <TextInput label="Subtitel" value={spec.subtitle ?? ""} onChange={(v) => patch((s) => { s.subtitle = v || undefined; })} />
              <div>
                <span className={labelCls}>Kleuren</span>
                <div className="grid grid-cols-5 gap-2">
                  {(["primary", "secondary", "accent", "background", "textColor"] as const).map((k) => (
                    <label key={k} className="flex flex-col items-center gap-1">
                      <span className="text-[10px] text-slate-400 capitalize">{k === "textColor" ? "tekst" : k === "background" ? "achtergr." : k}</span>
                      <input
                        type="color"
                        value={spec.theme[k]}
                        onChange={(e) => patch((s) => { s.theme[k] = e.target.value; })}
                        className="w-9 h-9 rounded border border-white/10 bg-transparent cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {selectedScene.kind === "outro" && (
            <div className="space-y-3">
              <TextInput label="Bron (footer)" value={spec.source ?? ""} onChange={(v) => patch((s) => { s.source = v || undefined; })} />
              <p className="text-[11px] text-slate-500">De outro toont de titel{spec.source ? " en bron" : ""}{spec.logoUrl ? " met je logo" : ""}.</p>
            </div>
          )}

          {selectedScene.kind === "block" && (
            <BlockEditor
              block={spec.blocks[selectedScene.blockIndex]}
              onPatch={(mut) => patch((s) => mut(s.blocks[(selectedScene as { blockIndex: number }).blockIndex]))}
            />
          )}
        </div>

        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-sm text-slate-400 hover:text-white">← Terug</button>
          <button onClick={onNext} className="btn-primary text-sm">Naar export →</button>
        </div>
      </div>
    </div>
  );
}

function sceneNumber(scenes: VideoScene[], scene: VideoScene): number {
  return scenes.indexOf(scene) + 1;
}

function sceneKindLabel(scene: VideoScene): string {
  if (scene.kind === "intro") return "Intro";
  if (scene.kind === "outro") return "Outro";
  return "Scene";
}

function sceneLabel(spec: InfographicSpec, scene: VideoScene): string {
  if (scene.kind === "intro") return spec.title || "Intro";
  if (scene.kind === "outro") return "Afsluiting";
  return blockLabel(spec.blocks[scene.blockIndex]);
}

function blockLabel(b: InfographicBlock): string {
  const map: Record<InfographicBlock["type"], string> = {
    stat: "Kerncijfers",
    barChart: "Staafdiagram",
    pieChart: "Cirkeldiagram",
    lineChart: "Lijndiagram",
    process: "Proces / stappen",
    comparison: "Vergelijking",
    list: "Lijst",
  };
  return map[b.type];
}

// Per-block veldeditor. `onPatch` krijgt een mutator die op het block-object werkt.
function BlockEditor({ block, onPatch }: { block: InfographicBlock; onPatch: (mut: (b: InfographicBlock) => void) => void }) {
  const set = (mut: (b: InfographicBlock) => void) => onPatch(mut);

  const titleField =
    "title" in block ? (
      <TextInput label="Kop" value={block.title ?? ""} onChange={(v) => set((b) => { (b as { title?: string }).title = v || undefined; })} />
    ) : null;

  switch (block.type) {
    case "stat":
      return (
        <div className="space-y-2">
          {block.items.map((it, k) => (
            <div key={k} className="grid grid-cols-2 gap-2">
              <TextInput label="Waarde" value={it.value} onChange={(v) => set((b) => { (b as typeof block).items[k].value = v; })} />
              <TextInput label="Label" value={it.label} onChange={(v) => set((b) => { (b as typeof block).items[k].label = v; })} />
            </div>
          ))}
        </div>
      );
    case "barChart":
    case "lineChart":
    case "pieChart":
      return (
        <div className="space-y-2">
          {titleField}
          {block.data.map((d, k) => (
            <div key={k} className="grid grid-cols-[1fr_90px] gap-2">
              <TextInput label="Label" value={d.label} onChange={(v) => set((b) => { (b as typeof block).data[k].label = v; })} />
              <label className="block">
                <span className={labelCls}>Waarde</span>
                <input
                  type="number"
                  value={d.value}
                  onChange={(e) => set((b) => { (b as typeof block).data[k].value = Number(e.target.value); })}
                  className={inputCls}
                />
              </label>
            </div>
          ))}
        </div>
      );
    case "process":
      return (
        <div className="space-y-2">
          {titleField}
          {block.steps.map((st, k) => (
            <div key={k} className="space-y-1">
              <TextInput label={`Stap ${k + 1}`} value={st.label} onChange={(v) => set((b) => { (b as typeof block).steps[k].label = v; })} />
              <TextInput label="Toelichting" value={st.description ?? ""} onChange={(v) => set((b) => { (b as typeof block).steps[k].description = v || undefined; })} />
            </div>
          ))}
        </div>
      );
    case "comparison":
      return (
        <div className="space-y-2">
          {titleField}
          <div className="grid grid-cols-2 gap-2">
            <TextInput label="Kolom A" value={block.columns[0]} onChange={(v) => set((b) => { (b as typeof block).columns[0] = v; })} />
            <TextInput label="Kolom B" value={block.columns[1]} onChange={(v) => set((b) => { (b as typeof block).columns[1] = v; })} />
          </div>
          {block.rows.map((r, k) => (
            <div key={k} className="grid grid-cols-3 gap-2">
              <TextInput label="Rij" value={r.label} onChange={(v) => set((b) => { (b as typeof block).rows[k].label = v; })} />
              <TextInput label="A" value={r.left} onChange={(v) => set((b) => { (b as typeof block).rows[k].left = v; })} />
              <TextInput label="B" value={r.right} onChange={(v) => set((b) => { (b as typeof block).rows[k].right = v; })} />
            </div>
          ))}
        </div>
      );
    case "list":
      return (
        <div className="space-y-2">
          {titleField}
          {block.items.map((it, k) => (
            <TextInput key={k} label={`Punt ${k + 1}`} value={it.text} onChange={(v) => set((b) => { (b as typeof block).items[k].text = v; })} />
          ))}
        </div>
      );
    default:
      return null;
  }
}
