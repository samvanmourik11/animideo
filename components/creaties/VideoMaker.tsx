"use client";

import { useState } from "react";
import Link from "next/link";
import { FORMATEN, type Formaat } from "@/lib/creaties/makers";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { VIDEO_MODELLEN, STANDAARD_VIDEO_MODEL } from "@/lib/video-modellen";
import type { Creatie } from "@/lib/creaties/types";
import CreatieKaart from "./CreatieKaart";
import CreatieDetail from "./CreatieDetail";
import BeeldKiezer, { type GekozenBeeld } from "./BeeldKiezer";
import { startMaker, useCreaties, zetFavoriet } from "./gebruik-creaties";

// Het maakscherm voor video's, met dezelfde opbouw als Beeld. Twee manieren: een beeld
// tot leven brengen (de beste resultaten: je bepaalt zelf hoe het eruitziet), of alleen
// met tekst beschrijven.

const FORMAAT_LABEL: Record<Formaat, string> = { "1:1": "Vierkant", "9:16": "Staand", "16:9": "Liggend" };

export default function VideoMaker() {
  const [manier, setManier] = useState<"beeld" | "tekst">("beeld");
  const [bron, setBron] = useState<GekozenBeeld | null>(null);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(STANDAARD_VIDEO_MODEL);
  const [formaat, setFormaat] = useState<Formaat>("16:9");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState<Creatie | null>(null);

  const lijst = useCreaties({ soort: "video" });
  const gekozen = VIDEO_MODELLEN.find((m) => m.id === model) ?? VIDEO_MODELLEN[0];
  const prijs = manier === "beeld" ? gekozen.credits : CREDIT_COSTS.VIDEO_GENERATION;
  const klaarOmTeMaken = manier === "beeld" ? !!bron : !!prompt.trim();

  async function maak() {
    setBezig(true);
    setFout(null);
    try {
      const c =
        manier === "beeld"
          ? await startMaker(
              "beeld-naar-video",
              { bronUrl: bron!.url, prompt, model, formaat: bron!.formaat },
              bron!.id ?? null,
            )
          : await startMaker("tekst-naar-video", { prompt, formaat });
      lijst.zetVoor(c);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  }

  const tab = (actief: boolean) =>
    `flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
      actief ? "bg-paneel text-tekst shadow-sm" : "text-tekst-3 hover:text-tekst"
    }`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start">
      <div className="n-kaart space-y-5 lg:sticky lg:top-8">
        <div>
          <h1 className="text-xl font-bold text-tekst">🎬 Video maken</h1>
          <p className="text-sm text-tekst-3 mt-1">Breng een beeld tot leven, of beschrijf wat er moet gebeuren.</p>
        </div>

        <div className="flex gap-1 p-1 rounded-xl bg-paneel-2">
          <button onClick={() => setManier("beeld")} className={tab(manier === "beeld")}>Van een beeld</button>
          <button onClick={() => setManier("tekst")} className={tab(manier === "tekst")}>Alleen tekst</button>
        </div>

        {manier === "beeld" && (
          <div>
            <label className="n-label">Beeld</label>
            <div className="mt-1.5">
              <BeeldKiezer waarde={bron} onKies={setBron} leeg="Welk beeld moet gaan bewegen?" />
            </div>
          </div>
        )}

        <div>
          <label className="n-label">{manier === "beeld" ? "Wat moet er bewegen?" : "Wat gebeurt er?"}</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder={
              manier === "beeld"
                ? "Bijvoorbeeld: ze draait zich om en lacht, de camera zoomt langzaam in (mag leeg)"
                : "Bijvoorbeeld: een zeilboot op het IJsselmeer bij zonsondergang, de camera vliegt langzaam voorbij"
            }
            className="n-invoer mt-1.5 resize-none"
          />
        </div>

        {manier === "beeld" ? (
          <div>
            <label className="n-label">Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="n-invoer mt-1.5">
              {VIDEO_MODELLEN.map((m) => (
                <option key={m.id} value={m.id}>{m.naam} · {m.credits} cr.</option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-tekst-3">{gekozen.waarvoor}</p>
          </div>
        ) : (
          <div>
            <label className="n-label">Formaat</label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {FORMATEN.map((f) => (
                <button
                  key={f}
                  onClick={() => setFormaat(f)}
                  className={`rounded-xl border py-2 text-sm transition-colors ${
                    formaat === f ? "border-blue-500 bg-blue-500/10 text-tekst" : "border-rand text-tekst-3 hover:text-tekst"
                  }`}
                >
                  {FORMAAT_LABEL[f]}
                  <span className="block text-[10px] text-tekst-3">{f}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button onClick={maak} disabled={bezig || !klaarOmTeMaken} className="btn-primary w-full disabled:opacity-50">
          {bezig ? "Bezig met insturen…" : `Maak video · ${prijs} credits`}
        </button>
        {fout && (
          <p className="text-sm text-red-600 dark:text-red-300 bg-red-500/10 rounded-xl px-3 py-2">
            {fout}
            {fout === "Niet genoeg credits." && (
              <> <Link href="/pricing" className="underline">Credits bijkopen</Link></>
            )}
          </p>
        )}
        <p className="text-[11px] text-tekst-3">Een video van 5 seconden duurt meestal 1 tot 3 minuten. Je kunt ondertussen gewoon verder.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-tekst-2">Jouw video&apos;s</h2>
          <Link href="/mijn-werk" className="text-xs text-blue-500 hover:text-blue-400">Hele bibliotheek →</Link>
        </div>
        {lijst.laden && lijst.creaties.length === 0 ? (
          <p className="text-sm text-tekst-3">Laden…</p>
        ) : lijst.creaties.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-rand p-12 text-center text-tekst-3">
            <div className="text-4xl mb-3">🎬</div>
            Hier verschijnen je video&apos;s. Kies links een beeld om tot leven te brengen.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {lijst.creaties.map((c) => (
              <CreatieKaart
                key={c.id}
                creatie={c}
                onOpen={() => setOpen(c)}
                onFavoriet={async () => lijst.werkBij(await zetFavoriet(c))}
              />
            ))}
          </div>
        )}
      </div>

      {open && (
        <CreatieDetail
          creatie={lijst.creaties.find((c) => c.id === open.id) ?? open}
          onSluit={() => setOpen(null)}
          onGewijzigd={lijst.werkBij}
          onWeg={lijst.haalWeg}
          onNieuw={(c) => {
            if (c.soort === "video") lijst.zetVoor(c);
          }}
        />
      )}
    </div>
  );
}
