"use client";

// ── Het uitklapmenu ──────────────────────────────────────────────────────────
//
// Eén menu voor alles wat je met een geselecteerd element kunt doen, precies
// zoals in Canva: een lijst met pictogrammen, sneltoetsen rechts, streepjes
// tussen de groepen, en een pijltje bij alles wat verder uitklapt.
//
// Bewust géén balk boven het beeld. Zo'n balk moet altijd alles tegelijk laten
// zien en wordt daardoor een rij naamloze knopjes; in een menu past een woord
// én een pictogram én de sneltoets, en zie je in één oogopslag wat waar hoort.
//
// Openen kan met de rechtermuisknop op het beeld of op de tijdlijn, of met de
// knop die naast de selectie verschijnt.

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_TRANSFORM, type Clip, type TrackKind,
} from "@/lib/editor/timeline";
import { useEditor, type EditorStore } from "@/lib/editor/store";
import {
  LETTERTYPEN, TEKST_EFFECTEN, huidigEffect, lettertypeVanStack, pasEffectToe,
} from "@/lib/editor/text-styles";
import type { AnimationPreset } from "@/lib/editor/timeline";
import { PALET } from "./ui";

export interface MenuPlek {
  x: number;
  y: number;
  clipId: string;
}

const ANIMATIES: Array<{ id: AnimationPreset; label: string }> = [
  { id: "none", label: "Geen" },
  { id: "fade-in", label: "Invloeien" },
  { id: "pop", label: "Ploppen" },
  { id: "slide-up", label: "Omhoog schuiven" },
  { id: "typewriter", label: "Typemachine" },
  { id: "word-by-word", label: "Woord voor woord" },
];

const VERHOUDINGEN: Array<{ label: string; ratio: number | null }> = [
  { label: "Origineel", ratio: null },
  { label: "1:1", ratio: 1 },
  { label: "4:5", ratio: 4 / 5 },
  { label: "16:9", ratio: 16 / 9 },
  { label: "9:16", ratio: 9 / 16 },
];

// ── Pictogrammen ─────────────────────────────────────────────────────────────
// Lijntekeningen in dezelfde stijl als de rail, zodat het één geheel blijft.

const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const ICOON = {
  kopie: <><rect x="9" y="9" width="11" height="11" rx="2" {...p} /><path d="M15 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2h3" {...p} /></>,
  kwast: <><path d="M6 12h12V8a2 2 0 00-2-2H8a2 2 0 00-2 2z" {...p} /><path d="M12 12v3" {...p} /><rect x="10" y="15" width="4" height="6" rx="1" {...p} /></>,
  plakken: <><rect x="6" y="5" width="12" height="16" rx="2" {...p} /><path d="M9 5V4a2 2 0 012-2h2a2 2 0 012 2v1" {...p} /></>,
  dupliceren: <><rect x="4" y="4" width="12" height="12" rx="2" {...p} /><path d="M8 20h10a2 2 0 002-2V8" {...p} /></>,
  prullenbak: <><path d="M4 7h16" {...p} /><path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" {...p} /><path d="M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" {...p} /></>,
  lagen: <><path d="M12 3l9 5-9 5-9-5z" {...p} /><path d="M3 13l9 5 9-5" {...p} /></>,
  uitlijnen: <><path d="M4 4v16" {...p} /><rect x="8" y="6" width="11" height="4" rx="1" {...p} /><rect x="8" y="14" width="7" height="4" rx="1" {...p} /></>,
  bijsnijden: <><path d="M7 2v15h15" {...p} /><path d="M2 7h15v15" {...p} /></>,
  spiegel: <><path d="M12 3v18" {...p} /><path d="M9 7L4 12l5 5z" {...p} /><path d="M15 7l5 5-5 5z" {...p} /></>,
  draaien: <><path d="M21 12a9 9 0 11-3-6.7L21 8" {...p} /><path d="M21 3v5h-5" {...p} /></>,
  schaar: <><circle cx="6" cy="6" r="2.5" {...p} /><circle cx="6" cy="18" r="2.5" {...p} /><path d="M8 8l12 10M8 16L20 6" {...p} /></>,
  druppel: <><path d="M12 3s6 6.6 6 10.5a6 6 0 01-12 0C6 9.6 12 3 12 3z" {...p} /></>,
  slot: <><rect x="5" y="10" width="14" height="10" rx="2" {...p} /><path d="M8 10V7a4 4 0 018 0v3" {...p} /></>,
  klok: <><circle cx="12" cy="12" r="9" {...p} /><path d="M12 7v5l3 2" {...p} /></>,
  letter: <><path d="M5 6V4h14v2" {...p} /><path d="M12 4v16" {...p} /><path d="M8.5 20h7" {...p} /></>,
  penseel: <><path d="M4 20l4-1 10-10a2.1 2.1 0 10-3-3L5 16z" {...p} /><path d="M14.5 5.5l4 4" {...p} /></>,
  ster: <><path d="M12 3l2.6 6.3 6.4.5-4.9 4.2 1.5 6.2L12 17l-5.6 3.2 1.5-6.2L3 9.8l6.4-.5z" {...p} /></>,
  schuif: <><path d="M4 8h10M18 8h2M4 16h4M12 16h8" {...p} /><circle cx="16" cy="8" r="2" {...p} /><circle cx="10" cy="16" r="2" {...p} /></>,
  diagram: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...p} /></>,
  toverstaf: <><path d="M4 20l10-10" {...p} /><path d="M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" {...p} /><path d="M19 11l.7 1.4 1.4.7-1.4.7-.7 1.4-.7-1.4-1.4-.7 1.4-.7z" {...p} /></>,
  instellingen: <><circle cx="12" cy="12" r="3" {...p} /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" {...p} /></>,
};

export default function ContextMenu({
  store,
  plek,
  onSluit,
  onMeer,
  getMaat,
  klembord,
  onKlembord,
  stijlKlembord,
  onStijlKlembord,
}: {
  store: EditorStore;
  plek: MenuPlek;
  onSluit: () => void;
  /** Opent het eigenschappenpaneel rechts (keyframes, effecten, timing). */
  onMeer: () => void;
  /**
   * Halve breedte/hoogte van de selectie in beeldfracties, voor uitlijnen en
   * bijsnijden. Een functie en geen waarde: het element verandert terwijl het
   * menu openstaat (juist door dit menu), en met een waarde die bij het openen
   * is vastgelegd rekende twee keer bijsnijden op elkaar door.
   */
  getMaat: () => { halfW: number; halfH: number } | null;
  klembord: { clip: Clip; spoor: TrackKind } | null;
  onKlembord: (c: { clip: Clip; spoor: TrackKind } | null) => void;
  stijlKlembord: Clip | null;
  onStijlKlembord: (c: Clip | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // De uitklap staat naast het menu in plaats van erin (anders zou het scrollen
  // van het menu hem afsnijden). Daardoor moet de "klik buiten"-controle naar
  // allebei kijken; deed hij dat niet, dan sloot het hele menu zodra je in de
  // uitklap iets aanwees.
  const uitRef = useRef<HTMLDivElement>(null);
  const [uit, setUit] = useState<{ id: string; top: number; links: number } | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  // Meelezen met het document: zonder dit bleven de schuiven en labels in het
  // menu op hun oude waarde staan nadat je er zelf iets mee had veranderd.
  useEditor(store, (s) => s.doc);
  const clip = store.find(plek.clipId);

  useEffect(() => {
    function weg(e: MouseEvent) {
      const doel = e.target as Node;
      if (ref.current?.contains(doel) || uitRef.current?.contains(doel)) return;
      onSluit();
    }
    function toets(e: KeyboardEvent) {
      if (e.key === "Escape") onSluit();
    }
    // In het volgende tikje registreren, anders sluit de klik die het menu
    // opende hem meteen weer.
    const t = setTimeout(() => {
      window.addEventListener("mousedown", weg);
      window.addEventListener("keydown", toets);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", weg);
      window.removeEventListener("keydown", toets);
    };
  }, [onSluit]);

  if (!clip) return null;

  const vorm = clip.meta?.vorm;
  const isTekst = clip.type === "text";
  const isBeeld = clip.type === "image" || clip.type === "video";
  const tf = clip.transform;

  function doe(fn: () => void) {
    fn();
    onSluit();
  }

  /**
   * Uitklap openen op de hoogte van zijn eigen regel. De positie komt uit de
   * regel zelf en niet uit een vaste offset, zodat het ook klopt als het menu
   * moet scrollen.
   */
  function open(id: string, e: React.MouseEvent<HTMLElement>) {
    if (uit?.id === id) { setUit(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const menu = ref.current!.getBoundingClientRect();
    const rechts = menu.right + 268 < window.innerWidth;
    setUit({
      id,
      top: Math.min(r.top, window.innerHeight - 320),
      links: rechts ? menu.right + 4 : menu.left - 268,
    });
  }

  function plakStijl() {
    const bron = stijlKlembord;
    if (!bron || !clip) return;
    if (bron.type === "text" && clip.type === "text") store.setTextStyle(clip.id, { ...bron.style });
    const bt = { ...DEFAULT_TRANSFORM, ...bron.transform };
    store.setTransform(clip.id, {
      rotation: bt.rotation, cornerRadius: bt.cornerRadius, flipH: bt.flipH, flipV: bt.flipV,
    });
    store.updateClip(clip.id, { opacity: bron.opacity ?? 1 });
  }

  /** Uitsnede op een vaste verhouding, gecentreerd op wat er nu staat. */
  function snijBij(ratio: number | null) {
    if (!ratio) { store.setTransform(clip!.id, { crop: undefined }); return; }
    const m = getMaat();
    const huidig = m && m.halfH > 0 ? m.halfW / m.halfH : 1;
    const doelInBeeld = ratio * (9 / 16);
    const f = huidig / doelInBeeld;
    store.setTransform(clip!.id, {
      crop: f > 1
        ? { top: 0, bottom: 0, left: (1 - 1 / f) / 2, right: (1 - 1 / f) / 2 }
        : { left: 0, right: 0, top: (1 - f) / 2, bottom: (1 - f) / 2 },
    });
  }

  async function wisAchtergrond() {
    if (clip!.type !== "image" && clip!.type !== "video") return;
    const bron = clip!.src;
    if (bron.startsWith("data:")) {
      setMelding("Dit is een getekende vorm; die is al doorzichtig.");
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

  function zetKleur(k: string, waar: "vulling" | "lijn" | "tekst") {
    if (waar === "tekst") store.setTextStyle(clip!.id, { color: k });
    else store.dispatch({ op: "restyle_element", clipId: clip!.id, stijl: waar === "lijn" ? { lijn: k } : { vulling: k } });
  }

  return (
    <>
      <div
        ref={ref}
        style={{ left: plek.x, top: plek.y }}
        className="fixed z-[60] w-[300px] max-h-[76vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.18)] py-2"
      >
        <Regel icoon={ICOON.kopie} label="Kopiëren" snel="⌘C"
          onClick={() => doe(() => onKlembord({ clip, spoor: store.spoorKindVan(clip.id) ?? "overlay" }))} />
        <Regel icoon={ICOON.kwast} label="Stijl kopiëren" snel="⌥⌘C" onClick={() => doe(() => onStijlKlembord(clip))} />
        <Regel icoon={ICOON.kwast} label="Stijl plakken" grijs={!stijlKlembord} onClick={() => doe(plakStijl)} />
        <Regel icoon={ICOON.plakken} label="Plakken" snel="⌘V" grijs={!klembord}
          onClick={() => doe(() => klembord && store.plakClip(klembord.clip, klembord.spoor))} />
        <Regel icoon={ICOON.dupliceren} label="Dupliceren" snel="⌘D" onClick={() => doe(() => store.dupliceerOpZelfdePlek(clip.id))} />
        <Regel icoon={ICOON.prullenbak} label="Verwijderen" snel="DELETE" gevaar onClick={() => doe(() => store.removeClip(clip.id))} />

        <Streep />

        <Regel icoon={ICOON.lagen} label="Laag" meer actief={uit?.id === "laag"} onClick={(e) => open("laag", e)} />
        <Regel icoon={ICOON.uitlijnen} label="Uitlijnen met beeld" meer actief={uit?.id === "uitlijnen"} onClick={(e) => open("uitlijnen", e)} />

        {(isBeeld || vorm || isTekst || clip.meta?.diagram) && <Streep />}

        {isBeeld && (
          <>
            <Regel icoon={ICOON.bijsnijden} label="Bijsnijden" meer actief={uit?.id === "bijsnijden"} onClick={(e) => open("bijsnijden", e)} />
            <Regel icoon={ICOON.spiegel} label="Spiegelen" meer actief={uit?.id === "spiegelen"} onClick={(e) => open("spiegelen", e)} />
            <Regel icoon={ICOON.draaien} label="Draaien en hoeken" meer actief={uit?.id === "draaien"} onClick={(e) => open("draaien", e)} />
            <Regel icoon={ICOON.schaar} label={bezig ? "Bezig met uitknippen…" : "Achtergrond wissen"} grijs={bezig} onClick={() => void wisAchtergrond()} />
          </>
        )}

        {vorm && (
          <>
            <Regel icoon={ICOON.druppel} label="Vulkleur" kleur={vorm.vulling} meer actief={uit?.id === "vulling"} onClick={(e) => open("vulling", e)} />
            <Regel icoon={ICOON.penseel} label="Lijnkleur" kleur={vorm.lijn} meer actief={uit?.id === "lijn"} onClick={(e) => open("lijn", e)} />
            <Regel icoon={ICOON.schuif} label="Lijndikte" meer actief={uit?.id === "dikte"} onClick={(e) => open("dikte", e)} />
          </>
        )}

        {clip.meta?.diagram && (
          <Regel icoon={ICOON.diagram} label="Cijfers aanpassen" onClick={() => doe(onMeer)} />
        )}

        {isTekst && (
          <>
            <Regel icoon={ICOON.letter} label="Lettertype en grootte" meer actief={uit?.id === "letter"} onClick={(e) => open("letter", e)} />
            <Regel icoon={ICOON.penseel} label="Opmaak" meer actief={uit?.id === "opmaak"} onClick={(e) => open("opmaak", e)} />
            <Regel icoon={ICOON.druppel} label="Tekstkleur" kleur={clip.style.color === "#00000000" ? "#ffffff" : clip.style.color}
              meer actief={uit?.id === "tekstkleur"} onClick={(e) => open("tekstkleur", e)} />
            <Regel icoon={ICOON.ster} label="Teksteffect" meer actief={uit?.id === "effect"} onClick={(e) => open("effect", e)} />
            <Regel icoon={ICOON.toverstaf} label="Animatie" meer actief={uit?.id === "animatie"} onClick={(e) => open("animatie", e)} />
          </>
        )}

        <Streep />

        <Regel icoon={ICOON.schuif} label="Transparantie" meer actief={uit?.id === "transparantie"} onClick={(e) => open("transparantie", e)} />
        <Regel icoon={ICOON.slot} label={clip.locked ? "Ontgrendelen" : "Vergrendelen"} snel="⌥⇧L"
          onClick={() => doe(() => store.zetVergrendeld(clip.id, !clip.locked))} />
        <Regel icoon={ICOON.klok} label="Timing weergeven"
          onClick={() => doe(() => { store.select(clip.id); store.seek(clip.start + 0.01); })} />
        <Regel icoon={ICOON.instellingen} label="Meer instellingen" onClick={() => doe(onMeer)} />

        <Streep />
        <p className="px-4 py-1.5 text-[11px] text-slate-500 leading-snug">
          {clip.meta?.label ?? clip.type} · start {clip.start.toFixed(1)}s · {clip.duration.toFixed(1)}s
          {clip.meta?.sceneIndex ? ` · scène ${clip.meta.sceneIndex}` : ""}
        </p>
        {melding && <p className="px-4 pt-1 text-[12px] text-blue-700">{melding}</p>}
      </div>

      {uit && (
        <div
          ref={uitRef}
          style={{ left: uit.links, top: uit.top }}
          className="fixed z-[61] w-[264px] max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.18)] p-2"
        >
          {uit.id === "laag" && (
            <>
              <Sub label="Helemaal naar voren" onClick={() => doe(() => store.zetLaag(clip.id, "vooraan"))} />
              <Sub label="Naar voren" onClick={() => doe(() => store.zetLaag(clip.id, "voor"))} />
              <Sub label="Naar achter" onClick={() => doe(() => store.zetLaag(clip.id, "achter"))} />
              <Sub label="Helemaal naar achter" onClick={() => doe(() => store.zetLaag(clip.id, "achteraan"))} />
            </>
          )}

          {uit.id === "uitlijnen" && (
            <div className="grid grid-cols-2 gap-1">
              {([
                ["links", "Links"], ["boven", "Boven"],
                ["midden", "Midden"], ["centraal", "Centraal"],
                ["rechts", "Rechts"], ["onder", "Onder"],
              ] as const).map(([r, label]) => (
                <Sub key={r} label={label} onClick={() => doe(() => store.lijnUit(clip.id, r, getMaat()))} />
              ))}
            </div>
          )}

          {uit.id === "bijsnijden" && (
            <div className="space-y-2 p-1">
              <div className="grid grid-cols-3 gap-1">
                {VERHOUDINGEN.map((v) => (
                  <button key={v.label} type="button" onClick={() => snijBij(v.ratio)}
                    className="text-[13px] px-1 py-2 rounded-lg border border-slate-200 hover:bg-slate-50">
                    {v.label}
                  </button>
                ))}
              </div>
              {(["top", "right", "bottom", "left"] as const).map((kant) => (
                <Schuif key={kant}
                  label={`${{ top: "Boven", right: "Rechts", bottom: "Onder", left: "Links" }[kant]}: ${Math.round((tf?.crop?.[kant] ?? 0) * 100)}%`}
                  min={0} max={0.45} step={0.01} waarde={tf?.crop?.[kant] ?? 0}
                  onWijzig={(v) => store.setTransform(clip.id, { crop: { top: 0, right: 0, bottom: 0, left: 0, ...tf?.crop, [kant]: v } })} />
              ))}
              <p className="text-[11px] text-slate-500 leading-snug">
                Bijsnijden maakt het element écht kleiner, dus het kader eromheen blijft kloppen.
              </p>
            </div>
          )}

          {uit.id === "spiegelen" && (
            <>
              <Sub label={`Horizontaal${tf?.flipH ? " (aan)" : ""}`} onClick={() => store.setTransform(clip.id, { flipH: !tf?.flipH })} />
              <Sub label={`Verticaal${tf?.flipV ? " (aan)" : ""}`} onClick={() => store.setTransform(clip.id, { flipV: !tf?.flipV })} />
            </>
          )}

          {uit.id === "draaien" && (
            <div className="space-y-2 p-1">
              <Schuif label={`Draaien: ${Math.round(tf?.rotation ?? 0)}°`} min={-180} max={180} step={1}
                waarde={tf?.rotation ?? 0} onWijzig={(v) => store.setTransform(clip.id, { rotation: v })} />
              <div className="grid grid-cols-4 gap-1">
                {[0, 90, 180, 270].map((g) => (
                  <button key={g} type="button" onClick={() => store.setTransform(clip.id, { rotation: g })}
                    className="text-[13px] py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">{g}°</button>
                ))}
              </div>
              <Schuif label={`Afgeronde hoeken: ${Math.round((tf?.cornerRadius ?? 0) * 100)}%`} min={0} max={0.5} step={0.01}
                waarde={tf?.cornerRadius ?? 0} onWijzig={(v) => store.setTransform(clip.id, { cornerRadius: v })} />
            </div>
          )}

          {(uit.id === "vulling" || uit.id === "lijn" || uit.id === "tekstkleur") && (
            <Kleuren onKies={(k) => zetKleur(k, uit.id === "tekstkleur" ? "tekst" : uit.id === "lijn" ? "lijn" : "vulling")} />
          )}

          {uit.id === "dikte" && vorm && (
            <div className="p-1">
              <Schuif label={`Lijndikte: ${(vorm.dikte * 100).toFixed(0)}`} min={0.01} max={0.2} step={0.005} waarde={vorm.dikte}
                onWijzig={(v) => store.dispatch({ op: "restyle_element", clipId: clip.id, stijl: { dikte: v } })} />
            </div>
          )}

          {uit.id === "letter" && isTekst && (
            <div className="p-1 space-y-2">
              <Schuif label={`Grootte: ${Math.round(clip.style.fontSize)}`} min={8} max={220} step={1}
                waarde={clip.style.fontSize} onWijzig={(v) => store.setTextStyle(clip.id, { fontSize: v })} />
              <div className="max-h-56 overflow-y-auto">
                {LETTERTYPEN.map((l) => (
                  <button key={l.id} type="button"
                    onClick={() => store.setTextStyle(clip.id, { fontFamily: l.stack })}
                    className={`w-full text-left px-3 py-2 rounded-lg text-[15px] ${
                      lettertypeVanStack(clip.style.fontFamily) === l.id ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-900"
                    }`}
                    style={{ fontFamily: l.stack }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {uit.id === "opmaak" && isTekst && (
            <div className="p-1 space-y-2">
              <div className="grid grid-cols-4 gap-1">
                <Schakel aan={clip.style.fontWeight >= 700} onClick={() => store.setTextStyle(clip.id, { fontWeight: clip.style.fontWeight >= 700 ? 400 : 700 })}><b>B</b></Schakel>
                <Schakel aan={!!clip.style.italic} onClick={() => store.setTextStyle(clip.id, { italic: !clip.style.italic })}><i>I</i></Schakel>
                <Schakel aan={!!clip.style.underline} onClick={() => store.setTextStyle(clip.id, { underline: !clip.style.underline })}><u>U</u></Schakel>
                <Schakel aan={!!clip.style.strike} onClick={() => store.setTextStyle(clip.id, { strike: !clip.style.strike })}><s>S</s></Schakel>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(["left", "center", "right"] as const).map((a) => (
                  <Schakel key={a} aan={clip.style.align === a} onClick={() => store.setTextStyle(clip.id, { align: a })}>
                    {a === "left" ? "⇤" : a === "center" ? "≡" : "⇥"}
                  </Schakel>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {([
                  ["normaal", "Aa"], ["hoofdletters", "AA"], ["kleine-letters", "aa"],
                ] as const).map(([id, label]) => (
                  <Schakel key={id} aan={(clip.style.letters ?? "normaal") === id} onClick={() => store.setTextStyle(clip.id, { letters: id })}>
                    {label}
                  </Schakel>
                ))}
              </div>
              <Schuif label={`Letterafstand: ${(clip.style.letterSpacing ?? 0).toFixed(0)}`} min={-10} max={40} step={1}
                waarde={clip.style.letterSpacing ?? 0} onWijzig={(v) => store.setTextStyle(clip.id, { letterSpacing: v })} />
              <Schuif label={`Regelafstand: ${(clip.style.lineHeight ?? 1.2).toFixed(2)}`} min={0.8} max={2.4} step={0.05}
                waarde={clip.style.lineHeight ?? 1.2} onWijzig={(v) => store.setTextStyle(clip.id, { lineHeight: v })} />
            </div>
          )}

          {uit.id === "effect" && isTekst && (
            <div className="grid grid-cols-2 gap-1 p-1">
              {TEKST_EFFECTEN.map((e) => (
                <button key={e.id} type="button"
                  onClick={() => store.setTextStyle(clip.id, pasEffectToe(clip.style, e.id))}
                  className={`text-[13px] px-2 py-2 rounded-lg border text-left ${
                    huidigEffect(clip.style) === e.id ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          )}

          {uit.id === "animatie" && isTekst && (
            <>
              {ANIMATIES.map((a) => (
                <Sub key={a.id} label={a.label} actief={(clip.preset ?? "none") === a.id}
                  onClick={() => store.updateClip(clip.id, { preset: a.id })} />
              ))}
            </>
          )}

          {uit.id === "transparantie" && (
            <div className="p-1">
              <Schuif label={`Transparantie: ${Math.round((clip.opacity ?? 1) * 100)}%`} min={0} max={1} step={0.01}
                waarde={clip.opacity ?? 1} onWijzig={(v) => store.updateClip(clip.id, { opacity: v })} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── Onderdelen ───────────────────────────────────────────────────────────────

function Regel({
  icoon, label, snel, onClick, grijs, gevaar, meer, actief, kleur,
}: {
  icoon: ReactNode;
  label: string;
  snel?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  grijs?: boolean;
  gevaar?: boolean;
  meer?: boolean;
  actief?: boolean;
  /** Kleurbolletje in plaats van niets, bij een kleurregel. */
  kleur?: string;
}) {
  return (
    <button
      type="button"
      disabled={grijs}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2 text-left text-[14px] disabled:opacity-35 disabled:hover:bg-transparent ${
        actief ? "bg-slate-100" : "hover:bg-slate-100"
      } ${gevaar ? "text-red-600 hover:bg-red-50" : "text-slate-800"}`}
    >
      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] shrink-0" aria-hidden>{icoon}</svg>
      <span className="flex-1 truncate">{label}</span>
      {kleur && <span className="w-4 h-4 rounded-full border border-slate-300 shrink-0" style={{ background: kleur }} />}
      {snel && (
        <span className="shrink-0 text-[11px] text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5">{snel}</span>
      )}
      {meer && <span className="shrink-0 text-slate-400">›</span>}
    </button>
  );
}

function Sub({ label, onClick, actief }: { label: string; onClick: () => void; actief?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-[13px] ${
        actief ? "bg-blue-50 text-blue-700" : "text-slate-800 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}

function Streep() {
  return <div className="my-1.5 border-t border-slate-200" />;
}

function Schakel({ aan, onClick, children }: { aan: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-2 rounded-lg border text-[14px] ${
        aan ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
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

function Kleuren({ onKies }: { onKies: (k: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 p-2">
      {PALET.map((k) => (
        <button key={k} type="button" onClick={() => onKies(k)} aria-label={k}
          className="w-7 h-7 rounded-full border border-slate-200" style={{ background: k }} />
      ))}
      <label className="w-7 h-7 rounded-full border border-slate-200 overflow-hidden cursor-pointer relative">
        <span className="absolute inset-0 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" />
        <input type="color" onChange={(e) => onKies(e.target.value)} className="opacity-0 w-full h-full cursor-pointer" />
      </label>
    </div>
  );
}
