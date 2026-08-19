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
          className={`text-[12px] ${saveState === "error" ? "text-red-600" : "text-slate-500"}`}
        >
          {saveLabel}
        </span>
      )}
      <button
        onClick={() => store.togglePlay()}
        className="text-[14px] py-2 px-4 w-24 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
      >
        {isPlaying ? "Pauze" : "Afspelen"}
      </button>
      <span className="text-[13px] tabular-nums text-slate-500 w-24 text-center">
        {fmt(currentTime)} / {fmt(duration)}
      </span>
    </div>
  );
}
