"use client";

// ── Tekst ────────────────────────────────────────────────────────────────────
//
// Drie manieren om tekst in beeld te krijgen, van snel naar precies:
//
//   1. Een tekstvak in de maat die je nodig hebt (koptekst, subtitel, platte
//      tekst) — één klik.
//   2. Een kant-en-klaar sjabloon: lettertype, kleur en effect in één, met een
//      voorbeeld dat er precies zo uitziet als wat je krijgt.
//   3. Zelf een lettertype kiezen en daarna rechts verder verfijnen.
//
// Plus "Schrijf mee": laat de tekst zelf bedenken op basis van wat er in deze
// scène gebeurt. Dat is het enige stuk hier dat een model aanraakt; de opmaak
// blijft altijd handwerk.

import { useMemo, useState } from "react";
import {
  LETTERTYPEN, TEKST_SJABLONEN, TEKST_SOORTEN, lettertypeStack,
} from "@/lib/editor/text-styles";
import type { EditorStore } from "@/lib/editor/store";
import { heeftBeeld, huidigeClipId, nieuwId } from "@/lib/editor/plaatsing";
import { DEFAULT_TEXT_STYLE, type TextStyle } from "@/lib/editor/timeline";
import { pakOp } from "@/lib/editor/sleep";
import { GenereerVak, Melding, PaneelKop, Sectie, Zoekbalk } from "../ui";

export default function TekstPanel({ store, onSluit }: { store: EditorStore; onSluit: () => void }) {
  const [zoek, setZoek] = useState("");
  const [melding, setMelding] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [letter, setLetter] = useState("systeem");
  const leeg = !heeftBeeld(store);

  function plaats(tekst: string, stijl: Partial<TextStyle>, y = 0.5) {
    const clipId = huidigeClipId(store);
    if (!clipId) return setMelding("Zet eerst beeld op de tijdlijn.");
    const id = nieuwId("tekst");
    const res = store.dispatch({
      op: "add_text",
      clipId,
      text: tekst,
      textId: id,
      x: 0.5,
      y,
      style: { ...stijl, fontFamily: stijl.fontFamily ?? lettertypeStack(letter) },
    });
    // Meteen selecteren: dan staan lettertype, grootte en effect boven het beeld
    // klaar en kun je de tekst rechts overtypen zonder eerst te zoeken.
    if (res.ok) store.select(id);
    setMelding(res.ok ? "Tekst geplaatst — pas hem aan in de balk boven het beeld" : res.error.message);
  }

  async function schrijfMee(opdracht: string) {
    const clipId = huidigeClipId(store);
    if (!clipId) return setMelding("Zet eerst beeld op de tijdlijn.");
    setBezig(true);
    setMelding(null);
    try {
      const clip = store.find(clipId);
      const res = await fetch("/api/editor/tekst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opdracht,
          context: {
            gesproken: clip?.meta?.transcript ?? null,
            beeld: clip?.meta?.genPrompt ?? null,
          },
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.tekst) {
        setMelding(d.error ?? "Het schrijven lukte niet.");
        return;
      }
      plaats(d.tekst, TEKST_SOORTEN[1].stijl);
    } catch {
      setMelding("Het schrijven lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  const letters = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    if (!q) return LETTERTYPEN;
    return LETTERTYPEN.filter((l) => `${l.label} ${l.hint}`.toLowerCase().includes(q));
  }, [zoek]);

  return (
    <div className="flex flex-col h-full">
      <PaneelKop titel="Tekst" onSluit={onSluit} />
      <Zoekbalk waarde={zoek} onWijzig={setZoek} hint="Zoek een lettertype" />

      <div className="px-4 pb-3 shrink-0">
        <button
          type="button"
          disabled={leeg}
          onClick={() => plaats("Jouw tekst", TEKST_SOORTEN[1].stijl)}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-[14px] font-semibold py-3"
        >
          Tekstvak toevoegen
        </button>
      </div>

      <GenereerVak
        hint="Waar moet de tekst over gaan?"
        knop="Schrijf mee"
        bezig={bezig}
        onGenereer={schrijfMee}
        toelichting="Kijkt naar wat er in deze scène gezegd wordt en stelt een korte zin voor."
      />
      <Melding tekst={melding} />

      <div className="flex-1 overflow-y-auto pb-6">
        <Sectie titel="Tekstsoort">
          <div className="space-y-1.5">
            {TEKST_SOORTEN.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={leeg}
                onClick={() => plaats(t.voorbeeld, t.stijl, t.id === "ondertitel" ? 0.82 : 0.5)}
                draggable={!leeg}
                onDragStart={(e) =>
                  pakOp(e, {
                    soort: "tekst",
                    tekst: t.voorbeeld,
                    stijl: { ...t.stijl, fontFamily: lettertypeStack(letter) },
                  })
                }
                title="Klik of sleep naar het beeld"
                className="w-full text-left rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-4 py-3 disabled:opacity-40"
                style={{
                  fontFamily: lettertypeStack(letter),
                  // De knop laat de verhouding zien, niet de echte grootte: 120px
                  // zou het paneel uit lopen. Wel dezelfde vetheid en afstand.
                  fontSize: Math.max(14, Math.min(26, (t.stijl.fontSize ?? 44) / 4.5)),
                  fontWeight: t.stijl.fontWeight ?? 400,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Sectie>

        <Sectie titel="Stijlen">
          <div className="grid grid-cols-2 gap-2">
            {TEKST_SJABLONEN.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={leeg}
                onClick={() => plaats(s.tekst, s.stijl, s.id === "ondertitel" ? 0.82 : 0.5)}
                draggable={!leeg}
                onDragStart={(e) => pakOp(e, { soort: "tekst", tekst: s.tekst, stijl: s.stijl })}
                title={`${s.label} — klik of sleep naar het beeld`}
                className="rounded-xl bg-slate-900 hover:ring-2 hover:ring-blue-500 h-20 flex items-center justify-center px-2 overflow-hidden disabled:opacity-40"
              >
                <span style={voorbeeldStijl(s.stijl)} className="text-center leading-tight truncate">
                  {s.tekst}
                </span>
              </button>
            ))}
          </div>
        </Sectie>

        <Sectie titel="Lettertypen">
          <div className="space-y-1">
            {letters.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLetter(l.id)}
                className={`w-full text-left rounded-lg px-3 py-2.5 border ${
                  letter === l.id ? "border-blue-500 bg-blue-50" : "border-transparent hover:bg-slate-50"
                }`}
              >
                <span className="block text-[16px] text-slate-900" style={{ fontFamily: l.stack }}>
                  {l.label}
                </span>
                <span className="block text-[11px] text-slate-500">{l.hint}</span>
              </button>
            ))}
            {letters.length === 0 && <p className="text-[13px] text-slate-500">Geen lettertype gevonden.</p>}
          </div>
          <p className="text-[11px] text-slate-500 mt-2 leading-snug">
            Alleen lettertypen die ook op de renderserver staan. Een letter die daar ontbreekt zou een
            andere video opleveren dan je hier ziet.
          </p>
        </Sectie>
      </div>
    </div>
  );
}

/** De sjabloontegel op paneelgrootte: dezelfde opmaak, kleiner gerekend. */
function voorbeeldStijl(s: TextStyle): React.CSSProperties {
  const f = 22 / (s.fontSize || DEFAULT_TEXT_STYLE.fontSize);
  return {
    fontFamily: s.fontFamily,
    fontSize: 22,
    fontWeight: s.fontWeight,
    letterSpacing: (s.letterSpacing ?? 0) * f,
    color: s.color === "#00000000" ? "transparent" : s.color,
    background: s.background,
    padding: s.background ? "2px 8px" : undefined,
    borderRadius: s.background ? 6 : undefined,
    WebkitTextStroke: s.stroke ? `${Math.max(0.5, s.stroke.width * f)}px ${s.stroke.color}` : undefined,
    textShadow: s.shadow
      ? `${s.shadow.x * f}px ${s.shadow.y * f}px ${s.shadow.blur * f}px ${s.shadow.color}`
      : undefined,
  };
}
