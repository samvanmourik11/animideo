"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Creatie } from "@/lib/creaties/types";
import CreatieKaart from "@/components/creaties/CreatieKaart";
import VideoAanpassen from "@/components/motion/VideoAanpassen";
import DocuTijdlijn from "@/components/docu/DocuTijdlijn";
import { MuziekKiezer } from "@/components/motion/MuziekKiezer";
import { DOCU_STIJLEN, type DocuStijl, type KanaalProfiel } from "@/lib/docu/kanalen";
import CreatieDetail from "@/components/creaties/CreatieDetail";
import { startMaker, useCreaties, zetFavoriet } from "@/components/creaties/gebruik-creaties";
import { BrowserMelding, useBrowserVideo } from "@/components/motion/BrowserVideo";
import { MOTION_ONDERTITELS, MOTION_STEM_HUGO, MOTION_TALEN, duurTekst, isMotionTaal, isOndertitels, maxWoorden, type MotionOndertitels, type MuziekVolume, type MotionPlan, type MotionTaal } from "@/lib/motion/types";
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
  const [ondertitels, setOndertitels] = useState<MotionOndertitels>("uit");
  const [mail, setMail] = useState(true);
  const [aanpassen, setAanpassen] = useState<Creatie | null>(null);
  const [tijdlijn, setTijdlijn] = useState<Creatie | null>(null);
  const [stem, setStem] = useState<string>(MOTION_STEM_HUGO);
  const [stemmen, setStemmen] = useState<BibliotheekStem[]>([]);
  const [muziek, setMuziek] = useState<string>(DOCU_MUZIEK[0].slug);
  const [muziekVolume, setMuziekVolume] = useState<MuziekVolume>("normaal");
  const [muziekUrl, setMuziekUrl] = useState("");
  const [short, setShort] = useState(true);
  // Short-fabriek: één of drie Shorts (alleen als `short` aan staat).
  const [shorts, setShorts] = useState<1 | 3>(1);
  const aantalShorts = short ? shorts : 0;
  const [stijl, setStijl] = useState<DocuStijl>("archief");
  const [kanalen, setKanalen] = useState<KanaalProfiel[]>([]);
  const [kanaalId, setKanaalId] = useState("");
  const [nieuweAflevering, setNieuweAflevering] = useState("");
  const [plan, setPlan] = useState<MotionPlan | null>(null);
  const [feiten, setFeiten] = useState<DocuFeit[]>([]);
  const [controle, setControle] = useState<DocuControle | null>(null);
  const [fotoZoek, setFotoZoek] = useState<string[]>([]);
  const [fotos, setFotos] = useState<DocuFoto[] | null>(null);
  const [bezig, setBezig] = useState<Bezig>(null);
  // Na het starten op slot tot het script verandert: één klik = één video (en één keer credits).
  const [gestartPlan, setGestartPlan] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState<Creatie | null>(null);
  const [pakket, setPakket] = useState<Creatie | null>(null);
  const [geladen, setGeladen] = useState(false);
  useEffect(() => {
    fetch("/api/docu/kanalen").then((r) => (r.ok ? r.json() : { kanalen: [] })).then((d) => setKanalen(d.kanalen ?? [])).catch(() => {});
  }, []);
  const gekozenKanaal = kanalen.find((k) => k.id === kanaalId) ?? null;

  async function bewaarKanalen(lijst: KanaalProfiel[]) {
    const res = await fetch("/api/docu/kanalen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kanalen: lijst }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error ?? "Bewaren mislukt");
    setKanalen(d.kanalen);
    return d.kanalen as KanaalProfiel[];
  }
  /** Een kanaal kiezen: alle vaste keuzes van dat kanaal in één keer. */
  function kiesKanaal(id: string) {
    setKanaalId(id);
    const k = kanalen.find((x) => x.id === id);
    if (!k) return;
    setKanaal(k.naam);
    setKleur(k.kleur);
    // Staat er al een script, dan blijft de taal daarvan: anders klopt het script niet meer.
    if (!plan) setTaal(k.taal);
    if (k.stem) setStem(k.stem);
    if (k.muziek !== undefined) setMuziek(k.muziek);
    setMuziekVolume(k.muziekVolume);
    setStijl(k.stijl);
    setOndertitels(k.ondertitels);
    setShort(k.short);
  }
  /** De huidige keuzes als kanaal bewaren (nieuw, of het gekozen kanaal bijwerken). */
  async function bewaarAlsKanaal() {
    if (!kanaal.trim()) return setFout("Vul eerst de naam van je kanaal in.");
    const basis = { naam: kanaal.trim(), kleur, taal, stem, muziek, muziekVolume, stijl, ondertitels, short };
    const lijst = gekozenKanaal
      ? kanalen.map((k) => (k.id === gekozenKanaal.id ? { ...k, ...basis } : k))
      : [...kanalen, { id: Math.random().toString(36).slice(2, 10), ...basis, reeks: [] }];
    const nieuw = await bewaarKanalen(lijst).catch((e) => { setFout(e instanceof Error ? e.message : String(e)); return null; });
    if (nieuw && !gekozenKanaal) setKanaalId(nieuw[nieuw.length - 1].id);
  }
  async function wijzigReeks(reeks: KanaalProfiel["reeks"]) {
    if (!gekozenKanaal) return;
    await bewaarKanalen(kanalen.map((k) => (k.id === gekozenKanaal.id ? { ...k, reeks } : k))).catch((e) => setFout(e instanceof Error ? e.message : String(e)));
  }

  const lijst = useCreaties({ maker: "docu" });
  // De Shorts bij de docu's zijn motion-rijen; ook die worden in deze browser gemaakt.
  const shortLijst = useCreaties({ maker: "motion" });
  const docuIds = new Set(lijst.creaties.map((c) => c.id));
  const browserStand = useBrowserVideo(
    [...lijst.creaties, ...shortLijst.creaties.filter((c) => c.ouder_id && docuIds.has(c.ouder_id))],
    () => { lijst.ververs(); shortLijst.ververs(); },
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
        if (isOndertitels(b.ondertitels) && b.ondertitels !== "woord") setOndertitels(b.ondertitels);
        if (typeof b.mail === "boolean") setMail(b.mail);
        if (b.stijl === "archief" || b.stijl === "krant" || b.stijl === "truecrime") setStijl(b.stijl);
        if (typeof b.stem === "string") setStem(b.stem);
        if (typeof b.muziek === "string") setMuziek(b.muziek);
        if (typeof b.short === "boolean") setShort(b.short);
        if (b.shorts === 1 || b.shorts === 3) setShorts(b.shorts);
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
      localStorage.setItem(BEWAAR, JSON.stringify({ kanaal, kleur, onderwerp, wens, lengte, taal, stem, ondertitels, mail, muziek, stijl, short, shorts, plan, feiten, controle, fotoZoek, fotos }));
    } catch {}
  }, [geladen, kanaal, kleur, onderwerp, wens, lengte, taal, stem, ondertitels, mail, muziek, stijl, short, shorts, plan, feiten, controle, fotoZoek, fotos]);

  // Nederlands: Hugo vooraan, dan de bibliotheek. Andere talen: alleen moedertaalstemmen, met
  // een vaste documentaireverteller vooraan (lib/stem/taalstemmen.ts).
  const stemKeuzes: { id: string; naam: string; voorbeeld?: string }[] =
    taal === "nl"
      ? [
          { id: MOTION_STEM_HUGO, naam: "Hugo · verteller", voorbeeld: stemmen.find((s) => s.id === MOTION_STEM_HUGO)?.voorbeeld },
          ...stemmen.filter((s) => s.id !== MOTION_STEM_HUGO).map((s) => ({ id: s.id, naam: `${s.naam} · ${s.geslacht}`, voorbeeld: s.voorbeeld })),
        ]
      : taalStemmen(taal).map((s) => ({ id: s.id, naam: `${s.naam} · ${s.typering}`, voorbeeld: s.voorbeeld }));
  const voorbeeldStem = stemKeuzes.find((s) => s.id === stem)?.voorbeeld;
  function luister() {
    if (voorbeeldStem) void new Audio(voorbeeldStem).play().catch(() => {});
  }

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
      const c = await startMaker("docu", { onderwerp, kanaal, kleur, kleur2: "#f3efe6", lengte, taal, stem, ondertitels, mail, muziek, muziekVolume, muziekUrl, stijl, short, shorts, plan, feiten, controle, fotos: fotos ?? [] });
      // Een geplande aflevering van dit kanaal is hiermee gemaakt.
      if (gekozenKanaal?.reeks.some((a) => !a.gemaakt && a.onderwerp === onderwerp.trim())) void wijzigReeks(gekozenKanaal.reeks.map((a) => (a.onderwerp === onderwerp.trim() ? { ...a, gemaakt: true } : a)));
      lijst.zetVoor(c);
      setGestartPlan(JSON.stringify(plan));
    });
  }

  function wijzigScene(i: number, veld: Partial<MotionPlan["scenes"][number]>) {
    setPlan((p) => (p ? { ...p, scenes: p.scenes.map((s, j) => (j === i ? { ...s, ...veld } : s)) } : p));
  }

  const woorden = plan ? [...plan.scenes.map((s) => s.tekst), plan.eind.tekst].join(" ").split(/\s+/).filter(Boolean).length : 0;
  const max = Math.round(maxWoorden(lengte) * 1.25);
  const teLang = woorden > max;
  const credits = docuCredits(lengte, aantalShorts);
  const gestart = !!plan && gestartPlan === JSON.stringify(plan);

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
          {/* Kanaal: vaste keuzes en de geplande afleveringen */}
          <div className="n-kaart space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-tekst shrink-0">📺 Kanaal</span>
              <select value={kanaalId} onChange={(e) => kiesKanaal(e.target.value)} className="n-invoer !py-1.5 min-w-0">
                <option value="">{kanalen.length ? "Kies een kanaal…" : "Nog geen kanaal bewaard"}</option>
                {kanalen.map((k) => (
                  <option key={k.id} value={k.id}>{k.naam}</option>
                ))}
              </select>
              <button onClick={() => void bewaarAlsKanaal()} className="n-knop2 !py-1.5 !px-3 text-xs whitespace-nowrap">{gekozenKanaal ? "💾 Bijwerken" : "💾 Bewaar als kanaal"}</button>
            </div>
            <p className="text-[11px] text-tekst-3">Een kanaal onthoudt naam, kleur, taal, verteller, muziek, stijl en ondertitels. Plan er je volgende afleveringen bij.</p>
            {gekozenKanaal && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-tekst-3">Geplande afleveringen</div>
                {gekozenKanaal.reeks.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <button onClick={() => setOnderwerp(a.onderwerp)} title="Als onderwerp gebruiken" className={`flex-1 text-left truncate hover:text-blue-500 ${a.gemaakt ? "line-through text-tekst-3" : "text-tekst"}`}>
                      {a.gemaakt ? "✓" : "○"} {a.onderwerp}
                    </button>
                    <button onClick={() => void wijzigReeks(gekozenKanaal.reeks.map((x, j) => (j === i ? { ...x, gemaakt: !x.gemaakt } : x)))} className="text-[11px] text-tekst-3 hover:text-tekst">{a.gemaakt ? "Open" : "Klaar"}</button>
                    <button onClick={() => void wijzigReeks(gekozenKanaal.reeks.filter((_, j) => j !== i))} className="text-[11px] text-tekst-3 hover:text-red-500">✕</button>
                  </div>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!nieuweAflevering.trim()) return;
                    void wijzigReeks([...gekozenKanaal.reeks, { onderwerp: nieuweAflevering.trim() }]);
                    setNieuweAflevering("");
                  }}
                  className="flex gap-2"
                >
                  <input value={nieuweAflevering} onChange={(e) => setNieuweAflevering(e.target.value)} maxLength={300} placeholder="Volgende aflevering, bijv. De val van Blokker" className="n-invoer !py-1.5 text-sm" />
                  <button className="n-knop2 !py-1.5 !px-3 text-xs">＋</button>
                </form>
              </div>
            )}
          </div>

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
                    <div className="text-[11px] text-tekst-2 mt-1">{docuCredits(l.sec, aantalShorts)} credits</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="n-label">Stijl</label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {DOCU_STIJLEN.map((st) => (
                  <button key={st.id} onClick={() => setStijl(st.id)} className={`rounded-xl border p-2 text-left ${stijl === st.id ? "border-blue-500 bg-blue-500/10" : "border-rand hover:border-blue-500/40"}`}>
                    <div className="h-10 rounded-md flex items-center justify-center gap-1.5" style={{ background: st.kleuren[0] }}>
                      <span className="text-sm font-black" style={{ color: st.kleuren[1], fontFamily: st.id === "krant" ? "Georgia, serif" : undefined }}>1987</span>
                      <span className="h-1.5 w-5 rounded-full" style={{ background: st.kleuren[2] }} />
                    </div>
                    <div className="text-sm font-semibold text-tekst mt-1.5">{st.naam}</div>
                    <div className="text-[11px] text-tekst-3 leading-snug">{st.uitleg}</div>
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
                <div className="mt-1.5 flex gap-2">
                  <select value={stem} onChange={(e) => setStem(e.target.value)} className="n-invoer min-w-0">
                    {stemKeuzes.map((s) => (
                      <option key={s.id} value={s.id}>{s.naam}</option>
                    ))}
                  </select>
                  <button onClick={luister} disabled={!voorbeeldStem} title="Luister naar deze verteller" className="n-knop2 !px-3 disabled:opacity-50">▶</button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="n-label">Kanaalnaam <span className="font-normal text-tekst-3">(mag leeg)</span></label>
                <input value={kanaal} onChange={(e) => setKanaal(e.target.value)} maxLength={40} placeholder="Naam van je kanaal" className="n-invoer mt-1.5" />
              </div>
              <div>
                <label className="n-label">Accentkleur</label>
                <input type="color" value={kleur} onChange={(e) => setKleur(e.target.value)} className="mt-1.5 h-[42px] w-full rounded-xl border border-rand bg-transparent" />
              </div>
            </div>

            <MuziekKiezer muziek={muziek} setMuziek={setMuziek} volume={muziekVolume} setVolume={setMuziekVolume} eigen={muziekUrl} setEigen={setMuziekUrl} aanbevolen={DOCU_MUZIEK} />
            <div>
              <label className="n-label">Shorts erbij</label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {([0, 1, 3] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => { setShort(n > 0); if (n) setShorts(n); }}
                    className={`rounded-xl border px-3 py-2 text-left ${aantalShorts === n ? "border-blue-500 bg-blue-500/10" : "border-rand hover:border-blue-500/40"}`}
                  >
                    <div className="text-sm font-semibold text-tekst">{n === 0 ? "Geen" : n === 1 ? "1 Short" : "3 Shorts"}</div>
                    <div className="text-[11px] text-tekst-3">{n === 0 ? "Alleen de docu" : n === 1 ? "Het sterkste moment" : "Haak, keerpunt en 'wist je dat'"}</div>
                    <div className="text-[11px] text-tekst-2 mt-0.5">{n === 0 ? "" : `+ ${docuCredits(lengte, n) - docuCredits(lengte, 0)} credits`}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="n-label">Ondertitels <span className="font-normal text-tekst-3">(gratis)</span></label>
              <select value={ondertitels} onChange={(e) => setOndertitels(e.target.value as MotionOndertitels)} className="n-invoer mt-1.5">
                {MOTION_ONDERTITELS.filter((o) => o.id !== "woord").map((o) => (
                  <option key={o.id} value={o.id}>{o.naam} · {o.uitleg}</option>
                ))}
              </select>
              {ondertitels !== "uit" && short && <p className="text-[11px] text-tekst-3 mt-1">De Short krijgt grote woord-voor-woord-ondertitels.</p>}
            </div>
            <label className="flex items-center gap-2 text-sm text-tekst">
              <input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} />
              Mail me als de docu klaar is
            </label>

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

              <button onClick={maak} disabled={!!bezig || teLang || fotos === null || gestart} className="btn-primary w-full disabled:opacity-50">
                {bezig === "maken" ? "Bezig met insturen…" : gestart ? "✓ Je docu wordt gemaakt — je ziet hem bij Jouw docu's" : `🎞️ Maak de docu · ${credits} credits`}
              </button>
              <p className="text-[11px] text-tekst-3">
                Dit duurt {lengte >= 600 ? "ongeveer een uur" : lengte >= 300 ? "een half uur tot drie kwartier" : "een minuut of 20"}: elk hoofdstuk wordt speciaal getekend en nagekeken. Daarna
                komen de thumbnail, de beschrijving{aantalShorts === 1 ? " en de Short" : aantalShorts === 3 ? " en de drie Shorts" : ""} erbij. Je kunt deze pagina sluiten; mislukt het, dan krijg je je credits terug.
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
                  <CreatieKaart creatie={c} onOpen={() => setOpen(c)} onFavoriet={async () => lijst.werkBij(await zetFavoriet(c))} onAanpassen={() => setAanpassen(c)} />
                  {c.status === "klaar" && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <button onClick={() => setPakket(c)} className="n-knop2 w-full !py-1.5 text-xs">📦 YouTube-pakket</button>
                      <button onClick={() => setTijdlijn(c)} className="n-knop2 w-full !py-1.5 text-xs">🎞 Tijdlijn</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {aanpassen && (
        <VideoAanpassen
          creatie={aanpassen}
          onSluit={() => setAanpassen(null)}
          onGestart={(c) => {
            setAanpassen(null);
            lijst.zetVoor(c);
          }}
        />
      )}

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
      {tijdlijn && (
        <DocuTijdlijn
          creatie={tijdlijn}
          onSluit={() => setTijdlijn(null)}
          onGestart={(c) => {
            setTijdlijn(null);
            lijst.zetVoor(c);
          }}
        />
      )}
    </div>
  );
}

/** Het YouTube-pakket van een klare docu: thumbnail, titels, beschrijving en de Short. */
function Pakket({ creatie, onSluit }: { creatie: Creatie; onSluit: () => void }) {
  const x = ((creatie.invoer as { docu?: { extras?: DocuExtras } }).docu?.extras ?? {}) as DocuExtras;
  const [gekopieerd, setGekopieerd] = useState("");
  const [gekozen, setGekozen] = useState(x.thumbnail ?? "");
  async function kiesThumb(url: string) {
    setGekozen(url);
    await fetch("/api/docu/pakket", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: creatie.id, thumbnail: url }) }).catch(() => {});
  }
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
          {gekozen && <a href={gekozen} target="_blank" rel="noreferrer" className="n-knop2 text-sm">⬇ Thumbnail</a>}
        </div>
        {gekozen && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={gekozen} alt="Thumbnail" className="w-full rounded-xl border border-rand" />
        )}
        {(x.thumbnails?.length ?? 0) > 1 && (
          <div>
            <label className="n-label">Kies je thumbnail</label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {x.thumbnails!.map((t, i) => (
                <button key={t} onClick={() => void kiesThumb(t)} className={`relative rounded-lg overflow-hidden border-2 ${t === gekozen ? "border-blue-500" : "border-transparent hover:border-blue-500/40"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t} alt={`Thumbnail ${i + 1}`} className="w-full aspect-video object-cover" />
                  {t === gekozen && <span className="absolute top-1 right-1 rounded-full bg-blue-600 text-white text-[10px] px-1.5">✓ Gekozen</span>}
                </button>
              ))}
            </div>
          </div>
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
            {(x.shortIds?.length ?? 1) > 1 ? `De ${x.shortIds!.length} Shorts worden apart gemaakt en staan` : "De Short wordt apart gemaakt en staat"} straks in <Link href="/mijn-werk" className="underline">je bibliotheek</Link> (bij Motion graphics).
          </p>
        )}
      </div>
    </div>
  );
}
