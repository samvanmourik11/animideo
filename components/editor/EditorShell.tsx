"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EditorStore } from "@/lib/editor/store";
import type { Ratio, TimelineDoc } from "@/lib/editor/timeline";
import PreviewCanvas from "./PreviewCanvas";
import Transport from "./Transport";
import Timeline from "./Timeline";
import MediaPanel from "./MediaPanel";
import PropertiesPanel from "./PropertiesPanel";

export default function EditorShell({
  projectId,
  userId,
  title,
  ratio,
  initialTimeline,
  backHref = "/editor",
}: {
  projectId: string;
  userId: string;
  title: string;
  ratio: Ratio;
  initialTimeline: TimelineDoc;
  // Waar de ←-knop naartoe gaat. Vanuit de Studio terug naar het Studio-project
  // (stap 5), anders naar de editor-projectenlijst.
  backHref?: string;
}) {
  const router = useRouter();

  // ←-knop: een expliciete Studio-bestemming (?studio=) heeft voorrang; anders
  // gewoon terug naar de vorige pagina (bv. de Studio-wizard, die stap 5 herstelt),
  // met de projectenlijst als laatste vangnet.
  function goBack() {
    if (backHref !== "/editor") { router.push(backHref); return; }
    if (typeof window !== "undefined" && window.history.length > 1) { router.back(); return; }
    router.push("/editor");
  }

  // Store eenmalig aanmaken, met een persist-functie die naar Supabase schrijft.
  const storeRef = useRef<EditorStore | null>(null);
  if (!storeRef.current) {
    const supabase = createClient();
    storeRef.current = new EditorStore(initialTimeline, async (doc) => {
      const { error } = await supabase
        .from("editor_projects")
        .update({
          timeline: doc,
          width: doc.width,
          height: doc.height,
          fps: doc.fps,
        })
        .eq("id", projectId);
      if (error) throw error;
    });
  }
  const store = storeRef.current;

  // ── Export ─────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportLabel, setExportLabel] = useState("");
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setExportUrl(null);
    setExportError(null);
    setExportPct(0);
    setExportLabel("Starten");
    try {
      const res = await fetch("/api/editor/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text().catch(() => "Export mislukt"));
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6));
          if (ev.type === "progress" || ev.type === "phase") {
            setExportPct(ev.pct ?? 0);
            if (ev.label || ev.phase) setExportLabel(ev.label || ev.phase);
          } else if (ev.type === "complete") {
            setExportUrl(ev.url);
            setExportPct(100);
          } else if (ev.type === "error") {
            setExportError(ev.message || "Export mislukt");
          }
        }
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export mislukt");
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => () => store.destroy(), [store]);

  // Sneltoetsen: spatie = afspelen/pauze, Delete = geselecteerde clip weg.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        store.togglePlay();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const id = store.getState().selectedClipId;
        if (id) {
          e.preventDefault();
          store.removeClip(id);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex items-center justify-between px-4 h-12 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={goBack} className="text-slate-400 hover:text-white text-sm">
            ←
          </button>
          <span className="text-sm font-semibold truncate">{title}</span>
          <span className="text-xs text-slate-500 px-2 py-0.5 rounded bg-white/5">
            {ratio}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Transport store={store} />
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn-primary text-sm py-1.5 px-4"
          >
            {exporting ? "Exporteren..." : "Exporteren"}
          </button>
        </div>
      </header>

      {(exporting || exportUrl || exportError) && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
          <div className="card w-96 text-center space-y-4">
            {exportError ? (
              <>
                <p className="text-sm font-semibold text-red-400">Export mislukt</p>
                <p className="text-xs text-slate-400 break-words">{exportError}</p>
                <button
                  onClick={() => setExportError(null)}
                  className="btn-secondary text-sm w-full"
                >
                  Sluiten
                </button>
              </>
            ) : exportUrl ? (
              <>
                <p className="text-sm font-semibold">Klaar</p>
                <a
                  href={exportUrl}
                  download={`${title.replace(/\s+/g, "-")}.mp4`}
                  className="btn-primary text-sm inline-block w-full"
                >
                  Download MP4
                </a>
                <button
                  onClick={() => setExportUrl(null)}
                  className="btn-secondary text-sm w-full"
                >
                  Sluiten
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">{exportLabel || "Exporteren"}</p>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${exportPct}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">{exportPct}%</p>
                <p className="text-[11px] text-slate-600">
                  De server rendert frame voor frame. Voor langere video&apos;s kan dit
                  enkele minuten duren.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <MediaPanel store={store} projectId={projectId} userId={userId} />
        <PreviewCanvas store={store} ratio={ratio} />
        <PropertiesPanel store={store} />
      </div>

      <Timeline store={store} />
    </div>
  );
}
