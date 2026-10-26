"use client";

import PakketSlot from "@/components/PakketSlot";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Creatie } from "@/lib/creaties/types";
import BeeldKiezer, { type GekozenBeeld } from "@/components/creaties/BeeldKiezer";
import CreatieDetail from "@/components/creaties/CreatieDetail";
import { startMaker, useCreaties } from "@/components/creaties/gebruik-creaties";
import { CREATIES_GEWIJZIGD } from "@/components/app-shell/Zijbalk";
import { EIGEN, GEBRUIK_LABEL, KLOON_CREDITS, MIN_OPNAME_SEC, TAAL, voiceOverCredits, type BibliotheekStem } from "@/lib/stem/types";
import { lipsyncCredits } from "@/lib/lipsync";

// STEM & LIPSYNC: de 100 beste stemmen voor Nederlands, losse voice-overs
// om te downloaden, je eigen stem trainen en een foto laten praten.

type Tab = "stemmen" | "voice-over" | "eigen" | "lipsync";
export interface GekozenStem { id: string; naam: string; taal: string; omschrijving: string; voorbeeld?: string; talen?: string[] }

/** Vlaggetjes van de talen die een stem goed spreekt, zoals ElevenLabs ze toont. */
function Vlaggen({ talen, max = 7 }: { talen: string[]; max?: number }) {
  const bekend = talen.filter((t) => TAAL[t]);
  const titel = bekend.map((t) => TAAL[t].naam).join(", ");
  return (
    <span className="inline-flex items-center gap-0.5 text-[13px] leading-none" title={`Spreekt goed: ${titel}`}>
      {bekend.slice(0, max).map((t) => <span key={t}>{TAAL[t].vlag}</span>)}
      {bekend.length > max && <span className="ml-1 text-[10px] text-tekst-3">+{bekend.length - max}</span>}
    </span>
  );
}

/** Ophogen na een nieuwe sync: de lijst staat een uur in de browsercache. */
const BIBLIOTHEEK_VERSIE = 3;
let cache: BibliotheekStem[] | null = null;
function useBibliotheek() {
  const [lijst, setLijst] = useState<BibliotheekStem[]>(cache ?? []);
  useEffect(() => {
    if (cache) return;
    fetch(`/api/stem/bibliotheek?v=${BIBLIOTHEEK_VERSIE}`).then((r) => r.json()).then((d: BibliotheekStem[]) => {
      cache = d;
      setLijst(d);
    }).catch(() => {});
  }, []);
  return lijst;
}

/** Eén afspeler voor de hele pagina: een nieuw voorbeeld stopt het vorige. */
const speler: { a: HTMLAudioElement | null } = { a: null };
function speel(url?: string) {
  speler.a?.pause();
  if (!url) return;
  speler.a = new Audio(url);
  speler.a.play().catch(() => {});
}

function StemKiezer({ eigen, onKies, gekozenId }: { eigen: Creatie[]; onKies: (s: GekozenStem) => void; gekozenId?: string }) {
  const lijst = useBibliotheek();
  const [categorie, setCategorie] = useState<"alle" | "nl" | "vlaams" | "internationaal" | "eigen">("alle");
  const [ookTaal, setOokTaal] = useState("");
  const [geslacht, setGeslacht] = useState("");
  const [leeftijd, setLeeftijd] = useState("");
  const [gebruik, setGebruik] = useState("");
  const [zoek, setZoek] = useState("");
  const [aantal, setAantal] = useState(40);

  const gefilterd = useMemo(() => {
    const z = zoek.trim().toLowerCase();
    return lijst
      .filter((s) =>
        categorie === "nl" ? s.moedertaal && s.accent === "Nederlands"
        : categorie === "vlaams" ? s.accent !== "Nederlands"
        : categorie === "internationaal" ? !s.moedertaal
        : true,
      )
      .filter((s) => !ookTaal || s.talen.includes(ookTaal))
      .filter((s) => !geslacht || s.geslacht === geslacht)
      .filter((s) => !leeftijd || s.leeftijd === leeftijd)
      .filter((s) => !gebruik || s.gebruik === gebruik)
      .filter((s) => !z || `${s.naam} ${s.typering} ${s.beschrijving}`.toLowerCase().includes(z));
    // Volgorde komt uit de bibliotheek: Nederlandstalig eerst, dan op recent gebruik.
  }, [lijst, categorie, geslacht, leeftijd, gebruik, zoek, ookTaal]);
  const andereTalen = useMemo(() => {
    const tel = new Map<string, number>();
    lijst.forEach((s) => s.talen.forEach((t) => t !== "nl" && TAAL[t] && tel.set(t, (tel.get(t) ?? 0) + 1)));
    return [...tel.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [lijst]);

  const tabKnop = (actief: boolean) => `px-3 py-1.5 rounded-full text-sm ${actief ? "bg-blue-600 text-white" : "bg-paneel-2 text-tekst-2 hover:text-tekst"}`;
  const eigenKlaar = eigen.filter((c) => c.status === "klaar");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setCategorie("alle")} className={tabKnop(categorie === "alle")}>Alle 100</button>
        <button onClick={() => setCategorie("nl")} className={tabKnop(categorie === "nl")}>🇳🇱 Nederlands</button>
        <button onClick={() => setCategorie("vlaams")} className={tabKnop(categorie === "vlaams")}>🇧🇪 Vlaams & Brabants</button>
        <button onClick={() => setCategorie("internationaal")} className={tabKnop(categorie === "internationaal")} title="Internationale topstemmen die ook goed Nederlands spreken">🌍 Internationaal</button>
        <button onClick={() => setCategorie("eigen")} className={tabKnop(categorie === "eigen")}>⭐ Eigen stemmen ({eigenKlaar.length})</button>
      </div>

      {categorie === "eigen" ? (
        eigenKlaar.length === 0 ? (
          <p className="text-sm text-tekst-3">Nog geen eigen stem. Train er een bij het tabblad &ldquo;Eigen stem&rdquo;.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {eigenKlaar.map((c) => {
              const naam = (c.invoer as { naam?: string }).naam ?? "Eigen stem";
              const id = `${EIGEN}${c.id}`;
              return (
                <div key={c.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${gekozenId === id ? "border-blue-500 bg-blue-500/10" : "border-rand"}`}>
                  <button onClick={() => speel(c.url ?? undefined)} className="w-8 h-8 shrink-0 rounded-full bg-blue-600 text-white text-xs" aria-label="Luister">▶</button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-tekst truncate">⭐ {naam}</div>
                    <div className="text-[11px] text-tekst-3">Je eigen stem</div>
                  </div>
                  <button onClick={() => onKies({ id, naam, taal: "nl", omschrijving: "Eigen stem", voorbeeld: c.url ?? undefined })} className="n-knop2 !py-1 !px-3 text-xs">Kies</button>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="🔍 Zoek op naam of typering" className="n-invoer !w-56 !py-1.5" />
            <select value={geslacht} onChange={(e) => setGeslacht(e.target.value)} className="n-invoer !w-auto !py-1.5">
              <option value="">Man & vrouw</option>
              <option value="man">Man</option>
              <option value="vrouw">Vrouw</option>
            </select>
            <select value={leeftijd} onChange={(e) => setLeeftijd(e.target.value)} className="n-invoer !w-auto !py-1.5">
              <option value="">Alle leeftijden</option>
              <option value="jong">Jong</option>
              <option value="volwassen">Volwassen</option>
              <option value="ouder">Ouder</option>
            </select>
            <select value={gebruik} onChange={(e) => setGebruik(e.target.value)} className="n-invoer !w-auto !py-1.5">
              <option value="">Alle soorten</option>
              {Object.entries(GEBRUIK_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={ookTaal} onChange={(e) => setOokTaal(e.target.value)} className="n-invoer !w-auto !py-1.5">
              <option value="">Spreekt ook…</option>
              {andereTalen.map((t) => <option key={t} value={t}>{TAAL[t].vlag} {TAAL[t].naam}</option>)}
            </select>
          </div>
          <p className="text-[11px] text-tekst-3">{lijst.length ? `${gefilterd.length} stemmen` : "Stemmen laden…"}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {gefilterd.slice(0, aantal).map((s) => (
              <div key={s.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${gekozenId === s.id ? "border-blue-500 bg-blue-500/10" : "border-rand"}`}>
                <button onClick={() => speel(s.voorbeeld)} className="w-8 h-8 shrink-0 rounded-full bg-blue-600 text-white text-xs" aria-label={`Luister naar ${s.naam}`}>▶</button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-tekst truncate">
                    {s.naam} {s.typering && <span className="font-normal text-tekst-3">· {s.typering}</span>}
                  </div>
                  <div className="text-[11px] text-tekst-3 truncate">
                    {s.geslacht} · {s.leeftijd}{s.gebruik ? ` · ${GEBRUIK_LABEL[s.gebruik] ?? s.gebruik}` : ""}
                    {s.accent !== "Nederlands" ? ` · ${s.accent}` : ""}{!s.moedertaal ? " · internationaal" : ""}
                  </div>
                  <div className="mt-0.5"><Vlaggen talen={s.talen} /></div>
                </div>
                <button
                  onClick={() => onKies({ id: s.id, naam: s.naam, taal: "nl", talen: s.talen, omschrijving: `${s.geslacht}, ${s.leeftijd}${s.gebruik ? `, ${GEBRUIK_LABEL[s.gebruik] ?? s.gebruik}` : ""}`, voorbeeld: s.voorbeeld })}
                  className="n-knop2 !py-1 !px-3 text-xs"
                >
                  Kies
                </button>
              </div>
            ))}
          </div>
          {gefilterd.length > aantal && (
            <button onClick={() => setAantal((n) => n + 40)} className="n-knop2 w-full text-sm">Meer stemmen tonen</button>
          )}
        </>
      )}
    </div>
  );
}

/** Lijst met geluid: afspelen, downloaden en openen. */
function GeluidLijst({ lijst, onOpen, extra }: { lijst: Creatie[]; onOpen: (c: Creatie) => void; extra?: (c: Creatie) => React.ReactNode }) {
  if (!lijst.length) return <p className="text-sm text-tekst-3">Nog niets gemaakt.</p>;
  return (
    <div className="space-y-2">
      {lijst.map((c) => (
        <div key={c.id} className="rounded-xl border border-rand bg-paneel p-3 space-y-2">
          <button onClick={() => onOpen(c)} className="text-left text-sm text-tekst line-clamp-2 w-full">{c.prompt}</button>
          {c.status === "bezig" && <div className="text-xs text-tekst-3 flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />Wordt gemaakt…</div>}
          {c.status === "mislukt" && <div className="text-xs text-red-500">Mislukt: {c.foutmelding}{c.credits > 0 ? " · credits zijn terug" : ""}</div>}
          {c.status === "klaar" && c.url && (
            <div className="flex items-center gap-2">
              {c.soort === "audio" ? <audio src={c.url} controls preload="none" className="flex-1 h-9" /> : <video src={c.url} controls className="w-full max-h-64 rounded-lg" />}
              <a href={c.url} download target="_blank" rel="noreferrer" className="n-knop2 !py-1.5 !px-3 text-xs shrink-0">⬇️ {c.soort === "audio" ? "mp3" : "mp4"}</a>
              {extra?.(c)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Inspreken in de browser, met een tekst om voor te lezen. */
function Opnemer({ onKlaar }: { onKlaar: (c: Creatie, sec: number) => void }) {
  const [bezig, setBezig] = useState(false);
  const [sec, setSec] = useState(0);
  const [uploaden, setUploaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stukken = useRef<Blob[]>([]);
  const klok = useRef<ReturnType<typeof setInterval> | null>(null);

  async function upload(bestand: Blob, naam: string) {
    setUploaden(true);
    setFout(null);
    try {
      const form = new FormData();
      form.append("bestand", bestand, naam);
      form.append("naam", naam);
      const res = await fetch("/api/stem/upload", { method: "POST", body: form });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Uploaden mislukt.");
      window.dispatchEvent(new Event(CREATIES_GEWIJZIGD));
      onKlaar(d.creatie, d.sec);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setUploaden(false);
    }
  }

  async function start() {
    setFout(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const r = new MediaRecorder(stream);
      stukken.current = [];
      r.ondataavailable = (e) => e.data.size && stukken.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        upload(new Blob(stukken.current, { type: r.mimeType || "audio/webm" }), `Opname ${new Date().toLocaleString("nl-NL")}`);
      };
      recorder.current = r;
      r.start();
      setSec(0);
      setBezig(true);
      klok.current = setInterval(() => setSec((s) => s + 1), 1000);
    } catch {
      setFout("Geen toegang tot je microfoon. Sta de microfoon toe in je browser, of upload een opname.");
    }
  }
  function stop() {
    if (klok.current) clearInterval(klok.current);
    setBezig(false);
    recorder.current?.stop();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {bezig ? (
          <button onClick={stop} className="btn-primary !bg-none !bg-red-600">⏹ Stop ({sec} s)</button>
        ) : (
          <button onClick={start} disabled={uploaden} className="btn-primary disabled:opacity-50">🎙️ Opnemen</button>
        )}
        <label className="n-knop2 cursor-pointer text-sm">
          📁 Of upload een opname
          <input type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], e.target.files[0].name)} />
        </label>
        {uploaden && <span className="text-xs text-tekst-3">Verwerken…</span>}
      </div>
      {bezig && sec < MIN_OPNAME_SEC && <p className="text-xs text-amber-600 dark:text-amber-300">Nog even doorpraten: minimaal {MIN_OPNAME_SEC} seconden.</p>}
      {fout && <p className="text-sm text-red-600 dark:text-red-300">{fout}</p>}
    </div>
  );
}

const VOORLEESTEKST =
  "Hallo! Ik neem nu mijn eigen stem op voor Animideo. Ik praat rustig en duidelijk, zoals ik normaal ook praat. Vandaag is het een mooie dag: de zon schijnt, de koffie is warm en de fiets staat klaar. Ik vertel graag over wat we maken, over onze klanten en over de plannen voor het komende jaar. Wist je dat een goede stem een verhaal pas echt tot leven brengt? Daarom neem ik de tijd, adem ik rustig, en lees ik deze tekst één keer helemaal voor.";

export default function StemStudio({ magKlonen = true }: { magKlonen?: boolean }) {
  const [tab, setTab] = useState<Tab>("stemmen");
  const [stem, setStem] = useState<GekozenStem | null>(null);
  const [tekst, setTekst] = useState("");
  const [snelheid, setSnelheid] = useState(1);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState<Creatie | null>(null);
  const [kiezerOpen, setKiezerOpen] = useState(false);

  // Eigen stem
  const [kloonNaam, setKloonNaam] = useState("");
  const [opname, setOpname] = useState<{ c: Creatie; sec: number } | null>(null);
  const [kloonToestemming, setKloonToestemming] = useState(false);

  // Pratende foto
  const [foto, setFoto] = useState<GekozenBeeld | null>(null);
  const [geluid, setGeluid] = useState<Creatie | null>(null);
  const [fotoToestemming, setFotoToestemming] = useState(false);

  const voiceOvers = useCreaties({ maker: "voice-over" });
  const klonen = useCreaties({ maker: "stem-kloon" });
  const pratend = useCreaties({ maker: "pratende-foto" });
  const alleGeluid = useCreaties({ soort: "audio" });

  async function doe(actie: () => Promise<void>) {
    setBezig(true);
    setFout(null);
    try {
      await actie();
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  }

  function kies(s: GekozenStem) {
    setStem(s);
    setKiezerOpen(false);
    setTab("voice-over");
  }

  const geluidSec = geluid ? Number((geluid.invoer as { sec?: number }).sec) || Math.max(2, ((geluid.invoer as { tekst?: string }).tekst?.length ?? 60) / 15) : 0;
  const tabKnop = (t: Tab) => `px-4 py-2 rounded-xl text-sm font-medium ${tab === t ? "bg-blue-600 text-white" : "text-tekst-2 hover:bg-paneel-2"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-tekst tracking-tight">🗣️ Stem & Lipsync</h1>
        <p className="text-tekst-3 mt-1">De 100 beste stemmen voor Nederlands, losse voice-overs om te downloaden, je eigen stem, en foto&apos;s die praten.</p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-2xl bg-paneel border border-rand p-1 w-fit">
        <button onClick={() => setTab("stemmen")} className={tabKnop("stemmen")}>📚 Stemmen</button>
        <button onClick={() => setTab("voice-over")} className={tabKnop("voice-over")}>🎙️ Voice-over</button>
        <button onClick={() => setTab("eigen")} className={tabKnop("eigen")}>⭐ Eigen stem</button>
        <button onClick={() => setTab("lipsync")} className={tabKnop("lipsync")}>🗣️ Pratende foto</button>
      </div>

      {fout && (
        <p className="text-sm text-red-600 dark:text-red-300 bg-red-500/10 rounded-xl px-3 py-2">
          {fout}{fout === "Niet genoeg credits." && <> <Link href="/pricing" className="underline">Credits bijkopen</Link></>}
        </p>
      )}

      {tab === "stemmen" && (
        <div className="n-kaart">
          <StemKiezer eigen={klonen.creaties} onKies={kies} gekozenId={stem?.id} />
        </div>
      )}

      {tab === "voice-over" && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-6 items-start">
          <div className="n-kaart space-y-4">
            <div>
              <label className="n-label">Stem</label>
              <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-rand px-3 py-2">
                {stem ? (
                  <>
                    <button onClick={() => speel(stem.voorbeeld)} className="w-8 h-8 shrink-0 rounded-full bg-blue-600 text-white text-xs" aria-label="Luister">▶</button>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-tekst">{stem.naam}</div>
                      <div className="text-[11px] text-tekst-3">{stem.omschrijving}</div>
                      {stem.talen && <Vlaggen talen={stem.talen} max={12} />}
                    </div>
                  </>
                ) : (
                  <span className="flex-1 text-sm text-tekst-3">Nog geen stem gekozen</span>
                )}
                <button onClick={() => setKiezerOpen((x) => !x)} className="n-knop2 !py-1.5 !px-3 text-xs">{stem ? "Wissel" : "Kies een stem"}</button>
              </div>
              {kiezerOpen && (
                <div className="mt-3">
                  <StemKiezer eigen={klonen.creaties} onKies={kies} gekozenId={stem?.id} />
                </div>
              )}
            </div>
            {stem && (stem.talen?.length ?? 0) > 1 && (
              <div>
                <label className="n-label">Taal van je tekst</label>
                <select value={stem.taal} onChange={(e) => setStem({ ...stem, taal: e.target.value })} className="n-invoer mt-1.5">
                  {stem.talen!.filter((t) => TAAL[t]).map((t) => <option key={t} value={t}>{TAAL[t].vlag} {TAAL[t].naam}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="n-label">Tekst</label>
              <textarea
                value={tekst}
                onChange={(e) => setTekst(e.target.value.slice(0, 5000))}
                rows={7}
                placeholder="Typ wat er gezegd moet worden. Tip: met [enthousiast] of [fluisterend] stuur je de toon bij een bibliotheekstem."
                className="n-invoer mt-1.5 resize-none"
              />
              <div className="flex justify-between text-[11px] text-tekst-3 mt-1">
                <span>{tekst.length} / 5.000 tekens · ≈ {Math.round(tekst.trim().split(/\s+/).filter(Boolean).length / 2.4)} s</span>
                <span>{tekst.trim() ? voiceOverCredits(tekst) : 1} credit{voiceOverCredits(tekst || "x") > 1 ? "s" : ""}</span>
              </div>
            </div>
            <div>
              <label className="n-label">Snelheid: {snelheid.toFixed(2)}×</label>
              <input type="range" min={0.7} max={1.3} step={0.05} value={snelheid} onChange={(e) => setSnelheid(Number(e.target.value))} className="w-full mt-1.5" />
            </div>
            <button
              onClick={() =>
                doe(async () => {
                  const c = await startMaker("voice-over", { tekst, stemId: stem!.id, stemNaam: stem!.naam, snelheid, taal: stem!.taal });
                  voiceOvers.zetVoor(c);
                })
              }
              disabled={bezig || !stem || !tekst.trim()}
              className="btn-primary w-full disabled:opacity-50"
            >
              {bezig ? "Bezig…" : `🎙️ Maak de voice-over · ${voiceOverCredits(tekst || "x")} credit${voiceOverCredits(tekst || "x") > 1 ? "s" : ""}`}
            </button>
            <p className="text-[11px] text-tekst-3">Meestal binnen 10 seconden klaar. Je kunt de mp3 downloaden of meteen een foto laten praten.</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-tekst-2 mb-3">Jouw voice-overs</h2>
            <GeluidLijst
              lijst={voiceOvers.creaties}
              onOpen={setOpen}
              extra={(c) => (
                <button onClick={() => { setGeluid(c); setTab("lipsync"); }} className="n-knop2 !py-1.5 !px-3 text-xs shrink-0">🗣️ Laat praten</button>
              )}
            />
          </div>
        </div>
      )}

      {(tab === "eigen" || tab === "lipsync") && !magKlonen && <PakketSlot recht="stemKlonen" />}

      {tab === "eigen" && magKlonen && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-6 items-start">
          <div className="n-kaart space-y-4">
            <div>
              <h2 className="font-bold text-tekst">Train je eigen stem</h2>
              <p className="text-sm text-tekst-3 mt-1">Lees de tekst hieronder rustig voor (30-60 seconden is het mooist), in een stille ruimte. Daarna spreekt je stem elke tekst in, in al je video&apos;s.</p>
            </div>
            <div className="rounded-xl bg-paneel-2 p-3 text-sm text-tekst-2 leading-relaxed">{VOORLEESTEKST}</div>
            <Opnemer onKlaar={(c, sec) => setOpname({ c, sec })} />
            {opname && (
              <div className="rounded-xl border border-rand p-3 space-y-1">
                <div className="text-xs text-tekst-3">Je opname ({Math.round(opname.sec)} s)</div>
                <audio src={opname.c.url ?? undefined} controls className="w-full h-9" />
                {opname.sec < MIN_OPNAME_SEC && <p className="text-xs text-red-500">Te kort: minimaal {MIN_OPNAME_SEC} seconden. Neem opnieuw op.</p>}
              </div>
            )}
            <input value={kloonNaam} onChange={(e) => setKloonNaam(e.target.value)} placeholder="Naam van je stem, bijv. Sam" className="n-invoer" />
            <label className="flex items-start gap-2 text-xs text-tekst-2 cursor-pointer">
              <input type="checkbox" checked={kloonToestemming} onChange={(e) => setKloonToestemming(e.target.checked)} className="mt-0.5" />
              <span>Dit is mijn eigen stem, of ik heb toestemming van de persoon die spreekt. Ik gebruik hem niet om iemand na te doen of te misleiden.</span>
            </label>
            <button
              onClick={() =>
                doe(async () => {
                  const c = await startMaker("stem-kloon", { naam: kloonNaam, audioUrl: opname!.c.url, toestemming: kloonToestemming });
                  klonen.zetVoor(c);
                  setOpname(null);
                  setKloonNaam("");
                  setKloonToestemming(false);
                })
              }
              disabled={bezig || !opname || opname.sec < MIN_OPNAME_SEC || !kloonNaam.trim() || !kloonToestemming}
              className="btn-primary w-full disabled:opacity-50"
            >
              ⭐ Train mijn stem · {KLOON_CREDITS} credits
            </button>
            <p className="text-[11px] text-tekst-3">Duurt meestal minder dan een minuut. Daarna kost spreken met je stem hetzelfde als met elke andere stem.</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-tekst-2 mb-3">Jouw stemmen</h2>
            <GeluidLijst
              lijst={klonen.creaties}
              onOpen={setOpen}
              extra={(c) => (
                <button
                  onClick={() => kies({ id: `${EIGEN}${c.id}`, naam: (c.invoer as { naam?: string }).naam ?? "Eigen stem", taal: "nl", omschrijving: "Eigen stem", voorbeeld: c.url ?? undefined })}
                  className="n-knop2 !py-1.5 !px-3 text-xs shrink-0"
                >
                  Gebruik
                </button>
              )}
            />
          </div>
        </div>
      )}

      {tab === "lipsync" && magKlonen && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-6 items-start">
          <div className="n-kaart space-y-4">
            <div>
              <label className="n-label">Foto (een duidelijk gezicht)</label>
              <div className="mt-1.5"><BeeldKiezer waarde={foto} onKies={setFoto} leeg="Kies of upload een foto" /></div>
            </div>
            <div>
              <label className="n-label">Wat zegt hij of zij?</label>
              <div className="mt-1.5 space-y-1.5 max-h-64 overflow-y-auto">
                {alleGeluid.creaties.filter((c) => c.status === "klaar" && c.url).map((c) => (
                  <label key={c.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer ${geluid?.id === c.id ? "border-blue-500 bg-blue-500/10" : "border-rand"}`}>
                    <input type="radio" checked={geluid?.id === c.id} onChange={() => setGeluid(c)} />
                    <span className="flex-1 text-xs text-tekst-2 line-clamp-2">{c.prompt}</span>
                    <button onClick={(e) => { e.preventDefault(); speel(c.url ?? undefined); }} className="text-xs text-blue-500">▶</button>
                  </label>
                ))}
                {alleGeluid.creaties.length === 0 && <p className="text-xs text-tekst-3">Nog geen geluid. Maak eerst een voice-over, of neem hieronder iets op.</p>}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <button onClick={() => setTab("voice-over")} className="text-xs text-blue-500">＋ Nieuwe voice-over maken</button>
              </div>
              <div className="mt-2"><Opnemer onKlaar={(c) => { alleGeluid.zetVoor(c); setGeluid(c); }} /></div>
            </div>
            <label className="flex items-start gap-2 text-xs text-tekst-2 cursor-pointer">
              <input type="checkbox" checked={fotoToestemming} onChange={(e) => setFotoToestemming(e.target.checked)} className="mt-0.5" />
              <span>Ik heb toestemming van wie er op de foto staat (of het is een door AI bedacht persoon).</span>
            </label>
            <button
              onClick={() =>
                doe(async () => {
                  const c = await startMaker("pratende-foto", { fotoUrl: foto!.url, audioUrl: geluid!.url, toestemming: fotoToestemming, formaat: foto!.formaat }, foto!.id ?? null);
                  pratend.zetVoor(c);
                })
              }
              disabled={bezig || !foto || !geluid || !fotoToestemming}
              className="btn-primary w-full disabled:opacity-50"
            >
              {!foto
                ? "Kies eerst een foto"
                : !geluid
                  ? "Kies eerst de voice-over hierboven"
                  : !fotoToestemming
                    ? "Vink eerst de toestemming aan"
                    : `🗣️ Laat de foto praten · ±${lipsyncCredits(geluidSec)} credits`}
            </button>
            <p className="text-[11px] text-tekst-3">Prijs naar lengte: per begonnen 5 seconden. Duurt meestal 2 tot 4 minuten.</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-tekst-2 mb-3">Jouw pratende foto&apos;s</h2>
            <GeluidLijst lijst={pratend.creaties} onOpen={setOpen} />
          </div>
        </div>
      )}

      {open && (
        <CreatieDetail
          creatie={open}
          onSluit={() => setOpen(null)}
          onGewijzigd={() => {}}
          onWeg={() => setOpen(null)}
          onNieuw={() => {}}
        />
      )}
    </div>
  );
}
