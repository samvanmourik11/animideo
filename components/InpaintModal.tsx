"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  sourceImageUrl: string;
  projectId: string;
  sceneId: string;
  onClose: () => void;
  onSuccess: (newImageUrl: string) => void;
  onInsufficientCredits: (credits: number, required: number) => void;
}

type Stroke = { x: number; y: number; size: number }[];

export default function InpaintModal({
  sourceImageUrl,
  projectId,
  sceneId,
  onClose,
  onSuccess,
  onInsufficientCredits,
}: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [brushSize, setBrushSize] = useState(40);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  // Source image laden om natural dimensions te krijgen
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setError("Bron-afbeelding kon niet geladen worden");
    img.src = sourceImageUrl;
    imgRef.current = img;
  }, [sourceImageUrl]);

  // Overlay canvas redraw bij strokes of resize
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(59, 130, 246, 0.55)"; // blauwe overlay voor preview
    for (const stroke of [...strokes, ...(currentStroke ? [currentStroke] : [])]) {
      for (const p of stroke) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [strokes, currentStroke, naturalSize]);

  // ESC sluit modal
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !generating) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, generating]);

  function canvasCoords(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null {
    const canvas = overlayRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const point = "touches" in e ? e.touches[0] : e;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (point.clientX - rect.left) * scaleX,
      y: (point.clientY - rect.top) * scaleY,
    };
  }

  function handleDown(e: React.MouseEvent | React.TouchEvent) {
    if (generating) return;
    const p = canvasCoords(e);
    if (!p || !naturalSize) return;
    // Brush size in native pixel space — schaal vanaf screen
    const canvas = overlayRef.current!;
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    setCurrentStroke([{ ...p, size: brushSize * scale }]);
  }

  function handleMove(e: React.MouseEvent | React.TouchEvent) {
    if (!currentStroke || generating) return;
    e.preventDefault();
    const p = canvasCoords(e);
    if (!p) return;
    const canvas = overlayRef.current!;
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    setCurrentStroke([...currentStroke, { ...p, size: brushSize * scale }]);
  }

  function handleUp() {
    if (!currentStroke) return;
    setStrokes((s) => [...s, currentStroke]);
    setCurrentStroke(null);
  }

  function undo() {
    setStrokes((s) => s.slice(0, -1));
  }

  function clear() {
    setStrokes([]);
    setCurrentStroke(null);
  }

  function buildMaskDataUrl(): string | null {
    if (!naturalSize) return null;
    const mask = document.createElement("canvas");
    mask.width = naturalSize.w;
    mask.height = naturalSize.h;
    const ctx = mask.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, mask.width, mask.height);
    ctx.fillStyle = "white";
    for (const stroke of strokes) {
      for (const p of stroke) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return mask.toDataURL("image/png");
  }

  async function generate() {
    if (!prompt.trim()) { setError("Geef aan wat er in het gemaskerde gebied moet komen"); return; }
    if (strokes.length === 0) { setError("Teken eerst een masker op het gebied dat je wilt aanpassen"); return; }
    const maskDataUrl = buildMaskDataUrl();
    if (!maskDataUrl) { setError("Masker kon niet aangemaakt worden"); return; }

    setGenerating(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const res = await fetch("/api/inpaint-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          sourceImageUrl,
          maskDataUrl,
          prompt,
          projectId,
          sceneId,
        }),
      });

      let data: { imageUrl?: string; error?: string; credits?: number; required?: number } = {};
      try { data = await res.json(); } catch { throw new Error(`Server error (HTTP ${res.status})`); }

      if (res.status === 402) {
        onInsufficientCredits(data.credits ?? 0, data.required ?? 1);
        return;
      }
      if (!res.ok || !data.imageUrl) throw new Error(data.error ?? "Inpainting mislukt");

      onSuccess(data.imageUrl);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Er ging iets mis");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0a1429] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[95vh] overflow-auto shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white">Bewerk deel van afbeelding</h2>
            <p className="text-xs text-slate-400 mt-0.5">Teken over het gebied dat je wilt aanpassen en beschrijf wat er moet komen</p>
          </div>
          <button
            onClick={onClose}
            disabled={generating}
            className="text-slate-400 hover:text-white disabled:opacity-40 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Canvas met source image + overlay */}
          <div
            ref={containerRef}
            className="relative rounded-xl overflow-hidden bg-[#060d1f] border border-white/10 mx-auto"
            style={{ maxHeight: "55vh" }}
          >
            {naturalSize ? (
              <div className="relative" style={{ aspectRatio: `${naturalSize.w} / ${naturalSize.h}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sourceImageUrl}
                  alt="Bron"
                  className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
                  draggable={false}
                />
                <canvas
                  ref={overlayRef}
                  width={naturalSize.w}
                  height={naturalSize.h}
                  className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
                  onMouseDown={handleDown}
                  onMouseMove={handleMove}
                  onMouseUp={handleUp}
                  onMouseLeave={handleUp}
                  onTouchStart={handleDown}
                  onTouchMove={handleMove}
                  onTouchEnd={handleUp}
                />
              </div>
            ) : (
              <div className="aspect-video flex items-center justify-center text-slate-500 text-sm">
                Laden…
              </div>
            )}
          </div>

          {/* Tools */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              Brush
              <input
                type="range"
                min={10}
                max={150}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-32"
                disabled={generating}
              />
              <span className="w-8 text-right tabular-nums">{brushSize}</span>
            </label>
            <button
              onClick={undo}
              disabled={generating || strokes.length === 0}
              className="btn-secondary text-sm disabled:opacity-40"
            >
              ↶ Ongedaan maken
            </button>
            <button
              onClick={clear}
              disabled={generating || strokes.length === 0}
              className="btn-secondary text-sm disabled:opacity-40"
            >
              Wissen
            </button>
          </div>

          {/* Prompt */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Wat moet er in het gemaskerde gebied komen?
            </label>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="bv. een blauw shirt, een zonsondergang op de achtergrond, een kop koffie"
              className="input mt-2 text-sm"
              disabled={generating}
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} disabled={generating} className="btn-secondary">
              Annuleren
            </button>
            <button onClick={generate} disabled={generating} className="btn-primary">
              {generating ? "Genereren…" : "Genereer (1 credit)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
