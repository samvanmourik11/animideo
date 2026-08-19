"use client";

// ── Contextuele werkbalk ─────────────────────────────────────────────────────
//
// Canva's belangrijkste vondst: de knoppen die je nodig hebt staan bóven het
// beeld en veranderen mee met wat je hebt geselecteerd. Niets zoeken in een
// paneel vol schuifjes die op dit moment nergens over gaan.
//
// Tekst krijgt letters en opmaak, beeld krijgt bijsnijden en spiegelen, een
// vorm krijgt kleuren. Wat altijd geldt (transparantie, positie, laag, kopie,
// weg) staat rechts en blijft op zijn plek staan, zodat je spiergeheugen klopt.

import { useEffect, useRef, useState } from "react";
import { useEditor, type EditorStore } from "@/lib/editor/store";
import {
  LETTERTYPEN, TEKST_EFFECTEN, huidigEffect, lettertypeVanStack, pasEffectToe,
} from "@/lib/editor/text-styles";
import type { AnimationPreset } from "@/lib/editor/timeline";
import { PALET } from "./ui";

type Uitklap =
  | "vulling" | "lijn" | "letter" | "effect" | "hoofdletters" | "afstand"
  | "transparantie" | "positie" | "laag" | "bijsnijden" | "draaien" | "animatie" | null;

const ANIMATIES: Array<{ id: AnimationPreset; label: string }> = [
  { id: "none", label: "Geen" },
  { id: "fade-in", label: "Invloeien" },
  { id: "pop", label: "Ploppen" },
  { id: "slide-up", label: "Omhoog schuiven" },
  { id: "typewriter", label: "Typemachine" },
  { id: "word-by-word", label: "Woord voor woord" },
];

/** Bijsnijden op vaste verhoudingen; de uitsnede blijft altijd gecentreerd. */
const VERHOUDINGEN: Array<{ id: string; label: string; ratio: number | null }> = [
  { id: "vrij", label: "Origineel", ratio: null },
  { id: "1-1", label: "1:1", ratio: 1 },
  { id: "4-5", label: "4:5", ratio: 4 / 5 },
  { id: "16-9", label: "16:9", ratio: 16 / 9 },
  { id: "9-16", label: "9:16", ratio: 9 / 16 },
];

export default function ContextBalk({
  store,
  onMeer,
  meerOpen,
  getMaat,
}: {
  store: EditorStore;
  onMeer: () => void;
  meerOpen: boolean;
  /**
   * Halve breedte/hoogte van de selectie in beeldfracties, voor uitlijnen en
   * bijsnijden. Een functie en geen waarde: alleen de compositor weet dit, en
   * die weet het pas per frame — als prop zou de hele balk 60 keer per seconde
   * opnieuw tekenen.
   */
  getMaat: () => { halfW: number; halfH: number } | null;
}) {
  const geselecteerd = useEditor(store, (s) => s.selectedClipId);
  // Het document meelezen zodat de knoppen bijwerken zodra de clip verandert —
  // ook als die wijziging van het canvas of van de AI-monteur komt.
  useEditor(store, (s) => s.doc);
  const clip = store.find(geselecteerd);
  const [open, setOpen] = useState<Uitklap>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const balkRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(null); setMelding(null); }, [geselecteerd]);

  useEffect(() => {
    function weg(e: MouseEvent) {
      if (!balkRef.current?.contains(e.target as Node)) setOpen(null);
    }
    if (open) window.addEventListener("mousedown", weg);
    return () => window.removeEventListener("mousedown", weg);
  }, [open]);

  if (!clip) {
    return (
      <div className="h-12 flex items-center px-4 text-[13px] text-slate-500 border-b border-slate-200 bg-white shrink-0">
        Klik iets aan in beeld of op de tijdlijn om het te bewerken. Rechtsklik voor kopiëren, lagen en uitlijnen.
      </div>
    );
  }

  const vorm = clip.meta?.vorm;
  const isTekst = clip.type === "text";
  const isBeeld = clip.type === "image" || clip.type === "video";
  const tf = clip.transform;
  const wissel = (w: Uitklap) => setOpen(open === w ? null : w);

  /** Uitsnede op een vaste verhouding, gecentreerd op wat er nu staat. */
  function snijBij(ratio: number | null) {
    if (!ratio) {
      store.setTransform(clip!.id, { crop: undefined });
      return;
    }
    // We kennen de bronverhouding niet in de UI, maar wél hoe het element nu in
    // beeld staat. Daaruit volgt hoeveel er van elke kant af moet.
    const m = getMaat();
    const huidig = m && m.halfH > 0 ? m.halfW / m.halfH : 1;
    const doelInBeeld = ratio * (9 / 16); // compositie is breder dan hoog
    const f = huidig / doelInBeeld;
    const c = f > 1
      ? { top: 0, bottom: 0, left: (1 - 1 / f) / 2, right: (1 - 1 / f) / 2 }
      : { left: 0, right: 0, top: (1 - f) / 2, bottom: (1 - f) / 2 };
    store.setTransform(clip!.id, { crop: c });
  }

  async function wisAchtergrond() {
    if (clip!.type !== "image" && clip!.type !== "video") return;
    const bron = clip!.src;
    if (bron.startsWith("data:")) {
      setMelding("Dit is een getekende vorm; die heeft al een doorzichtige achtergrond.");
      return;
    }
    setBezig(true);
    setMelding(null);
    try {
      const res = await fetch("/api/editor/achtergrond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: bron }),
      });
      const d = await res.json();
      if (!res.ok || !d.url) {
        setMelding(d.error === "insufficient_credits" ? "Te weinig credits." : d.error ?? "Mislukt");
        return;
      }
      const r = store.dispatch({ op: "replace_clip_source", clipId: clip!.id, src: d.url, mediaType: "image" });
      setMelding(r.ok ? "Achtergrond weggehaald" : r.error.message);
    } catch {
      setMelding("Het uitknippen lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div ref={balkRef} className="relative shrink-0 border-b border-slate-200 bg-white">
      <div className="h-12 flex items-center gap-1.5 px-3 overflow-x-auto">
        <span className="text-[13px] font-medium text-slate-700 shrink-0 max-w-[9rem] truncate">
          {clip.meta?.label ?? (isTekst ? clip.text : clip.type === "video" ? "Scène" : "Element")}
        </span>
        {clip.locked && <span className="text-[11px] text-slate-400 shrink-0">vergrendeld</span>}
        <Scheiding />

        {vorm && (
          <>
            <Kleurknop label="Vulling" kleur={vorm.vulling} onClick={() => wissel("vulling")} />
            <Kleurknop label="Lijn" kleur={vorm.lijn} onClick={() => wissel("lijn")} />
            <label className="flex items-center gap-2 text-[12px] text-slate-600 shrink-0 px-1">
              Dikte
              <input
                type="range" min={0.01} max={0.2} step={0.005} value={vorm.dikte}
                onChange={(e) => store.dispatch({ op: "restyle_element", clipId: clip.id, stijl: { dikte: Number(e.target.value) } })}
                className="w-16 accent-blue-600"
              />
            </label>
            <Scheiding />
          </>
        )}

        {clip.meta?.diagram && (<><Knop onClick={onMeer}>Cijfers aanpassen</Knop><Scheiding /></>)}

        {isTekst && (
          <>
            <Knop onClick={() => wissel("letter")} breed>
              <span style={{ fontFamily: clip.style.fontFamily }}>
                {LETTERTYPEN.find((l) => l.id === lettertypeVanStack(clip.style.fontFamily))?.label ?? "Lettertype"}
              </span>
            </Knop>
            <div className="flex items-center shrink-0 rounded-lg border border-slate-200 overflow-hidden">
              <MiniKnop onClick={() => store.setTextStyle(clip.id, { fontSize: Math.max(8, Math.round(clip.style.fontSize - 4)) })}>−</MiniKnop>
              <input
                type="number" min={8} max={400} value={Math.round(clip.style.fontSize)}
                onChange={(e) => store.setTextStyle(clip.id, { fontSize: Math.max(8, Number(e.target.value)) })}
                className="w-12 text-center py-1.5 text-[13px] text-slate-900 border-x border-slate-200 focus:outline-none"
              />
              <MiniKnop onClick={() => store.setTextStyle(clip.id, { fontSize: Math.round(clip.style.fontSize + 4) })}>+</MiniKnop>
            </div>
            <Kleurknop
              label="Kleur"
              kleur={clip.style.color === "#00000000" ? "#ffffff" : clip.style.color}
              onClick={() => wissel("vulling")}
            />
            <div className="flex shrink-0 rounded-lg border border-slate-200 overflow-hidden">
              <Schakel aan={clip.style.fontWeight >= 700} onClick={() => store.setTextStyle(clip.id, { fontWeight: clip.style.fontWeight >= 700 ? 400 : 700 })}>
                <span className="font-bold">B</span>
              </Schakel>
              <Schakel aan={!!clip.style.italic} onClick={() => store.setTextStyle(clip.id, { italic: !clip.style.italic })}>
                <span className="italic">I</span>
              </Schakel>
              <Schakel aan={!!clip.style.underline} onClick={() => store.setTextStyle(clip.id, { underline: !clip.style.underline })}>
                <span className="underline">U</span>
              </Schakel>
              <Schakel aan={!!clip.style.strike} onClick={() => store.setTextStyle(clip.id, { strike: !clip.style.strike })}>
                <span className="line-through">S</span>
              </Schakel>
            </div>
            <Knop onClick={() => wissel("hoofdletters")}>aA</Knop>
            <div className="flex shrink-0 rounded-lg border border-slate-200 overflow-hidden">
              {(["left", "center", "right"] as const).map((a) => (
                <Schakel key={a} aan={clip.style.align === a} onClick={() => store.setTextStyle(clip.id, { align: a })}>
                  {a === "left" ? "⇤" : a === "center" ? "≡" : "⇥"}
                </Schakel>
              ))}
            </div>
            <Knop onClick={() => wissel("afstand")}>Afstand</Knop>
            <Knop onClick={() => wissel("effect")}>
              {TEKST_EFFECTEN.find((e) => e.id === huidigEffect(clip.style))?.label}
            </Knop>
            <Knop onClick={() => wissel("animatie")}>Animatie</Knop>
            <Scheiding />
          </>
        )}

        {isBeeld && (
          <>
            <Knop onClick={() => wissel("bijsnijden")}>Bijsnijden</Knop>
            <Knop onClick={() => store.setTransform(clip.id, { flipH: !tf?.flipH })}>Spiegel ↔</Knop>
            <Knop onClick={() => store.setTransform(clip.id, { flipV: !tf?.flipV })}>Spiegel ↕</Knop>
            <Knop onClick={() => wissel("draaien")}>Draaien</Knop>
            <Knop onClick={() => void wisAchtergrond()} uit={bezig}>
              {bezig ? "Bezig…" : "Achtergrond wissen"}
            </Knop>
            <Scheiding />
          </>
        )}

        <Knop onClick={() => wissel("transparantie")}>Transparantie</Knop>
        <Knop onClick={() => wissel("positie")}>Positie</Knop>
        <Knop onClick={() => wissel("laag")}>Laag</Knop>
        <Knop onClick={() => store.dupliceerOpZelfdePlek(clip.id)}>Kopie</Knop>
        <Knop onClick={() => store.removeClip(clip.id)} gevaar>Verwijderen</Knop>

        <div className="flex-1 min-w-[1rem]" />
        <button
          type="button"
          onClick={onMeer}
          className={`shrink-0 text-[13px] px-3 py-1.5 rounded-lg border ${
            meerOpen ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          Meer instellingen
        </button>
      </div>

      {melding && (
        <p className="px-4 pb-2 -mt-1 text-[12px] text-slate-500">{melding}</p>
      )}

      {open && (
        <div className="absolute left-3 top-12 z-30 rounded-xl border border-slate-200 bg-white shadow-lg p-3 w-72">
          {open === "letter" && isTekst ? (
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
          ) : open === "effect" && isTekst ? (
            <div className="grid grid-cols-2 gap-1.5">
              {TEKST_EFFECTEN.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => { store.setTextStyle(clip.id, pasEffectToe(clip.style, e.id)); setOpen(null); }}
                  className={`text-[13px] px-3 py-2 rounded-lg border text-left ${
                    huidigEffect(clip.style) === e.id ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          ) : open === "hoofdletters" && isTekst ? (
            <div className="space-y-1">
              {([
                ["normaal", "Zoals getypt"],
                ["hoofdletters", "HOOFDLETTERS"],
                ["kleine-letters", "kleine letters"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { store.setTextStyle(clip.id, { letters: id }); setOpen(null); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[13px] border ${
                    (clip.style.letters ?? "normaal") === id ? "border-blue-600 bg-blue-50" : "border-transparent hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
              <p className="text-[11px] text-slate-500 px-1 pt-1">
                Dit is opmaak: je oorspronkelijke schrijfwijze blijft bewaard.
              </p>
            </div>
          ) : open === "afstand" && isTekst ? (
            <div className="space-y-3">
              <Schuif
                label={`Letterafstand: ${(clip.style.letterSpacing ?? 0).toFixed(0)}`}
                min={-10} max={40} step={1} waarde={clip.style.letterSpacing ?? 0}
                onWijzig={(v) => store.setTextStyle(clip.id, { letterSpacing: v })}
              />
              <Schuif
                label={`Regelafstand: ${(clip.style.lineHeight ?? 1.2).toFixed(2)}`}
                min={0.8} max={2.4} step={0.05} waarde={clip.style.lineHeight ?? 1.2}
                onWijzig={(v) => store.setTextStyle(clip.id, { lineHeight: v })}
              />
            </div>
          ) : open === "animatie" && isTekst ? (
            <div className="space-y-1">
              {ANIMATIES.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { store.updateClip(clip.id, { preset: a.id }); setOpen(null); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[13px] border ${
                    (clip.preset ?? "none") === a.id ? "border-blue-600 bg-blue-50" : "border-transparent hover:bg-slate-50"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          ) : open === "bijsnijden" && isBeeld ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-1.5">
                {VERHOUDINGEN.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => snijBij(v.ratio)}
                    className="text-[13px] px-2 py-2 rounded-lg border border-slate-200 hover:bg-slate-50"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              {(["top", "right", "bottom", "left"] as const).map((kant) => (
                <Schuif
                  key={kant}
                  label={`${{ top: "Boven", right: "Rechts", bottom: "Onder", left: "Links" }[kant]}: ${Math.round((tf?.crop?.[kant] ?? 0) * 100)}%`}
                  min={0} max={0.45} step={0.01}
                  waarde={tf?.crop?.[kant] ?? 0}
                  onWijzig={(v) =>
                    store.setTransform(clip.id, {
                      crop: { top: 0, right: 0, bottom: 0, left: 0, ...tf?.crop, [kant]: v },
                    })
                  }
                />
              ))}
              <p className="text-[11px] text-slate-500 leading-snug">
                Bijsnijden maakt het element écht kleiner, dus het kader eromheen blijft kloppen.
              </p>
            </div>
          ) : open === "draaien" && isBeeld ? (
            <div className="space-y-3">
              <Schuif
                label={`Draaien: ${Math.round(tf?.rotation ?? 0)}°`}
                min={-180} max={180} step={1} waarde={tf?.rotation ?? 0}
                onWijzig={(v) => store.setTransform(clip.id, { rotation: v })}
              />
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 90, 180, 270].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => store.setTransform(clip.id, { rotation: g })}
                    className="text-[13px] py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
                  >
                    {g}°
                  </button>
                ))}
              </div>
              <Schuif
                label={`Afgeronde hoeken: ${Math.round((tf?.cornerRadius ?? 0) * 100)}%`}
                min={0} max={0.5} step={0.01} waarde={tf?.cornerRadius ?? 0}
                onWijzig={(v) => store.setTransform(clip.id, { cornerRadius: v })}
              />
            </div>
          ) : open === "transparantie" ? (
            <Schuif
              label={`Transparantie: ${Math.round((clip.opacity ?? 1) * 100)}%`}
              min={0} max={1} step={0.01} waarde={clip.opacity ?? 1}
              onWijzig={(v) => store.updateClip(clip.id, { opacity: v })}
            />
          ) : open === "positie" ? (
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ["links", "Links"], ["midden", "Midden"], ["rechts", "Rechts"],
                ["boven", "Boven"], ["centraal", "Centraal"], ["onder", "Onder"],
              ] as const).map(([r, label]) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => { store.lijnUit(clip.id, r, getMaat()); setOpen(null); }}
                  className="text-[13px] px-2 py-2 rounded-lg border border-slate-200 hover:bg-slate-50"
                >
                  {label}
                </button>
              ))}
            </div>
          ) : open === "laag" ? (
            <div className="space-y-1">
              {([
                ["vooraan", "Helemaal naar voren"], ["voor", "Naar voren"],
                ["achter", "Naar achter"], ["achteraan", "Helemaal naar achter"],
              ] as const).map(([w, label]) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => { store.zetLaag(clip.id, w); setOpen(null); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-[13px] hover:bg-slate-50"
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { store.zetVergrendeld(clip.id, !clip.locked); setOpen(null); }}
                className="w-full text-left px-3 py-2 rounded-lg text-[13px] hover:bg-slate-50 border-t border-slate-100 mt-1"
              >
                {clip.locked ? "Ontgrendelen" : "Vergrendelen"}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {PALET.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { zetKleur(k); setOpen(null); }}
                  aria-label={k}
                  className="w-7 h-7 rounded-full border border-slate-200"
                  style={{ background: k }}
                />
              ))}
              <label className="w-7 h-7 rounded-full border border-slate-200 overflow-hidden cursor-pointer relative">
                <span className="absolute inset-0 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" />
                <input
                  type="color"
                  onChange={(e) => zetKleur(e.target.value)}
                  className="opacity-0 w-full h-full cursor-pointer"
                />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );

  function zetKleur(k: string) {
    if (!clip) return;
    if (isTekst) store.setTextStyle(clip.id, { color: k });
    else store.dispatch({
      op: "restyle_element",
      clipId: clip.id,
      stijl: open === "lijn" ? { lijn: k } : { vulling: k },
    });
  }
}

function Scheiding() {
  return <span className="w-px h-6 bg-slate-200 shrink-0" />;
}

function Knop({
  onClick, children, gevaar, uit, breed,
}: {
  onClick: () => void; children: React.ReactNode; gevaar?: boolean; uit?: boolean; breed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={uit}
      className={`shrink-0 text-[13px] px-2.5 py-1.5 rounded-lg border border-slate-200 whitespace-nowrap disabled:opacity-40 ${
        breed ? "max-w-[9rem] truncate" : ""
      } ${gevaar ? "text-red-600 hover:bg-red-50 hover:border-red-200" : "text-slate-700 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}

function MiniKnop({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="px-2 py-1.5 text-[13px] text-slate-600 hover:bg-slate-50">
      {children}
    </button>
  );
}

function Schakel({ aan, onClick, children }: { aan: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1.5 text-[13px] min-w-[2rem] ${aan ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
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

function Schuif({
  label, min, max, step, waarde, onWijzig,
}: {
  label: string; min: number; max: number; step: number; waarde: number; onWijzig: (v: number) => void;
}) {
  return (
    <div>
      <p className="text-[12px] font-medium text-slate-600 mb-1">{label}</p>
      <input
        type="range" min={min} max={max} step={step} value={waarde}
        onChange={(e) => onWijzig(Number(e.target.value))}
        className="w-full accent-blue-600"
      />
    </div>
  );
}
