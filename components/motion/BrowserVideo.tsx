"use client";

// De laatste stap van een motion graphics-video: de video maken in de browser van de klant.
//
// Op onze server is beeld voor beeld tekenen veel te traag (1,4 s per beeld, gemeten
// 14-11-2026); een gewone laptop doet het in een fractie daarvan. Zodra een video op stap
// "browser" staat en de studio open is, gebeurt hier:
//   1. de opdracht ophalen (per hoofdstuk de pagina met animatie, stem-tijden en lettertypes)
//   2. elke pagina in een afgeschermd venstertje laden (de code komt van een taalmodel: geen
//      toegang tot de studio, niets ophalen) en beeld voor beeld laten tekenen
//   3. elk beeld door de video-encoder van de browser (H.264), meteen in een mp4 met de
//      juiste tijden (een kale H.264-stroom las het ffmpeg op de server met een verkeerde
//      beeldsnelheid: 475 beelden per seconde, gezien 14-11-2026)
//   4. de video rechtstreeks op onze opslag zetten en afmelden; de server zet er stem en
//      muziek onder en de video verschijnt in de lijst.

import { useEffect, useRef, useState } from "react";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { createClient } from "@/lib/supabase/client";
import type { Creatie } from "@/lib/creaties/types";

interface Opdracht {
  fps: number;
  w: number;
  h: number;
  delen: { html: string; beelden: number | null }[];
  upload: { pad: string; token: string };
  bitrate: number;
}

export interface BrowserStand {
  id: string;
  fase: "voorbereiden" | "tekenen" | "uploaden" | "afmaken" | "fout";
  /** 0 tot 1 */
  deel: number;
  fout?: string;
}

const wachtOpBrowser = (c: Creatie) =>
  c.maker === "motion" && c.status === "bezig" && (c.invoer as { voortgang?: { stap?: string } }).voortgang?.stap === "browser";

export const kanBrowserVideo = () => typeof window !== "undefined" && "VideoEncoder" in window && "OffscreenCanvas" in window;

async function kiesEncoder(o: Opdracht): Promise<VideoEncoderConfig> {
  // High, Main en Baseline, op oplopend niveau: staand 1080x1920 heeft niveau 4 of hoger nodig.
  for (const codec of ["avc1.640028", "avc1.64002a", "avc1.640032", "avc1.4d0028", "avc1.4d0032", "avc1.42e028", "avc1.42e032"]) {
    const cfg: VideoEncoderConfig = { codec, width: o.w, height: o.h, bitrate: o.bitrate, framerate: o.fps, latencyMode: "quality", avc: { format: "avc" } };
    try {
      if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg;
    } catch {}
  }
  throw new Error("Je browser kan geen video maken. Gebruik de nieuwste Chrome, Edge of Safari.");
}

/** Eén hoofdstuk-pagina in een afgeschermd venstertje, met een functie om een beeld op te vragen. */
function openPagina(html: string, o: Opdracht): Promise<{ einde: number; beeld: (t: number) => Promise<ImageBitmap>; sluit: () => void }> {
  return new Promise((ok, mis) => {
    const frame = document.createElement("iframe");
    // Alleen scripts; geen toegang tot de studio, cookies of opslag.
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = `position:fixed;right:0;bottom:0;width:${o.w}px;height:${o.h}px;opacity:0.01;pointer-events:none;z-index:-1;transform:scale(0.001);transform-origin:bottom right;border:0`;
    let nr = 0;
    const wachtend = new Map<number, { ok: (v: unknown) => void; mis: (e: Error) => void }>();
    const vraag = (bericht: Record<string, unknown>) =>
      new Promise<unknown>((ja, nee) => {
        const n = ++nr;
        wachtend.set(n, { ok: ja, mis: nee });
        frame.contentWindow?.postMessage({ ...bericht, nr: n }, "*");
      });
    const sluit = () => {
      window.removeEventListener("message", luister);
      frame.remove();
      wachtend.forEach((w) => w.mis(new Error("Gestopt")));
      wachtend.clear();
    };
    const luister = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow) return;
      const m = e.data as { soort?: string; nr?: number; einde?: number; bmp?: ImageBitmap; fout?: string; fouten?: string[] };
      if (m?.soort === "geladen") {
        vraag({ soort: "start" }).then(
          (r) => {
            const einde = Number((r as { einde?: number }).einde);
            if (!(einde > 0)) {
              sluit();
              mis(new Error(`De animatie kon niet worden geladen. ${((r as { fouten?: string[] }).fouten ?? []).join(" ")}`));
              return;
            }
            ok({ einde, beeld: (t: number) => vraag({ soort: "beeld", t }) as Promise<ImageBitmap>, sluit });
          },
          (err) => { sluit(); mis(err); },
        );
        return;
      }
      const w = typeof m?.nr === "number" ? wachtend.get(m.nr) : undefined;
      if (!w) return;
      wachtend.delete(m.nr!);
      if (m.soort === "fout") w.mis(new Error(m.fout || "Tekenen mislukt"));
      else if (m.soort === "beeld") {
        if (m.bmp instanceof ImageBitmap) w.ok(m.bmp);
        else w.mis(new Error("Leeg beeld"));
      } else w.ok(m);
    };
    window.addEventListener("message", luister);
    document.body.appendChild(frame);
    frame.srcdoc = html;
    setTimeout(() => {
      if (wachtend.size || nr === 0) {
        // Na een minuut nog geen eerste antwoord: dan komt het niet meer.
        if (nr === 0) { sluit(); mis(new Error("De animatie laadde niet.")); }
      }
    }, 60_000);
  });
}

async function maakVideo(c: Creatie, zet: (s: BrowserStand) => void): Promise<void> {
  const start = performance.now();
  zet({ id: c.id, fase: "voorbereiden", deel: 0 });
  const res = await fetch(`/api/motion/render?id=${c.id}`, { cache: "no-store" });
  const o = (await res.json()) as Opdracht & { error?: string };
  if (!res.ok) throw new Error(o.error ?? "De opdracht kon niet worden opgehaald.");
  const cfg = await kiesEncoder(o);

  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width: o.w, height: o.h, frameRate: o.fps }, fastStart: "in-memory" });
  let encFout: Error | null = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encFout = e instanceof Error ? e : new Error(String(e)); },
  });
  enc.configure(cfg);

  // Eerst alle pagina's laden om het totale aantal beelden te weten (voor de voortgang).
  let gedaan = 0;
  let totaal = 0;
  const aantallen: number[] = [];
  try {
    for (let k = 0; k < o.delen.length; k++) {
      const p = await openPagina(o.delen[k].html, o);
      const aantal = o.delen[k].beelden ?? Math.max(1, Math.round(p.einde * o.fps));
      aantallen.push(aantal);
      if (k === 0) totaal = o.delen.length === 1 ? aantal : o.delen.reduce((n, d) => n + (d.beelden ?? 0), 0) || aantal * o.delen.length;
      try {
        for (let f = 0; f < aantal; f++) {
          if (encFout) throw encFout;
          const bmp = await p.beeld(f / o.fps);
          const frame = new VideoFrame(bmp, { timestamp: Math.round((gedaan * 1e6) / o.fps), duration: Math.round(1e6 / o.fps) });
          enc.encode(frame, { keyFrame: gedaan % (o.fps * 2) === 0 });
          frame.close();
          bmp.close();
          gedaan++;
          while (enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
          if (gedaan % 10 === 0) zet({ id: c.id, fase: "tekenen", deel: Math.min(0.99, gedaan / Math.max(totaal, gedaan)) });
        }
      } finally {
        p.sluit();
      }
    }
    await enc.flush();
    if (encFout) throw encFout;
  } finally {
    if (enc.state !== "closed") enc.close();
  }

  zet({ id: c.id, fase: "uploaden", deel: 1 });
  muxer.finalize();
  const blob = new Blob([muxer.target.buffer], { type: "video/mp4" });
  const { error } = await createClient().storage.from("scene-assets").uploadToSignedUrl(o.upload.pad, o.upload.token, blob, { contentType: "video/mp4" });
  if (error) throw new Error(`Uploaden mislukt: ${error.message}`);

  zet({ id: c.id, fase: "afmaken", deel: 1 });
  const klaar = await fetch("/api/motion/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: c.id, pad: o.upload.pad, beelden: gedaan, renderSec: (performance.now() - start) / 1000 }),
  });
  const k = (await klaar.json().catch(() => ({}))) as { error?: string };
  if (!klaar.ok) throw new Error(k.error ?? "Afmaken mislukt.");
}

/**
 * Houdt de lijst in de gaten en maakt de video van elke motion-creatie die op de browser
 * wacht, één tegelijk. Geeft de stand terug voor de melding bovenaan de studio.
 */
export function useBrowserVideo(creaties: Creatie[], ververs: () => void): BrowserStand | null {
  const [stand, setStand] = useState<BrowserStand | null>(null);
  const bezig = useRef(false);
  // Wat hier al eens misging, niet steeds opnieuw proberen (pas na herladen van de pagina).
  const mislukt = useRef(new Set<string>());

  useEffect(() => {
    if (bezig.current || !kanBrowserVideo()) return;
    const c = creaties.find((x) => wachtOpBrowser(x) && !mislukt.current.has(x.id));
    if (!c) return;
    bezig.current = true;
    maakVideo(c, setStand)
      .then(() => setStand(null))
      .catch((e) => {
        mislukt.current.add(c.id);
        setStand({ id: c.id, fase: "fout", deel: 0, fout: e instanceof Error ? e.message : String(e) });
      })
      .finally(() => {
        bezig.current = false;
        ververs();
      });
  }, [creaties, ververs]);

  // Wegklikken of sluiten tijdens het maken: eerst waarschuwen.
  const actief = !!stand && stand.fase !== "fout";
  useEffect(() => {
    if (!actief) return;
    const waarschuw = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", waarschuw);
    return () => window.removeEventListener("beforeunload", waarschuw);
  }, [actief]);

  const wachtNog = creaties.some(wachtOpBrowser);
  if (!stand && wachtNog && typeof window !== "undefined" && !kanBrowserVideo()) {
    return { id: "", fase: "fout", deel: 0, fout: "Je browser kan deze video niet maken. Open de studio in de nieuwste Chrome, Edge of Safari." };
  }
  return stand;
}

/** De melding bovenaan de studio zolang de browser een video maakt. */
export function BrowserMelding({ stand }: { stand: BrowserStand | null }) {
  if (!stand) return null;
  if (stand.fase === "fout") {
    return (
      <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-tekst">
        <div className="font-semibold">De video maken lukte niet in je browser</div>
        <div className="text-tekst-2 mt-0.5">{stand.fout}</div>
        <button onClick={() => location.reload()} className="mt-2 text-xs text-blue-500 hover:underline">Opnieuw proberen</button>
      </div>
    );
  }
  const pct = Math.round(stand.deel * 100);
  const tekst =
    stand.fase === "voorbereiden" ? "Voorbereiden…" : stand.fase === "tekenen" ? `Beelden tekenen… ${pct}%` : stand.fase === "uploaden" ? "Video versturen…" : "Stem en muziek eronder zetten…";
  return (
    <div className="sticky top-2 z-30 rounded-2xl border border-blue-500/50 bg-blue-500/10 backdrop-blur px-4 py-3 text-sm text-tekst shadow">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">⏳ Houd dit tabblad open: je video wordt nu gemaakt</div>
          <div className="text-tekst-2 mt-0.5">{tekst} Sluit je het tabblad, dan gaat het verder zodra je de studio weer opent.</div>
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-blue-500/15 overflow-hidden">
        <div className="h-full bg-blue-500 transition-all" style={{ width: `${stand.fase === "tekenen" ? pct : stand.fase === "voorbereiden" ? 2 : 100}%` }} />
      </div>
    </div>
  );
}
