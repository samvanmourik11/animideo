"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Creatie } from "@/lib/creaties/types";
import CreatieKaart from "@/components/creaties/CreatieKaart";
import CreatieDetail from "@/components/creaties/CreatieDetail";
import { startMaker, useCreaties, zetFavoriet } from "@/components/creaties/gebruik-creaties";
import { BrowserMelding, useBrowserVideo } from "@/components/motion/BrowserVideo";
import { MOTION_STEM_HUGO, MOTION_TALEN, duurTekst, isMotionTaal, maxWoorden, type MotionPlan, type MotionTaal } from "@/lib/motion/types";
import type { BibliotheekStem } from "@/lib/stem/types";
import { taalStemmen } from "@/lib/stem/taalstemmen";
import {
  DOCU_LENGTES,
  DOCU_MUZIEK,
  docuCredits,
  fotoCredit,
  isDocuLengte,
  type DocuControle,
  type DocuExtras,
  type DocuFeit,
  type DocuFoto,
  type DocuLengte,
  type DocuOnderzoek,
} from "@/lib/docu/types";

// Docu-studio: faceless YouTube-documentaires. Drie stappen op één scherm: het onderwerp
// kiezen, het onderzoek (script met feitencontrole en vrije foto's, nog gratis) nalopen, en
// de docu laten maken. Het onderzoek kost ons echt geld en minuten; daarom blijft het in deze
// browser bewaard, ook als de pagina ververst.

async function post<T>(pad: string, body: unknown): Promise<T> {
  const res = await fetch(pad, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Er ging iets mis. Probeer het opnieuw.");
  return data as T;
}

type Bezig = null | "onderzoek" | "fotos" | "maken";
const BEWAAR = "docu-studio";
const VOORZETTEN = ["De ondergang van V&D", "Hoe Blockbuster Netflix liet lopen", "De Concorde: te mooi om te blijven", "Het faillissement van Vitesse"];

export default function DocuStudio() {
  const [kanaal, setKanaal] = useState("");
  const [kleur, setKleur] = useState("#e3342f");
  const [onderwerp, setOnderwerp] = useState("");
  const [wens, setWens] = useState("");
  const [lengte, setLengte] = useState<DocuLengte>(600);
  const [taal, setTaal] = useState<MotionTaal>("nl");
  const [stem, setStem] = useState<string>(MOTION_STEM_HUGO);
  const [stemmen, setStemmen] = useState<BibliotheekStem[]>([]);
  const [muziek, setMuziek] = useState<string>(DOCU_MUZIEK[0].slug);
  const [short, setShort] = useState(true);
  const [plan, setPlan] = useState<MotionPlan | null>(null);
  const [feiten, setFeiten] = useState<DocuFeit[]>([]);
  const [controle, setControle] = useState<DocuControle | null>(null);
  const [fotoZoek, setFotoZoek] = useState<string[]>([]);
  const [fotos, setFotos] = useState<DocuFoto[] | null>(null);
  const [bezig, setBezig] = useState<Bezig>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState<Creatie | null>(null);
  const [pakket, setPakket] = useState<Creatie | null>(null);
  const [geladen, setGeladen] = useState(false);

  const lijst = useCreaties({ maker: "docu" });
  // De Shorts bij de docu's zijn motion-rijen; ook die worden in deze browser gemaakt.
  const shorts = useCreaties({ maker: "motion" });
  const docuIds = new Set(lijst.creaties.map((c) => c.id));
  const browserStand = useBrowserVideo(
    [...lijst.creaties, ...shorts.creaties.filter((c) => c.ouder_id && docuIds.has(c.ouder_id))],
    () => { lijst.ververs(); shorts.ververs(); },
  );

  useEffect(() => {
    fetch("/api/stem/bibliotheek").then((r) => (r.ok ? r.json() : [])).then((d: BibliotheekStem[]) => setStemmen(Array.isArray(d) ? d : [])).catch(() => {});
    try {
      const b = JSON.parse(localStorage.getItem(BEWAAR) ?? "null");
      if (b) {
        if (typeof b.kanaal === "string") setKanaal(b.kanaal);
        if (/^#[0-9a-f]{6}$/i.test(b.kleur ?? "")) setKleur(b.kleur);
        if (typeof b.onderwerp === "string") setOnderwerp(b.onderwerp);
        if (typeof b.wens === "string") setWens(b.wens);
        if (isDocuLengte(b.lengte)) setLengte(b.lengte);
        if (isMotionTaal(b.taal)) setTaal(b.taal);
        if (typeof b.stem === "string") setStem(b.stem);
        if (typeof b.muziek === "string") setMuziek(b.muziek);
        if (typeof b.short === "boolean") setShort(b.short);
        if (b.plan) setPlan(b.plan);
        if (Array.isArray(b.feiten)) setFeiten(b.feiten);
        if (b.controle) setControle(b.controle);
        if (Array.isArray(b.fotoZoek)) setFotoZoek(b.fotoZoek);
        if (Array.isArray(b.fotos)) setFotos(b.fotos);
      }
    } catch {}
    setGeladen(true);
  }, []);
  useEffect(() => {
    if (!geladen) return;
    try {
      localStorage.setItem(BEWAAR, JSON.stringify({ kanaal, kleur, onderwerp, wens, lengte, taal, stem, muziek, short, plan, feiten, controle, fotoZoek, fotos }));
    } catch {}
  }, [geladen, kanaal, kleur, onderwerp, wens, lengte, taal, stem, muziek, short, plan, feiten, controle, fotoZoek, fotos]);

  // Nederlands: Hugo vooraan, dan de bibliotheek. Andere talen: alleen moedertaalstemmen, met
  // onze eigen KRONIK-verteller vooraan (lib/stem/taalstemmen.ts).
  const stemKeuzes: { id: string; naam: string }[] =
    taal === "nl"
      ? [{ id: MOTION_STEM_HUGO, naam: "Hugo · verteller" }, ...stemmen.filter((s) => s.id !== MOTION_STEM_HUGO).map((s) => ({ id: s.id, naam: `${s.naam} · ${s.geslacht}` }))]
      : taalStemmen(taal).map((s) => ({ id: s.id, naam: `${s.naam} · ${s.typering}` }));

  function kiesTaal(t: MotionTaal) {
    setTaal(t);
    setStem(t === "nl" ? MOTION_STEM_HUGO : taalStemmen(t)[0]?.id ?? MOTION_STEM_HUGO);
  }

  async function doe(wat: Exclude<Bezig, null>, actie: () => Promise<void>) {
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

  function zoekFotos(p: MotionPlan, zoek: string[]) {
    return doe("fotos", async () => {
      const r = await post<{ fotos: DocuFoto[] }>("/api/docu/fotos", { plan: p, fotoZoek: zoek, lengte });
      setFotos(r.fotos);
    });
  }

  function onderzoek() {
    return doe("onderzoek", async () => {
      const r = await post<DocuOnderzoek>("/api/docu/onderzoek", { onderwerp, wens, lengte, taal, kanaal });
      setPlan(r.plan);
      setFeiten(r.feiten);
      setControle(r.controle);
      setFotoZoek(r.fotoZoek);
      setFotos(null);
      // Meteen door naar de foto's: die horen bij het script.
      setBezig("fotos");
      const f = await post<{ fotos: DocuFoto[] }>("/api/docu/fotos", { plan: r.plan, fotoZoek: r.fotoZoek, lengte }).catch((e: Error) => {
        setFout(`Het script staat klaar, maar foto's zoeken lukte niet: ${e.message}`);
        return null;
      });
      if (f) setFotos(f.fotos);
    });
  }

  function opnieuw() {
    setPlan(null); setFeiten([]); setControle(null); setFotoZoek([]); setFotos(null); setFout(null);
  }

  function maak() {
    return doe("maken", async () => {
      const c = await startMaker("docu", { onderwerp, kanaal, kleur, kleur2: "#f3efe6", lengte, taal, stem, muziek, short, plan, feiten, controle, fotos: fotos ?? [] });
      lijst.zetVoor(c);
    });
  }

  function wijzigScene(i: number, veld: Partial<MotionPlan["scenes"][number]>) {
    setPlan((p) => (p ? { ...p, scenes: p.scenes.map((s, j) => (j === i ? { ...s, ...veld } : s)) } : p));
  }

  const woorden = plan ? [...plan.scenes.map((s) => s.tekst), plan.eind.tekst].join(" ").split(/\s+/).filter(Boolean).length : 0;
  const max = Math.round(maxWoorden(lengte) * 1.25);
  const teLang = woorden > max;
  const credits = docuCredits(lengte, short);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-tekst tracking-tight">🎞️ Docu</h1>
        <p className="text-tekst-3 mt-1 max-w-2xl">
          Een faceless documentaire voor YouTube, zoals &quot;de opkomst en ondergang van…&quot;. Wij zoeken het verhaal uit met bronnen, controleren elk feit, zoeken
          vrije archieffoto&apos;s en maken de video met verteller, muziek, thumbnail, beschrijving en een Short erbij.
        </p>
      </div>

      <BrowserMelding stand={browserStand} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-6 items-start">
        <div className="space-y-4">
          {/* Stap 1 — onderwerp en vorm */}
          <div className="n-kaart space-y-4">
            <div>
              <h2 className="font-bold text-tekst">1. Onderwerp</h2>
              <p className="text-xs text-tekst-3 mt-0.5">Een bedrijf, club, gebouw, product of persoon met een verhaal. Wij doen het onderzoek.</p>
            </div>
            <div>
              <label className="n-label">Waar gaat je docu over?</label>
              <input value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} placeholder="De ondergang van V&D" className="n-invoer mt-1.5" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {VOORZETTEN.map((v) => (
                  <button key={v} onClick={() => setOnderwerp(v)} className="rounded-full border border-rand px-2.5 py-1 text-[11px] text-tekst-2 hover:border-blue-500/50">{v}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="n-label">Invalshoek of wat er zeker in moet <span className="font-normal text-tekst-3">(mag leeg)</span></label>
              <textarea value={wens} onChange={(e) => setWens(e.target.value)} rows={2} placeholder="Bijvoorbeeld: vooral de rol van de eigenaren, en eindig bij de doorstart." className="n-invoer mt-1.5 resize-none" />
            </div>

            <div>
              <label className="n-label">Lengte</label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {DOCU_LENGTES.map((l) => (
                  <button
                    key={l.sec}
                    onClick={() => setLengte(l.sec)}
                    disabled={!!plan}
                    className={`rounded-xl border px-3 py-2 text-left disabled:opacity-60 ${lengte === l.sec ? "border-blue-500 bg-blue-500/10" : "border-rand hover:border-blue-500/40"}`}
                  >
                    <div className="text-sm font-semibold text-tekst">{l.naam}</div>
                    <div className="text-[11px] text-tekst-3 leading-snug">{l.uitleg}</div>
                    <div className="text-[11px] text-tekst-2 mt-1">{docuCredits(l.sec, short)} credits</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="n-label">Taal</label>
                <select value={taal} onChange={(e) => kiesTaal(e.target.value as MotionTaal)} disabled={!!plan} className="n-invoer mt-1.5 disabled:opacity-60">
                  {MOTION_TALEN.map((t) => (
                    <option key={t.id} value={t.id}>{t.naam}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="n-label">Verteller</label>
                <select value={stem} onChange={(e) => setStem(e.target.value)} className="n-invoer mt-1.5">
                  {stemKeuzes.map((s) => (
                    <option key={s.id} value={s.id}>{s.naam}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="n-label">Kanaalnaam <span className="font-normal text-tekst-3">(mag leeg)</span></label>
                <input value={kanaal} onChange={(e) => setKanaal(e.target.value)} maxLength={40} placeholder="KRONIK" className="n-invoer mt-1.5" />
              </div>
              <div>
                <label className="n-label">Accentkleur</label>
                <input type="color" value={kleur} onChange={(e) => setKleur(e.target.value)} className="mt-1.5 h-[42px] w-full rounded-xl border border-rand bg-transparent" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="n-label">Muziek</label>
                <select value={muziek} onChange={(e) => setMuziek(e.target.value)} className="n-invoer mt-1.5">
                  {DOCU_MUZIEK.map((m) => (
                    <option key={m.slug} value={m.slug}>{m.naam}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm text-tekst">
                <input type="checkbox" checked={short} onChange={(e) => setShort(e.target.checked)} />
                Maak er ook een Short bij
              </label>
            </div>

            {!plan && (
              <>
                <button onClick={onderzoek} disabled={!!bezig || onderwerp.trim().length < 3} className="btn-primary w-full disabled:opacity-50">
                  {bezig === "onderzoek" ? "Bezig met onderzoek…" : "🔎 Onderzoek en schrijf het script (gratis)"}
                </button>
                {bezig === "onderzoek" && (
                  <p className="text-[11px] text-tekst-3">
                    We zoeken het verhaal uit op internet, schrijven het script en laten elk feit door een tweede redacteur nalopen. Dat duurt 3 tot 6 minuten; laat deze pagina open.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Stap 2 — het onderzoek nalopen */}
          {plan && (
            <div className="n-kaart space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-tekst">2. Het script</h2>
                  <p className="text-xs text-tekst-3 mt-0.5">{plan.titel}</p>
                </div>
                <button onClick={opnieuw} disabled={!!bezig} className="n-knop2 !py-1.5 !px-3 text-xs">Ander onderwerp</button>
              </div>

              {controle && (
                <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm text-tekst">
                  <div className="font-semibold">✓ Feiten gecontroleerd</div>
                  <p className="text-xs text-tekst-2 mt-1">
                    {controle.gecontroleerd} beweringen nagelopen tegen {new Set(feiten.map((f) => f.url)).size} bronnen.{" "}
                    {controle.verbeterd.length ? `${controle.verbeterd.length} ${controle.verbeterd.length === 1 ? "zin is" : "zinnen zijn"} verbeterd.` : "Er hoefde niets verbeterd te worden."} Je hoeft zelf niets na te lopen.
                  </p>
                  {(controle.verbeterd.length > 0 || feiten.length > 0) && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-tekst-2">Wat er is verbeterd, en de bronnen</summary>
                      <div className="mt-2 space-y-2 text-xs">
                        {controle.verbeterd.map((v, i) => (
                          <div key={i} className="rounded-xl bg-white/50 dark:bg-black/20 p-2">
                            <div className="font-semibold">{v.scene ? `Scene ${v.scene}` : "Eindkaart"}</div>
                            <div className="text-tekst-3">{v.reden}</div>
                          </div>
                        ))}
                        <ul className="space-y-1">
                          {feiten.map((f) => (
                            <li key={f.id}>
                              {f.feit} —{" "}
                              <a href={f.url} target="_blank" rel="noreferrer" className="underline">{f.bron || "bron"}</a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  )}
                </div>
              )}

              {/* Foto's */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="n-label">Archieffoto&apos;s <span className="font-normal text-tekst-3">(vrij te gebruiken, van Wikimedia Commons)</span></label>
                  {fotos && <button onClick={() => zoekFotos(plan, fotoZoek)} disabled={!!bezig} className="text-[11px] underline text-tekst-3">Opnieuw zoeken</button>}
                </div>
                {bezig === "fotos" ? (
                  <p className="text-xs text-tekst-3 mt-1.5">Foto&apos;s zoeken en uitkiezen… (een minuut of twee)</p>
                ) : fotos === null ? (
                  <button onClick={() => zoekFotos(plan, fotoZoek)} disabled={!!bezig} className="n-knop2 mt-1.5 text-sm">Zoek foto&apos;s</button>
                ) : fotos.length === 0 ? (
                  <p className="text-xs text-tekst-3 mt-1.5">Geen bruikbare vrije foto&apos;s gevonden. De video wordt dan helemaal getekend.</p>
                ) : (
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {fotos.map((f) => (
                      <div key={f.id} className="relative rounded-xl overflow-hidden border border-rand">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.url} alt={f.wat} className="w-full aspect-video object-cover" loading="lazy" />
                        <div className="px-2 py-1 text-[10px] text-tekst-3 leading-tight">
                          Scene {f.scene} · <a href={f.bron} target="_blank" rel="noreferrer" className="underline">{fotoCredit(f, taal).replace(/^Fo?to?:?\s*|^Photo:\s*/i, "")}</a>
                        </div>
                        <button onClick={() => setFotos((nu) => (nu ?? []).filter((x) => x.id !== f.id))} title="Deze foto niet gebruiken" className="absolute top-1 right-1 rounded-full bg-black/60 text-white w-6 h-6 text-xs">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {plan.scenes.map((s, i) => (
                  <div key={i} className="rounded-2xl border border-rand p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-tekst-3">
                      Scene {i + 1}{s.kop ? ` · ${s.kop}` : ""}{fotos?.some((f) => f.scene === i + 1) ? " · 📷" : ""}
                    </div>
                    <textarea value={s.tekst} onChange={(e) => wijzigScene(i, { tekst: e.target.value })} rows={3} className="n-invoer mt-1.5 resize-none" />
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11px] text-tekst-3">Wat je ziet</summary>
                      <textarea value={s.beeld} onChange={(e) => wijzigScene(i, { beeld: e.target.value })} rows={3} className="n-invoer mt-1 resize-none text-sm" />
                    </details>
                  </div>
                ))}
                <div className="rounded-2xl border border-rand p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-tekst-3">Eindkaart</div>
                  <textarea value={plan.eind.tekst} onChange={(e) => setPlan({ ...plan, eind: { ...plan.eind, tekst: e.target.value } })} rows={2} className="n-invoer mt-1.5 resize-none" />
                </div>
              </div>
              <p className={`text-[11px] ${teLang ? "text-red-500" : "text-tekst-3"}`}>
                {woorden} woorden {teLang ? `— te lang voor ${duurTekst(lengte)}: maak het korter` : `(ongeveer ${(woorden / 2.5 / 60).toFixed(1).replace(".", ",")} minuten)`}. Pas je een feit aan, dan
                controleren we dat niet opnieuw.
              </p>

              <button onClick={maak} disabled={!!bezig || teLang || fotos === null} className="btn-primary w-full disabled:opacity-50">
                {bezig === "maken" ? "Bezig met insturen…" : `🎞️ Maak de docu · ${credits} credits`}
              </button>
              <p className="text-[11px] text-tekst-3">
                Dit duurt {lengte >= 600 ? "ongeveer een uur" : lengte >= 300 ? "een half uur tot drie kwartier" : "een minuut of 20"}: elk hoofdstuk wordt speciaal getekend en nagekeken. Daarna
                komen de thumbnail, de beschrijving{short ? " en de Short" : ""} erbij. Je kunt deze pagina sluiten; mislukt het, dan krijg je je credits terug.
              </p>
            </div>
          )}

          {fout && (
            <p className="text-sm text-red-600 dark:text-red-300 bg-red-500/10 rounded-xl px-3 py-2">
              {fout}
              {fout === "Niet genoeg credits." && (
                <> <Link href="/pricing" className="underline">Credits bijkopen</Link></>
              )}
            </p>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-tekst-2 mb-3">Jouw docu&apos;s</h2>
          {lijst.laden && lijst.creaties.length === 0 ? (
            <p className="text-sm text-tekst-3">Laden…</p>
          ) : lijst.creaties.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-rand p-12 text-center text-tekst-3">
              <div className="text-4xl mb-3">🎞️</div>
              Kies links een onderwerp. Je docu&apos;s, met thumbnail en beschrijving, komen hier te staan.
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 items-start">
              {lijst.creaties.map((c) => (
                <div key={c.id} className="space-y-1.5">
                  <CreatieKaart creatie={c} onOpen={() => setOpen(c)} onFavoriet={async () => lijst.werkBij(await zetFavoriet(c))} />
                  {c.status === "klaar" && (
                    <button onClick={() => setPakket(c)} className="n-knop2 w-full !py-1.5 text-xs">📦 YouTube-pakket</button>
                  )}
                </div>
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
          onNieuw={(c) => c.maker === "docu" && lijst.zetVoor(c)}
        />
      )}
      {pakket && <Pakket creatie={pakket} onSluit={() => setPakket(null)} />}
    </div>
  );
}

/** Het YouTube-pakket van een klare docu: thumbnail, titels, beschrijving en de Short. */
function Pakket({ creatie, onSluit }: { creatie: Creatie; onSluit: () => void }) {
  const x = ((creatie.invoer as { docu?: { extras?: DocuExtras } }).docu?.extras ?? {}) as DocuExtras;
  const [gekopieerd, setGekopieerd] = useState("");
  function kopieer(tekst: string, wat: string) {
    void navigator.clipboard?.writeText(tekst).then(() => setGekopieerd(wat)).catch(() => {});
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onSluit}>
      <div className="n-kaart w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-tekst">📦 YouTube-pakket</h2>
          <button onClick={onSluit} className="text-tekst-3">✕</button>
        </div>
        {x.fout && <p className="text-xs text-amber-600 bg-amber-500/10 rounded-xl px-3 py-2">Niet alles lukte: {x.fout}</p>}
        <div className="flex gap-2">
          {creatie.url && <a href={creatie.url} target="_blank" rel="noreferrer" className="n-knop2 text-sm">⬇ Video</a>}
          {x.thumbnail && <a href={x.thumbnail} target="_blank" rel="noreferrer" className="n-knop2 text-sm">⬇ Thumbnail</a>}
        </div>
        {x.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={x.thumbnail} alt="Thumbnail" className="w-full rounded-xl border border-rand" />
        )}
        {x.titels?.length ? (
          <div>
            <label className="n-label">Titels</label>
            <ul className="mt-1.5 space-y-1">
              {x.titels.map((t) => (
                <li key={t} className="flex items-center justify-between gap-2 rounded-xl border border-rand px-3 py-2 text-sm text-tekst">
                  {t}
                  <button onClick={() => kopieer(t, t)} className="text-[11px] underline text-tekst-3 shrink-0">{gekopieerd === t ? "Gekopieerd" : "Kopieer"}</button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {x.beschrijving && (
          <div>
            <div className="flex items-center justify-between">
              <label className="n-label">Beschrijving</label>
              <button onClick={() => kopieer(x.beschrijving!, "beschrijving")} className="text-[11px] underline text-tekst-3">{gekopieerd === "beschrijving" ? "Gekopieerd" : "Kopieer"}</button>
            </div>
            <textarea readOnly value={x.beschrijving} rows={12} className="n-invoer mt-1.5 text-xs font-mono" />
          </div>
        )}
        {x.shortId && (
          <p className="text-xs text-tekst-3">
            De Short wordt apart gemaakt en staat straks in <Link href="/mijn-werk" className="underline">je bibliotheek</Link> (bij Motion graphics).
          </p>
        )}
      </div>
    </div>
  );
}
