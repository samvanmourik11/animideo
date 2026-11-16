"use client";

// Een opgeleverde motion- of docu-video aanpassen (Sam, 14-11-2026; Aanpassen 2.0, 17-11-2026):
//   - in het beeld: pauzeren en een stip zetten, een kader trekken of een pijl tekenen, en per
//     punt schrijven wat er anders moet (moment en plek gaan mee, lib/motion/aanpassen.ts)
//   - wat de verteller zegt: per scene de tekst wijzigen; de stem wordt opnieuw ingesproken en
//     de tekening schuift mee
//   - foto's: een foto in de video vervangen door een eigen foto
// Vooraf staat erbij wat het kost; de oude video blijft staan en de nieuwe versie komt erbij.

import { useEffect, useRef, useState } from "react";
import type { Creatie } from "@/lib/creaties/types";

type Vorm = "stip" | "kader" | "pijl";
interface Punt {
  t: number;
  x: number;
  y: number;
  tekst: string;
  vorm: Vorm;
  x2?: number;
  y2?: number;
}
interface Scene {
  tekst: string;
}
interface Beeld {
  id: string;
  url: string;
  doel: string;
  uitleg: string;
}

const MAX_PUNTEN = 8;
const MAX_ZINNEN = 4;
const tijd = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const GEREEDSCHAP: { id: Vorm; naam: string; icoon: string }[] = [
  { id: "stip", naam: "Stip", icoon: "●" },
  { id: "kader", naam: "Kader", icoon: "▭" },
  { id: "pijl", naam: "Pijl", icoon: "➜" },
];

export default function VideoAanpassen({ creatie, onSluit, onGestart }: { creatie: Creatie; onSluit: () => void; onGestart: (c: Creatie) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [nu, setNu] = useState(0);
  const [duur, setDuur] = useState(0);
  const [speelt, setSpeelt] = useState(false);
  const [vorm, setVorm] = useState<Vorm>("stip");
  const [punten, setPunten] = useState<Punt[]>([]);
  const [actief, setActief] = useState<number | null>(null);
  const [sleep, setSleep] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const invoer = creatie.invoer as { plan?: { scenes?: Scene[]; eind?: { tekst?: string } }; beelden?: Beeld[] };
  const origineel = [...(invoer.plan?.scenes ?? []).map((s) => s.tekst), invoer.plan?.eind?.tekst ?? ""];
  const [teksten, setTeksten] = useState<string[]>(origineel);
  const [open, setOpen] = useState<"beeld" | "tekst" | "foto">("beeld");
  const fotos = (invoer.beelden ?? []).filter((b) => b.doel === "tonen");
  const [wissels, setWissels] = useState<Record<string, string>>({});
  const [uploaden, setUploaden] = useState<string | null>(null);
  const [prijs, setPrijs] = useState<number | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const tekstVelden = useRef<(HTMLTextAreaElement | null)[]>([]);
  const docu = creatie.maker === "docu";

  // Wat er naar de server gaat: scene 1, 2, ... en 0 voor de slotzin.
  const zinnen = teksten
    .map((t, i) => ({ scene: i === teksten.length - 1 ? 0 : i + 1, tekst: t.trim(), oud: origineel[i] }))
    .filter((z) => z.tekst && z.tekst !== z.oud.trim())
    .map(({ scene, tekst }) => ({ scene, tekst }));
  const wisselLijst = Object.entries(wissels).map(([id, url]) => ({ id, url }));
  const aantal = punten.length + zinnen.length + wisselLijst.length;

  // De prijs hangt af van welke stukken van de video geraakt worden: opnieuw vragen bij elke
  // verandering van momenten, gewijzigde scenes of foto's (de teksten van de punten tellen niet).
  const sleutel = JSON.stringify([punten.map((p) => p.t.toFixed(1)), zinnen.map((z) => z.scene), wisselLijst.map((w) => w.id)]);
  useEffect(() => {
    if (!aantal) return setPrijs(null);
    const stop = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/motion/aanpassen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: creatie.id, alleenPrijs: true, punten: punten.map((p) => ({ ...p, tekst: "." })), zinnen, fotos: wisselLijst }),
          signal: stop.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Prijs ophalen mislukt");
        setPrijs(data.credits);
        setFout(null);
      } catch (e) {
        if (!stop.signal.aborted) setFout(e instanceof Error ? e.message : String(e));
      }
    }, 400);
    return () => { clearTimeout(t); stop.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleutel, creatie.id]);

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
  function plek(e: React.PointerEvent) {
    const el = video.current;
    if (!el) return null;
    const v = beeldVlak(el);
    return { x: Math.min(1, Math.max(0, (e.clientX - v.links) / v.w)), y: Math.min(1, Math.max(0, (e.clientY - v.boven) / v.h)) };
  }

  function omlaag(e: React.PointerEvent) {
    const p = plek(e);
    if (!p) return;
    video.current?.pause();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setSleep({ x: p.x, y: p.y, x2: p.x, y2: p.y });
  }
  function beweeg(e: React.PointerEvent) {
    if (!sleep) return;
    const p = plek(e);
    if (p) setSleep({ ...sleep, x2: p.x, y2: p.y });
  }
  function omhoog(e: React.PointerEvent) {
    const el = video.current;
    if (!sleep || !el) return setSleep(null);
    // Het eindpunt uit het loslaten zelf: niet elk apparaat stuurt tussenbewegingen.
    const eind = plek(e);
    const s = eind ? { ...sleep, x2: eind.x, y2: eind.y } : sleep;
    setSleep(null);
    if (punten.length + zinnen.length >= MAX_PUNTEN) return setFout(`Hooguit ${MAX_PUNTEN} wijzigingen per keer.`);
    // Nauwelijks gesleept: dan is het een stip, wat het gereedschap ook is.
    const klein = Math.hypot(s.x2 - s.x, s.y2 - s.y) < 0.03;
    const r = (n: number) => +n.toFixed(4);
    const punt: Punt =
      vorm === "stip" || klein
        ? { t: +el.currentTime.toFixed(2), x: r(s.x), y: r(s.y), tekst: "", vorm: "stip" }
        : { t: +el.currentTime.toFixed(2), x: r(s.x), y: r(s.y), x2: r(s.x2), y2: r(s.y2), tekst: "", vorm };
    const nieuw = [...punten, punt];
    setPunten(nieuw);
    setActief(nieuw.length - 1);
    setOpen("beeld");
    setTimeout(() => tekstVelden.current[nieuw.length - 1]?.focus(), 30);
  }

  function ga(i: number) {
    const el = video.current;
    if (!el) return;
    el.pause();
    el.currentTime = punten[i].t;
    setActief(i);
  }

  async function vervangFoto(id: string, bestand: File) {
    setUploaden(id);
    setFout(null);
    try {
      const fd = new FormData();
      fd.append("bestand", bestand);
      const res = await fetch("/api/motion/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Uploaden mislukt");
      setWissels((w) => ({ ...w, [id]: data.url }));
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setUploaden(null);
    }
  }

  async function verstuur() {
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch("/api/motion/aanpassen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: creatie.id, punten, zinnen, fotos: wisselLijst }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Aanpassen starten mislukt");
      onGestart(data.creatie);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
      setBezig(false);
    }
  }

  // Een punt is te zien rond zijn eigen moment, of als hij gekozen is.
  const zichtbaar = punten.map((p, i) => i === actief || Math.abs(p.t - nu) < 0.6);
  const vlak = video.current ? beeldVlak(video.current) : null;
  const doos = video.current?.getBoundingClientRect();
  const leeg = punten.findIndex((p) => !p.tekst.trim());
  const teVeelZinnen = zinnen.length > MAX_ZINNEN;
  const sx = (x: number) => (vlak && doos ? vlak.links - doos.left + x * vlak.w : 0);
  const sy = (y: number) => (vlak && doos ? vlak.boven - doos.top + y * vlak.h : 0);

  const tekening = (p: { vorm: Vorm; x: number; y: number; x2?: number; y2?: number }, sterk: boolean, sleutel: string) => {
    const kleur = sterk ? "#f43f5e" : "#fda4af";
    if (p.vorm === "kader" && p.x2 !== undefined && p.y2 !== undefined)
      return <rect key={sleutel} x={sx(Math.min(p.x, p.x2))} y={sy(Math.min(p.y, p.y2))} width={Math.abs(sx(p.x2) - sx(p.x))} height={Math.abs(sy(p.y2) - sy(p.y))} rx={6} fill="none" stroke={kleur} strokeWidth={3} />;
    if (p.vorm === "pijl" && p.x2 !== undefined && p.y2 !== undefined)
      return <line key={sleutel} x1={sx(p.x)} y1={sy(p.y)} x2={sx(p.x2)} y2={sy(p.y2)} stroke={kleur} strokeWidth={4} strokeLinecap="round" markerEnd="url(#punt)" />;
    return null;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/80" onClick={onSluit} />
      <div className="relative w-full max-w-6xl max-h-[95vh] overflow-y-auto bg-paneel border border-rand rounded-3xl grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="bg-black/90 p-3 sm:p-4 flex flex-col gap-3 rounded-t-3xl lg:rounded-l-3xl lg:rounded-tr-none">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-300">
              <b className="text-white">Pauzeer en wijs aan</b> wat er anders moet: klik voor een stip, of sleep voor een kader of pijl.
            </p>
            <div className="flex rounded-xl bg-white/10 p-0.5">
              {GEREEDSCHAP.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setVorm(g.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${vorm === g.id ? "bg-white text-slate-900" : "text-slate-200 hover:bg-white/10"}`}
                >
                  {g.icoon} {g.naam}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-center">
            <div className="relative select-none">
              <video
                ref={video}
                src={creatie.url ?? undefined}
                playsInline
                preload="auto"
                onTimeUpdate={(e) => setNu(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuur(e.currentTarget.duration)}
                onPlay={() => setSpeelt(true)}
                onPause={() => setSpeelt(false)}
                className="block max-h-[62vh] w-auto max-w-full rounded-lg"
              />
              {/* Een laag over het beeld vangt het klikken en slepen op. */}
              <div className="absolute inset-0 cursor-crosshair touch-none" onPointerDown={omlaag} onPointerMove={beweeg} onPointerUp={omhoog} />
              {vlak && doos && (
                <svg className="pointer-events-none absolute inset-0 w-full h-full overflow-visible">
                  <defs>
                    <marker id="punt" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
                      <path d="M0,0 L6,3 L0,6 Z" fill="#f43f5e" />
                    </marker>
                  </defs>
                  {punten.map((p, i) => (zichtbaar[i] ? tekening(p, i === actief, `p${i}`) : null))}
                  {sleep && vorm !== "stip" && tekening({ vorm, ...sleep }, true, "sleep")}
                </svg>
              )}
              {vlak && doos &&
                punten.map((p, i) =>
                  zichtbaar[i] ? (
                    <button
                      key={i}
                      onClick={() => ga(i)}
                      title={p.tekst || `Punt ${i + 1}`}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-[3px] text-xs font-bold flex items-center justify-center shadow-lg ${i === actief ? "border-white bg-rose-500 text-white" : "border-rose-500 bg-white/90 text-rose-600"}`}
                      style={{ left: sx(p.vorm === "kader" ? Math.min(p.x, p.x2 ?? p.x) : p.x), top: sy(p.vorm === "kader" ? Math.min(p.y, p.y2 ?? p.y) : p.y) }}
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

        <div className="p-4 sm:p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">✏️ Video aanpassen</h2>
            <button onClick={onSluit} className="text-tekst-3 hover:text-tekst text-xl leading-none" aria-label="Sluiten">
              ✕
            </button>
          </div>

          {/* In het beeld */}
          <Vak titel="In het beeld" aantal={punten.length} open={open === "beeld"} onOpen={() => setOpen("beeld")}>
            {!punten.length ? (
              <p className="text-sm text-tekst-2">Nog niets aangewezen. Klik of sleep in de video op een tekst, vorm of foto die anders moet.</p>
            ) : (
              <ol className="space-y-3">
                {punten.map((p, i) => (
                  <li key={i} className={`rounded-2xl border p-3 space-y-2 ${i === actief ? "border-rose-400" : "border-rand"}`}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <button onClick={() => ga(i)} className="font-semibold hover:underline">
                        <span className="inline-flex w-6 h-6 mr-1.5 items-center justify-center rounded-full bg-rose-500 text-white text-xs">{i + 1}</span>
                        {p.vorm === "kader" ? "kader" : p.vorm === "pijl" ? "pijl" : "stip"} op {tijd(p.t)}
                      </button>
                      <button onClick={() => { setPunten(punten.filter((_, j) => j !== i)); setActief(null); }} className="text-xs text-tekst-3 hover:text-red-500">
                        Weghalen
                      </button>
                    </div>
                    <textarea
                      ref={(el) => { tekstVelden.current[i] = el; }}
                      value={p.tekst}
                      onFocus={() => setActief(i)}
                      onChange={(e) => setPunten(punten.map((q, j) => (j === i ? { ...q, tekst: e.target.value.slice(0, 600) } : q)))}
                      rows={2}
                      placeholder={p.vorm === "pijl" ? "Bijv. 'zet dit logo hierheen'" : p.vorm === "kader" ? "Bijv. 'dit hele blok groter en rustiger'" : "Bijv. 'deze tekst groter', 'spelfout: Rotterdam'"}
                      className="n-invoer w-full text-sm"
                    />
                  </li>
                ))}
              </ol>
            )}
          </Vak>

          {/* Wat de verteller zegt */}
          {origineel.length > 1 && (
            <Vak titel="Wat de verteller zegt" aantal={zinnen.length} open={open === "tekst"} onOpen={() => setOpen("tekst")}>
              <p className="text-xs text-tekst-3">Pas de tekst aan waar nodig. De stem spreekt alles opnieuw in en de tekening schuift mee. {zinnen.length ? "" : `Hooguit ${MAX_ZINNEN} scenes per keer.`}</p>
              <div className="space-y-2">
                {teksten.map((t, i) => {
                  const anders = t.trim() !== origineel[i].trim();
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between text-[11px] text-tekst-3">
                        <span>{i === teksten.length - 1 ? "Slotzin" : `Scene ${i + 1}`}</span>
                        {anders && (
                          <button onClick={() => setTeksten(teksten.map((x, j) => (j === i ? origineel[i] : x)))} className="hover:text-tekst">
                            ↺ Terug
                          </button>
                        )}
                      </div>
                      <textarea
                        value={t}
                        onChange={(e) => setTeksten(teksten.map((x, j) => (j === i ? e.target.value.slice(0, 500) : x)))}
                        rows={2}
                        className={`n-invoer w-full text-sm mt-0.5 ${anders ? "!border-amber-400 bg-amber-500/5" : ""}`}
                      />
                    </div>
                  );
                })}
              </div>
              {teVeelZinnen && <p className="text-xs text-red-500">Hooguit {MAX_ZINNEN} scenes per keer.</p>}
            </Vak>
          )}

          {/* Foto's */}
          {fotos.length > 0 && (
            <Vak titel="Foto's" aantal={wisselLijst.length} open={open === "foto"} onOpen={() => setOpen("foto")}>
              <p className="text-xs text-tekst-3">Vervang een foto door een eigen foto. {docu ? "De bronvermelding verdwijnt dan bij die foto." : ""}</p>
              <div className="grid grid-cols-3 gap-2">
                {fotos.map((f) => (
                  <label key={f.id} className="group relative block cursor-pointer rounded-xl overflow-hidden border border-rand aspect-video bg-black/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={wissels[f.id] ?? f.url} alt={f.uitleg} className="w-full h-full object-cover" />
                    <span className={`absolute inset-x-0 bottom-0 text-[10px] font-semibold text-white px-1.5 py-0.5 ${wissels[f.id] ? "bg-emerald-600" : "bg-black/55 group-hover:bg-blue-600"}`}>
                      {uploaden === f.id ? "Uploaden…" : wissels[f.id] ? "✓ Vervangen" : "Vervang"}
                    </span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && vervangFoto(f.id, e.target.files[0])} />
                  </label>
                ))}
              </div>
              {wisselLijst.length > 0 && (
                <button onClick={() => setWissels({})} className="text-xs text-tekst-3 hover:text-tekst">
                  ↺ Alle foto&apos;s terug
                </button>
              )}
            </Vak>
          )}

          <p className="text-xs text-tekst-3">Je huidige video blijft bewaard; de aangepaste versie komt erbij in je lijst.</p>

          {fout && <p className="text-sm text-red-500">{fout}</p>}

          <button
            disabled={bezig || !aantal || leeg >= 0 || prijs === null || teVeelZinnen || !!uploaden}
            onClick={verstuur}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white font-semibold py-3 px-5 rounded-xl mt-auto transition-colors"
          >
            {bezig
              ? "Bezig met starten…"
              : !aantal
                ? "Wijs iets aan of wijzig een tekst"
                : leeg >= 0
                  ? `Schrijf bij punt ${leeg + 1} wat er anders moet`
                  : `Pas de video aan${prijs !== null ? ` · ${prijs} credits` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Vak({ titel, aantal, open, onOpen, children }: { titel: string; aantal: number; open: boolean; onOpen: () => void; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border ${open ? "border-blue-500/40" : "border-rand"}`}>
      <button onClick={onOpen} className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-tekst">
        <span>{titel}</span>
        <span className="flex items-center gap-2">
          {aantal > 0 && <span className="rounded-full bg-blue-600 text-white text-[11px] px-2 py-0.5">{aantal}</span>}
          <span className="text-tekst-3">{open ? "▾" : "▸"}</span>
        </span>
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}
