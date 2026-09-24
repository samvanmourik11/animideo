"use client";

// VASTE VOORWERPEN EN DE VASTE PLEK VOOR EEN VERHAAL.
//
// Personages konden al uit de bibliotheek gekozen worden; voorwerpen en
// omgevingen bestonden alleen in de dialoogtool. Dit blok haalt ze op en laat de
// gebruiker kiezen wat er in dít verhaal vastligt. Wélke scene ze gebruikt,
// bepaalt de beeldregie — een machine hoort niet in elk beeld.

import { useEffect, useState } from "react";
import type { StoryVoorwerp, StoryOmgeving } from "@/lib/infographics/story-schema";
import { MAX_STORY_VOORWERPEN } from "@/lib/infographics/story-schema";
import { voorwerpenVoorStijl, type BibliotheekVoorwerp } from "@/lib/infographics/voorwerp-bibliotheek";
import { variantenVoorStijl, beeldUitAndereStijl, type BibliotheekOmgeving } from "@/lib/infographics/omgeving-bibliotheek";

export default function VasteDingen({
  styleId,
  voorwerpen,
  omgeving,
  onVoorwerpen,
  onOmgeving,
  disabled = false,
}: {
  styleId: string;
  voorwerpen: StoryVoorwerp[];
  omgeving: StoryOmgeving | null;
  onVoorwerpen: (v: StoryVoorwerp[]) => void;
  onOmgeving: (o: StoryOmgeving | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState<"geen" | "voorwerpen" | "omgevingen">("geen");
  const [bibVoorwerpen, setBibVoorwerpen] = useState<BibliotheekVoorwerp[] | null>(null);
  const [bibOmgevingen, setBibOmgevingen] = useState<BibliotheekOmgeving[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    if (open === "geen") return;
    const pad = open === "voorwerpen" ? "/api/voorwerpen" : "/api/omgevingen";
    fetch(pad)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setFout(d.error); return; }
        if (open === "voorwerpen") setBibVoorwerpen(d.voorwerpen ?? []);
        else setBibOmgevingen(d.omgevingen ?? []);
      })
      .catch(() => setFout("De bibliotheek kon niet geladen worden."));
  }, [open]);

  function kiesVoorwerp(b: BibliotheekVoorwerp) {
    if (voorwerpen.some((v) => v.bibliotheekId === b.id)) return;
    // Het blad hoort bij één tekenstijl. Is er voor deze stijl nog geen blad,
    // dan gaat het voorwerp mee op zijn beschrijving en wordt het in de video
    // getekend — net als in de dialoogtool.
    const [inStijl] = voorwerpenVoorStijl([b], styleId);
    onVoorwerpen([
      ...voorwerpen,
      { naam: b.naam, uiterlijk: b.uiterlijk, bladUrl: inStijl?.bladUrl ?? null, bibliotheekId: b.id },
    ].slice(0, MAX_STORY_VOORWERPEN));
    setOpen("geen");
  }

  function kiesOmgeving(b: BibliotheekOmgeving) {
    const varianten = variantenVoorStijl(b, styleId);
    onOmgeving({
      naam: b.naam,
      beschrijving: b.beschrijving,
      kenmerken: b.kenmerken ?? [],
      varianten: varianten.map((v) => ({ soort: v.soort, url: v.url })),
      bibliotheekId: b.id,
    });
    setOpen("geen");
  }

  return (
    <div className="flex flex-col gap-1.5 pb-1.5">
      <span className="block text-[11px] text-slate-400">
        Vaste voorwerpen en plek{voorwerpen.length ? ` (${voorwerpen.length}/${MAX_STORY_VOORWERPEN})` : ""}
      </span>

      {(voorwerpen.length > 0 || omgeving) && (
        <div className="flex flex-wrap gap-1.5">
          {voorwerpen.map((v) => (
            <span key={v.bibliotheekId ?? v.naam} className="flex items-center gap-1.5 rounded border border-white/10 bg-slate-900/40 px-2 py-1 text-[11px] text-white">
              {v.bladUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.bladUrl} alt="" className="h-6 w-6 rounded object-contain bg-white/90 p-0.5" />
              )}
              {v.naam}
              <button
                onClick={() => onVoorwerpen(voorwerpen.filter((x) => x !== v))}
                disabled={disabled}
                title="Uit dit verhaal halen"
                className="text-slate-400 hover:text-white disabled:opacity-40"
              >
                ×
              </button>
            </span>
          ))}
          {omgeving && (
            <span className="flex items-center gap-1.5 rounded border border-orange-400/30 bg-orange-500/10 px-2 py-1 text-[11px] text-orange-50">
              {omgeving.varianten[0]?.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={omgeving.varianten[0].url} alt="" className="h-6 w-10 rounded object-cover" />
              )}
              📍 {omgeving.naam}
              <button
                onClick={() => onOmgeving(null)}
                disabled={disabled}
                title="Plek loslaten"
                className="text-orange-200 hover:text-white disabled:opacity-40"
              >
                ×
              </button>
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => (o === "voorwerpen" ? "geen" : "voorwerpen"))}
          disabled={disabled || voorwerpen.length >= MAX_STORY_VOORWERPEN}
          title="Dingen die er in al je video's hetzelfde uitzien"
          className="text-[11px] px-2 py-1 rounded border border-white/10 bg-slate-900/60 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
        >
          + Voorwerp
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => (o === "omgevingen" ? "geen" : "omgevingen"))}
          disabled={disabled}
          title="De plek waar dit verhaal zich afspeelt"
          className="text-[11px] px-2 py-1 rounded border border-white/10 bg-slate-900/60 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
        >
          {omgeving ? "Andere plek" : "+ Plek"}
        </button>
        <a href="/bibliotheek" target="_blank" className="text-[10px] text-slate-500 hover:text-slate-300 underline">
          bibliotheek beheren
        </a>
      </div>

      {open !== "geen" && (
        <div className="rounded border border-white/10 bg-slate-900/50 p-2 max-h-52 overflow-y-auto">
          {fout && <p className="text-[11px] text-red-400">{fout}</p>}
          {open === "voorwerpen" && (
            bibVoorwerpen === null ? (
              <p className="text-[11px] text-slate-500">Laden…</p>
            ) : bibVoorwerpen.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                Je bibliotheek is nog leeg. Voeg er een voorwerp toe (of maak er een van een foto).
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {bibVoorwerpen.map((b) => {
                  const [inStijl] = voorwerpenVoorStijl([b], styleId);
                  return (
                    <button
                      key={b.id}
                      onClick={() => kiesVoorwerp(b)}
                      className="flex items-center gap-2 text-left rounded px-2 py-1 hover:bg-white/5"
                    >
                      {inStijl?.bladUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={inStijl.bladUrl} alt="" className="h-8 w-8 rounded object-contain bg-white/90 p-0.5" />
                      ) : (
                        <span className="h-8 w-8 rounded bg-white/5 flex items-center justify-center text-[10px] text-slate-500">?</span>
                      )}
                      <span className="text-[11px] text-white">{b.naam}</span>
                      {!inStijl?.bladUrl && (
                        <span className="text-[10px] text-slate-500">— wordt in deze stijl getekend</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )
          )}
          {open === "omgevingen" && (
            bibOmgevingen === null ? (
              <p className="text-[11px] text-slate-500">Laden…</p>
            ) : bibOmgevingen.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                Je hebt nog geen plekken. Maak er een van een foto van je kantoor of werkplaats.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {bibOmgevingen.map((b) => {
                  const varianten = variantenVoorStijl(b, styleId);
                  const voorbeeld = varianten[0]?.url ?? beeldUitAndereStijl(b, styleId);
                  return (
                    <button
                      key={b.id}
                      onClick={() => kiesOmgeving(b)}
                      className="flex items-center gap-2 text-left rounded px-2 py-1 hover:bg-white/5"
                    >
                      {voorbeeld ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={voorbeeld} alt="" className="h-8 w-14 rounded object-cover" />
                      ) : (
                        <span className="h-8 w-14 rounded bg-white/5" />
                      )}
                      <span className="text-[11px] text-white">{b.naam}</span>
                      {!varianten.length && (
                        <span className="text-[10px] text-slate-500">— nog niet in deze stijl</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
