"use client";

import { useState } from "react";
import Link from "next/link";
import type { Creatie } from "@/lib/creaties/types";
import CreatieKaart from "@/components/creaties/CreatieKaart";
import CreatieDetail from "@/components/creaties/CreatieDetail";
import { startMaker, useCreaties, zetFavoriet } from "@/components/creaties/gebruik-creaties";
import {
  GENRES,
  TRAILER_LENGTES,
  geschatteTrailerCredits,
  tijdlijnDuur,
  trailerCredits,
  type Deel,
  type Element,
  type GenreId,
  type TrailerLengte,
  type TrailerPlan,
} from "@/lib/trailer/types";

// De trailerstudio. Verhaal en personages erin, de AI schrijft de trailer uit volgens het
// regelboek van het genre (gratis), de klant ziet en verbetert de montage als tijdlijn, en
// pas "Maak de trailer" kost credits.

const DEEL_NAAM: Record<Deel, string> = {
  opening: "Opening — stilte vóór het verhaal",
  wereld: "De wereld en de inzet",
  escalatie: "Escalatie",
  adem: "De adem",
  klap: "De klap",
  titel: "Titel en slot",
};

const KLEUR: Record<Element["soort"], string> = {
  shot: "bg-blue-500",
  zwart: "bg-slate-900 dark:bg-black border border-rand",
  tekst: "bg-amber-400",
  titel: "bg-rose-500",
};

async function post<T>(pad: string, body: unknown): Promise<T> {
  const res = await fetch(pad, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Er ging iets mis. Probeer het opnieuw.");
  return data as T;
}

export default function TrailerStudio() {
  const [genre, setGenre] = useState<GenreId>("fantasy");
  const [sec, setSec] = useState<TrailerLengte>(60);
  const [titel, setTitel] = useState("");
  const [verhaal, setVerhaal] = useState("");
  const [personages, setPersonages] = useState([{ naam: "", omschrijving: "" }]);
  const [plan, setPlan] = useState<TrailerPlan | null>(null);
  const [bezig, setBezig] = useState<null | "schrijven" | "maken">(null);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState<Creatie | null>(null);
  const lijst = useCreaties({ maker: "trailer" });

  async function doe(wat: "schrijven" | "maken", actie: () => Promise<void>) {
    setBezig(wat);
    setFout(null);
    try {
      await actie();
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(null);
    }
  }

  function schrijf() {
    return doe("schrijven", async () => {
      const { plan: p } = await post<{ plan: TrailerPlan }>("/api/trailer/plan", { genre, sec, titel, verhaal, personages: personages.filter((p) => p.naam.trim()) });
      setPlan(p);
    });
  }

  function maak() {
    return doe("maken", async () => {
      lijst.zetVoor(await startMaker("trailer", { genre, sec, plan }));
    });
  }

  function wijzigElement(i: number, nieuw: Partial<Element>) {
    setPlan((p) => (p ? { ...p, tijdlijn: p.tijdlijn.map((e, j) => (j === i ? ({ ...e, ...nieuw } as Element) : e)) } : p));
  }

  const totaal = plan ? tijdlijnDuur(plan.tijdlijn) : 0;
  const kosten = plan ? trailerCredits(plan) : geschatteTrailerCredits(sec, Math.max(1, personages.filter((p) => p.naam.trim()).length));
  const delen = plan ? (Object.keys(DEEL_NAAM) as Deel[]).filter((d) => plan.tijdlijn.some((e) => e.deel === d)) : [];

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-tekst-3">Studio · bèta</div>
        <h1 className="text-3xl font-extrabold text-tekst tracking-tight">🎞️ Trailerstudio</h1>
        <p className="text-tekst-3 mt-1 max-w-2xl">
          Een filmtrailer van 1 tot 1,5 minuut. De AI monteert volgens regels die we uit echte trailers hebben gehaald: stilte, opbouw, escalatie, de adem en de klap.
        </p>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,640px)_1fr] gap-6 items-start">
        <div className="space-y-4">
          <div className="n-kaart space-y-4">
            <h2 className="font-bold text-tekst">1. Genre en lengte</h2>
            <div className="grid grid-cols-3 gap-2">
              {GENRES.map((g) => (
                <button key={g.id} onClick={() => setGenre(g.id)} className={`rounded-2xl border p-3 text-left ${genre === g.id ? "border-blue-500 bg-blue-500/10" : "border-rand"}`}>
                  <div className="text-xl">{g.icoon}</div>
                  <div className="text-sm font-semibold text-tekst mt-1">{g.naam}</div>
                  <div className="text-[11px] text-tekst-3 leading-snug">{g.uitleg}</div>
                </button>
              ))}
              {["Actie", "Romantiek"].map((n) => (
                <div key={n} className="rounded-2xl border border-dashed border-rand p-3 text-left opacity-60">
                  <div className="text-sm font-semibold text-tekst">{n}</div>
                  <div className="text-[11px] text-tekst-3">binnenkort</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {TRAILER_LENGTES.map((l) => (
                <button key={l.sec} onClick={() => { setSec(l.sec); setPlan(null); }} className={`rounded-xl border px-3 py-2 text-left ${sec === l.sec ? "border-blue-500 bg-blue-500/10" : "border-rand"}`}>
                  <div className="text-sm font-semibold text-tekst">{l.naam}</div>
                  <div className="text-[11px] text-tekst-3">{l.clips} filmclips</div>
                </button>
              ))}
            </div>
          </div>

          <div className="n-kaart space-y-3">
            <h2 className="font-bold text-tekst">2. Je film</h2>
            <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Titel (mag leeg, dan verzint de AI er een)" className="n-invoer" />
            <textarea
              value={verhaal}
              onChange={(e) => setVerhaal(e.target.value)}
              rows={4}
              placeholder="Waar gaat de film over? Bijv. Een jonge smidsdochter ontdekt dat zij de laatste is die met draken kan praten, terwijl een koning het rijk in duisternis stort…"
              className="n-invoer resize-none"
            />
            <div>
              <label className="n-label">Hoofdpersonen</label>
              <div className="mt-1.5 space-y-2">
                {personages.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={p.naam} onChange={(e) => setPersonages(personages.map((x, j) => (j === i ? { ...x, naam: e.target.value } : x)))} placeholder="Naam" className="n-invoer w-32" />
                    <input
                      value={p.omschrijving}
                      onChange={(e) => setPersonages(personages.map((x, j) => (j === i ? { ...x, omschrijving: e.target.value } : x)))}
                      placeholder="Wie is het? Leeftijd, uiterlijk, rol"
                      className="n-invoer flex-1"
                    />
                    {personages.length > 1 && (
                      <button onClick={() => setPersonages(personages.filter((_, j) => j !== i))} className="text-tekst-3 hover:text-red-500 px-1" aria-label="Weghalen">✕</button>
                    )}
                  </div>
                ))}
                {personages.length < 3 && (
                  <button onClick={() => setPersonages([...personages, { naam: "", omschrijving: "" }])} className="text-xs text-blue-500 hover:text-blue-400">＋ Personage</button>
                )}
              </div>
            </div>
            <button onClick={schrijf} disabled={!!bezig || verhaal.trim().length < 20} className={`${plan ? "n-knop2" : "btn-primary"} w-full disabled:opacity-50`}>
              {bezig === "schrijven" ? "De monteur schrijft de trailer… (±30 s)" : plan ? "✍️ Schrijf opnieuw · gratis" : "✍️ Schrijf de trailer · gratis"}
            </button>
          </div>

          {plan && (
            <div className="n-kaart space-y-4">
              <div className="flex items-center justify-between gap-3">
                <input value={plan.titel} onChange={(e) => setPlan({ ...plan, titel: e.target.value })} className="n-invoer font-bold text-lg" />
                <span className="text-xs text-tekst-3 shrink-0">{Math.round(totaal)} s · {plan.tijdlijn.length} montagestukken</span>
              </div>

              {/* De montage in één oogopslag: elk blokje zo breed als het in de trailer duurt. */}
              <div>
                <div className="flex h-8 w-full overflow-hidden rounded-lg">
                  {plan.tijdlijn.map((e, i) => (
                    <div
                      key={i}
                      title={`${e.soort} · ${e.duur.toFixed(1)} s${e.regel ? ` · "${e.regel.tekst}"` : ""}`}
                      className={`${KLEUR[e.soort]} ${e.regel ? "ring-2 ring-inset ring-white/70" : ""} border-r border-vlak/60`}
                      style={{ width: `${(e.duur / totaal) * 100}%` }}
                    />
                  ))}
                </div>
                <div className="flex gap-3 mt-1.5 text-[11px] text-tekst-3">
                  <span>🟦 shot</span><span>⬛ zwart</span><span>🟨 tekstkaart</span><span>🟥 titel</span><span>◻️ met stem</span>
                </div>
              </div>

              {plan.personages.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {plan.personages.map((p) => (
                    <span key={p.naam} className="text-xs rounded-full bg-paneel-2 px-3 py-1 text-tekst-2"><strong className="text-tekst">{p.naam}</strong> · {p.rol}</span>
                  ))}
                </div>
              )}

              {delen.map((d) => (
                <div key={d}>
                  <div className="n-label mb-1.5">{DEEL_NAAM[d]}</div>
                  <div className="space-y-1.5">
                    {plan.tijdlijn.map((e, i) =>
                      e.deel !== d ? null : (
                        <div key={i} className="rounded-xl border border-rand px-3 py-2">
                          <div className="flex items-center gap-2 text-xs text-tekst-3">
                            <span className={`inline-block w-2.5 h-2.5 rounded-sm ${KLEUR[e.soort]}`} />
                            <span className="flex-1 truncate">
                              {e.soort === "shot" ? plan.clips[e.clip]?.uitleg : e.soort === "zwart" ? (e.stil ? "Zwart en stil" : "Zwart") : e.soort === "titel" ? "Titelkaart" : "Tekstkaart"}
                            </span>
                            <span>{e.duur.toFixed(1)} s</span>
                          </div>
                          {e.soort === "tekst" && (
                            <input value={e.tekst} onChange={(ev) => wijzigElement(i, { tekst: ev.target.value })} className="n-invoer mt-1.5 uppercase" />
                          )}
                          {e.regel && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <span className="text-[11px] font-semibold text-tekst-2 w-20 shrink-0 truncate">{e.regel.wie === "verteller" ? "🎙️ Verteller" : e.regel.wie}</span>
                              <input value={e.regel.tekst} onChange={(ev) => wijzigElement(i, { regel: { ...e.regel!, tekst: ev.target.value } })} className="n-invoer" />
                            </div>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ))}

              <button onClick={maak} disabled={!!bezig} className="btn-primary w-full disabled:opacity-50">
                {bezig === "maken" ? "Bezig met insturen…" : `🎬 Maak de trailer · ${kosten} credits`}
              </button>
              <p className="text-[11px] text-tekst-3">
                Duurt meestal 10 tot 20 minuten: eerst de personages, dan {plan.clips.length} filmbeelden, dan de beweging en de stemmen, dan de montage. De trailer komt vanzelf in je bibliotheek. Mislukt het, dan krijg je je credits terug.
              </p>
            </div>
          )}

          {fout && (
            <p className="text-sm text-red-600 dark:text-red-300 bg-red-500/10 rounded-xl px-3 py-2">
              {fout}
              {fout === "Niet genoeg credits." && <> <Link href="/pricing" className="underline">Credits bijkopen</Link></>}
            </p>
          )}
          {!plan && <p className="text-[11px] text-tekst-3">Een trailer van {sec} seconden kost ongeveer {kosten} credits.</p>}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-tekst-2 mb-3">Jouw trailers</h2>
          {lijst.creaties.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-rand p-12 text-center text-tekst-3">
              <div className="text-4xl mb-3">🎞️</div>
              {lijst.laden ? "Laden…" : "Je trailers komen hier te staan."}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              {lijst.creaties.map((c) => (
                <CreatieKaart key={c.id} creatie={c} onOpen={() => setOpen(c)} onFavoriet={async () => lijst.werkBij(await zetFavoriet(c))} />
              ))}
            </div>
          )}
        </div>
      </div>

      {open && (
        <CreatieDetail
          creatie={lijst.creaties.find((c) => c.id === open.id) ?? open}
          onSluit={() => setOpen(null)}
          onGewijzigd={lijst.werkBij}
          onWeg={lijst.haalWeg}
          onNieuw={(c) => c.maker === "trailer" && lijst.zetVoor(c)}
        />
      )}
    </div>
  );
}
