"use client";

// Iconenbibliotheek in de editor.
//
// Alles wat hier staat is al gemaakt: aanklikken kost niets en gaat meteen. De
// eerste tegel linksboven is de uitzondering — daar maak je een icoon dat er nog
// niet is. Die volgorde is bewust: eerst kijken of het er al staat, pas dan iets
// nieuws laten maken.
//
// Een gekozen icoon komt als losse laag over de clip waar de tijdbalk op staat,
// dus je kunt hem daarna gewoon verslepen en schalen.

import { useMemo, useState } from "react";
import {
  ICONEN,
  ICON_CATEGORIEEN,
  iconUrl,
  zoekIconen,
  type IconCategorie,
  type IconDefinitie,
} from "@/lib/editor/icons/library";
import type { EditorStore } from "@/lib/editor/store";
import { computeDuration } from "@/lib/editor/timeline";

export default function IconPanel({
  store,
  onClose,
}: {
  store: EditorStore;
  onClose: () => void;
}) {
  const [categorie, setCategorie] = useState<IconCategorie | "alle">("alle");
  const [zoek, setZoek] = useState("");
  const [eigenOpen, setEigenOpen] = useState(false);
  const [wens, setWens] = useState("");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  const lijst = useMemo<IconDefinitie[]>(() => {
    if (zoek.trim()) return zoekIconen(zoek, 200);
    if (categorie === "alle") return ICONEN;
    return ICONEN.filter((i) => i.categorie === categorie);
  }, [zoek, categorie]);

  /** Op welke clip komt het icoon? Die onder de tijdbalk. */
  function huidigeClipId(): string | null {
    const { doc, currentTime } = store.getState();
    const spoor = doc.tracks.find((t) => t.kind === "video");
    const clip = spoor?.clips.find((c) => currentTime >= c.start && currentTime < c.start + c.duration);
    return clip?.id ?? spoor?.clips[0]?.id ?? null;
  }

  function plaats(src: string, label: string) {
    const clipId = huidigeClipId();
    if (!clipId) {
      setMelding("Er staat nog geen clip op de tijdlijn om een icoon op te zetten.");
      return;
    }
    const res = store.dispatch({
      op: "add_element",
      clipId,
      src,
      label,
      // Midden-boven: uit de weg van ondertiteling, en meteen zichtbaar.
      x: 0.5,
      y: 0.35,
      scale: 0.18,
    });
    setMelding(res.ok ? `${label} toegevoegd — sleep hem op zijn plek` : res.error.message);
  }

  async function maakEigen() {
    const beschrijving = wens.trim();
    if (beschrijving.length < 2 || bezig) return;
    setBezig(true);
    setMelding(null);
    try {
      const res = await fetch("/api/editor/icon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beschrijving }),
      });
      const d = await res.json();
      if (!res.ok || !d.url) {
        setMelding(d.error === "insufficient_credits" ? "Te weinig credits voor een eigen icoon." : d.error ?? "Mislukt");
        return;
      }
      plaats(d.url, beschrijving);
      setWens("");
      setEigenOpen(false);
    } catch {
      setMelding("Het icoon maken lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  const leeg = computeDuration(store.getState().doc) === 0;

  return (
    <div className="absolute right-0 top-0 z-40 h-full w-80 border-l border-[#2a2a2a] bg-[#141414] flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a2a]">
        <span className="text-xs font-semibold text-slate-200">Iconen</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Sluiten"
          className="w-6 h-6 rounded bg-white/5 hover:bg-white/15 text-slate-400 text-xs"
        >
          ✕
        </button>
      </div>

      <div className="p-2 space-y-2 border-b border-[#2a2a2a]">
        <input
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          placeholder="Zoek een icoon…"
          className="w-full rounded-md bg-[#1e1e1e] border border-[#2a2a2a] px-2 py-1.5 text-[12px] text-white placeholder:text-slate-600 focus:outline-none focus:border-[#555]"
        />
        {!zoek.trim() && (
          <div className="flex flex-wrap gap-1">
            <Chip actief={categorie === "alle"} onClick={() => setCategorie("alle")} label={`Alles (${ICONEN.length})`} />
            {ICON_CATEGORIEEN.map((c) => (
              <Chip key={c.id} actief={categorie === c.id} onClick={() => setCategorie(c.id)} label={c.label} />
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-4 gap-1.5">
          {/* Altijd linksboven: zelf een icoon laten maken. */}
          <button
            type="button"
            onClick={() => setEigenOpen((o) => !o)}
            title="Staat het er niet bij? Beschrijf het en laat het maken"
            className={`aspect-square rounded-lg border border-dashed flex flex-col items-center justify-center gap-0.5 text-[9px] leading-tight px-1 ${
              eigenOpen
                ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-200"
                : "border-cyan-500/40 bg-cyan-500/5 text-cyan-300 hover:bg-cyan-500/15"
            }`}
          >
            <span className="text-base leading-none">✨</span>
            <span className="text-center">Eigen icoon</span>
          </button>

          {lijst.map((icoon) => (
            <button
              key={icoon.slug}
              type="button"
              onClick={() => plaats(iconUrl(icoon.slug), icoon.label)}
              title={icoon.label}
              disabled={leeg}
              className="aspect-square rounded-lg bg-white/[0.04] hover:bg-white/[0.10] border border-white/5 p-1.5 disabled:opacity-40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={iconUrl(icoon.slug)} alt={icoon.label} loading="lazy" className="w-full h-full object-contain" />
            </button>
          ))}
        </div>

        {lijst.length === 0 && zoek.trim() ? (
          <p className="text-[11px] text-slate-500 px-1 py-3">
            Niets gevonden voor &ldquo;{zoek}&rdquo;. Maak hem linksboven zelf.
          </p>
        ) : null}
      </div>

      {eigenOpen ? (
        <div className="border-t border-[#2a2a2a] p-2 space-y-1.5">
          <input
            value={wens}
            onChange={(e) => setWens(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void maakEigen(); }}
            placeholder="Bijv. een kapotte wasmachine"
            autoFocus
            className="w-full rounded-md bg-[#1e1e1e] border border-[#2a2a2a] px-2 py-1.5 text-[12px] text-white placeholder:text-slate-600 focus:outline-none focus:border-[#555]"
          />
          <button
            type="button"
            onClick={() => void maakEigen()}
            disabled={bezig || wens.trim().length < 2}
            className="w-full text-xs py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white"
          >
            {bezig ? "Bezig met maken…" : "Maak dit icoon"}
          </button>
          <p className="text-[10px] text-slate-500">
            In dezelfde stijl als de rest. Kost 1 credit; alles uit de bibliotheek is gratis.
          </p>
        </div>
      ) : null}

      {melding ? <p className="text-[11px] text-slate-400 px-3 py-2 border-t border-[#2a2a2a]">{melding}</p> : null}
    </div>
  );
}

function Chip({ actief, onClick, label }: { actief: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[10px] px-2 py-0.5 rounded-full border ${
        actief
          ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200"
          : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}
