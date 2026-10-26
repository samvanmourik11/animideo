"use client";

import { useState } from "react";
import Link from "next/link";
import type { Creatie } from "@/lib/creaties/types";
import CreatieKaart from "@/components/creaties/CreatieKaart";
import CreatieDetail from "@/components/creaties/CreatieDetail";
import BeeldKiezer, { type GekozenBeeld } from "@/components/creaties/BeeldKiezer";
import { startMaker, useCreaties, zetFavoriet } from "@/components/creaties/gebruik-creaties";
import {
  RECLAME_CREDITS,
  RECLAME_FORMATEN,
  STIJLEN,
  type Plan,
  type Product,
  type ReclameFormaat,
  type StijlId,
} from "@/lib/reclame/types";

// Link → reclame. Drie stappen op één scherm: link plakken, controleren wat we vonden,
// script bekijken. Pas bij de laatste knop kost het credits; lezen en script schrijven
// zijn gratis, zodat de klant rustig kan proberen.

const LEEG: Product = { naam: "", merk: "", omschrijving: "", voordelen: [], prijs: "", kleur: "#1c72ed", website: "", fotos: [] };

async function post<T>(pad: string, body: unknown): Promise<T> {
  const res = await fetch(pad, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Er ging iets mis. Probeer het opnieuw.");
  return data as T;
}

export default function ReclameMaker() {
  const [link, setLink] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [foto, setFoto] = useState<GekozenBeeld | null>(null);
  const [stijl, setStijl] = useState<StijlId>("strak");
  const [formaat, setFormaat] = useState<ReclameFormaat>("9:16");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [bezig, setBezig] = useState<null | "lezen" | "script" | "maken">(null);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState<Creatie | null>(null);

  const lijst = useCreaties({ maker: "reclame" });

  async function doe(wat: "lezen" | "script" | "maken", actie: () => Promise<void>) {
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

  function lees() {
    return doe("lezen", async () => {
      try {
        const { product: p } = await post<{ product: Product }>("/api/reclame/lees", { url: link });
        setProduct(p);
        setFoto(p.fotos[0] ? { url: p.fotos[0] } : null);
      } catch (e) {
        // Niet binnengelaten: dan toch door, met een leeg formulier en het domein al ingevuld.
        let website = "";
        try {
          website = new URL(/^https?:\/\//.test(link) ? link : `https://${link}`).hostname.replace(/^www\./, "");
        } catch {}
        setProduct({ ...LEEG, website });
        setFoto(null);
        throw e;
      }
      setPlan(null);
    });
  }

  function schrijf() {
    return doe("script", async () => {
      const { plan: p } = await post<{ plan: Plan }>("/api/reclame/plan", { product, stijl });
      setPlan(p);
    });
  }

  function maak() {
    return doe("maken", async () => {
      const c = await startMaker("reclame", { product, fotoUrl: foto!.url, stijl, formaat, plan }, foto!.id ?? null);
      lijst.zetVoor(c);
    });
  }

  function wijzig(veld: Partial<Product>) {
    setProduct((p) => (p ? { ...p, ...veld } : p));
  }
  function wijzigShot(i: number, tekst: string) {
    setPlan((p) => (p ? { ...p, shots: p.shots.map((s, j) => (j === i ? { ...s, tekst } : s)) } : p));
  }

  const voordelen = [0, 1, 2].map((i) => product?.voordelen[i] ?? "");
  const woorden = plan ? plan.voiceover.split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/apps" className="text-xs text-blue-500 hover:text-blue-400">← Apps</Link>
        <h1 className="mt-2 text-3xl font-extrabold text-tekst tracking-tight">🛍️ Link → reclame</h1>
        <p className="text-tekst-3 mt-1">
          Plak de link naar je product en krijg een reclamefilmpje van ±17 seconden: met je échte product, Nederlandse voice-over, muziek en je merkkleur.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] gap-6 items-start">
        <div className="space-y-4">
          {/* Stap 1 — de link */}
          <div className="n-kaart space-y-3">
            <h2 className="font-bold text-tekst">1. Link naar je product</h2>
            <div className="flex gap-2">
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && link.trim() && !bezig && lees()}
                placeholder="https://jouwwinkel.nl/product/..."
                className="n-invoer flex-1"
              />
              <button onClick={lees} disabled={!link.trim() || !!bezig} className="btn-primary shrink-0 disabled:opacity-50">
                {bezig === "lezen" ? "Lezen…" : "Lees pagina"}
              </button>
            </div>
            {!product && (
              <button onClick={() => setProduct(LEEG)} className="text-xs text-tekst-3 hover:text-tekst underline">
                Geen webwinkel? Vul het zelf in
              </button>
            )}
          </div>

          {/* Stap 2 — controleren wat we vonden */}
          {product && (
            <div className="n-kaart space-y-4">
              <h2 className="font-bold text-tekst">2. Klopt dit?</h2>

              <div>
                <label className="n-label">Productfoto — deze komt in elk shot</label>
                {product.fotos.length > 0 && (
                  <div className="mt-1.5 grid grid-cols-4 gap-2">
                    {product.fotos.slice(0, 8).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFoto({ url: f })}
                        className={`aspect-square rounded-xl overflow-hidden border-2 bg-white ${foto?.url === f ? "border-blue-500" : "border-transparent hover:border-rand"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f} alt="" className="w-full h-full object-contain" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-2">
                  <BeeldKiezer
                    waarde={foto && !product.fotos.includes(foto.url) ? foto : null}
                    onKies={(b) => setFoto(b)}
                    leeg={product.fotos.length ? "Of upload een eigen foto" : "Upload een foto van je product"}
                  />
                </div>
                <p className="text-[11px] text-tekst-3 mt-1.5">Het beste: één product, goed in beeld, liefst op een rustige achtergrond.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="n-label">Productnaam</label>
                  <input value={product.naam} onChange={(e) => wijzig({ naam: e.target.value })} className="n-invoer mt-1.5" />
                </div>
                <div>
                  <label className="n-label">Merk of bedrijf</label>
                  <input value={product.merk} onChange={(e) => wijzig({ merk: e.target.value })} className="n-invoer mt-1.5" />
                </div>
                <div>
                  <label className="n-label">Website (op de eindkaart)</label>
                  <input value={product.website} onChange={(e) => wijzig({ website: e.target.value })} placeholder="jouwwinkel.nl" className="n-invoer mt-1.5" />
                </div>
                <div className="col-span-2">
                  <label className="n-label">Wat is het, en voor wie?</label>
                  <textarea
                    value={product.omschrijving}
                    onChange={(e) => wijzig({ omschrijving: e.target.value })}
                    rows={2}
                    className="n-invoer mt-1.5 resize-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="n-label">Drie voordelen</label>
                  <div className="mt-1.5 space-y-1.5">
                    {voordelen.map((v, i) => (
                      <input
                        key={i}
                        value={v}
                        onChange={(e) => wijzig({ voordelen: voordelen.map((x, j) => (j === i ? e.target.value : x)) })}
                        placeholder={["Bijvoorbeeld: in 30 seconden klaar", "Bijvoorbeeld: gemaakt in Nederland", "Bijvoorbeeld: gratis bezorgd"][i]}
                        className="n-invoer"
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="n-label">Prijs (mag leeg)</label>
                  <input value={product.prijs} onChange={(e) => wijzig({ prijs: e.target.value })} className="n-invoer mt-1.5" />
                </div>
                <div>
                  <label className="n-label">Merkkleur</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      type="color"
                      value={product.kleur}
                      onChange={(e) => wijzig({ kleur: e.target.value })}
                      className="h-10 w-12 rounded-lg border border-rand bg-transparent cursor-pointer"
                    />
                    <span className="text-xs text-tekst-3">Voor de tekstbalkjes en de knop</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="n-label">Stijl</label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {STIJLEN.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStijl(s.id)}
                      className={`rounded-2xl border p-3 text-left transition-colors ${stijl === s.id ? "border-blue-500 bg-blue-500/10" : "border-rand hover:border-blue-500/40"}`}
                    >
                      <div className="text-xl">{s.icoon}</div>
                      <div className="text-sm font-semibold text-tekst mt-1">{s.naam}</div>
                      <div className="text-[11px] text-tekst-3 mt-0.5 leading-snug">{s.uitleg}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="n-label">Formaat</label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {RECLAME_FORMATEN.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFormaat(f.id)}
                      className={`rounded-xl border px-3 py-2 text-left ${formaat === f.id ? "border-blue-500 bg-blue-500/10" : "border-rand hover:border-blue-500/40"}`}
                    >
                      <div className="text-sm font-semibold text-tekst">{f.naam}</div>
                      <div className="text-[11px] text-tekst-3">{f.uitleg}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={schrijf} disabled={!product.naam.trim() || !!bezig} className={`${plan ? "n-knop2" : "btn-primary"} w-full disabled:opacity-50`}>
                {bezig === "script" ? "Script schrijven…" : plan ? "✍️ Schrijf een nieuw script · gratis" : "✍️ Schrijf het script · gratis"}
              </button>
            </div>
          )}

          {/* Stap 3 — het script */}
          {product && plan && (
            <div className="n-kaart space-y-4">
              <h2 className="font-bold text-tekst">3. Je reclame</h2>
              <div className="space-y-2">
                {plan.shots.map((s, i) => (
                  <div key={i} className="rounded-2xl border border-rand p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-tekst-3">
                      Shot {i + 1} · {["De haak", "Het voordeel", "Het product"][i]}
                    </div>
                    <p className="text-sm text-tekst-2 mt-1">{s.uitleg || s.beeld}</p>
                    <label className="block text-[11px] text-tekst-3 mt-2">Tekst in beeld</label>
                    <input value={s.tekst} onChange={(e) => wijzigShot(i, e.target.value)} maxLength={40} className="n-invoer mt-1" />
                  </div>
                ))}
                <div className="rounded-2xl border border-rand p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-tekst-3">Eindkaart</div>
                  <input
                    value={plan.eindtekst}
                    onChange={(e) => setPlan({ ...plan, eindtekst: e.target.value })}
                    maxLength={40}
                    placeholder="Bijvoorbeeld: Bestel nu online"
                    className="n-invoer mt-1.5"
                  />
                </div>
              </div>
              <div>
                <label className="n-label">Voice-over — Hugo spreekt dit in</label>
                <textarea
                  value={plan.voiceover}
                  onChange={(e) => setPlan({ ...plan, voiceover: e.target.value })}
                  rows={4}
                  className="n-invoer mt-1.5 resize-none"
                />
                <p className={`text-[11px] mt-1 ${woorden > 38 ? "text-red-500" : "text-tekst-3"}`}>
                  {woorden} woorden {woorden > 38 ? "— te lang voor 15 seconden, maak het korter" : "(hooguit 38)"}
                </p>
              </div>

              <button onClick={maak} disabled={!foto || !!bezig || woorden > 44} className="btn-primary w-full disabled:opacity-50">
                {bezig === "maken" ? "Bezig met insturen…" : `🎬 Maak de reclame · ${RECLAME_CREDITS} credits`}
              </button>
              {!foto && <p className="text-xs text-amber-600 dark:text-amber-300">Kies eerst een productfoto bij stap 2.</p>}
              <p className="text-[11px] text-tekst-3">
                Dit duurt meestal 3 tot 6 minuten. Je kunt ondertussen gewoon verder; de reclame komt vanzelf in je bibliotheek. Mislukt het, dan krijg je je credits terug.
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
          <h2 className="text-sm font-semibold text-tekst-2 mb-3">Jouw reclames</h2>
          {lijst.laden && lijst.creaties.length === 0 ? (
            <p className="text-sm text-tekst-3">Laden…</p>
          ) : lijst.creaties.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-rand p-12 text-center text-tekst-3">
              <div className="text-4xl mb-3">🛍️</div>
              Plak links een link naar je product. Je reclames komen hier te staan.
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 items-start">
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
          onNieuw={(c) => c.maker === "reclame" && lijst.zetVoor(c)}
        />
      )}
    </div>
  );
}
