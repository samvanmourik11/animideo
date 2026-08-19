"use client";

// ── Contextuele werkbalk ─────────────────────────────────────────────────────
//
// Canva's belangrijkste vondst: de knoppen die je nodig hebt staan bóven het
// ontwerp en veranderen mee met wat je hebt geselecteerd. Niets zoeken in een
// paneel vol schuifjes die op dit moment nergens over gaan.
//
// Hier staat dus alleen wat op déze selectie van toepassing is: een vorm krijgt
// kleuren, tekst krijgt letters en effecten, en alles krijgt de handelingen die
// altijd gelden (kopie, laag, weg).

import { useEffect, useState } from "react";
import { useEditor, type EditorStore } from "@/lib/editor/store";
import { LETTERTYPEN, TEKST_EFFECTEN, huidigEffect, lettertypeVanStack, pasEffectToe } from "@/lib/editor/text-styles";
import { PALET } from "./ui";

export default function ContextBalk({
  store,
  onMeer,
  meerOpen,
}: {
  store: EditorStore;
  onMeer: () => void;
  meerOpen: boolean;
}) {
  const geselecteerd = useEditor(store, (s) => s.selectedClipId);
  // Het document meelezen zodat de knoppen bijwerken zodra de clip verandert —
  // ook als die wijziging van het canvas of van de AI-monteur komt.
  useEditor(store, (s) => s.doc);
  const clip = store.find(geselecteerd);
  const [open, setOpen] = useState<"vulling" | "lijn" | "letter" | "effect" | null>(null);

  useEffect(() => setOpen(null), [geselecteerd]);

  if (!clip) {
    return (
      <div className="h-12 flex items-center px-4 text-[13px] text-slate-500 border-b border-slate-200 bg-white shrink-0">
        Klik iets aan in beeld of op de tijdlijn om het te bewerken.
      </div>
    );
  }

  const vorm = clip.meta?.vorm;
  const isTekst = clip.type === "text";

  return (
    <div className="relative shrink-0 border-b border-slate-200 bg-white">
      <div className="h-12 flex items-center gap-2 px-3 overflow-x-auto">
        <span className="text-[13px] font-medium text-slate-700 shrink-0 max-w-[10rem] truncate">
          {clip.meta?.label ?? (isTekst ? clip.text : clip.type === "video" ? "Scène" : "Element")}
        </span>
        <span className="w-px h-6 bg-slate-200 shrink-0" />

        {vorm && (
          <>
            <Kleurknop label="Vulling" kleur={vorm.vulling} onClick={() => setOpen(open === "vulling" ? null : "vulling")} />
            <Kleurknop label="Lijn" kleur={vorm.lijn} onClick={() => setOpen(open === "lijn" ? null : "lijn")} />
            <label className="flex items-center gap-2 text-[12px] text-slate-600 shrink-0 px-2">
              Dikte
              <input
                type="range" min={0.01} max={0.2} step={0.005} value={vorm.dikte}
                onChange={(e) => store.dispatch({ op: "restyle_element", clipId: clip.id, stijl: { dikte: Number(e.target.value) } })}
                className="w-20 accent-violet-600"
              />
            </label>
            <span className="w-px h-6 bg-slate-200 shrink-0" />
          </>
        )}

        {isTekst && (
          <>
            <Knop onClick={() => setOpen(open === "letter" ? null : "letter")}>
              <span style={{ fontFamily: clip.style.fontFamily }}>
                {LETTERTYPEN.find((l) => l.id === lettertypeVanStack(clip.style.fontFamily))?.label ?? "Lettertype"}
              </span>
            </Knop>
            <label className="flex items-center gap-1 shrink-0">
              <input
                type="number" min={8} max={400} value={Math.round(clip.style.fontSize)}
                onChange={(e) => store.setTextStyle(clip.id, { fontSize: Math.max(8, Number(e.target.value)) })}
                className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-[13px] text-slate-900"
              />
            </label>
            <Kleurknop
              label="Kleur"
              kleur={clip.style.color === "#00000000" ? "#ffffff" : clip.style.color}
              onClick={() => setOpen(open === "vulling" ? null : "vulling")}
            />
            <Knop onClick={() => setOpen(open === "effect" ? null : "effect")}>
              Effect: {TEKST_EFFECTEN.find((e) => e.id === huidigEffect(clip.style))?.label}
            </Knop>
            <div className="flex shrink-0 rounded-lg border border-slate-200 overflow-hidden">
              {(["left", "center", "right"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => store.setTextStyle(clip.id, { align: a })}
                  className={`px-2.5 py-1.5 text-[12px] ${clip.style.align === a ? "bg-violet-100 text-violet-700" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {a === "left" ? "⇤" : a === "center" ? "≡" : "⇥"}
                </button>
              ))}
            </div>
            <span className="w-px h-6 bg-slate-200 shrink-0" />
          </>
        )}

        <Knop onClick={() => store.duplicateClip(clip.id)}>Kopie</Knop>
        <Knop onClick={() => store.reorderClip(clip.id, "forward")}>Naar voren</Knop>
        <Knop onClick={() => store.reorderClip(clip.id, "backward")}>Naar achter</Knop>
        <Knop onClick={() => store.removeClip(clip.id)} gevaar>Verwijderen</Knop>

        <div className="flex-1" />
        <button
          type="button"
          onClick={onMeer}
          className={`shrink-0 text-[13px] px-3 py-1.5 rounded-lg border ${
            meerOpen ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          Meer instellingen
        </button>
      </div>

      {open && (
        <div className="absolute left-3 top-12 z-30 rounded-xl border border-slate-200 bg-white shadow-lg p-3 w-72">
          {open === "effect" && isTekst ? (
            <div className="grid grid-cols-2 gap-1.5">
              {TEKST_EFFECTEN.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => { store.setTextStyle(clip.id, pasEffectToe(clip.style, e.id)); setOpen(null); }}
                  className={`text-[13px] px-3 py-2 rounded-lg border text-left ${
                    huidigEffect(clip.style) === e.id ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          ) : open === "letter" && isTekst ? (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {LETTERTYPEN.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => { store.setTextStyle(clip.id, { fontFamily: l.stack }); setOpen(null); }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-[15px] text-slate-900"
                  style={{ fontFamily: l.stack }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {PALET.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (isTekst) store.setTextStyle(clip.id, { color: k });
                    else store.dispatch({
                      op: "restyle_element",
                      clipId: clip.id,
                      stijl: open === "lijn" ? { lijn: k } : { vulling: k },
                    });
                    setOpen(null);
                  }}
                  aria-label={k}
                  className="w-7 h-7 rounded-full border border-slate-200"
                  style={{ background: k }}
                />
              ))}
              <label className="w-7 h-7 rounded-full border border-slate-200 overflow-hidden cursor-pointer relative">
                <span className="absolute inset-0 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" />
                <input
                  type="color"
                  onChange={(e) => {
                    const k = e.target.value;
                    if (isTekst) store.setTextStyle(clip.id, { color: k });
                    else store.dispatch({
                      op: "restyle_element",
                      clipId: clip.id,
                      stijl: open === "lijn" ? { lijn: k } : { vulling: k },
                    });
                  }}
                  className="opacity-0 w-full h-full cursor-pointer"
                />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Knop({ onClick, children, gevaar }: { onClick: () => void; children: React.ReactNode; gevaar?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 text-[13px] px-3 py-1.5 rounded-lg border border-slate-200 whitespace-nowrap ${
        gevaar ? "text-red-600 hover:bg-red-50 hover:border-red-200" : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function Kleurknop({ label, kleur, onClick }: { label: string; kleur: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 flex items-center gap-1.5 text-[13px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
    >
      <span className="w-4 h-4 rounded-full border border-slate-300" style={{ background: kleur }} />
      {label}
    </button>
  );
}
