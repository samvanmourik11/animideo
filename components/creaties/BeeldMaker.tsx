"use client";

import { useState } from "react";
import Link from "next/link";
import { FORMATEN, beeldCredits, type Formaat } from "@/lib/creaties/makers";
import type { Creatie } from "@/lib/creaties/types";
import CreatieKaart from "./CreatieKaart";
import CreatieDetail from "./CreatieDetail";
import { startMaker, useCreaties, zetFavoriet } from "./gebruik-creaties";

// Het maakscherm voor beelden. Dezelfde opbouw komt straks terug bij Video en de
// effecten: links wat je wilt (met de prijs vóór je klikt), rechts je resultaten, die
// meteen ook in de bibliotheek staan.

const FORMAAT_LABEL: Record<Formaat, string> = { "1:1": "Vierkant", "9:16": "Staand", "16:9": "Liggend" };

const VOORBEELDEN = [
  "Een bakker in Volendam die verse stroopwafels uit de oven haalt, warm ochtendlicht",
  "Productfoto van een blauwe koffiemok op een houten tafel, zachte studiobelichting",
  "Een vrolijke wijkverpleegkundige op de fiets door een Hollandse straat, illustratiestijl",
  "Grachtenpanden in Amsterdam in Delfts-blauwe stijl",
];

export default function BeeldMaker() {
  const [prompt, setPrompt] = useState("");
  const [formaat, setFormaat] = useState<Formaat>("1:1");
  const [kwaliteit, setKwaliteit] = useState<"standaard" | "pro">("standaard");
  const [aantal, setAantal] = useState(1);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState<Creatie | null>(null);

  const lijst = useCreaties({ maker: "beeld" });
  const prijs = beeldCredits(kwaliteit) * aantal;

  async function maak() {
    setBezig(true);
    setFout(null);
    try {
      // Na elkaar insturen, niet tegelijk: dan houdt de server de grens van het aantal
      // dingen tegelijk in de maak netjes bij, en stopt het bij de eerste fout.
      for (let i = 0; i < aantal; i++) {
        const c = await startMaker("beeld", { prompt, formaat, kwaliteit });
        lijst.zetVoor(c);
      }
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-6 items-start">
      <div className="card space-y-5 lg:sticky lg:top-8">
        <div>
          <h1 className="text-xl font-bold text-white">🖼️ Beeld maken</h1>
          <p className="text-sm text-slate-400 mt-1">Schrijf wat je wilt zien. Alles wat je maakt komt in je bibliotheek.</p>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Wat wil je zien?</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && prompt.trim() && !bezig) maak();
            }}
            rows={5}
            placeholder="Bijvoorbeeld: een bakker in Volendam die verse stroopwafels uit de oven haalt"
            className="input mt-1.5 resize-none"
          />
          {!prompt && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {VOORBEELDEN.map((v) => (
                <button
                  key={v}
                  onClick={() => setPrompt(v)}
                  className="text-[11px] text-slate-400 bg-white/5 hover:bg-white/10 rounded-full px-2.5 py-1 text-left"
                >
                  {v.length > 42 ? v.slice(0, 42) + "…" : v}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Formaat</label>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {FORMATEN.map((f) => (
              <button
                key={f}
                onClick={() => setFormaat(f)}
                className={`rounded-xl border py-2 text-sm transition-colors ${
                  formaat === f ? "border-blue-500 bg-blue-500/15 text-white" : "border-white/10 text-slate-400 hover:text-white"
                }`}
              >
                {FORMAAT_LABEL[f]}
                <span className="block text-[10px] text-slate-500">{f}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Kwaliteit</label>
            <select
              value={kwaliteit}
              onChange={(e) => setKwaliteit(e.target.value as "standaard" | "pro")}
              className="input mt-1.5"
            >
              <option value="standaard">Standaard</option>
              <option value="pro">Pro (scherper)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Aantal</label>
            <select value={aantal} onChange={(e) => setAantal(Number(e.target.value))} className="input mt-1.5">
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        <button onClick={maak} disabled={bezig || !prompt.trim()} className="btn-primary w-full disabled:opacity-50">
          {bezig ? "Bezig met insturen…" : `Maak · ${prijs} credit${prijs === 1 ? "" : "s"}`}
        </button>
        {fout && (
          <p className="text-sm text-red-300 bg-red-500/10 rounded-xl px-3 py-2">
            {fout}
            {fout === "Niet genoeg credits." && (
              <> <Link href="/pricing" className="underline">Credits bijkopen</Link></>
            )}
          </p>
        )}
        <p className="text-[11px] text-slate-500">Je ziet altijd vóór het klikken wat het kost. Mislukt iets, dan krijg je je credits terug.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300">Jouw beelden</h2>
          <Link href="/mijn-werk" className="text-xs text-blue-300 hover:text-blue-200">Hele bibliotheek →</Link>
        </div>
        {lijst.laden && lijst.creaties.length === 0 ? (
          <p className="text-sm text-slate-500">Laden…</p>
        ) : lijst.creaties.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center text-slate-500">
            <div className="text-4xl mb-3">✨</div>
            Hier verschijnen je beelden. Begin links met een opdracht.
          </div>
        ) : (
          <div className="columns-2 md:columns-3 gap-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
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
            if (c.maker === "beeld") lijst.zetVoor(c);
          }}
        />
      )}
    </div>
  );
}
