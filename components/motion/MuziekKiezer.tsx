"use client";

// Muziek 2.0 (verbeterplan idee 09): elk nummer uit de muziekbibliotheek, per sfeer, met een
// luisterknop; hoe hard de muziek onder de stem ligt; of een eigen nummer (bijv. de jingle van
// het bedrijf). Gedeeld door de motion- en de docu-studio.

import { useRef, useState } from "react";
import { MUSIC_CATEGORIES, MUSIC_TRACKS, musicTrackUrl } from "@/lib/music/library";
import { MUZIEK_VOLUMES, type MuziekVolume } from "@/lib/motion/types";

export function MuziekKiezer({
  muziek,
  setMuziek,
  volume,
  setVolume,
  eigen,
  setEigen,
  aanbevolen,
}: {
  muziek: string;
  setMuziek: (s: string) => void;
  volume: MuziekVolume;
  setVolume: (v: MuziekVolume) => void;
  eigen: string;
  setEigen: (url: string) => void;
  /** Nummers die bij deze studio passen, bovenaan (slug + eigen naam). */
  aanbevolen: readonly { slug: string; naam: string }[];
}) {
  const speler = useRef<HTMLAudioElement | null>(null);
  const [speelt, setSpeelt] = useState(false);
  const [rechten, setRechten] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const bron = eigen || (muziek ? musicTrackUrl(muziek) : "");
  function luister() {
    if (speelt) {
      speler.current?.pause();
      return setSpeelt(false);
    }
    if (!bron) return;
    speler.current?.pause();
    const a = new Audio(bron);
    a.volume = 0.6;
    a.onended = () => setSpeelt(false);
    speler.current = a;
    void a.play().then(() => setSpeelt(true)).catch(() => setSpeelt(false));
  }
  function kies(slug: string) {
    speler.current?.pause();
    setSpeelt(false);
    setMuziek(slug);
  }

  async function upload(bestand: File) {
    setBezig(true);
    setFout(null);
    try {
      const fd = new FormData();
      fd.append("bestand", bestand);
      fd.append("soort", "muziek");
      const res = await fetch("/api/motion/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Uploaden mislukt");
      speler.current?.pause();
      setSpeelt(false);
      setEigen(data.url);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  }

  const aanbevolenSlugs = new Set(aanbevolen.map((a) => a.slug));
  return (
    <div className="space-y-2">
      <label className="n-label">Muziek</label>
      {eigen ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm text-tekst">
          <span className="flex-1">🎵 Je eigen nummer</span>
          <button onClick={luister} className="n-knop2 !px-3 !py-1">{speelt ? "❚❚" : "▶"}</button>
          <button onClick={() => { speler.current?.pause(); setSpeelt(false); setEigen(""); }} className="text-xs text-tekst-3 hover:text-red-500">Weghalen</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <select value={muziek} onChange={(e) => kies(e.target.value)} className="n-invoer min-w-0">
            <optgroup label="Past hier goed bij">
              {aanbevolen.map((a) => (
                <option key={a.slug || "geen"} value={a.slug}>{a.naam}</option>
              ))}
            </optgroup>
            {MUSIC_CATEGORIES.map((c) => (
              <optgroup key={c.id} label={c.label}>
                {MUSIC_TRACKS.filter((t) => t.category === c.id && !aanbevolenSlugs.has(t.slug)).map((t) => (
                  <option key={t.slug} value={t.slug}>{t.title}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button onClick={luister} disabled={!bron} title="Luister naar dit nummer" className="n-knop2 !px-3 disabled:opacity-50">{speelt ? "❚❚" : "▶"}</button>
        </div>
      )}

      {(muziek || eigen) && (
        <div className="flex items-center gap-2 text-xs text-tekst-3">
          <span>Onder de stem:</span>
          <div className="flex rounded-lg border border-rand p-0.5">
            {MUZIEK_VOLUMES.map((v) => (
              <button key={v.id} onClick={() => setVolume(v.id)} className={`px-2.5 py-0.5 rounded-md ${volume === v.id ? "bg-blue-600 text-white" : "hover:bg-blue-500/10"}`}>
                {v.naam}
              </button>
            ))}
          </div>
        </div>
      )}

      {!eigen && (
        <details className="text-xs text-tekst-3">
          <summary className="cursor-pointer hover:text-tekst">＋ Eigen nummer uploaden</summary>
          <div className="mt-2 space-y-2">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={rechten} onChange={(e) => setRechten(e.target.checked)} className="mt-0.5" />
              <span>Ik heb de rechten om dit nummer in mijn video te gebruiken.</span>
            </label>
            <label className={`n-knop2 inline-flex cursor-pointer ${!rechten || bezig ? "opacity-50 pointer-events-none" : ""}`}>
              {bezig ? "Uploaden…" : "Kies een mp3 of wav"}
              <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
          </div>
        </details>
      )}
      {fout && <p className="text-xs text-red-500">{fout}</p>}
    </div>
  );
}
