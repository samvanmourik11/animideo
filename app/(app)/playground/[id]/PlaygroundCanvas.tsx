"use client";

import { useMemo, useState } from "react";
import type { Project, PlaygroundNode } from "@/lib/types";

export default function PlaygroundCanvas({
  project,
  initialNodes,
}: {
  project: Project;
  initialNodes: PlaygroundNode[];
}) {
  const [nodes, setNodes] = useState<PlaygroundNode[]>(initialNodes);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const [focusId, setFocusId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [editing, setEditing] = useState(false);

  const aspectClass = project.format === "9:16" ? "aspect-[9/16]" : "aspect-video";

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const focused = focusId ? byId.get(focusId) ?? null : null;

  // Keten van voorouders (root eerst) van de gefocuste node.
  const ancestors = useMemo(() => {
    if (!focused) return [] as PlaygroundNode[];
    const chain: PlaygroundNode[] = [];
    let cur = focused.parent_id;
    while (cur) {
      const n = byId.get(cur);
      if (!n) break;
      chain.unshift(n);
      cur = n.parent_id;
    }
    return chain;
  }, [focused, byId]);

  const children = useMemo(
    () => (focused ? nodes.filter((n) => n.parent_id === focused.id) : []),
    [focused, nodes]
  );

  async function generate() {
    const p = prompt.trim();
    if (p.length < 2 || generating) return;
    setError("");
    setGenerating(true);
    try {
      const res = await fetch("/api/playground/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, prompt: p, format: project.format }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "insufficient_credits"
            ? "Je hebt geen credits meer."
            : data.error ?? "Genereren mislukt."
        );
        return;
      }
      setNodes((prev) => [...prev, data.node]);
      setPrompt("");
      setFocusId(data.node.id);
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setGenerating(false);
    }
  }

  async function applyEdit() {
    const ins = instruction.trim();
    if (!focused || ins.length < 2 || editing) return;
    setError("");
    setEditing(true);
    try {
      const res = await fetch("/api/playground/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          parentNodeId: focused.id,
          instruction: ins,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "insufficient_credits"
            ? "Je hebt geen credits meer."
            : data.error ?? "Bewerken mislukt."
        );
        return;
      }
      setNodes((prev) => [...prev, data.node]);
      setInstruction("");
      setFocusId(data.node.id);
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setEditing(false);
    }
  }

  // Nieuwste bovenaan op het canvas.
  const canvasNodes = useMemo(() => [...nodes].reverse(), [nodes]);

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">Playground</h1>
          <span className="text-xs bg-white/[0.06] text-slate-400 border border-white/10 px-2 py-0.5 rounded-full">
            {project.format}
          </span>
        </div>
        {project.notes && (
          <p className="text-sm text-slate-500 mt-1">
            <span className="text-slate-600">Brief:</span> {project.notes}
          </p>
        )}
      </div>

      {/* Canvas */}
      {canvasNodes.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-4xl mb-3">✨</div>
          <p className="text-slate-300 font-medium">Begin met een prompt</p>
          <p className="text-slate-500 text-sm mt-1">
            Typ hieronder wat je wilt zien. Daarna klik je op een beeld om het bij te sturen.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {canvasNodes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                setFocusId(n.id);
                setInstruction("");
              }}
              className={`group relative ${aspectClass} rounded-xl overflow-hidden border border-white/10 hover:border-blue-500/40 transition-colors`}
            >
              {n.image_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={n.image_url}
                  alt={n.prompt ?? "beeld"}
                  className="w-full h-full object-cover"
                />
              )}
              {n.parent_id && (
                <span className="absolute top-1.5 left-1.5 text-[10px] bg-black/60 text-blue-300 px-1.5 py-0.5 rounded-full">
                  bewerking
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 p-2 text-[11px] text-white/90 bg-gradient-to-t from-black/80 to-transparent text-left opacity-0 group-hover:opacity-100 transition-opacity line-clamp-2">
                {n.prompt}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Prompt-balk */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-[#060d1f]/95 backdrop-blur border-t border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5 mb-2">
              {error}
            </p>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              className="input flex-1 min-h-[44px] max-h-32 resize-none py-2.5"
              placeholder="Beschrijf een beeld dat je wilt maken…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  generate();
                }
              }}
              rows={1}
            />
            <button
              type="button"
              onClick={generate}
              disabled={generating || prompt.trim().length < 2}
              className="btn-primary shrink-0"
            >
              {generating ? "Genereren…" : "Genereer"}
            </button>
          </div>
        </div>
      </div>

      {/* Focus-overlay: groot beeld + bijsturen + geschiedenis */}
      {focused && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col">
          <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-white/10">
            <span className="text-sm text-slate-400">Beeld bijsturen</span>
            <button
              type="button"
              onClick={() => setFocusId(null)}
              className="text-slate-400 hover:text-white text-sm"
            >
              Sluiten ✕
            </button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            {/* Beeld + instructie */}
            <div className="flex-1 min-h-0 flex flex-col p-4 gap-3">
              <div className="flex-1 min-h-0 flex items-center justify-center">
                {focused.image_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={focused.image_url}
                    alt={focused.prompt ?? "beeld"}
                    className="max-h-full max-w-full object-contain rounded-xl"
                  />
                )}
              </div>
              <div className="shrink-0">
                <div className="flex gap-2 items-end">
                  <textarea
                    className="input flex-1 min-h-[44px] max-h-28 resize-none py-2.5"
                    placeholder="Wat wil je veranderen? Bijv. maak het paard wit"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        applyEdit();
                      }
                    }}
                    rows={1}
                  />
                  <button
                    type="button"
                    onClick={applyEdit}
                    disabled={editing || instruction.trim().length < 2}
                    className="btn-primary shrink-0"
                  >
                    {editing ? "Bezig…" : "Pas aan"}
                  </button>
                </div>
                <div className="flex items-center gap-4 mt-2">
                  {focused.image_url && (
                    <a
                      href={focused.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-500 hover:text-slate-300"
                    >
                      Download
                    </a>
                  )}
                  {focused.prompt && (
                    <span className="text-xs text-slate-600 truncate">{focused.prompt}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Geschiedenis-rail */}
            <div className="md:w-56 shrink-0 border-t md:border-t-0 md:border-l border-white/10 overflow-y-auto p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Geschiedenis
              </p>
              <div className="space-y-1.5">
                {[...ancestors, focused].map((n, i) => (
                  <HistoryThumb
                    key={n.id}
                    node={n}
                    active={n.id === focused.id}
                    label={i === 0 && !n.parent_id ? "start" : undefined}
                    onClick={() => {
                      setFocusId(n.id);
                      setInstruction("");
                    }}
                  />
                ))}
              </div>

              {children.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-2">
                    Varianten hieruit
                  </p>
                  <div className="space-y-1.5">
                    {children.map((n) => (
                      <HistoryThumb
                        key={n.id}
                        node={n}
                        active={false}
                        onClick={() => {
                          setFocusId(n.id);
                          setInstruction("");
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryThumb({
  node,
  active,
  label,
  onClick,
}: {
  node: PlaygroundNode;
  active: boolean;
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex gap-2 w-full text-left rounded-lg p-1.5 border transition-colors ${
        active
          ? "bg-blue-500/10 border-blue-500/30"
          : "border-transparent hover:bg-white/[0.04]"
      }`}
    >
      {node.image_url && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={node.image_url}
          alt=""
          className="w-12 h-12 object-cover rounded-md shrink-0"
        />
      )}
      <span className="text-[11px] text-slate-400 line-clamp-3 leading-tight">
        {label ? <span className="text-slate-600">{label}: </span> : null}
        {node.prompt}
      </span>
    </button>
  );
}
