"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { METHODES, METHODE_INFO, MAX_CLIP_SEC, TREND_FORMATEN, type Methode, type Trend, type TrendOpdracht, type TrendVelden } from "@/lib/trends/types";

// De keurpagina van de Trends-studio: wat de speurtocht vond (of wat Sam zelf tipte)
// nalopen, aanpassen, de trendvideo erbij zetten, uitproberen en live zetten.

type Rij = Trend & { credits: number; nogNodig: string | null };
type Tab = "voorstel" | "live" | "archief" | "afgewezen";

const TABS: { id: Tab; label: string }[] = [
  { id: "voorstel", label: "Te keuren" },
  { id: "live", label: "Live" },
  { id: "archief", label: "Archief" },
  { id: "afgewezen", label: "Afgewezen" },
];

async function post(body: Record<string, unknown>): Promise<{ trends?: Rij[]; error?: string }> {
  const res = await fetch("/api/admin/trends", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  return res.ok ? d : { error: d.error ?? "Dat lukte niet." };
}

export default function TrendBeheer() {
  const [trends, setTrends] = useState<Rij[]>([]);
  const [tab, setTab] = useState<Tab>("voorstel");
  const [tip, setTip] = useState("");
  const [melding, setMelding] = useState<string | null>(null);

  const laad = useCallback(async () => {
    const d = await fetch("/api/admin/trends", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    setTrends(d.trends ?? []);
  }, []);
  useEffect(() => {
    laad();
  }, [laad]);

  async function zoek() {
    setMelding(null);
    const d = await post({ actie: "zoek" });
    setMelding(d.error ?? "Ik zoek nu wat er viral gaat (2 tot 5 minuten). Ververs de pagina straks voor de voorstellen.");
  }
  async function stuurTip() {
    setMelding(null);
    const d = await post({ actie: "tip", tip });
    if (d.error) return setMelding(d.error);
    setTip("");
    setMelding("Ik zoek deze trend uit (1 tot 3 minuten). Ververs de pagina straks; hij staat dan bij Te keuren.");
  }

  const zichtbaar = trends.filter((t) => t.status === tab);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <Link href="/studios/trends" className="text-xs text-blue-500 hover:text-blue-400">← Trends-studio</Link>
          <h1 className="text-3xl font-extrabold text-tekst tracking-tight">🔥 Trends keuren</h1>
          <p className="text-sm text-tekst-2 mt-1 max-w-2xl">
            Elke ochtend zoek ik wat er viral gaat en zet ik het hier klaar, met een maakmethode die bij die trend past. Klanten zien een trend pas als jij hem live zet.
          </p>
        </div>
        <button onClick={zoek} className="btn-primary text-sm self-start sm:self-auto">🔎 Zoek nu</button>
      </div>

      <div className="n-kaart flex flex-col sm:flex-row gap-2">
        <input
          value={tip}
          onChange={(e) => setTip(e.target.value)}
          placeholder="Zelf iets gezien? Plak een TikTok-link of beschrijf het: 'iedereen maakt de goal van Özil na'"
          className="n-invoer flex-1"
        />
        <button onClick={stuurTip} disabled={tip.trim().length < 8} className="n-knop2 text-sm disabled:opacity-50">Uitzoeken</button>
      </div>
      {melding && <p className="text-sm text-tekst-2 bg-paneel-2 rounded-xl px-3 py-2">{melding}</p>}

      <div className="flex gap-2 flex-wrap">
        {TABS.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={`rounded-full px-3 py-1 text-sm border ${tab === x.id ? "border-blue-500 bg-blue-500/10 text-tekst" : "border-rand text-tekst-2"}`}
          >
            {x.label} ({trends.filter((t) => t.status === x.id).length})
          </button>
        ))}
      </div>

      {zichtbaar.length === 0 ? (
        <p className="text-sm text-tekst-3">Niets hier.</p>
      ) : (
        <div className="space-y-4">
          {zichtbaar.map((t) => <TrendKaart key={`${t.id}-${t.updated_at}`} trend={t} onLijst={setTrends} />)}
        </div>
      )}
    </div>
  );
}

function TrendKaart({ trend: t, onLijst }: { trend: Rij; onLijst: (l: Rij[]) => void }) {
  const [titel, setTitel] = useState(t.titel);
  const [uitleg, setUitleg] = useState(t.uitleg);
  const [icoon, setIcoon] = useState(t.icoon);
  const [methode, setMethode] = useState<Methode>(t.methode);
  const [velden, setVelden] = useState<TrendVelden>(t.velden);
  const [opdracht, setOpdracht] = useState<TrendOpdracht>(t.opdracht);
  const [gezicht, setGezicht] = useState(t.gezicht);
  const [hotness, setHotness] = useState(t.hotness);
  const [start, setStart] = useState(0);
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [zekerWeg, setZekerWeg] = useState(false);

  const gewijzigd =
    titel !== t.titel || uitleg !== t.uitleg || icoon !== t.icoon || methode !== t.methode || gezicht !== t.gezicht || hotness !== t.hotness ||
    JSON.stringify(velden) !== JSON.stringify(t.velden) || JSON.stringify(opdracht) !== JSON.stringify(t.opdracht);
  const info = METHODE_INFO[methode];
  const zonderFoto = methode === "tekst-foto" || methode === "tekst-video";

  async function doe(body: Record<string, unknown>, label: string) {
    setBezig(label);
    setFout(null);
    const d = await post({ id: t.id, ...body });
    setBezig(null);
    if (d.error) return setFout(d.error);
    if (d.trends) onLijst(d.trends);
  }

  const bewaar = () => doe({ actie: "bewaar", wijziging: { titel, uitleg, icoon, methode, velden, opdracht, gezicht, hotness } }, "bewaar");

  // De video is te groot voor een serverfunctie (4,5 MB): de browser zet hem in de opslag,
  // daarna knipt de server het goede stuk eruit.
  async function uploadClip(f: File | undefined) {
    if (!f) return;
    if (f.size > 200 * 1024 * 1024) return setFout("De video mag maximaal 200 MB zijn.");
    setBezig("clip");
    setFout(null);
    try {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("Sessie ongeldig — log opnieuw in.");
      const pad = `${user.id}/creaties/${crypto.randomUUID()}.${(f.name.split(".").pop() || "mp4").toLowerCase()}`;
      const { error } = await sb.storage.from("scene-assets").upload(pad, f, { contentType: f.type || "video/mp4" });
      if (error) throw new Error(error.message);
      const url = sb.storage.from("scene-assets").getPublicUrl(pad).data.publicUrl;
      await doe({ actie: "clip", url, start }, "clip");
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
      setBezig(null);
    }
  }

  const veld = "w-full rounded-lg border border-rand bg-paneel px-2 py-1 text-sm text-tekst";

  return (
    <div className="n-kaart space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-tekst-3">
        <span className="rounded-full bg-paneel-2 px-2 py-0.5">{t.bron === "handmatig" ? "jouw tip" : "speurtocht"}</span>
        <span>{new Date(t.created_at).toLocaleDateString("nl-NL")}</span>
        <span>· {t.credits} credits per keer</span>
        {t.live_op && <span>· live sinds {new Date(t.live_op).toLocaleDateString("nl-NL")}</span>}
      </div>

      <div className="grid md:grid-cols-[1fr_260px] gap-4">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={icoon} onChange={(e) => setIcoon(e.target.value)} className={`${veld} w-14 text-center`} />
            <input value={titel} onChange={(e) => setTitel(e.target.value)} className={`${veld} font-semibold`} />
          </div>
          <label className="block text-xs text-tekst-3">Voor de klant
            <textarea value={uitleg} onChange={(e) => setUitleg(e.target.value)} rows={2} className={veld} />
          </label>
          {t.waarom_viral && <p className="text-xs text-tekst-2 whitespace-pre-wrap">🔍 {t.waarom_viral}</p>}
          {t.origineel && <p className="text-xs text-tekst-2">🛠️ {t.origineel}</p>}
          {t.bron_links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {t.bron_links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:text-blue-400 truncate max-w-[260px]">↗ {l.titel || l.url}</a>
              ))}
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-2">
            <label className="text-xs text-tekst-3 sm:col-span-2">Methode
              <select value={methode} onChange={(e) => setMethode(e.target.value as Methode)} className={veld}>
                {METHODES.map((m) => <option key={m} value={m}>{METHODE_INFO[m].naam}</option>)}
              </select>
            </label>
            <label className="text-xs text-tekst-3">Formaat
              <select value={opdracht.formaat ?? "9:16"} onChange={(e) => setOpdracht({ ...opdracht, formaat: e.target.value as TrendOpdracht["formaat"] })} className={veld}>
                {TREND_FORMATEN.map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-tekst-3">{info.wanneer}</p>

          {!zonderFoto && (
            <div className="space-y-1">
              <div className="text-xs text-tekst-3">Foto&apos;s van de klant</div>
              {(velden.fotos.length ? velden.fotos : [{ label: "" }]).map((f, i) => (
                <input
                  key={i}
                  value={f.label}
                  placeholder="Een foto van jezelf, van top tot teen"
                  onChange={(e) => {
                    const fotos = [...(velden.fotos.length ? velden.fotos : [{ label: "" }])];
                    fotos[i] = { label: e.target.value };
                    setVelden({ ...velden, fotos });
                  }}
                  className={veld}
                />
              ))}
              <div className="flex gap-3 text-xs">
                {velden.fotos.length < 2 && <button onClick={() => setVelden({ ...velden, fotos: [...velden.fotos, { label: "Nog een foto" }] })} className="text-blue-500">+ tweede foto</button>}
                {velden.fotos.length > 1 && <button onClick={() => setVelden({ ...velden, fotos: velden.fotos.slice(0, 1) })} className="text-tekst-3">− tweede foto weg</button>}
              </div>
            </div>
          )}
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <label className="text-xs text-tekst-3">Invulveld (leeg = geen)
              <input value={velden.tekst?.label ?? ""} onChange={(e) => setVelden({ ...velden, tekst: e.target.value ? { label: e.target.value, placeholder: velden.tekst?.placeholder ?? "", verplicht: velden.tekst?.verplicht } : null })} className={veld} />
            </label>
            <label className="text-xs text-tekst-3">Voorbeeldtekst
              <input value={velden.tekst?.placeholder ?? ""} disabled={!velden.tekst} onChange={(e) => setVelden({ ...velden, tekst: velden.tekst && { ...velden.tekst, placeholder: e.target.value } })} className={veld} />
            </label>
            <label className="text-xs text-tekst-2 flex items-center gap-1 pb-1">
              <input type="checkbox" disabled={!velden.tekst} checked={!!velden.tekst?.verplicht} onChange={(e) => setVelden({ ...velden, tekst: velden.tekst && { ...velden.tekst, verplicht: e.target.checked } })} /> verplicht
            </label>
          </div>

          <label className="block text-xs text-tekst-3">Beeldopdracht (scène, Engels; {"{tekst}"} = invulveld){methode === "beweging" || methode === "pratend" ? " — optioneel" : ""}
            <textarea value={opdracht.scenePrompt ?? ""} onChange={(e) => setOpdracht({ ...opdracht, scenePrompt: e.target.value })} rows={3} className={veld} />
          </label>
          {methode !== "foto" && methode !== "tekst-foto" && (
            <label className="block text-xs text-tekst-3">Bewegingsopdracht (Engels){methode === "beweging" || methode === "pratend" ? " — optioneel" : ""}
              <textarea value={opdracht.bewegingPrompt ?? ""} onChange={(e) => setOpdracht({ ...opdracht, bewegingPrompt: e.target.value })} rows={2} className={veld} />
            </label>
          )}
          <div className="flex flex-wrap gap-4 text-xs text-tekst-2">
            <label className="flex items-center gap-1"><input type="checkbox" checked={gezicht} onChange={(e) => setGezicht(e.target.checked)} /> herkenbaar gezicht (toestemmingsvinkje)</label>
            <label className="flex items-center gap-1">hotness <input type="number" min={1} max={10} value={hotness} onChange={(e) => setHotness(Number(e.target.value))} className={`${veld} w-16`} /></label>
          </div>
        </div>

        <div className="space-y-3">
          {info.clipNodig || t.voorbeeldclip ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-tekst-2">Trendvideo {info.clipNodig ? "(nodig)" : ""}</div>
              {t.voorbeeldclip ? (
                <>
                  <video src={t.voorbeeldclip} controls playsInline className="w-full rounded-xl border border-rand" />
                  <p className="text-[11px] text-tekst-3">{t.clip_sec} s{methode === "pratend" && !t.geluid ? " · geen geluid gevonden!" : ""}</p>
                  <button onClick={() => doe({ actie: "clip-weg" }, "clip")} className="text-xs text-tekst-3 hover:text-red-500">Video weghalen</button>
                </>
              ) : (
                <p className="text-[11px] text-tekst-3">Download de trendvideo (TikTok/Instagram) en zet hem hier. Ik knip er maximaal {MAX_CLIP_SEC} seconden uit.</p>
              )}
              <label className="text-[11px] text-tekst-3 flex items-center gap-1">vanaf seconde <input type="number" min={0} value={start} onChange={(e) => setStart(Number(e.target.value))} className={`${veld} w-16`} /></label>
              <label className="n-knop2 text-xs inline-block cursor-pointer">
                {bezig === "clip" ? "Bezig met knippen…" : t.voorbeeldclip ? "Andere video" : "Video uploaden"}
                <input type="file" accept="video/*" className="hidden" disabled={!!bezig} onChange={(e) => uploadClip(e.target.files?.[0])} />
              </label>
            </div>
          ) : null}
          {t.voorbeeld_url && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-tekst-2">Voorbeeld op de tegel</div>
              {t.voorbeeld_soort === "beeld" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.voorbeeld_url} alt="" className="w-full rounded-xl border border-rand" />
              ) : (
                <video src={t.voorbeeld_url} muted loop autoPlay playsInline className="w-full rounded-xl border border-rand" />
              )}
              <button onClick={() => doe({ actie: "voorbeeld", url: "" }, "voorbeeld")} className="text-xs text-tekst-3 hover:text-red-500">Voorbeeld weghalen</button>
            </div>
          )}
        </div>
      </div>

      {t.nogNodig && !gewijzigd && <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 rounded-lg px-3 py-2">⚠️ {t.nogNodig}</p>}
      {fout && <p className="text-xs text-red-600 dark:text-red-300 bg-red-500/10 rounded-lg px-3 py-2">{fout}</p>}

      <div className="flex flex-wrap gap-2">
        {gewijzigd && <button onClick={bewaar} disabled={!!bezig} className="btn-primary text-sm">{bezig === "bewaar" ? "Bewaren…" : "Bewaren"}</button>}
        {!gewijzigd && (
          <Link href={`/studios/trends/${t.id}`} className="n-knop2 text-sm">🧪 Uitproberen</Link>
        )}
        {!gewijzigd && t.status !== "live" && t.status !== "afgewezen" && (
          <button onClick={() => doe({ actie: "live" }, "live")} disabled={!!bezig || !!t.nogNodig} className="btn-primary text-sm disabled:opacity-50">✓ Live zetten</button>
        )}
        {t.status === "voorstel" && <button onClick={() => doe({ actie: "afgewezen" }, "status")} className="n-knop2 text-sm">Afwijzen</button>}
        {t.status === "live" && <button onClick={() => doe({ actie: "archief" }, "status")} className="n-knop2 text-sm">Uit de studio halen</button>}
        {(t.status === "archief" || t.status === "afgewezen") && <button onClick={() => doe({ actie: "voorstel" }, "status")} className="n-knop2 text-sm">Terug naar te keuren</button>}
        {zekerWeg ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-tekst-2">Echt verwijderen?</span>
            <button onClick={() => doe({ actie: "verwijder" }, "weg")} className="text-red-600 font-semibold">Ja, weg</button>
            <button onClick={() => setZekerWeg(false)} className="text-tekst-3">Nee</button>
          </span>
        ) : (
          <button onClick={() => setZekerWeg(true)} className="text-sm text-tekst-3 hover:text-red-500 ml-auto">Verwijderen</button>
        )}
      </div>
    </div>
  );
}
