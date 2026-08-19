"use client";

// ── De editor ────────────────────────────────────────────────────────────────
//
// Indeling naar het voorbeeld van Canva, omdat die ene keuze het meeste
// oplevert: een rail links met wóórden erbij, één paneel dat daarbij openschuift,
// een grote werkplek in het midden met de knoppen die op de selectie slaan er
// vlak boven, en de tijdlijn onderin.
//
// De oude indeling stopte alles in drie knopjes rechtsboven en een kolom met
// schuifjes rechts; je moest weten waar iets zat. Nu zie je het staan.
//
// Lichte panelen, donker rondom het beeld: lezen doe je op wit, maar een video
// beoordeel je tegen een neutrale achtergrond — daarom houdt de werkplek zelf
// zijn grijs.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EditorStore } from "@/lib/editor/store";
import { EditorHistory } from "@/lib/editor/history";
import type { Ratio, TimelineDoc } from "@/lib/editor/timeline";
import type { PenStijl } from "@/lib/editor/tekening";
import Rail, { type RailItem } from "./Rail";
import ContextBalk from "./ContextBalk";
import HistoryPanel from "./HistoryPanel";
import ChatPanel from "./ChatPanel";
import ElementenPanel from "./panels/ElementenPanel";
import TekstPanel from "./panels/TekstPanel";
import UploadsPanel from "./panels/UploadsPanel";
import MuziekPanel from "./panels/MuziekPanel";
import MerkPanel from "./panels/MerkPanel";
import SjablonenPanel from "./panels/SjablonenPanel";
import ToolsPanel from "./panels/ToolsPanel";
import PreviewCanvas from "./PreviewCanvas";
import Transport from "./Transport";
import Timeline from "./Timeline";
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

  function goBack() {
    if (backHref !== "/editor") { router.push(backHref); return; }
    if (typeof window !== "undefined" && window.history.length > 1) { router.back(); return; }
    router.push("/editor");
  }

  // Store eenmalig aanmaken, met een persist-functie die naar Supabase schrijft
  // en een geschiedenis die elke bewerking vastlegt.
  const storeRef = useRef<EditorStore | null>(null);
  const historyRef = useRef<EditorHistory | null>(null);
  if (!storeRef.current) {
    const supabase = createClient();
    const history = new EditorHistory(supabase, projectId);
    historyRef.current = history;
    storeRef.current = new EditorStore(
      initialTimeline,
      async (doc) => {
        const { error } = await supabase
          .from("editor_projects")
          .update({ timeline: doc, width: doc.width, height: doc.height, fps: doc.fps })
          .eq("id", projectId);
        if (error) throw error;
      },
      {
        // Bewust niet awaiten: de montage mag nooit wachten op het bijwerken
        // van de geschiedenis. Mislukt het schrijven, dan blijft de bewerking
        // gewoon staan (en meldt de historie dat in de console).
        onOp: (op, summary, bron) => {
          void history.record(op, summary, storeRef.current!.getState().doc, bron);
        },
        onUndo: () => history.stapTerug(),
        onRedo: () => history.stapVooruit(),
      }
    );
  }
  const store = storeRef.current;

  // Geschiedenis ophalen zodra de editor open is: daarmee werkt ongedaan maken
  // ook over een refresh heen, in plaats van bij nul te beginnen.
  useEffect(() => {
    let afgebroken = false;
    (async () => {
      try {
        const { eerdereDocs } = await historyRef.current!.load(initialTimeline);
        if (!afgebroken) store.hydrate(eerdereDocs);
      } catch (e) {
        console.warn("[editor] geschiedenis laden mislukt:", e);
      }
    })();
    return () => { afgebroken = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [paneel, setPaneel] = useState<RailItem | null>("elementen");
  const [meerOpen, setMeerOpen] = useState(false);
  const [pen, setPen] = useState<PenStijl | null>(null);
  const [tekenMelding, setTekenMelding] = useState<string | null>(null);

  // De pen hoort bij het tools-paneel: sluit je dat, dan stop je met tekenen.
  // Anders blijf je krassen zonder te zien waar dat vandaan komt.
  function kiesPaneel(id: RailItem) {
    setPaneel((huidig) => {
      const nieuw = huidig === id ? null : id;
      if (nieuw !== "tools") setPen(null);
      return nieuw;
    });
  }

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
      // Tijdens het tekenen doet Escape wat je verwacht: pen weg.
      if (e.key === "Escape" && pen) {
        e.preventDefault();
        setPen(null);
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
  }, [store, pen]);

  const sluitPaneel = () => { setPaneel(null); setPen(null); };

  return (
    <div className="relative flex flex-col h-full min-h-0 bg-white text-slate-900">
      <header className="flex items-center justify-between px-4 h-14 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={goBack}
            aria-label="Terug"
            className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-600 flex items-center justify-center"
          >
            ←
          </button>
          <span className="text-[15px] font-semibold truncate">{title}</span>
          <span className="text-[12px] text-slate-500 px-2 py-0.5 rounded-md bg-slate-100">{ratio}</span>
        </div>
        <div className="flex items-center gap-3">
          <Transport store={store} />
          <button
            onClick={handleExport}
            disabled={exporting}
            className="text-[14px] font-semibold py-2 px-5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white"
          >
            {exporting ? "Exporteren…" : "Exporteren"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <Rail actief={paneel} onKies={kiesPaneel} />

        {paneel && (
          <aside className="w-[340px] shrink-0 border-r border-slate-200 bg-white overflow-hidden">
            {paneel === "sjablonen" && <SjablonenPanel store={store} onSluit={sluitPaneel} />}
            {paneel === "elementen" && <ElementenPanel store={store} onSluit={sluitPaneel} />}
            {paneel === "tekst" && <TekstPanel store={store} onSluit={sluitPaneel} />}
            {paneel === "merk" && <MerkPanel store={store} onSluit={sluitPaneel} />}
            {paneel === "uploads" && (
              <UploadsPanel store={store} projectId={projectId} userId={userId} onSluit={sluitPaneel} />
            )}
            {paneel === "muziek" && <MuziekPanel store={store} onSluit={sluitPaneel} />}
            {paneel === "tools" && (
              <ToolsPanel store={store} pen={pen} onPen={setPen} onSluit={sluitPaneel} />
            )}
            {paneel === "monteur" && <ChatPanel projectId={projectId} store={store} onClose={sluitPaneel} />}
            {paneel === "versies" && historyRef.current && (
              <HistoryPanel history={historyRef.current} store={store} onClose={sluitPaneel} />
            )}
          </aside>
        )}

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <ContextBalk store={store} onMeer={() => setMeerOpen((o) => !o)} meerOpen={meerOpen} />
          {pen && (
            <div className="px-4 py-2 bg-violet-50 border-b border-violet-200 text-[13px] text-violet-800 flex items-center gap-3 shrink-0">
              <span>Teken op het beeld. Elke streep wordt een losse laag.</span>
              {tekenMelding && <span className="text-violet-600">{tekenMelding}</span>}
              <button type="button" onClick={() => setPen(null)} className="ml-auto underline">
                Stoppen (Esc)
              </button>
            </div>
          )}
          <PreviewCanvas store={store} ratio={ratio} pen={pen} onTekening={setTekenMelding} />
        </div>

        {meerOpen && <PropertiesPanel store={store} />}
      </div>

      <Timeline store={store} />

      {(exporting || exportUrl || exportError) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center">
          <div className="w-96 rounded-2xl bg-white p-6 text-center space-y-4 shadow-xl">
            {exportError ? (
              <>
                <p className="text-[15px] font-semibold text-red-600">Export mislukt</p>
                <p className="text-[13px] text-slate-600 break-words">{exportError}</p>
                <button
                  onClick={() => setExportError(null)}
                  className="w-full rounded-xl border border-slate-200 hover:bg-slate-50 text-[14px] py-2.5 text-slate-700"
                >
                  Sluiten
                </button>
              </>
            ) : exportUrl ? (
              <>
                <p className="text-[15px] font-semibold">Klaar</p>
                <a
                  href={exportUrl}
                  download={`${title.replace(/\s+/g, "-")}.mp4`}
                  className="block w-full rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[14px] font-semibold py-2.5"
                >
                  Download MP4
                </a>
                <button
                  onClick={() => setExportUrl(null)}
                  className="w-full rounded-xl border border-slate-200 hover:bg-slate-50 text-[14px] py-2.5 text-slate-700"
                >
                  Sluiten
                </button>
              </>
            ) : (
              <>
                <p className="text-[15px] font-semibold">{exportLabel || "Exporteren"}</p>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-600 transition-all" style={{ width: `${exportPct}%` }} />
                </div>
                <p className="text-[13px] text-slate-500">{exportPct}%</p>
                <p className="text-[12px] text-slate-400">
                  De server rendert frame voor frame. Voor langere video&apos;s kan dit enkele minuten duren.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
