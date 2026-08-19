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
import type { Clip, Ratio, TimelineDoc, TrackKind } from "@/lib/editor/timeline";
import type { PenStijl } from "@/lib/editor/tekening";
import { inInvoerveld, toetsNaarActie } from "@/lib/editor/sneltoetsen";
import Rail, { type RailItem } from "./Rail";
import ContextMenu, { type MenuPlek } from "./ContextMenu";
import { huidigeClipId, nieuwId as nieuwElementId } from "@/lib/editor/plaatsing";
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

  // Rechtermuisknop-menu plus de twee klemborden: één voor hele lagen, één voor
  // alleen de opmaak. Ze leven hier omdat je in het ene element kopieert en in
  // het andere plakt.
  const [menu, setMenu] = useState<MenuPlek | null>(null);
  const [klembord, setKlembord] = useState<{ clip: Clip; spoor: TrackKind } | null>(null);
  const maatRef = useRef<() => { halfW: number; halfH: number } | null>(() => null);
  // Zoom van het beeld zelf (niet van de tijdlijn). 1 = passend in het venster.
  const [zoom, setZoom] = useState(1);
  const werkvlakRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<string | null>(null);

  /** Korte melding onder in beeld, voor dingen die geen paneel verdienen. */
  function meld(tekst: string) {
    setTip(tekst);
    window.setTimeout(() => setTip((t) => (t === tekst ? null : t)), 2600);
  }
  const [stijlKlembord, setStijlKlembord] = useState<Clip | null>(null);

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

  // Sneltoetsen. De vertaling van toets naar handeling staat in
  // lib/editor/sneltoetsen.ts; hier gebeurt alleen het uitvoeren.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const doel = e.target as HTMLElement | null;
      const uitkomst = toetsNaarActie(e);
      if (!uitkomst) return;

      // In een invoerveld hoort alleen het bewerken van tekst te werken; een
      // losse "c" moet daar een letter zijn en geen cirkel op je video.
      if (inInvoerveld(doel?.tagName)) {
        const magInVeld = ["kopieer", "plak", "knip", "ongedaan", "opnieuw", "escape"];
        if (!magInVeld.includes(uitkomst.actie)) return;
        if (uitkomst.actie !== "escape") return;
      }

      const id = store.getState().selectedClipId;
      const clip = store.find(id);
      const stap = uitkomst.groot ? 10 : 1;

      switch (uitkomst.actie) {
        // ── Elementen ──────────────────────────────────────────────────────
        case "tekst": {
          e.preventDefault();
          const clipId = huidigeClipId(store);
          if (!clipId) return meld("Zet eerst beeld op de tijdlijn.");
          const nieuwId = nieuwElementId("tekst");
          const r = store.dispatch({
            op: "add_text", clipId, textId: nieuwId, text: "Jouw tekst", x: 0.5, y: 0.5,
          });
          if (r.ok) store.select(nieuwId);
          return;
        }
        case "rechthoek":
        case "cirkel":
        case "lijn": {
          e.preventDefault();
          const clipId = huidigeClipId(store);
          if (!clipId) return meld("Zet eerst beeld op de tijdlijn.");
          const vormId =
            uitkomst.actie === "rechthoek" ? "rechthoek-rond"
            : uitkomst.actie === "cirkel" ? "cirkel" : "lijn";
          const nieuwId = nieuwElementId("vorm");
          const r = store.dispatch({ op: "add_vorm", clipId, vormId, elementId: nieuwId });
          if (r.ok) store.select(nieuwId);
          return;
        }
        case "zoeken":
          e.preventDefault();
          setPaneel("elementen");
          // Het veld bestaat pas nadat het paneel is getekend.
          window.setTimeout(() => {
            document.querySelector<HTMLInputElement>('input[placeholder="Zoek een vorm of icoon"]')?.focus();
          }, 60);
          return;

        // ── Tekst ──────────────────────────────────────────────────────────
        case "vet":
          if (clip?.type !== "text") return;
          e.preventDefault();
          store.setTextStyle(clip.id, { fontWeight: clip.style.fontWeight >= 700 ? 400 : 700 });
          return;
        case "cursief":
          if (clip?.type !== "text") return;
          e.preventDefault();
          store.setTextStyle(clip.id, { italic: !clip.style.italic });
          return;
        case "onderstrepen":
          if (clip?.type !== "text") return;
          e.preventDefault();
          store.setTextStyle(clip.id, { underline: !clip.style.underline });
          return;
        case "hoofdletters":
          if (clip?.type !== "text") return;
          e.preventDefault();
          store.setTextStyle(clip.id, {
            letters: clip.style.letters === "hoofdletters" ? "normaal" : "hoofdletters",
          });
          return;
        case "groter":
        case "kleiner":
          if (clip?.type !== "text") return;
          e.preventDefault();
          store.setTextStyle(clip.id, {
            fontSize: Math.max(8, Math.round(clip.style.fontSize * (uitkomst.actie === "groter" ? 1.1 : 1 / 1.1))),
          });
          return;
        case "regelafstand-op":
        case "regelafstand-neer":
          if (clip?.type !== "text") return;
          e.preventDefault();
          store.setTextStyle(clip.id, {
            lineHeight: Math.max(0.8, Math.min(2.4,
              (clip.style.lineHeight ?? 1.2) + (uitkomst.actie === "regelafstand-op" ? 0.05 : -0.05))),
          });
          return;

        // ── Algemeen ───────────────────────────────────────────────────────
        case "kopieer":
          if (!clip) return;
          e.preventDefault();
          setKlembord({ clip, spoor: store.spoorKindVan(clip.id) ?? "overlay" });
          meld("Gekopieerd");
          return;
        case "kopieer-stijl":
          if (!clip) return;
          e.preventDefault();
          setStijlKlembord(clip);
          meld("Opmaak gekopieerd");
          return;
        case "knip":
          if (!clip) return;
          e.preventDefault();
          setKlembord({ clip, spoor: store.spoorKindVan(clip.id) ?? "overlay" });
          store.removeClip(clip.id);
          return;
        case "plak":
          if (!klembord) return;
          e.preventDefault();
          store.plakClip(klembord.clip, klembord.spoor);
          return;
        case "dupliceer":
          if (!clip) return;
          e.preventDefault();
          store.dupliceerOpZelfdePlek(clip.id);
          return;
        case "ongedaan":
          e.preventDefault();
          store.undo();
          return;
        case "opnieuw":
          e.preventDefault();
          store.redo();
          return;
        case "verwijder":
          if (!clip) return;
          e.preventDefault();
          store.removeClip(clip.id);
          return;
        case "selecteer-alles":
          e.preventDefault();
          meld("Meerdere lagen tegelijk selecteren kan nog niet.");
          return;

        // ── Rangschikken ───────────────────────────────────────────────────
        case "laag-voor":
        case "laag-achter":
        case "laag-vooraan":
        case "laag-achteraan":
          if (!clip) return;
          e.preventDefault();
          store.zetLaag(clip.id, {
            "laag-voor": "voor", "laag-achter": "achter",
            "laag-vooraan": "vooraan", "laag-achteraan": "achteraan",
          }[uitkomst.actie] as "voor" | "achter" | "vooraan" | "achteraan");
          return;
        case "groepeer":
        case "degroepeer":
          e.preventDefault();
          meld("Groeperen kan nog niet — daar is meervoudige selectie voor nodig.");
          return;
        case "vergrendel":
          if (!clip) return;
          e.preventDefault();
          store.zetVergrendeld(clip.id, !clip.locked);
          return;
        case "links":
        case "rechts":
        case "omhoog":
        case "omlaag":
          if (!clip || clip.locked) return;
          e.preventDefault();
          store.verschuif(
            clip.id,
            uitkomst.actie === "links" ? -stap : uitkomst.actie === "rechts" ? stap : 0,
            uitkomst.actie === "omhoog" ? -stap : uitkomst.actie === "omlaag" ? stap : 0
          );
          return;

        // ── Weergave ───────────────────────────────────────────────────────
        case "zoom-in":
          e.preventDefault();
          setZoom((z) => Math.min(4, Math.round(z * 1.25 * 100) / 100));
          return;
        case "zoom-uit":
          e.preventDefault();
          setZoom((z) => Math.max(0.25, Math.round((z / 1.25) * 100) / 100));
          return;
        case "zoom-100":
          e.preventDefault();
          setZoom(1);
          return;
        case "zoom-passend":
          e.preventDefault();
          setZoom(1);
          meld("Passend in beeld");
          return;
        case "nieuwe-scene":
          e.preventDefault();
          store.nieuweScene();
          meld("Lege scène achteraan gezet");
          return;
        case "presentatie":
          e.preventDefault();
          void werkvlakRef.current?.requestFullscreen?.().then(() => store.play()).catch(() => {});
          return;
        case "escape":
          if (document.fullscreenElement) { void document.exitFullscreen().catch(() => {}); return; }
          if (pen) { e.preventDefault(); setPen(null); return; }
          store.select(null);
          return;
        case "afspelen":
          e.preventDefault();
          store.togglePlay();
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, pen, klembord]);

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
            className="text-[14px] font-semibold py-2 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
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

        <div ref={werkvlakRef} className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#e8edf7]">
          {pen && (
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 text-[13px] text-blue-800 flex items-center gap-3 shrink-0">
              <span>Teken op het beeld. Elke streep wordt een losse laag.</span>
              {tekenMelding && <span className="text-blue-600">{tekenMelding}</span>}
              <button type="button" onClick={() => setPen(null)} className="ml-auto underline">
                Stoppen (Esc)
              </button>
            </div>
          )}
          <PreviewCanvas
            store={store}
            ratio={ratio}
            zoom={zoom}
            onGeplaatst={meld}
            pen={pen}
            onTekening={setTekenMelding}
            registreerMaat={(fn) => { maatRef.current = fn; }}
            onContext={(punt, clipId) => {
              // Iets naar binnen, zodat een menu bij de rechterrand niet half
              // buiten het scherm valt.
              setMenu({ x: Math.min(punt.x, window.innerWidth - 280), y: Math.min(punt.y, window.innerHeight - 380), clipId });
            }}
          />
          {(zoom !== 1 || tip) && (
            <div className="shrink-0 h-8 flex items-center gap-3 px-4 bg-white border-t border-slate-200 text-[12px] text-slate-600">
              {zoom !== 1 && (
                <>
                  <span>Zoom {Math.round(zoom * 100)}%</span>
                  <button type="button" onClick={() => setZoom(1)} className="underline">
                    Terug naar passend
                  </button>
                </>
              )}
              {tip && <span className="text-blue-700">{tip}</span>}
            </div>
          )}
        </div>

        {meerOpen && <PropertiesPanel store={store} onClose={() => setMeerOpen(false)} />}
      </div>

      <Timeline
        store={store}
        onContext={(punt, clipId) => {
          setMenu({
            x: Math.min(punt.x, window.innerWidth - 280),
            y: Math.min(punt.y, window.innerHeight - 380),
            clipId,
          });
        }}
      />

      {menu && (
        <ContextMenu
          store={store}
          plek={menu}
          getMaat={() => maatRef.current()}
          klembord={klembord}
          onKlembord={setKlembord}
          stijlKlembord={stijlKlembord}
          onStijlKlembord={setStijlKlembord}
          onMeer={() => setMeerOpen(true)}
          onSluit={() => setMenu(null)}
        />
      )}

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
                  className="block w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[14px] font-semibold py-2.5"
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
                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${exportPct}%` }} />
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
