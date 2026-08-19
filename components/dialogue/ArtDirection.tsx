"use client";

import { STORY_STYLE_PRESETS, stylePreviewUrl } from "@/lib/infographics/story-style";

// Beeldregie: de tekenstijl en een vrije briefing die voor ÉLK beeld in de video
// geldt — de twee-shots per scène en de bronbeelden per gesproken regel.
//
// Waarom dit op twee plekken in de wizard staat: je weet pas wat voor beeld je
// wilt als je je script hebt gelezen. De stijl vastzetten bij de opzet en er
// daarna niet meer bij kunnen, dwingt mensen opnieuw te beginnen.

export default function ArtDirection({
  styleId,
  brief,
  onStyle,
  onBrief,
  disabled = false,
  /** Aantal al gemaakte beelden — die houden hun oude stijl tot je ze weggooit. */
  gemaakteBeelden = 0,
  onOpnieuw,
}: {
  styleId: string;
  brief: string;
  onStyle: (id: string) => void;
  onBrief: (tekst: string) => void;
  disabled?: boolean;
  gemaakteBeelden?: number;
  onOpnieuw?: () => void;
}) {
  const actief = STORY_STYLE_PRESETS.find((s) => s.id === styleId) ?? STORY_STYLE_PRESETS[0];

  return (
    <div className="space-y-3">
      <div>
        <span className="block text-[11px] text-slate-400 mb-1.5">Animatiestijl</span>
        {/* Een voorbeeldbeeld zegt meer dan een naam: alle vier tonen dezelfde
            scène, dus je ziet puur het stijlverschil. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STORY_STYLE_PRESETS.map((s) => (
            <button
              key={s.id}
              onClick={() => onStyle(s.id)}
              disabled={disabled}
              className={`rounded-lg border overflow-hidden text-left transition disabled:opacity-50 disabled:cursor-not-allowed ${
                s.id === styleId
                  ? "border-orange-400 ring-1 ring-orange-400/40"
                  : "border-white/10 hover:border-white/30"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stylePreviewUrl(s.id)}
                alt={`Voorbeeld van de stijl ${s.name}`}
                className="w-full aspect-video object-cover bg-slate-800"
                loading="lazy"
              />
              <span className={`block px-2 py-1.5 ${s.id === styleId ? "bg-orange-500/10" : "bg-slate-900/40"}`}>
                <span className="block text-xs text-white font-medium">{s.name}</span>
                <span className="block text-[10px] text-slate-500 leading-tight">{s.tagline}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="block text-[11px] text-slate-400 mb-0.5">Illustratie-briefing</span>
        <textarea
          value={brief}
          onChange={(e) => onBrief(e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="Regie voor alle beelden, bijv.: gebruik onze huisstijlkleuren donkerblauw en oranje, personages in zakelijke kleding, lichte kantooromgeving, geen planten of decoratie."
          className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white placeholder:text-slate-600 disabled:opacity-50"
        />
        <span className="block text-[10px] text-slate-600 mt-0.5">
          Geldt voor élk beeld: de scènes én de personages per regel. Beschrijf hóe het eruit moet zien, niet wat er gezegd wordt.
        </span>
      </label>

      {/* Al gemaakte beelden houden hun oude stijl — dat moet je weten voor je je
          afvraagt waarom de helft van je video er anders uitziet. */}
      {gemaakteBeelden > 0 && !disabled && (
        <p className="text-[11px] text-amber-300">
          Er {gemaakteBeelden === 1 ? "staat 1 beeld" : `staan ${gemaakteBeelden} beelden`} klaar in de vorige stijl. Nieuwe beelden krijgen “{actief.name}”.
          {onOpnieuw && (
            <button onClick={onOpnieuw} className="ml-1 underline hover:text-amber-200">
              Alles opnieuw laten tekenen
            </button>
          )}
        </p>
      )}
    </div>
  );
}
