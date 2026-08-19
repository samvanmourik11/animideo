"use client";

// ── Gedeelde onderdelen van de editor-panelen ────────────────────────────────
//
// De oude editor was donkergrijs met tekst van 10 pixels: alles paste, maar je
// moest zoeken naar wat je nodig had. Canva laat zien waarom dat anders kan —
// lichte panelen, tekst die je leest zonder te turen, en per onderdeel een kopje
// met een rijtje eronder. Die keuzes staan hier op één plek, zodat elk paneel er
// vanzelf hetzelfde uitziet en één wijziging overal doorwerkt.

import { useState, type ReactNode } from "react";

/** Kleuren van de editor. Alles wat licht/donker bepaalt staat hier. */
export const KLEUR = {
  paneel: "bg-white",
  paneelRand: "border-slate-200",
  rail: "bg-slate-50",
  werkvlak: "bg-slate-100",
  tekst: "text-slate-900",
  tekstZacht: "text-slate-500",
  accent: "bg-blue-600",
  accentTekst: "text-blue-700",
};

export function PaneelKop({ titel, onTerug, onSluit }: { titel: string; onTerug?: () => void; onSluit?: () => void }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0">
      {onTerug && (
        <button
          type="button"
          onClick={onTerug}
          aria-label="Terug"
          className="w-7 h-7 -ml-1 rounded-lg hover:bg-slate-100 text-slate-600 flex items-center justify-center"
        >
          ←
        </button>
      )}
      <h2 className="text-[15px] font-semibold text-slate-900 flex-1 truncate">{titel}</h2>
      {onSluit && (
        <button
          type="button"
          onClick={onSluit}
          aria-label="Paneel sluiten"
          className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function Zoekbalk({
  waarde,
  onWijzig,
  hint,
}: {
  waarde: string;
  onWijzig: (v: string) => void;
  hint: string;
}) {
  return (
    <div className="px-4 pb-3 shrink-0">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">⌕</span>
        <input
          value={waarde}
          onChange={(e) => onWijzig(e.target.value)}
          placeholder={hint}
          className="w-full rounded-xl bg-slate-100 border border-transparent focus:border-blue-500 focus:bg-white pl-8 pr-3 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
      </div>
    </div>
  );
}

/**
 * Een rij met een kopje en, als er meer is dan er past, een knop om alles te
 * zien. Dat is precies waarom Canva's paneel overzichtelijk blijft: je ziet van
 * elke categorie een handvol, niet honderden.
 */
export function Sectie({
  titel,
  alles,
  children,
}: {
  titel: string;
  alles?: { open: boolean; onWissel: () => void };
  children: ReactNode;
}) {
  return (
    <section className="px-4 pb-5">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[13px] font-semibold text-slate-800">{titel}</h3>
        {alles && (
          <button
            type="button"
            onClick={alles.onWissel}
            className="text-[12px] text-blue-700 hover:text-blue-900 font-medium"
          >
            {alles.open ? "Minder" : "Alles bekijken"}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * De AI-knop die in Canva boven elke categorie staat: "beschrijf je ideale
 * element". Bij ons staat hij bewust ná de bibliotheek in beeldvolgorde maar
 * vóór in de tegelrij — eerst kijken of het er al staat, pas dan iets nieuws
 * laten maken. Dat scheelt credits en levert een beter resultaat.
 */
export function GenereerVak({
  hint,
  knop,
  bezig,
  onGenereer,
  toelichting,
}: {
  hint: string;
  knop: string;
  bezig: boolean;
  onGenereer: (beschrijving: string) => void;
  toelichting?: string;
}) {
  const [tekst, setTekst] = useState("");
  const kan = tekst.trim().length >= 2 && !bezig;
  return (
    <div className="px-4 pb-3 shrink-0">
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-2.5 space-y-2">
        <input
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && kan) onGenereer(tekst.trim()); }}
          placeholder={hint}
          className="w-full rounded-lg bg-white border border-blue-200 px-3 py-2 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
        />
        <button
          type="button"
          onClick={() => kan && onGenereer(tekst.trim())}
          disabled={!kan}
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-[13px] font-medium py-2"
        >
          {bezig ? "Bezig met maken…" : knop}
        </button>
        {toelichting && <p className="text-[11px] text-slate-500 leading-snug">{toelichting}</p>}
      </div>
    </div>
  );
}

/** Tegel in een raster: een vorm, een icoon, een diagram. */
export function Tegel({
  onClick,
  titel,
  uit,
  children,
  vierkant = true,
}: {
  onClick: () => void;
  titel: string;
  uit?: boolean;
  children: ReactNode;
  vierkant?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titel}
      disabled={uit}
      className={`${vierkant ? "aspect-square" : ""} rounded-lg bg-slate-100 hover:bg-slate-200 border border-transparent hover:border-slate-300 p-2 flex items-center justify-center transition-colors disabled:opacity-40 disabled:hover:bg-slate-100`}
    >
      {children}
    </button>
  );
}

export function Chip({ actief, onClick, label }: { actief: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[12px] px-3 py-1.5 rounded-full border font-medium transition-colors ${
        actief
          ? "border-blue-500 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

export function Melding({ tekst }: { tekst: string | null }) {
  if (!tekst) return null;
  return (
    <p className="mx-4 mb-3 rounded-lg bg-slate-100 px-3 py-2 text-[12px] text-slate-600 leading-snug shrink-0">
      {tekst}
    </p>
  );
}

/** Kleurkiezer met een rijtje veelgebruikte kleuren plus een vrije keuze. */
export const PALET = [
  "#ffffff", "#0f172a", "#ef4444", "#f97316", "#facc15", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

export function KleurKiezer({
  waarde,
  onKies,
  label,
}: {
  waarde: string;
  onKies: (kleur: string) => void;
  label: string;
}) {
  return (
    <div>
      <p className="text-[12px] font-medium text-slate-600 mb-1.5">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {PALET.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onKies(k)}
            aria-label={k}
            className={`w-6 h-6 rounded-full border-2 ${
              waarde.toLowerCase() === k ? "border-blue-600" : "border-slate-200"
            }`}
            style={{ background: k }}
          />
        ))}
        <label className="w-6 h-6 rounded-full border-2 border-slate-200 overflow-hidden cursor-pointer relative">
          <span className="absolute inset-0 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" />
          <input
            type="color"
            value={/^#[\da-f]{6}$/i.test(waarde) ? waarde : "#ffffff"}
            onChange={(e) => onKies(e.target.value)}
            className="opacity-0 w-full h-full cursor-pointer"
          />
        </label>
      </div>
    </div>
  );
}
