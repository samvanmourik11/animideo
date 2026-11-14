"use client";

// Een opgeleverde motion- of docu-video aanpassen (Sam, 14-11-2026): de klant pauzeert de
// video, klikt op wat er anders moet en schrijft er per punt bij wat hij wil. Moment en plek
// gaan mee, zodat er niets te raden valt (lib/motion/aanpassen.ts). Vooraf staat erbij wat
// het kost; de oude video blijft staan en de nieuwe versie komt erbij.

import { useEffect, useRef, useState } from "react";
import type { Creatie } from "@/lib/creaties/types";

interface Punt {
  t: number;
  x: number;
  y: number;
  tekst: string;
}

const MAX_PUNTEN = 8;
const tijd = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function VideoAanpassen({ creatie, onSluit, onGestart }: { creatie: Creatie; onSluit: () => void; onGestart: (c: Creatie) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [nu, setNu] = useState(0);
  const [duur, setDuur] = useState(0);
  const [speelt, setSpeelt] = useState(false);
  const [punten, setPunten] = useState<Punt[]>([]);
  const [actief, setActief] = useState<number | null>(null);
  const [prijs, setPrijs] = useState<number | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const tekstVelden = useRef<(HTMLTextAreaElement | null)[]>([]);
  const docu = creatie.maker === "docu";

  // De prijs hangt af van hoeveel stukken van de video geraakt worden: bij elke verandering
  // van de momenten opnieuw vragen (de teksten doen er voor de prijs niet toe).
  const momenten = punten.map((p) => p.t.toFixed(1)).join(",");
  useEffect(() => {
    if (!punten.length) return setPrijs(null);
    const stop = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/motion/aanpassen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: creatie.id, alleenPrijs: true, punten: punten.map((p) => ({ ...p, tekst: "." })) }),
          signal: stop.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Prijs ophalen mislukt");
        setPrijs(data.credits);
        setFout(null);
      } catch (e) {
        if (!stop.signal.aborted) setFout(e instanceof Error ? e.message : String(e));
      }
    }, 300);
    return () => { clearTimeout(t); stop.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momenten, creatie.id]);

  useEffect(() => {
    const toets = (e: KeyboardEvent) => e.key === "Escape" && onSluit();
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, [onSluit]);

  /** Waar het beeld zelf in het video-element staat (zwarte randen tellen niet mee). */
  function beeldVlak(el: HTMLVideoElement) {
    const r = el.getBoundingClientRect();
    const vw = el.videoWidth || 16, vh = el.videoHeight || 9;
    const schaal = Math.min(r.width / vw, r.height / vh);
    const w = vw * schaal, h = vh * schaal;
    return { links: r.left + (r.width - w) / 2, boven: r.top + (r.height - h) / 2, w, h };
  }

  function klik(e: React.MouseEvent) {
    const el = video.current;
    if (!el) return;
    const v = beeldVlak(el);
    const x = (e.clientX - v.links) / v.w, y = (e.clientY - v.boven) / v.h;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    el.pause();
    if (punten.length >= MAX_PUNTEN) return setFout(`Hooguit ${MAX_PUNTEN} punten per keer.`);
    const nieuw = [...punten, { t: +el.currentTime.toFixed(2), x: +x.toFixed(4), y: +y.toFixed(4), tekst: "" }];
    setPunten(nieuw);
    setActief(nieuw.length - 1);
    setTimeout(() => tekstVelden.current[nieuw.length - 1]?.focus(), 30);
  }

  function ga(i: number) {
    const el = video.current;
    if (!el) return;
    el.pause();
    el.currentTime = punten[i].t;
    setActief(i);
  }

  async function verstuur() {
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch("/api/motion/aanpassen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: creatie.id, punten }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Aanpassen starten mislukt");
      onGestart(data.creatie);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
      setBezig(false);
    }
  }

  // Een stip is te zien rond zijn eigen moment, of als hij gekozen is.
  const zichtbaar = punten.map((p, i) => i === actief || Math.abs(p.t - nu) < 0.6);
  const vlak = video.current ? beeldVlak(video.current) : null;
  const doos = video.current?.getBoundingClientRect();
  const leeg = punten.findIndex((p) => !p.tekst.trim());

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/80" onClick={onSluit} />
      <div className="relative w-full max-w-6xl max-h-[95vh] overflow-y-auto bg-paneel border border-rand rounded-3xl grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="bg-black/90 p-3 sm:p-4 flex flex-col gap-3 rounded-t-3xl lg:rounded-l-3xl lg:rounded-tr-none">
          <p className="text-sm text-slate-300">
            <b className="text-white">Pauzeer en klik</b> op wat er anders moet. Je kunt meerdere punten zetten, ook op verschillende momenten.
          </p>
          <div className="flex justify-center">
           <div className="relative">
            <video
              ref={video}
              src={creatie.url ?? undefined}
              playsInline
              preload="auto"
              onTimeUpdate={(e) => setNu(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuur(e.currentTarget.duration)}
              onPlay={() => setSpeelt(true)}
              onPause={() => setSpeelt(false)}
              className="block max-h-[62vh] w-auto max-w-full rounded-lg cursor-crosshair"
              onClick={klik}
            />
            {vlak && doos &&
              punten.map((p, i) =>
                zichtbaar[i] ? (
                  <button
                    key={i}
                    onClick={() => ga(i)}
                    title={p.tekst || `Punt ${i + 1}`}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-[3px] text-xs font-bold flex items-center justify-center shadow-lg ${i === actief ? "border-white bg-rose-500 text-white" : "border-rose-500 bg-white/90 text-rose-600"}`}
                    style={{ left: vlak.links - doos.left + p.x * vlak.w, top: vlak.boven - doos.top + p.y * vlak.h }}
                  >
                    {i + 1}
                  </button>
                ) : null,
              )}
           </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => (speelt ? video.current?.pause() : video.current?.play())}
              className="w-10 h-10 shrink-0 rounded-full bg-white/10 hover:bg-white/20 text-white text-lg"
              aria-label={speelt ? "Pauze" : "Afspelen"}
            >
              {speelt ? "❚❚" : "▶"}
            </button>
            <div className="relative flex-1">
              <input
                type="range"
                min={0}
                max={duur || 1}
                step={0.04}
                value={nu}
                onChange={(e) => { if (video.current) video.current.currentTime = Number(e.target.value); }}
                className="w-full"
              />
              {duur > 0 &&
                punten.map((p, i) => (
                  <span key={i} className="pointer-events-none absolute -top-1.5 w-1.5 h-1.5 rounded-full bg-rose-500" style={{ left: `${(p.t / duur) * 100}%` }} />
                ))}
            </div>
            <span className="text-xs text-slate-300 tabular-nums w-20 text-right">
              {tijd(nu)} / {tijd(duur)}
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">✏️ Video aanpassen</h2>
            <button onClick={onSluit} className="text-tekst-3 hover:text-tekst text-xl leading-none" aria-label="Sluiten">
              ✕
            </button>
          </div>

          {!punten.length ? (
            <p className="text-sm text-tekst-2">Nog geen punten. Klik in de video op een tekst, vorm of foto die anders moet.</p>
          ) : (
            <ol className="space-y-3">
              {punten.map((p, i) => (
                <li key={i} className={`rounded-2xl border p-3 space-y-2 ${i === actief ? "border-rose-400" : "border-rand"}`}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <button onClick={() => ga(i)} className="font-semibold hover:underline">
                      <span className="inline-flex w-6 h-6 mr-1.5 items-center justify-center rounded-full bg-rose-500 text-white text-xs">{i + 1}</span>
                      op {tijd(p.t)}
                    </button>
                    <button
                      onClick={() => {
                        setPunten(punten.filter((_, j) => j !== i));
                        setActief(null);
                      }}
                      className="text-xs text-tekst-3 hover:text-red-500"
                    >
                      Weghalen
                    </button>
                  </div>
                  <textarea
                    ref={(el) => { tekstVelden.current[i] = el; }}
                    value={p.tekst}
                    onFocus={() => setActief(i)}
                    onChange={(e) => setPunten(punten.map((q, j) => (j === i ? { ...q, tekst: e.target.value.slice(0, 600) } : q)))}
                    rows={2}
                    placeholder="Wat moet er anders? Bijv. 'Deze tekst groter', 'maak dit blauw', 'spelfout: Rotterdam'"
                    className="n-invoer w-full text-sm"
                  />
                </li>
              ))}
            </ol>
          )}

          <div className="text-xs text-tekst-3 space-y-1">
            <p>Alleen het beeld verandert: wat de verteller zegt blijft hetzelfde.{docu ? " Een andere foto kiezen kan niet." : ""}</p>
            <p>Je huidige video blijft bewaard; de aangepaste versie komt erbij in je lijst.</p>
          </div>

          {fout && <p className="text-sm text-red-500">{fout}</p>}

          <button
            disabled={bezig || !punten.length || leeg >= 0 || prijs === null}
            onClick={verstuur}
            className="n-knop w-full disabled:opacity-50 mt-auto"
          >
            {bezig
              ? "Bezig met starten…"
              : !punten.length
                ? "Klik eerst in de video"
                : leeg >= 0
                  ? `Schrijf bij punt ${leeg + 1} wat er anders moet`
                  : `Pas de video aan${prijs !== null ? ` · ${prijs} credits` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
