"use client";

import { useState } from "react";
import Link from "next/link";
import { METHODE_INFO, type PubliekeTrend } from "@/lib/trends/types";
import type { Creatie } from "@/lib/creaties/types";
import CreatieKaart from "@/components/creaties/CreatieKaart";
import CreatieDetail from "@/components/creaties/CreatieDetail";
import BeeldKiezer, { type GekozenBeeld } from "@/components/creaties/BeeldKiezer";
import { startMaker, useCreaties, zetFavoriet } from "@/components/creaties/gebruik-creaties";

// Het scherm van één trend: links de trend zelf en wat je aanlevert (één of twee foto's,
// soms een zinnetje), rechts je resultaten. Hoe hij gemaakt wordt, blijft op de server.

export default function TrendMaker({ trend: t, beheer = false }: { trend: PubliekeTrend; beheer?: boolean }) {
  const [fotos, setFotos] = useState<(GekozenBeeld | null)[]>(t.velden.fotos.map(() => null));
  const [tekst, setTekst] = useState("");
  const [toestemming, setToestemming] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [open, setOpen] = useState<Creatie | null>(null);

  const lijst = useCreaties({ maker: "trend", trend: t.id });
  const info = METHODE_INFO[t.methode];
  const metFoto = t.velden.fotos.length > 0;
  const klaar = fotos.every(Boolean) && (!t.velden.tekst?.verplicht || !!tekst.trim()) && (!t.gezicht || !metFoto || toestemming);
  const origineel = t.bron_links[0]?.url;

  async function maak() {
    setBezig(true);
    setFout(null);
    try {
      const c = await startMaker(
        "trend",
        { trendId: t.id, fotos: fotos.map((f) => f!.url), tekst, toestemming },
        fotos[0]?.id ?? null,
      );
      lijst.zetVoor(c);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  }

  async function alsVoorbeeld(c: Creatie) {
    setMelding(null);
    const res = await fetch("/api/admin/trends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actie: "voorbeeld", id: t.id, url: c.url, soort: c.soort }),
    });
    setMelding(res.ok ? "Staat nu als voorbeeld op de tegel." : "Dat lukte niet.");
  }

  return (
    <div className="space-y-10">
      <div className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">
        <div className="n-kaart space-y-5 lg:sticky lg:top-8">
          <Link href="/studios/trends" className="text-xs text-blue-500 hover:text-blue-400">← Trends</Link>
          {t.status !== "live" && (
            <p className="text-xs rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2">
              Nog niet live — alleen jij ziet dit. Probeer hem uit en zet hem daarna live op de keurpagina.
            </p>
          )}
          <div className="rounded-2xl p-4 bg-gradient-to-br from-orange-500/25 to-transparent">
            <div className="text-4xl">{t.icoon}</div>
            <h1 className="mt-2 text-xl font-bold text-tekst">{t.titel}</h1>
            <p className="text-sm text-tekst-2 mt-1">{t.uitleg}</p>
            {origineel && (
              <a href={origineel} target="_blank" rel="noreferrer" className="inline-block mt-2 text-xs text-blue-500 hover:text-blue-400">
                Bekijk de originele trend ↗
              </a>
            )}
          </div>

          {t.velden.fotos.map((f, i) => (
            <div key={i}>
              <label className="n-label">{f.label}</label>
              <div className="mt-1.5">
                <BeeldKiezer waarde={fotos[i]} onKies={(g) => setFotos(fotos.map((x, j) => (j === i ? g : x)))} leeg={f.label} />
              </div>
            </div>
          ))}

          {t.velden.tekst && (
            <div>
              <label className="n-label">{t.velden.tekst.label}{t.velden.tekst.verplicht ? "" : " (mag leeg)"}</label>
              <input value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder={t.velden.tekst.placeholder} className="n-invoer mt-1.5" />
            </div>
          )}

          {t.gezicht && metFoto && (
            // Regels vooraf in plaats van een controle achteraf: wie een gezicht gebruikt, bevestigt dat het mag.
            <label className="flex items-start gap-2 text-xs text-tekst-2 cursor-pointer">
              <input type="checkbox" checked={toestemming} onChange={(e) => setToestemming(e.target.checked)} className="mt-0.5" />
              <span>Dit ben ik zelf, of ik heb toestemming van wie er op de foto staat.</span>
            </label>
          )}

          <button onClick={maak} disabled={bezig || !klaar} className="btn-primary w-full disabled:opacity-50">
            {bezig ? "Bezig met insturen…" : `Maak na · ${t.credits} credits`}
          </button>
          {fout && (
            <p className="text-sm text-red-600 dark:text-red-300 bg-red-500/10 rounded-xl px-3 py-2">
              {fout}
              {fout === "Niet genoeg credits." && (
                <> <Link href="/pricing" className="underline">Credits bijkopen</Link></>
              )}
            </p>
          )}
          <p className="text-[11px] text-tekst-3">
            {info.soort === "video" ? "Een trendvideo duurt meestal 2 tot 6 minuten. Je kunt ondertussen gewoon verder." : "Meestal binnen een halve minuut klaar."}{" "}
            Mislukt het, dan krijg je je credits terug.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-tekst-2 mb-3">Jouw versies</h2>
          {melding && <p className="text-xs text-tekst-2 mb-2">{melding}</p>}
          {lijst.laden && lijst.creaties.length === 0 ? (
            <p className="text-sm text-tekst-3">Laden…</p>
          ) : lijst.creaties.length === 0 ? (
            t.voorbeeld_url || t.voorbeeldclip ? (
              <div className="n-kaart p-4 max-w-md">
                <p className="text-sm text-tekst-2 mb-3">{t.voorbeeld_url ? "Zo ziet het eruit:" : "Dit is de trend die je namaakt:"}</p>
                {t.voorbeeld_url && t.voorbeeld_soort === "beeld" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.voorbeeld_url} alt="Voorbeeld" className="w-full rounded-2xl border border-rand" />
                ) : (
                  <video src={t.voorbeeld_url ?? t.voorbeeldclip!} controls autoPlay muted loop playsInline className="w-full rounded-2xl border border-rand" />
                )}
                <p className="text-xs text-tekst-3 mt-3">{metFoto ? "Kies links je eigen foto en klik op Maak na." : "Vul links in wat je wilt en klik op Maak na."}</p>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-rand p-12 text-center text-tekst-3">
                <div className="text-4xl mb-3">{t.icoon}</div>
                {metFoto ? "Kies links een foto en klik op Maak na." : "Vul links in wat je wilt en klik op Maak na."}
              </div>
            )
          ) : (
            <div className="columns-1 sm:columns-2 gap-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
              {lijst.creaties.map((c) => (
                <div key={c.id}>
                  <CreatieKaart creatie={c} onOpen={() => setOpen(c)} onFavoriet={async () => lijst.werkBij(await zetFavoriet(c))} />
                  {beheer && c.status === "klaar" && c.url && (
                    <button onClick={() => alsVoorbeeld(c)} className="mt-1 text-xs text-blue-500 hover:text-blue-400">⭐ Gebruik als voorbeeld op de tegel</button>
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
          onNieuw={(c) => {
            if ((c.invoer as { trendId?: string }).trendId === t.id) lijst.zetVoor(c);
          }}
        />
      )}
    </div>
  );
}
