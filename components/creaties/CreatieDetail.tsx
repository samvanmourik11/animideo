"use client";

import { useState } from "react";
import type { Creatie, CreatieMap } from "@/lib/creaties/types";
import { modelNaam } from "@/lib/creaties/makers";
import { VIDEO_MODELLEN, STANDAARD_VIDEO_MODEL } from "@/lib/video-modellen";
import { startMaker, verwijder, zetFavoriet, zetMap } from "./gebruik-creaties";

// De detailweergave van één creatie — en vooral de vervolgknoppen. Dat is de motor van
// de nieuwe app: iets is nooit "af", je gaat vanaf hier verder (er een video van maken,
// nog een keer proberen). Elke vervolgstap wordt een nieuwe creatie die naar deze
// verwijst, zodat de keten zichtbaar blijft.

export default function CreatieDetail({
  creatie,
  mappen,
  onSluit,
  onGewijzigd,
  onWeg,
  onNieuw,
}: {
  creatie: Creatie;
  mappen?: CreatieMap[];
  onSluit: () => void;
  onGewijzigd: (c: Creatie) => void;
  onWeg: (id: string) => void;
  onNieuw: (c: Creatie) => void;
}) {
  const c = creatie;
  const [videoOpen, setVideoOpen] = useState(false);
  const [beweging, setBeweging] = useState("");
  const [videoModel, setVideoModel] = useState(STANDAARD_VIDEO_MODEL);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);

  async function doe(actie: () => Promise<void>) {
    setBezig(true);
    setMelding(null);
    try {
      await actie();
    } catch (e) {
      setMelding(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  }

  const gekozenModel = VIDEO_MODELLEN.find((m) => m.id === videoModel) ?? VIDEO_MODELLEN[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onSluit} />
      <div className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-[#0c1428] border border-white/[0.08] rounded-3xl grid md:grid-cols-[1fr_340px]">
        <div className="bg-black/40 flex items-center justify-center min-h-[300px] p-4">
          {c.status === "klaar" && c.url && c.soort === "beeld" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.url} alt={c.prompt ?? ""} className="max-h-[80vh] w-auto rounded-xl" />
          )}
          {c.status === "klaar" && c.url && c.soort === "video" && (
            <video src={c.url} controls autoPlay loop playsInline className="max-h-[80vh] w-auto rounded-xl" />
          )}
          {c.status === "bezig" && (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <div className="w-10 h-10 rounded-full border-2 border-blue-400/30 border-t-blue-400 animate-spin" />
              Wordt gemaakt… je kunt dit venster gerust sluiten.
            </div>
          )}
          {c.status === "mislukt" && (
            <div className="max-w-sm text-center space-y-2">
              <div className="text-3xl">⚠️</div>
              <p className="text-red-300 text-sm">{c.foutmelding ?? "Dit is niet gelukt."}</p>
              {c.credits > 0 && <p className="text-slate-500 text-xs">De {c.credits} credits staan weer op je saldo.</p>}
            </div>
          )}
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs text-slate-500">
              {modelNaam(c.fal_endpoint)} · {new Date(c.created_at).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}
              {c.credits > 0 && <> · {c.credits} cr.</>}
            </div>
            <button onClick={onSluit} className="text-slate-400 hover:text-white text-lg leading-none" aria-label="Sluiten">✕</button>
          </div>

          {c.prompt && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Opdracht</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(c.prompt ?? "");
                    setGekopieerd(true);
                    setTimeout(() => setGekopieerd(false), 1500);
                  }}
                  className="text-xs text-blue-300 hover:text-blue-200"
                >
                  {gekopieerd ? "Gekopieerd ✓" : "Kopiëren"}
                </button>
              </div>
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{c.prompt}</p>
            </div>
          )}

          {c.status === "klaar" && (
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Verder maken</span>
              {c.soort === "beeld" && !videoOpen && (
                <button onClick={() => setVideoOpen(true)} className="btn-primary w-full">🎬 Maak er video van</button>
              )}
              {c.soort === "beeld" && videoOpen && (
                <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
                  <textarea
                    value={beweging}
                    onChange={(e) => setBeweging(e.target.value)}
                    placeholder="Wat moet er bewegen? (mag leeg: dan rustige, natuurlijke beweging)"
                    rows={2}
                    className="input resize-none"
                  />
                  <select value={videoModel} onChange={(e) => setVideoModel(e.target.value)} className="input">
                    {VIDEO_MODELLEN.map((m) => (
                      <option key={m.id} value={m.id}>{m.naam} · {m.credits} cr.</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500">{gekozenModel.waarvoor}</p>
                  <button
                    disabled={bezig}
                    onClick={() =>
                      doe(async () => {
                        const nieuw = await startMaker(
                          "beeld-naar-video",
                          { bronUrl: c.url, prompt: beweging, model: videoModel },
                          c.id,
                        );
                        onNieuw(nieuw);
                        setVideoOpen(false);
                        setMelding("De video staat in de wachtrij. Je vindt hem in je bibliotheek.");
                      })
                    }
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    Maak video · {gekozenModel.credits} cr.
                  </button>
                </div>
              )}
              <button
                disabled={bezig}
                onClick={() =>
                  doe(async () => {
                    const nieuw = await startMaker(c.maker, c.invoer, c.ouder_id);
                    onNieuw(nieuw);
                    setMelding("Nieuwe poging gestart.");
                  })
                }
                className="btn-secondary w-full disabled:opacity-50"
              >
                🔄 Nog eens · {c.credits > 0 ? `${c.credits} cr.` : "zelfde opdracht"}
              </button>
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer" download className="btn-secondary w-full">
                  ⬇️ Downloaden
                </a>
              )}
            </div>
          )}

          {c.status === "mislukt" && (
            <button
              disabled={bezig}
              onClick={() =>
                doe(async () => {
                  onNieuw(await startMaker(c.maker, c.invoer, c.ouder_id));
                  setMelding("Nieuwe poging gestart.");
                })
              }
              className="btn-primary w-full disabled:opacity-50"
            >
              🔄 Opnieuw proberen
            </button>
          )}

          {melding && <p className="text-sm text-amber-200 bg-amber-400/10 rounded-xl px-3 py-2">{melding}</p>}

          <div className="space-y-2 pt-2 border-t border-white/[0.06]">
            {c.status === "klaar" && (
              <button
                onClick={() => doe(async () => onGewijzigd(await zetFavoriet(c)))}
                className="text-sm text-slate-300 hover:text-white"
              >
                {c.favoriet ? "❤️ Favoriet" : "🤍 Maak favoriet"}
              </button>
            )}
            {mappen && mappen.length > 0 && (
              <select
                value={c.map_id ?? ""}
                onChange={(e) => doe(async () => onGewijzigd(await zetMap(c, e.target.value || null)))}
                className="input"
              >
                <option value="">Geen map</option>
                {mappen.map((m) => (
                  <option key={m.id} value={m.id}>📁 {m.naam}</option>
                ))}
              </select>
            )}
            <button
              onClick={() =>
                doe(async () => {
                  if (!confirm("Weet je zeker dat je dit wilt verwijderen?")) return;
                  await verwijder(c);
                  onWeg(c.id);
                  onSluit();
                })
              }
              className="block text-xs text-red-400/80 hover:text-red-300"
            >
              Verwijderen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
