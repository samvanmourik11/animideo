"use client";

import { useMemo, useState } from "react";
import type { Project, PlaygroundNode } from "@/lib/types";

const VARIATION_INSTRUCTION =
  "Genereer een nieuwe variatie van dit beeld: behoud het onderwerp, de compositie en de stijl, maar varieer subtiel in details, belichting en sfeer.";

const toolBtn =
  "text-xs font-medium px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 " +
  "hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

type Action = "" | "edit" | "vary" | "upscale" | "pin";

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
  const [action, setAction] = useState<Action>("");

  const [activeIngredients, setActiveIngredients] = useState<Set<string>>(
    () => new Set(initialNodes.filter((n) => n.meta?.is_ingredient === true).map((n) => n.id))
  );

  const aspectClass = project.format === "9:16" ? "aspect-[9/16]" : "aspect-video";

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const focused = focusId ? byId.get(focusId) ?? null : null;
  const focusedPinned = focused?.meta?.is_ingredient === true;

  const ingredients = useMemo(
    () => nodes.filter((n) => n.meta?.is_ingredient === true && n.image_url),
    [nodes]
  );

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

  function addNode(node: PlaygroundNode, focusIt = true) {
    setNodes((prev) => [...prev, node]);
    if (focusIt) {
      setFocusId(node.id);
      setInstruction("");
    }
  }

  function errText(data: { error?: string }, fallback: string) {
    if (data.error === "insufficient_credits") return "Je hebt geen credits meer.";
    return data.error ?? fallback;
  }

  async function generate() {
    const p = prompt.trim();
    if (p.length < 2 || generating) return;
    setError("");
    setGenerating(true);
    try {
      const ingredientUrls = ingredients
        .filter((n) => activeIngredients.has(n.id))
        .map((n) => n.image_url);
      const res = await fetch("/api/playground/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          prompt: p,
          format: project.format,
          ingredientUrls,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errText(data, "Genereren mislukt."));
        return;
      }
      setPrompt("");
      addNode(data.node);
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setGenerating(false);
    }
  }

  async function runEdit(instructionText: string, label?: string, kind: Action = "edit") {
    if (!focused || action) return;
    setError("");
    setAction(kind);
    try {
      const res = await fetch("/api/playground/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          parentNodeId: focused.id,
          instruction: instructionText,
          label,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errText(data, "Bewerken mislukt."));
        return;
      }
      addNode(data.node);
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setAction("");
    }
  }

  async function applyEdit() {
    const ins = instruction.trim();
    if (ins.length < 2) return;
    await runEdit(ins);
  }

  async function upscale() {
    if (!focused || action) return;
    setError("");
    setAction("upscale");
    try {
      const res = await fetch("/api/playground/upscale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, nodeId: focused.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errText(data, "Upscalen mislukt."));
        return;
      }
      addNode(data.node);
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setAction("");
    }
  }

  async function togglePin() {
    if (!focused || action) return;
    const next = !focusedPinned;
    setError("");
    setAction("pin");
    try {
      const res = await fetch("/api/playground/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, nodeId: focused.id, pinned: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errText(data, "Opslaan mislukt."));
        return;
      }
      setNodes((prev) => prev.map((n) => (n.id === data.node.id ? data.node : n)));
      setActiveIngredients((prev) => {
        const s = new Set(prev);
        if (next) s.add(data.node.id);
        else s.delete(data.node.id);
        return s;
      });
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setAction("");
    }
  }

  // Nieuwste bovenaan op het canvas.
  const canvasNodes = useMemo(() => [...nodes].reverse(), [nodes]);

  return (
    <div className="pb-40">
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
              className={`group relative ${aspectClass} rounded-xl overflow-hidden border transition-colors ${
                n.meta?.is_ingredient === true
                  ? "border-amber-500/40 hover:border-amber-400/60"
                  : "border-white/10 hover:border-blue-500/40"
              }`}
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
              {n.meta?.is_ingredient === true && (
                <span className="absolute top-1.5 right-1.5 text-[10px] bg-black/60 text-amber-300 px-1.5 py-0.5 rounded-full">
                  ingrediënt
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
          {/* Ingrediënten-strip */}
          {ingredients.length > 0 && (
            <div className="mb-2">
              <p className="text-[11px] text-slate-500 mb-1">
                Ingrediënten, meegenomen bij genereren. Klik om aan of uit te zetten.
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {ingredients.map((n) => {
                  const on = activeIngredients.has(n.id);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() =>
                        setActiveIngredients((prev) => {
                          const s = new Set(prev);
                          if (on) s.delete(n.id);
                          else s.add(n.id);
                          return s;
                        })
                      }
                      className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                        on ? "border-amber-400 opacity-100" : "border-white/10 opacity-40"
                      }`}
                      title={n.prompt ?? "ingrediënt"}
                    >
                      {n.image_url && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={n.image_url} alt="" className="w-full h-full object-cover" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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

      {/* Focus-overlay: groot beeld + gereedschap + geschiedenis */}
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
            {/* Beeld + gereedschap + instructie */}
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

              {/* Gereedschap */}
              <div className="shrink-0 flex flex-wrap gap-2">
                <button type="button" onClick={() => runEdit(VARIATION_INSTRUCTION, "Variatie", "vary")} disabled={!!action} className={toolBtn}>
                  {action === "vary" ? "Variant maken…" : "✦ Variant"}
                </button>
                <button type="button" onClick={upscale} disabled={!!action} className={toolBtn}>
                  {action === "upscale" ? "Upscalen…" : "⤢ Upscale 2x"}
                </button>
                <button
                  type="button"
                  onClick={togglePin}
                  disabled={!!action}
                  className={
                    focusedPinned
                      ? toolBtn + " border-amber-500/40 text-amber-300"
                      : toolBtn
                  }
                >
                  {action === "pin"
                    ? "Bezig…"
                    : focusedPinned
                    ? "★ Ingrediënt, losmaken"
                    : "☆ Pin als ingrediënt"}
                </button>
              </div>

              {/* Instructie */}
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
                    disabled={!!action || instruction.trim().length < 2}
                    className="btn-primary shrink-0"
                  >
                    {action === "edit" ? "Bezig…" : "Pas aan"}
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
