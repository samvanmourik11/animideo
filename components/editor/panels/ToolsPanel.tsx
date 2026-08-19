"use client";

// ── Tools ────────────────────────────────────────────────────────────────────
//
// Het gereedschap dat je met de hand gebruikt: een pen om iets aan te strepen,
// een plakbriefje, een tabel en een handtekening. Canva heeft hier een uitklap-
// balkje voor; bij ons is het een paneel, omdat pen en tabel instellingen hebben
// die je wilt zien terwijl je bezig bent.

import { useState } from "react";
import { PENNEN, alsDataUri, plakbriefjeSvg, tabelSvg, BRIEFJE_KLEUREN, type PenStijl } from "@/lib/editor/tekening";
import { breedteNaarSchaal } from "@/lib/editor/element-geometry";
import type { EditorStore } from "@/lib/editor/store";
import { heeftBeeld, huidigeClipId, nieuwId } from "@/lib/editor/plaatsing";
import { KleurKiezer, Melding, PaneelKop, Sectie } from "../ui";

export default function ToolsPanel({
  store,
  pen,
  onPen,
  onSluit,
}: {
  store: EditorStore;
  pen: PenStijl | null;
  onPen: (stijl: PenStijl | null) => void;
  onSluit: () => void;
}) {
  const [melding, setMelding] = useState<string | null>(null);
  const [penId, setPenId] = useState("pen");
  const [rijen, setRijen] = useState(3);
  const [kolommen, setKolommen] = useState(3);
  const [briefjeKleur, setBriefjeKleur] = useState(BRIEFJE_KLEUREN[0]);
  const leeg = !heeftBeeld(store);

  function plaats(svg: string, label: string, breedte: number, formaat: { breedte: number; hoogte: number }) {
    const clipId = huidigeClipId(store);
    if (!clipId) return setMelding("Zet eerst beeld op de tijdlijn.");
    const doc = store.getState().doc;
    const id = nieuwId("tool");
    const res = store.dispatch({
      op: "add_element",
      clipId,
      src: alsDataUri(svg),
      label,
      elementId: id,
      x: 0.5,
      y: 0.5,
      scale: breedteNaarSchaal(breedte, formaat, doc),
    });
    if (res.ok) store.select(id);
    setMelding(res.ok ? `${label} toegevoegd` : res.error.message);
  }

  function kiesPen(id: string) {
    const gekozen = PENNEN.find((p) => p.id === id)!;
    setPenId(id);
    // Nog een keer op dezelfde pen klikken zet hem uit; anders blijf je tekenen
    // terwijl je eigenlijk iets wilt verslepen.
    onPen(pen && penId === id ? null : { ...gekozen.stijl });
  }

  return (
    <div className="flex flex-col h-full">
      <PaneelKop titel="Tools" onSluit={onSluit} />
      <Melding tekst={melding} />

      <div className="flex-1 overflow-y-auto pb-6">
        <Sectie titel="Tekenen">
          <div className="grid grid-cols-2 gap-2">
            {PENNEN.map((p) => {
              const actief = pen !== null && penId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={leeg}
                  onClick={() => kiesPen(p.id)}
                  className={`rounded-xl border px-3 py-3 text-left disabled:opacity-40 ${
                    actief ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className="block rounded-full mb-2"
                    style={{
                      background: p.stijl.kleur,
                      height: Math.max(3, p.stijl.dikte * 260),
                      opacity: p.stijl.dekking ?? 1,
                    }}
                  />
                  <span className="text-[13px] font-medium text-slate-800">{p.label}</span>
                  {actief && <span className="block text-[11px] text-violet-700">Actief — teken op het canvas</span>}
                </button>
              );
            })}
          </div>
          {pen && (
            <div className="mt-3 space-y-3">
              <KleurKiezer label="Penkleur" waarde={pen.kleur} onKies={(kleur) => onPen({ ...pen, kleur })} />
              <div>
                <p className="text-[12px] font-medium text-slate-600 mb-1">Dikte</p>
                <input
                  type="range"
                  min={0.002}
                  max={0.05}
                  step={0.001}
                  value={pen.dikte}
                  onChange={(e) => onPen({ ...pen, dikte: Number(e.target.value) })}
                  className="w-full accent-violet-600"
                />
              </div>
              <button
                type="button"
                onClick={() => onPen(null)}
                className="w-full rounded-lg border border-slate-200 hover:bg-slate-50 text-[13px] py-2 text-slate-700"
              >
                Klaar met tekenen
              </button>
            </div>
          )}
        </Sectie>

        <Sectie titel="Plakbriefje">
          <div className="flex gap-2 mb-2">
            {BRIEFJE_KLEUREN.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setBriefjeKleur(k)}
                aria-label={k}
                className={`w-8 h-8 rounded-md border-2 ${briefjeKleur === k ? "border-violet-600" : "border-slate-200"}`}
                style={{ background: k }}
              />
            ))}
          </div>
          <button
            type="button"
            disabled={leeg}
            onClick={() => plaats(plakbriefjeSvg(briefjeKleur), "Plakbriefje", 0.28, { breedte: 400, hoogte: 340 })}
            className="w-full rounded-lg bg-slate-900 hover:bg-slate-700 disabled:opacity-40 text-white text-[13px] py-2.5"
          >
            Plakbriefje plaatsen
          </button>
          <p className="text-[11px] text-slate-500 mt-2">Zet er via Tekst een notitie overheen.</p>
        </Sectie>

        <Sectie titel="Tabel">
          <div className="flex items-center gap-3 mb-2">
            <label className="flex-1 text-[12px] text-slate-600">
              Rijen
              <input
                type="number" min={1} max={20} value={rijen}
                onChange={(e) => setRijen(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[14px] text-slate-900"
              />
            </label>
            <label className="flex-1 text-[12px] text-slate-600">
              Kolommen
              <input
                type="number" min={1} max={12} value={kolommen}
                onChange={(e) => setKolommen(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[14px] text-slate-900"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={leeg}
            onClick={() => {
              const svg = tabelSvg({ rijen, kolommen, kop: true });
              const b = 800;
              const h = Math.max(24, Math.round(b / Math.max(1, kolommen) / 2.6)) * Math.max(1, rijen);
              plaats(svg, `Tabel ${rijen}×${kolommen}`, 0.55, { breedte: b, hoogte: h });
            }}
            className="w-full rounded-lg bg-slate-900 hover:bg-slate-700 disabled:opacity-40 text-white text-[13px] py-2.5"
          >
            Tabel plaatsen
          </button>
          <p className="text-[11px] text-slate-500 mt-2 leading-snug">
            Een leeg raster. De cellen vul je met losse tekstlagen, zodat je ze apart kunt
            aanpassen zonder de tabel opnieuw te tekenen.
          </p>
        </Sectie>
      </div>
    </div>
  );
}
