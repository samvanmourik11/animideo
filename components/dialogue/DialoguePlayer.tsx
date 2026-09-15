"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { DialogueSpec } from "@/lib/infographics/dialogue-schema";
import { ZACHTE_LAS } from "@/lib/infographics/dialoog-montage";

// Afspeler voor een video die nog niet bestaat.
//
// De clips die Seedance oplevert hebben GEEN geluid — de stem is een los bestand
// en de muziek een derde spoor. Er is dus geen enkel mediabestand dat "de video"
// is; die ontstaat pas bij het exporteren. Deze speler doet alsof hij er al is:
// hij legt een VIRTUELE TIJDLIJN over alle fragmenten heen, zodat je kunt spoelen,
// pauzeren en zien waar je bent, net als bij een gewone videospeler.
//
// Twee gestapelde videolagen zorgen dat er tussen fragmenten geen zwart frame
// valt. Fragment n staat altijd op laag n % 2; fragment n+1 laadt alvast op de
// andere laag. Die vaste verdeling is bewust: een eerdere versie koos de laag
// dynamisch en wachtte op canplay voordat hij wisselde, maar een src die niet
// verandert vuurt geen nieuw canplay af — het beeld bleef dan staan terwijl de
// audio doorliep en de speler op hol sloeg.

// Tussen élke twee fragmenten, net zo lang als de zachte las in de download. Het beeld
// dat wegvloeit houdt zijn laag vast tot de overvloeier klaar is: eerst kreeg die laag
// meteen de volgende clip, en dan viel er bij elke zin een flits in plaats van een
// overgang. Zie `vasthouden` en `beeldKlaar`.
const OVERVLOEI_MS = Math.round(ZACHTE_LAS * 1000);
/** Laadt het nieuwe beeld te traag, dan toch overvloeien in plaats van blijven hangen. */
const BEELD_WACHT_MS = 600;
const SPOEL_SEC = 5;

// De export duckt de muziek met een sidechain-compressor: onder spraak zakt hij
// weg, op een beeld zonder stem komt hij naar voren. Dat bootsen we hier na met
// twee vaste niveaus, zodat de preview klinkt zoals de download.
const MUZIEK_VOL = 0.45;
const MUZIEK_GEDUCKT = 0.11;
const DUCK_MS = 250;
const INFADE_MS = 1200;

export interface Fragment {
  key: string;
  /** Bij welke scène dit fragment hoort. Bepaalt of er overvloeid mag worden. */
  scene: number;
  videoUrl: string;
  /** Leeg bij een actiebeeld zonder voice-over: daar draagt de muziek het beeld. */
  audioUrl: string | null;
  /** Hoe lang dit fragment in de video staat. Basis voor de tijdlijn. */
  duur: number;
  /** Waar in de clip de mond opengaat; daar begint het beeld. */
  mouthStart: number;
  spreker: string;
  tekst: string;
}

export function bouwFragmenten(spec: DialogueSpec): Fragment[] {
  const naam = (id: string) =>
    id === "verteller" ? "Verteller" : spec.cast.find((c) => c.id === id)?.name ?? id;
  const uit: Fragment[] = [];
  spec.scenes.forEach((s, si) =>
    s.lines.forEach((l, li) => {
      if (!l.videoUrl) return;
      const stem = (l.text ?? "").trim();
      const isActie = l.kind === "actie";
      if (isActie && !stem) {
        uit.push({
          key: `s${si}-l${li}`, scene: si, videoUrl: l.videoUrl, audioUrl: null,
          duur: l.seconden ?? 4, mouthStart: 0, spreker: "", tekst: (l.actie ?? "").trim(),
        });
      } else if (l.audioUrl) {
        uit.push({
          key: `s${si}-l${li}`, scene: si, videoUrl: l.videoUrl, audioUrl: l.audioUrl,
          duur: l.audioDuration ?? 4,
          mouthStart: isActie ? 0 : l.mouthStart ?? 0,
          spreker: naam(l.characterId),
          tekst: stem || (l.actie ?? "").trim(),
        });
      }
    })
  );
  return uit;
}

type Status = "stop" | "speelt" | "pauze";

const tijd = (s: number) => {
  const heel = Math.max(0, Math.floor(s));
  return `${Math.floor(heel / 60)}:${String(heel % 60).padStart(2, "0")}`;
};

export default function DialoguePlayer({
  fragmenten,
  format,
  musicUrl,
  musicVolume,
}: {
  fragmenten: Fragment[];
  format: "16:9" | "9:16";
  /** Muziekbed, zodat de preview klinkt zoals de download. */
  musicUrl?: string | null;
  musicVolume?: number | null;
}) {
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState<Status>("stop");
  const [ronde, setRonde] = useState(0);
  const [inFragment, setInFragment] = useState(0);
  const [sleept, setSleept] = useState(false);
  // Het fragment dat net wegvloeit, en op welke laag het staat.
  const [vasthouden, setVasthouden] = useState<{ laag: 0 | 1; url: string } | null>(null);
  // Pas overvloeien als het nieuwe beeld er echt is; anders vloeide het in zwart over.
  const [beeldKlaar, setBeeldKlaar] = useState(true);

  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const muziekRef = useRef<HTMLAudioElement | null>(null);
  const duckTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const balkRef = useRef<HTMLDivElement | null>(null);
  // Waar een fragment moet beginnen na een sprong; de startroutine leest dit uit.
  const zoekOffset = useRef(0);
  // Voor fragmenten zonder stem: wanneer dit fragment begon te lopen.
  const stilStart = useRef(0);

  const huidig: Fragment | undefined = fragmenten[idx];
  const laag: 0 | 1 = (idx % 2) as 0 | 1;
  const ander: 0 | 1 = laag === 0 ? 1 : 0;
  // Overvloeien alleen bij een scènewissel was bedacht toen een scène één beeld had en
  // een dissolve bij elke zin knipperde. Nu heeft elke zin een eigen beeld; de harde
  // wissel daartussen zag Sam als geflikker. Daarom nu tussen alle fragmenten.
  const basisVol = typeof musicVolume === "number" ? musicVolume : MUZIEK_VOL;

  // De virtuele tijdlijn: waar begint elk fragment, en hoe lang is het geheel?
  const { starts, totaal } = useMemo(() => {
    const s: number[] = [];
    let t = 0;
    for (const f of fragmenten) { s.push(t); t += Math.max(0.1, f.duur); }
    return { starts: s, totaal: t };
  }, [fragmenten]);

  const positie = (starts[idx] ?? 0) + inFragment;

  const bronnen: [string | undefined, string | undefined] = [undefined, undefined];
  if (huidig) bronnen[laag] = huidig.videoUrl;
  const naDeze = fragmenten[idx + 1];
  // Tijdens een overvloeier houdt de andere laag het vorige beeld; daarna laadt hij
  // alvast het volgende fragment.
  if (vasthouden && vasthouden.laag === ander) bronnen[ander] = vasthouden.url;
  else if (naDeze) bronnen[ander] = naDeze.videoUrl;

  /** Naar het volgende fragment, met het huidige beeld stilgezet om uit te vloeien. */
  const naarVolgende = () => {
    const nu = fragmenten[idx];
    if (nu && fragmenten[idx + 1]) {
      // Stilzetten zoals de download: daar blijft het laatste beeld staan, anders
      // praat de mond nog door terwijl hij wegvloeit.
      videoRefs.current[laag]?.pause();
      setVasthouden({ laag, url: nu.videoUrl });
      setBeeldKlaar(false);
    }
    setIdx(idx + 1);
  };
  // Het interval hieronder leeft langer dan één render; via de ref roept het altijd de actuele versie aan.
  const naarVolgendeRef = useRef(naarVolgende);
  naarVolgendeRef.current = naarVolgende;

  const naarVolume = useCallback((doel: number, ms: number) => {
    const a = muziekRef.current;
    if (!a) return;
    if (duckTimer.current) clearInterval(duckTimer.current);
    const start = a.volume;
    const stappen = Math.max(1, Math.round(ms / 25));
    let n = 0;
    duckTimer.current = setInterval(() => {
      n++;
      a.volume = Math.max(0, Math.min(1, start + (doel - start) * (n / stappen)));
      if (n >= stappen && duckTimer.current) { clearInterval(duckTimer.current); duckTimer.current = null; }
    }, 25);
  }, []);

  // Fragment starten, eventueel middenin na een sprong. Bewust NIET afhankelijk
  // van `status`: pauzeren en hervatten regelen de knoppen zelf, anders zou
  // hervatten het fragment overnieuw beginnen.
  useEffect(() => {
    if (status !== "speelt" || !huidig) return;
    const offset = Math.max(0, Math.min(zoekOffset.current, Math.max(0, huidig.duur - 0.05)));
    zoekOffset.current = 0;
    setInFragment(offset);

    const v = videoRefs.current[laag];
    if (v) {
      const start = () => {
        try { v.currentTime = huidig.mouthStart + offset; } catch {}
        void v.play().catch(() => {});
      };
      if (v.readyState >= 1) start();
      else v.addEventListener("loadedmetadata", start, { once: true });
    }

    if (huidig.audioUrl) {
      const a = audioRef.current;
      if (a) {
        try { a.currentTime = offset; } catch {}
        void a.play().catch(() => {});
      }
    } else {
      stilStart.current = performance.now() - offset * 1000;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, ronde]);

  // Positie bijhouden. De stem is leidend waar die er is; bij een stil fragment
  // telt de klok, want daar stuurt niets anders de tijd.
  useEffect(() => {
    if (status !== "speelt" || !huidig) return;
    const t = setInterval(() => {
      if (sleept) return;
      if (huidig.audioUrl) {
        const a = audioRef.current;
        if (a && !a.paused) setInFragment(a.currentTime);
      } else {
        const verstreken = (performance.now() - stilStart.current) / 1000;
        if (verstreken >= huidig.duur) naarVolgendeRef.current();
        else setInFragment(verstreken);
      }
    }, 100);
    return () => clearInterval(t);
  }, [status, huidig, sleept]);

  // Muziek duckt mee met wat er te horen is.
  useEffect(() => {
    if (status !== "speelt" || !muziekRef.current) return;
    naarVolume(huidig?.audioUrl ? basisVol * (MUZIEK_GEDUCKT / MUZIEK_VOL) : basisVol, DUCK_MS);
  }, [idx, status, huidig, basisVol, naarVolume]);

  useEffect(() => () => { if (duckTimer.current) clearInterval(duckTimer.current); }, []);

  // Na de overvloeier mag de vrijgekomen laag het volgende fragment laden.
  useEffect(() => {
    if (!vasthouden) return;
    const t = setTimeout(() => setVasthouden(null), OVERVLOEI_MS + BEELD_WACHT_MS);
    return () => clearTimeout(t);
  }, [vasthouden]);

  // Overvloeien zodra het nieuwe beeld getekend kan worden. Eerst readyState: een laag
  // waarvan de bron niet verandert vuurt geen nieuw laad-event af (zie bovenaan), en
  // dan zou de speler blijven wachten. Met een grens, zodat hij nooit blijft hangen.
  useEffect(() => {
    if (beeldKlaar) return;
    const v = videoRefs.current[laag];
    const klaar = () => setBeeldKlaar(true);
    if (!v || v.readyState >= 2) { klaar(); return; }
    v.addEventListener("loadeddata", klaar, { once: true });
    const t = setTimeout(klaar, BEELD_WACHT_MS);
    return () => { v.removeEventListener("loadeddata", klaar); clearTimeout(t); };
  }, [beeldKlaar, laag]);

  // Het volgende fragment staat alvast op het beeld waarmee het begint (waar de mond
  // opengaat), zodat de overvloeier niet eerst beeld nul laat zien en dan verspringt.
  useEffect(() => {
    if (!naDeze || vasthouden) return;
    const v = videoRefs.current[ander];
    if (!v) return;
    const zet = () => { try { v.currentTime = naDeze.mouthStart; } catch {} };
    if (v.readyState >= 1) zet();
    else v.addEventListener("loadedmetadata", zet, { once: true });
    return () => v.removeEventListener("loadedmetadata", zet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naDeze?.key, vasthouden, ander]);

  const alsStop = useCallback(() => {
    videoRefs.current.forEach((v) => v?.pause());
    audioRef.current?.pause();
    muziekRef.current?.pause();
    setVasthouden(null);
    setBeeldKlaar(true);
    setStatus("stop");
    setIdx(0);
    setInFragment(0);
  }, []);

  useEffect(() => {
    if (status !== "stop" && idx >= fragmenten.length && fragmenten.length > 0) alsStop();
  }, [idx, status, fragmenten.length, alsStop]);

  /** Springt naar een absolute positie op de tijdlijn. */
  const zoek = useCallback((doelSec: number) => {
    if (fragmenten.length === 0) return;
    const t = Math.max(0, Math.min(doelSec, Math.max(0, totaal - 0.1)));
    let i = starts.findIndex((s, n) => t >= s && t < s + Math.max(0.1, fragmenten[n].duur));
    if (i < 0) i = fragmenten.length - 1;
    const offset = t - starts[i];

    setInFragment(offset);
    if (i === idx) {
      // Zelfde fragment: het start-effect vuurt niet, dus zelf verzetten.
      const v = videoRefs.current[(i % 2) as 0 | 1];
      const f = fragmenten[i];
      if (v) { try { v.currentTime = f.mouthStart + offset; } catch {} }
      if (f.audioUrl) { const a = audioRef.current; if (a) { try { a.currentTime = offset; } catch {} } }
      else stilStart.current = performance.now() - offset * 1000;
    } else {
      // Een sprong is geen overgang: meteen het nieuwe beeld.
      zoekOffset.current = offset;
      setVasthouden(null);
      setBeeldKlaar(true);
      setIdx(i);
    }
  }, [fragmenten, starts, totaal, idx]);

  function afspelen() {
    if (fragmenten.length === 0) return;
    const m = muziekRef.current;
    if (m) {
      try { m.currentTime = 0; } catch {}
      m.volume = 0;
      void m.play().catch(() => {});
      // Invaren in plaats van ineens vol aan, net als het muziekbed in de export.
      naarVolume(basisVol, INFADE_MS);
    }
    zoekOffset.current = 0;
    setVasthouden(null);
    setBeeldKlaar(true);
    setIdx(0);
    setInFragment(0);
    setRonde((r) => r + 1);
    setStatus("speelt");
  }

  function pauzeer() {
    videoRefs.current.forEach((v) => v?.pause());
    audioRef.current?.pause();
    muziekRef.current?.pause();
    setStatus("pauze");
  }

  function hervat() {
    if (status === "stop") { afspelen(); return; }
    void videoRefs.current[laag]?.play().catch(() => {});
    if (huidig?.audioUrl) void audioRef.current?.play().catch(() => {});
    else stilStart.current = performance.now() - inFragment * 1000;
    void muziekRef.current?.play().catch(() => {});
    setStatus("speelt");
  }

  const spoel = (delta: number) => {
    if (status === "stop") { setRonde((r) => r + 1); setStatus("speelt"); }
    zoek(positie + delta);
  };

  /** Positie uit een aanwijsgebeurtenis op de balk. */
  const uitBalk = (clientX: number) => {
    const el = balkRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return ((clientX - r.left) / Math.max(1, r.width)) * totaal;
  };

  const verhouding = format === "9:16" ? "9 / 16" : "16 / 9";
  const bezig = status === "speelt" || status === "pauze";
  const percentage = totaal ? Math.min(100, (positie / totaal) * 100) : 0;

  return (
    <div>
      <div
        className="relative bg-black rounded-lg overflow-hidden mx-auto"
        style={{ aspectRatio: verhouding, maxWidth: format === "9:16" ? 360 : "100%" }}
      >
        {fragmenten.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
            Nog geen fragmenten
          </div>
        ) : (
          <>
            {([0, 1] as const).map((n) => (
              <video
                key={n}
                ref={(el) => { videoRefs.current[n] = el; }}
                src={bronnen[n]}
                className="absolute inset-0 w-full h-full object-contain"
                style={{
                  // Het nieuwe beeld komt op zodra het klaar is; tot dan blijft het vorige staan.
                  opacity: (n === laag ? beeldKlaar : !beeldKlaar && vasthouden?.laag === n) ? 1 : 0,
                  transition: `opacity ${OVERVLOEI_MS}ms ease-in-out`,
                }}
                playsInline
                muted
                preload="auto"
              />
            ))}

            {/* Klikken op het beeld pauzeert en hervat, zoals je van een speler verwacht. */}
            <button
              onClick={() => (status === "speelt" ? pauzeer() : hervat())}
              className="absolute inset-0 flex items-center justify-center"
              aria-label={status === "speelt" ? "Pauzeren" : "Afspelen"}
            >
              {status !== "speelt" && (
                <span className="w-14 h-14 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white text-xl transition">
                  ▶
                </span>
              )}
            </button>

            {huidig?.audioUrl && (
              <audio
                key={`${huidig.key}-a`}
                ref={audioRef}
                src={huidig.audioUrl}
                onEnded={naarVolgende}
              />
            )}
            {/* Doorlopend muziekbed, bewust niet gekoppeld aan een fragment. */}
            {musicUrl && <audio ref={muziekRef} src={musicUrl} loop preload="auto" />}
          </>
        )}
      </div>

      {/* Tijdbalk over de hele video. De streepjes zijn de fragmentgrenzen, zodat
          je ziet waar een scène begint en gericht kunt springen. */}
      <div
        ref={balkRef}
        onPointerDown={(e) => {
          if (fragmenten.length === 0) return;
          setSleept(true);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          zoek(uitBalk(e.clientX));
        }}
        onPointerMove={(e) => { if (sleept) zoek(uitBalk(e.clientX)); }}
        onPointerUp={(e) => {
          setSleept(false);
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          if (status !== "speelt") hervat();
        }}
        className="relative h-2 mt-2 rounded-full bg-white/10 cursor-pointer select-none touch-none"
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-orange-500" style={{ width: `${percentage}%` }} />
        {starts.slice(1).map((s, i) => (
          <span key={i} className="absolute top-0 bottom-0 w-px bg-black/40" style={{ left: `${(s / totaal) * 100}%` }} />
        ))}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow pointer-events-none"
          style={{ left: `${percentage}%` }}
        />
      </div>

      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={() => (status === "speelt" ? pauzeer() : hervat())}
          disabled={fragmenten.length === 0}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-medium rounded px-3 py-1.5 transition w-16"
        >
          {status === "speelt" ? "❚❚" : "▶"}
        </button>
        <button
          onClick={() => spoel(-SPOEL_SEC)}
          disabled={fragmenten.length === 0}
          title={`${SPOEL_SEC} seconden terug`}
          className="text-xs text-slate-400 hover:text-white border border-white/10 rounded px-2 py-1.5 disabled:opacity-30 transition"
        >
          ↩ {SPOEL_SEC}s
        </button>
        <button
          onClick={() => spoel(SPOEL_SEC)}
          disabled={fragmenten.length === 0}
          title={`${SPOEL_SEC} seconden vooruit`}
          className="text-xs text-slate-400 hover:text-white border border-white/10 rounded px-2 py-1.5 disabled:opacity-30 transition"
        >
          {SPOEL_SEC}s ↪
        </button>
        {bezig && (
          <button onClick={alsStop} className="text-xs text-slate-500 hover:text-white px-2 py-1.5 transition">
            Stop
          </button>
        )}

        <span className="text-xs text-slate-500 tabular-nums ml-1">
          {tijd(positie)} / {tijd(totaal)}
        </span>

        {huidig && (
          <span className="text-xs text-slate-400 truncate ml-2">
            <span className="text-slate-600">{idx + 1}/{fragmenten.length}</span>{" "}
            {huidig.spreker
              ? <><span className="text-orange-300">{huidig.spreker}</span>: {huidig.tekst}</>
              : <span className="text-sky-300">🎬 {huidig.tekst}</span>}
          </span>
        )}
      </div>
    </div>
  );
}
