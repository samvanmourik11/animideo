"use client";

import { useState } from "react";
import Link from "next/link";
import type { Creatie, CreatieMap } from "@/lib/creaties/types";
import { BEWERKINGEN, LICHTRICHTINGEN, beeldCredits, modelNaam } from "@/lib/creaties/makers";
import { VIDEO_MODELLEN, STANDAARD_VIDEO_MODEL } from "@/lib/video-modellen";
import { recept, receptPad } from "@/lib/creaties/recepten";
import { startMaker, verwijder, zetFavoriet, zetMap } from "./gebruik-creaties";
import { SCHAAKBORD, isDoorzichtig } from "./CreatieKaart";
import { heeftGezicht, herkomst } from "@/lib/delen/herkomst";
import { magFeedback } from "@/lib/creaties/eindmakers";
import FeedbackBlok from "./FeedbackBlok";

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
  const receptVan = c.maker === "recept" ? recept((c.invoer as { receptId?: string }).receptId) : null;
  // Video's uit de Studio's: die maak je niet "nog eens" met één klik, die open je weer in de tool.
  const studio = c.maker === "storytelling" || c.maker === "dialoog";
  const projectId = (c.invoer as { projectId?: string }).projectId;
  const studioPad = c.maker === "storytelling" ? "/infographics/story" : "/infographics/dialogue";
  const [paneel, setPaneel] = useState<Paneel>(null);
  const [beweging, setBeweging] = useState("");
  const [videoModel, setVideoModel] = useState(STANDAARD_VIDEO_MODEL);
  const [aanpassing, setAanpassing] = useState("");
  const [richting, setRichting] = useState<string>("Left");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);
  const [deelToestemming, setDeelToestemming] = useState(false);
  const [linkGekopieerd, setLinkGekopieerd] = useState(false);
  const deelUrl = c.deel_code && typeof window !== "undefined" ? `${window.location.origin}/d/${c.deel_code}` : null;

  async function delen(aan: boolean) {
    const res = await fetch(`/api/creaties/${c.id}/delen`, {
      method: aan ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: aan ? JSON.stringify({ toestemming: deelToestemming }) : undefined,
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error ?? "Delen mislukt");
    onGewijzigd(d.creatie);
  }

  // Op het profiel / insturen voor de voorpagina. Allebei delen ze het werk ook.
  async function zet(soort: "profiel" | "voorpagina", aan: boolean) {
    const res = await fetch(`/api/creaties/${c.id}/${soort}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aan, toestemming: deelToestemming }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error ?? "Dat lukte niet");
    onGewijzigd(d.creatie);
  }

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
          {c.status === "klaar" && c.url && c.soort === "audio" && (
            <div className="w-full max-w-md text-center space-y-4 text-slate-200">
              <div className="text-5xl">🎙️</div>
              <p className="text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">{(c.invoer as { tekst?: string }).tekst ?? c.prompt}</p>
              <audio src={c.url} controls autoPlay className="w-full" />
            </div>
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
              {c.maker === "upload" ? (c.soort === "video" ? "Eigen video" : "Eigen foto") : receptVan ? receptVan.naam : studio ? herkomst(c).naam : modelNaam(c.fal_endpoint)} ·{" "}
              {new Date(c.created_at).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}
              {c.credits > 0 && <> · {c.credits} cr.</>}
            </div>
            <button onClick={onSluit} className="text-tekst-3 hover:text-tekst text-lg leading-none" aria-label="Sluiten">✕</button>
          </div>

          {c.prompt && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className={kop}>{c.maker === "upload" ? "Bestand" : studio ? "Titel" : "Opdracht"}</span>
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
              {studio && (
                <Link href={projectId ? `${studioPad}?project=${projectId}` : herkomst(c).pad} className="n-knop2 w-full">
                  {c.maker === "storytelling" ? "📖" : "💬"} Open in {herkomst(c).naam}
                </Link>
              )}
              {c.maker !== "upload" && !studio && (
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
              {c.maker === "reclame" && (
                <Link href="/apps/reclame" className="n-knop2 w-full">
                  🛍️ Nieuwe reclame maken
                </Link>
              )}
              {receptVan && (
                <Link href={receptPad(receptVan)} className="n-knop2 w-full">
                  {receptVan.icoon} Naar {receptVan.naam}
                </Link>
              )}
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer" download className="n-knop2 w-full">
                  ⬇️ Downloaden
                </a>
              )}
            </div>
          )}

          {magFeedback(c) && <FeedbackBlok creatieId={c.id} />}

          {c.status === "klaar" && c.maker !== "upload" && (
            <div className="space-y-2 rounded-2xl border border-rand p-3">
              <span className={kop}>Delen</span>
              {deelUrl ? (
                <>
                  <div className="flex gap-2">
                    <input readOnly value={deelUrl} className="n-invoer flex-1 text-xs" onFocus={(e) => e.target.select()} />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(deelUrl);
                        setLinkGekopieerd(true);
                        setTimeout(() => setLinkGekopieerd(false), 1500);
                      }}
                      className="n-knop2 shrink-0 text-xs"
                    >
                      {linkGekopieerd ? "✓" : "Kopieer"}
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <a href={`https://wa.me/?text=${encodeURIComponent(deelUrl)}`} target="_blank" rel="noreferrer" className="text-emerald-600 dark:text-emerald-400 hover:underline">
                      WhatsApp
                    </a>
                    <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(deelUrl)}`} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                      LinkedIn
                    </a>
                    <a href={deelUrl} target="_blank" rel="noreferrer" className="text-tekst-3 hover:text-tekst">Bekijk</a>
                    <button
                      disabled={bezig}
                      onClick={() => doe(async () => { await delen(false); setMelding("Gestopt met delen: de link werkt niet meer."); })}
                      className="ml-auto text-red-500 hover:text-red-400"
                    >
                      Stop met delen
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-tekst-3">Krijg een link die iedereen kan openen, ook zonder account.</p>
                  <button
                    disabled={bezig || (heeftGezicht(c) && !deelToestemming)}
                    onClick={() => doe(async () => delen(true))}
                    className="n-knop2 w-full disabled:opacity-50"
                  >
                    🔗 Maak een deellink
                  </button>
                </>
              )}

              {!deelUrl && heeftGezicht(c) && (
                // Iets voor jezelf maken is wat anders dan het openbaar zetten: daarom bij
                // gezichten opnieuw vragen, niet achteraf controleren.
                <label className="flex items-start gap-2 text-xs text-tekst-2 cursor-pointer">
                  <input type="checkbox" checked={deelToestemming} onChange={(e) => setDeelToestemming(e.target.checked)} className="mt-0.5" />
                  <span>Iedereen op dit beeld vindt het goed dat ik het deel.</span>
                </label>
              )}

              <div className="pt-2 border-t border-rand space-y-1.5">
                <label className="flex items-center justify-between gap-2 text-sm text-tekst-2 cursor-pointer">
                  <span>🌐 Op mijn profiel</span>
                  <input
                    type="checkbox"
                    checked={!!c.op_profiel}
                    disabled={bezig || (!deelUrl && heeftGezicht(c) && !deelToestemming)}
                    onChange={(e) => doe(async () => zet("profiel", e.target.checked))}
                  />
                </label>
                {c.voorpagina === "ingestuurd" ? (
                  <div className="flex items-center justify-between text-xs text-tekst-3">
                    <span>⏳ Ingestuurd voor de voorpagina</span>
                    <button disabled={bezig} onClick={() => doe(async () => zet("voorpagina", false))} className="text-red-500 hover:text-red-400">
                      Intrekken
                    </button>
                  </div>
                ) : c.voorpagina === "goedgekeurd" ? (
                  <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400">
                    <span>⭐ Staat op de voorpagina · {c.hartjes ?? 0} ❤️</span>
                    <button disabled={bezig} onClick={() => doe(async () => zet("voorpagina", false))} className="text-tekst-3 hover:text-tekst">
                      Weghalen
                    </button>
                  </div>
                ) : c.voorpagina === "afgewezen" ? (
                  <p className="text-xs text-tekst-3">Deze keer niet gekozen voor de voorpagina.</p>
                ) : (
                  <button
                    disabled={bezig || (!deelUrl && heeftGezicht(c) && !deelToestemming)}
                    onClick={() =>
                      doe(async () => {
                        await zet("voorpagina", true);
                        setMelding("Ingestuurd! We bekijken het; goedgekeurd werk komt op de voorpagina van Animideo.");
                      })
                    }
                    className="text-xs text-blue-500 hover:text-blue-400 disabled:opacity-50"
                  >
                    ⭐ Insturen voor de voorpagina
                  </button>
                )}
              </div>
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
            <p className="text-sm text-amber-700 dark:text-amber-200 bg-amber-400/15 rounded-xl px-3 py-2">
              {melding}
              {melding.includes("profiel aan") && (
                <> <Link href="/profiel" className="underline">Profiel aanmaken</Link></>
              )}
            </p>
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
