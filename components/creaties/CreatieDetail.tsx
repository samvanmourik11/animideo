"use client";

import { useState } from "react";
import Link from "next/link";
import type { Creatie, CreatieMap } from "@/lib/creaties/types";
import { BEWERKINGEN, LICHTRICHTINGEN, beeldCredits, modelNaam } from "@/lib/creaties/makers";
import { VIDEO_MODELLEN, STANDAARD_VIDEO_MODEL } from "@/lib/video-modellen";
import { startMaker, verwijder, zetFavoriet, zetMap } from "./gebruik-creaties";
import { SCHAAKBORD, isDoorzichtig } from "./CreatieKaart";

// De detailweergave van één creatie — en vooral de vervolgknoppen. Dat is de motor van
// de nieuwe app: iets is nooit "af", je gaat vanaf hier verder (er een video van maken,
// scherper maken, iets aanpassen). Elke vervolgstap wordt een nieuwe creatie die naar
// deze verwijst, zodat de keten zichtbaar blijft.

type Paneel = null | "video" | "aanpassen" | "licht";

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
  const formaat = (c.invoer as { formaat?: string }).formaat;
  const [paneel, setPaneel] = useState<Paneel>(null);
  const [beweging, setBeweging] = useState("");
  const [videoModel, setVideoModel] = useState(STANDAARD_VIDEO_MODEL);
  const [aanpassing, setAanpassing] = useState("");
  const [richting, setRichting] = useState<string>("Left");
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

  // Elke vervolgstap: starten met dit beeld als bron, en deze creatie als ouder.
  function verder(maker: string, invoer: Record<string, unknown>, bericht: string) {
    return doe(async () => {
      const nieuw = await startMaker(maker, { bronUrl: c.url, formaat, ...invoer }, c.id);
      onNieuw(nieuw);
      setPaneel(null);
      setMelding(`${bericht} Je vindt het in je bibliotheek.`);
    });
  }

  const gekozenModel = VIDEO_MODELLEN.find((m) => m.id === videoModel) ?? VIDEO_MODELLEN[0];
  const kop = "text-xs font-semibold uppercase tracking-wider text-tekst-3";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onSluit} />
      <div className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-paneel border border-rand rounded-3xl grid md:grid-cols-[1fr_360px]">
        <div className={`flex items-center justify-center min-h-[300px] p-4 ${isDoorzichtig(c) ? SCHAAKBORD : "bg-black/80"}`}>
          {c.status === "klaar" && c.url && c.soort === "beeld" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.url} alt={c.prompt ?? ""} className="max-h-[80vh] w-auto rounded-xl" />
          )}
          {c.status === "klaar" && c.url && c.soort === "video" && (
            <video src={c.url} controls autoPlay loop playsInline className="max-h-[80vh] w-auto rounded-xl" />
          )}
          {c.status === "bezig" && (
            <div className="flex flex-col items-center gap-3 text-slate-300">
              <div className="w-10 h-10 rounded-full border-2 border-blue-400/30 border-t-blue-400 animate-spin" />
              Wordt gemaakt… je kunt dit venster gerust sluiten.
            </div>
          )}
          {c.status === "mislukt" && (
            <div className="max-w-sm text-center space-y-2">
              <div className="text-3xl">⚠️</div>
              <p className="text-red-300 text-sm">{c.foutmelding ?? "Dit is niet gelukt."}</p>
              {c.credits > 0 && <p className="text-slate-400 text-xs">De {c.credits} credits staan weer op je saldo.</p>}
            </div>
          )}
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs text-tekst-3">
              {c.maker === "upload" ? "Eigen foto" : modelNaam(c.fal_endpoint)} ·{" "}
              {new Date(c.created_at).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}
              {c.credits > 0 && <> · {c.credits} cr.</>}
            </div>
            <button onClick={onSluit} className="text-tekst-3 hover:text-tekst text-lg leading-none" aria-label="Sluiten">✕</button>
          </div>

          {c.prompt && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className={kop}>{c.maker === "upload" ? "Bestand" : "Opdracht"}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(c.prompt ?? "");
                    setGekopieerd(true);
                    setTimeout(() => setGekopieerd(false), 1500);
                  }}
                  className="text-xs text-blue-500 hover:text-blue-400"
                >
                  {gekopieerd ? "Gekopieerd ✓" : "Kopiëren"}
                </button>
              </div>
              <p className="text-sm text-tekst-2 whitespace-pre-wrap">{c.prompt}</p>
            </div>
          )}

          {c.status === "klaar" && c.soort === "beeld" && (
            <div className="space-y-2">
              <span className={kop}>Verder maken</span>
              {paneel !== "video" ? (
                <button onClick={() => setPaneel("video")} className="btn-primary w-full">🎬 Maak er video van</button>
              ) : (
                <div className="rounded-2xl border border-blue-500/40 bg-blue-500/5 p-3 space-y-2">
                  <textarea
                    value={beweging}
                    onChange={(e) => setBeweging(e.target.value)}
                    placeholder="Wat moet er bewegen? (mag leeg: dan rustige, natuurlijke beweging)"
                    rows={2}
                    className="n-invoer resize-none"
                  />
                  <select value={videoModel} onChange={(e) => setVideoModel(e.target.value)} className="n-invoer">
                    {VIDEO_MODELLEN.map((m) => (
                      <option key={m.id} value={m.id}>{m.naam} · {m.credits} cr.</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-tekst-3">{gekozenModel.waarvoor}</p>
                  <button
                    disabled={bezig}
                    onClick={() => verder("beeld-naar-video", { prompt: beweging, model: videoModel }, "De video staat in de wachtrij.")}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    Maak video · {gekozenModel.credits} cr.
                  </button>
                </div>
              )}

              {paneel !== "aanpassen" ? (
                <button onClick={() => setPaneel("aanpassen")} className="n-knop2 w-full">🖌️ Iets aanpassen</button>
              ) : (
                <div className="rounded-2xl border border-rand bg-paneel-2/50 p-3 space-y-2">
                  <textarea
                    value={aanpassing}
                    onChange={(e) => setAanpassing(e.target.value)}
                    placeholder="Wat moet er anders? Bijvoorbeeld: maak de jas rood, haal de man op de achtergrond weg"
                    rows={3}
                    className="n-invoer resize-none"
                  />
                  <button
                    disabled={bezig || !aanpassing.trim()}
                    onClick={() => verder("bewerk", { prompt: aanpassing }, "De aanpassing is gestart.")}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    Aanpassen · {beeldCredits("standaard")} cr.
                  </button>
                </div>
              )}

              <p className="text-[11px] text-tekst-3 pt-1">Bewerken · 1 credit per keer</p>
              <div className="grid grid-cols-2 gap-2">
                {BEWERKINGEN.map((b) =>
                  b.maker === "belichting" ? (
                    <button
                      key={b.maker}
                      onClick={() => setPaneel(paneel === "licht" ? null : "licht")}
                      title={b.uitleg}
                      className={`n-knop2 py-2 px-2 text-sm whitespace-nowrap ${paneel === "licht" ? "border-blue-500" : ""}`}
                    >
                      {b.icoon} {b.label}
                    </button>
                  ) : (
                    <button
                      key={b.maker}
                      disabled={bezig}
                      title={b.uitleg}
                      onClick={() => verder(b.maker, {}, `${b.label}: gestart.`)}
                      className="n-knop2 py-2 px-2 text-sm whitespace-nowrap disabled:opacity-50"
                    >
                      {b.icoon} {b.label}
                    </button>
                  ),
                )}
              </div>
              {paneel === "licht" && (
                <div className="rounded-2xl border border-rand bg-paneel-2/50 p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {LICHTRICHTINGEN.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setRichting(r.id)}
                        className={`rounded-xl border py-1.5 text-sm ${richting === r.id ? "border-blue-500 bg-blue-500/10 text-tekst" : "border-rand text-tekst-2"}`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <button
                    disabled={bezig}
                    onClick={() => verder("belichting", { richting }, "Nieuw licht: gestart.")}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    Ander licht · 1 cr.
                  </button>
                </div>
              )}

              <Link
                href={`/maak/beeld?ref=${encodeURIComponent(c.url ?? "")}`}
                className="block text-center text-sm text-blue-500 hover:text-blue-400 pt-1"
              >
                ⭐ Gebruik als voorbeeld voor een nieuw beeld
              </Link>
            </div>
          )}

          {c.status === "klaar" && (
            <div className="space-y-2">
              {c.maker !== "upload" && (
                <button
                  disabled={bezig}
                  onClick={() =>
                    doe(async () => {
                      onNieuw(await startMaker(c.maker, c.invoer, c.ouder_id));
                      setMelding("Nieuwe poging gestart.");
                    })
                  }
                  className="n-knop2 w-full disabled:opacity-50"
                >
                  🔄 Nog eens{c.credits > 0 ? ` · ${c.credits} cr.` : ""}
                </button>
              )}
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer" download className="n-knop2 w-full">
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

          {melding && (
            <p className="text-sm text-amber-700 dark:text-amber-200 bg-amber-400/15 rounded-xl px-3 py-2">{melding}</p>
          )}

          <div className="space-y-2 pt-3 border-t border-rand">
            {c.status === "klaar" && (
              <button
                onClick={() => doe(async () => onGewijzigd(await zetFavoriet(c)))}
                className="text-sm text-tekst-2 hover:text-tekst"
              >
                {c.favoriet ? "❤️ Favoriet" : "🤍 Maak favoriet"}
              </button>
            )}
            {mappen && mappen.length > 0 && (
              <select
                value={c.map_id ?? ""}
                onChange={(e) => doe(async () => onGewijzigd(await zetMap(c, e.target.value || null)))}
                className="n-invoer"
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
              className="block text-xs text-red-500 hover:text-red-400"
            >
              Verwijderen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
