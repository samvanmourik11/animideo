"use client";

// ── Sjablonen ────────────────────────────────────────────────────────────────
//
// Een sjabloon zet meerdere lagen in één keer neer: vlak, titel en onderregel.
// Je vult de teksten hier vooraf in, zodat je niet daarna nog drie keer hoeft te
// dubbelklikken op het canvas.
//
// Na plaatsen is het gewoon losse lagen. Dat is bewust: een blok dat je alleen
// in zijn geheel kunt weggooien is precies waar een editor voor bedoeld is om
// van af te komen.

import { useState } from "react";
import { SJABLONEN } from "@/lib/editor/sjablonen";
import type { EditorStore } from "@/lib/editor/store";
import { heeftBeeld, huidigeClipId } from "@/lib/editor/plaatsing";
import { Melding, PaneelKop, Sectie } from "../ui";

export default function SjablonenPanel({ store, onSluit }: { store: EditorStore; onSluit: () => void }) {
  const [titel, setTitel] = useState("");
  const [onder, setOnder] = useState("");
  const [melding, setMelding] = useState<string | null>(null);
  const leeg = !heeftBeeld(store);

  function plaats(id: string) {
    const sjabloon = SJABLONEN.find((s) => s.id === id)!;
    const clipId = huidigeClipId(store);
    if (!clipId) return setMelding("Zet eerst beeld op de tijdlijn.");

    const ops = sjabloon.bouw(clipId, {
      titel: titel.trim() || "Jouw titel",
      onder: onder.trim() || "Een korte toelichting",
    });

    // Eén voor één, zodat een laag die niet past de rest niet meesleept — en
    // zodat je ze los kunt terugdraaien in de geschiedenis.
    const mislukt: string[] = [];
    for (const op of ops) {
      const res = store.dispatch(op);
      if (!res.ok) mislukt.push(res.error.message);
    }
    setMelding(
      mislukt.length === 0
        ? `${sjabloon.label} geplaatst — sleep de onderdelen zoals je wilt`
        : `Deels geplaatst. ${mislukt[0]}`
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PaneelKop titel="Sjablonen" onSluit={onSluit} />

      <div className="px-4 pb-3 space-y-2 shrink-0">
        <input
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          placeholder="Titel"
          className="w-full rounded-xl bg-slate-100 focus:bg-white border border-transparent focus:border-violet-400 px-3 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
        <input
          value={onder}
          onChange={(e) => setOnder(e.target.value)}
          placeholder="Regel eronder"
          className="w-full rounded-xl bg-slate-100 focus:bg-white border border-transparent focus:border-violet-400 px-3 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
      </div>

      <Melding tekst={melding} />

      <div className="flex-1 overflow-y-auto pb-6">
        <Sectie titel="Kies een opzet">
          <div className="space-y-2">
            {SJABLONEN.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={leeg}
                onClick={() => plaats(s.id)}
                className="w-full rounded-xl border border-slate-200 hover:border-violet-400 hover:bg-violet-50/40 p-2 text-left disabled:opacity-40"
              >
                <div className="relative aspect-video rounded-lg bg-slate-700 overflow-hidden">
                  {s.voorbeeld.map((v, i) =>
                    v.vorm ? (
                      <span
                        key={i}
                        className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded"
                        style={{
                          top: `${v.y * 100}%`,
                          height: `${(v.hoogte ?? 0.2) * 100}%`,
                          width: v.vorm === "balk" || v.vorm === "verloop" ? "100%" : "34%",
                          background: v.vorm === "verloop" ? `linear-gradient(to top, ${v.kleur}, transparent)` : v.kleur,
                          borderRadius: v.vorm === "cirkel" ? "9999px" : undefined,
                          opacity: v.vorm === "verloop" ? 0.9 : 1,
                        }}
                      />
                    ) : (
                      <span
                        key={i}
                        className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-semibold whitespace-nowrap"
                        style={{ top: `${v.y * 100}%`, color: v.kleur }}
                      >
                        {v.tekst}
                      </span>
                    )
                  )}
                </div>
                <p className="text-[13px] font-medium text-slate-800 mt-1.5">{s.label}</p>
                <p className="text-[11px] text-slate-500 leading-snug">{s.hint}</p>
              </button>
            ))}
          </div>
        </Sectie>
      </div>
    </div>
  );
}
