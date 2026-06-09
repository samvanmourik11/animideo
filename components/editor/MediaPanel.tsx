"use client";

import { useRef, useState } from "react";
import { uploadEditorMedia } from "@/lib/editor/media";
import { useEditor, type EditorStore } from "@/lib/editor/store";

export default function MediaPanel({
  store,
  projectId,
  userId,
}: {
  store: EditorStore;
  projectId: string;
  userId: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const doc = useEditor(store, (s) => s.doc);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const clip = await uploadEditorMedia(file, projectId, userId);
        store.addClip(clip);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import mislukt");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const clips = doc.tracks.flatMap((t) => t.clips);

  return (
    <aside className="w-60 border-r border-white/10 shrink-0 hidden md:flex flex-col">
      <div className="px-3 h-9 flex items-center text-xs font-medium text-slate-400 border-b border-white/10">
        Media
      </div>
      <div className="p-3 space-y-3">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="btn-primary text-sm py-2 px-4 w-full disabled:opacity-50"
        >
          {busy ? "Importeren..." : "Importeer media"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/*,image/*,audio/*"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <p className="text-[11px] text-slate-600">
          Video, beeld of audio. Wordt achteraan de juiste track geplaatst.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
        {clips.map((c) => (
          <button
            key={c.id}
            onClick={() => store.select(c.id)}
            className="w-full text-left text-xs px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 truncate"
          >
            {c.type === "text" ? "Tekst" : c.type} · {c.duration.toFixed(1)}s
          </button>
        ))}
      </div>
    </aside>
  );
}
