"use client";

import { computeDuration } from "@/lib/editor/timeline";
import { useEditor, type EditorStore } from "@/lib/editor/store";

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${d}`;
}

export default function Transport({ store }: { store: EditorStore }) {
  const isPlaying = useEditor(store, (s) => s.isPlaying);
  const currentTime = useEditor(store, (s) => s.currentTime);
  const doc = useEditor(store, (s) => s.doc);
  const saveState = useEditor(store, (s) => s.saveState);
  const duration = computeDuration(doc);

  const saveLabel =
    saveState === "saving"
      ? "Opslaan..."
      : saveState === "saved"
        ? "Opgeslagen"
        : saveState === "error"
          ? "Opslaan mislukt"
          : "";

  return (
    <div className="flex items-center gap-3">
      {saveLabel && (
        <span
          className={`text-xs ${saveState === "error" ? "text-red-400" : "text-slate-500"}`}
        >
          {saveLabel}
        </span>
      )}
      <button
        onClick={() => store.togglePlay()}
        className="btn-secondary text-sm py-1.5 px-4 w-20"
      >
        {isPlaying ? "Pauze" : "Afspelen"}
      </button>
      <span className="text-xs tabular-nums text-slate-400 w-24 text-center">
        {fmt(currentTime)} / {fmt(duration)}
      </span>
    </div>
  );
}
