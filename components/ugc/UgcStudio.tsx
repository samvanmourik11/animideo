"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Creatie } from "@/lib/creaties/types";
import CreatieKaart from "@/components/creaties/CreatieKaart";
import CreatieDetail from "@/components/creaties/CreatieDetail";
import BeeldKiezer, { type GekozenBeeld } from "@/components/creaties/BeeldKiezer";
import { startMaker, useCreaties, zetFavoriet } from "@/components/creaties/gebruik-creaties";
import { CREATORS } from "@/lib/ugc/creators";
import { voicePreviewUrl } from "@/lib/infographics/story-voices";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import {
  UGC_LENGTES,
  UGC_STEMMEN,
  geschatteUgcCredits,
  stukjeCredits,
  ugcCredits,
  type Creator,
  type UgcLengte,
  type UgcScript,
} from "@/lib/ugc/types";

// De UGC-studio. Vier stappen op één scherm: waar gaat het over, wie vertelt het, hoe
// lang, en het script. Lezen en script schrijven zijn gratis; pas "Maak de video" kost
// credits. Rechts de video's die je al maakte.

interface Onderwerp {
  naam: string;
  omschrijving: string;
  voordelen: string[];
  website: string;
}
const LEEG: Onderwerp = { naam: "", omschrijving: "", voordelen: [], website: "" };

async function post<T>(pad: string, body: unknown): Promise<T> {
  const res = await fetch(pad, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Er ging iets mis. Probeer het opnieuw.");
  return data as T;
}

export default function UgcStudio() {
  const [soort, setSoort] = useState<"product" | "dienst">("product");
  const [link, setLink] = useState("");
  const [onderwerp, setOnderwerp] = useState<Onderwerp>(LEEG);
  const [fotos, setFotos] = useState<string[]>([]);
  const [foto, setFoto] = useState<GekozenBeeld | null>(null);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [sec, setSec] = useState<UgcLengte>(15);
  const [broll, setBroll] = useState(true);
  const [script, setScript] = useState<UgcScript | null>(null);
  const [bezig, setBezig] = useState<null | "lezen" | "script" | "maken" | "creator">(null);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState<Creatie | null>(null);
  const [nieuweCreator, setNieuweCreator] = useState(false);
  const [cNaam, setCNaam] = useState("");
  const [cBeschrijving, setCBeschrijving] = useState("");
  const [cStem, setCStem] = useState(UGC_STEMMEN[0].id);
  const speler = useRef<HTMLAudioElement | null>(null);

  const videos = useCreaties({ maker: "ugc" });
  const eigen = useCreaties({ maker: "ugc-creator" });

  const eigenCreators: (Creator & { bezig?: boolean })[] = useMemo(
    () =>
      eigen.creaties
        .filter((c) => c.status !== "mislukt")
        .map((c) => {
          const inv = c.invoer as { naam?: string; beschrijving?: string; stem?: string };
          return {
            id: c.id,
            naam: inv.naam ?? "Creator",
            omschrijving: "eigen creator",
            portretUrl: c.url ?? "",
            stem: inv.stem ?? UGC_STEMMEN[0].id,
            persona: inv.beschrijving ?? "",
            eigen: true,
            bezig: c.status === "bezig",
          };
        }),
    [eigen.creaties],
  );
  const alle = [...eigenCreators, ...CREATORS];
  const creator = alle.find((c) => c.id === creatorId && !("bezig" in c && c.bezig)) ?? null;

  async function doe(wat: NonNullable<typeof bezig>, actie: () => Promise<void>) {
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
      const { product } = await post<{ product: Onderwerp & { fotos: string[] } }>("/api/reclame/lees", { url: link });
      setOnderwerp({ naam: product.naam, omschrijving: product.omschrijving, voordelen: product.voordelen, website: product.website });
      setFotos(product.fotos);
      setFoto(product.fotos[0] ? { url: product.fotos[0] } : null);
      setScript(null);
    });
  }

  function speel(stem: string) {
    speler.current?.pause();
    speler.current = new Audio(voicePreviewUrl(stem));
    speler.current.play().catch(() => {});
  }

  function maakCreator() {
    return doe("creator", async () => {
      const c = await startMaker("ugc-creator", { naam: cNaam, beschrijving: cBeschrijving, stem: cStem });
      eigen.zetVoor(c);
      setNieuweCreator(false);
      setCNaam("");
      setCBeschrijving("");
    });
  }

  const metProduct = soort === "product" && !!foto;
  const invoerOnderwerp = { ...onderwerp, voordelen: onderwerp.voordelen.filter(Boolean) };

  function schrijf() {
    return doe("script", async () => {
      const { script: s } = await post<{ script: UgcScript }>("/api/ugc/script", {
        onderwerp: invoerOnderwerp,
        metProduct,
        creator: creatorId,
        sec,
        broll,
      });
      setScript(s);
    });
  }

  function maak() {
    return doe("maken", async () => {
      const c = await startMaker(
        "ugc",
        { onderwerp: invoerOnderwerp, fotoUrl: metProduct ? foto!.url : "", creator: creatorId, sec, broll, script },
        metProduct ? foto!.id ?? null : null,
      );
      videos.zetVoor(c);
    });
  }

  const voordelen = [0, 1, 2].map((i) => onderwerp.voordelen[i] ?? "");
  const kosten = script ? ugcCredits(script) : geschatteUgcCredits(sec, broll);
  const klaarVoorScript = !!onderwerp.naam.trim() && !!creator;

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-tekst-3">Studio</div>
        <h1 className="text-3xl font-extrabold text-tekst tracking-tight">🤳 UGC-studio</h1>
        <p className="text-tekst-3 mt-1 max-w-2xl">
          Een AI-creator vertelt over je product of dienst, zoals een echte klant op TikTok of Instagram. Met Nederlandse stem en meelopende ondertitels.
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,560px)_1fr] gap-6 items-start">
        <div className="space-y-4">
          {/* 1. Waar gaat het over */}
          <div className="n-kaart space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-tekst">1. Waar gaat het over?</h2>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-paneel-2 p-1 text-xs">
                {(["product", "dienst"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSoort(s); setScript(null); }}
                    className={`rounded-lg px-3 py-1.5 ${soort === s ? "bg-paneel text-tekst font-semibold shadow-sm" : "text-tekst-3"}`}
                  >
                    {s === "product" ? "📦 Product" : "🛠️ Dienst"}
                  </button>
                ))}
              </div>
            </div>

            {soort === "product" && (
              <div className="flex gap-2">
                <input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && link.trim() && !bezig && lees()}
                  placeholder="Link naar je product (mag leeg)"
                  className="n-invoer flex-1"
                />
                <button onClick={lees} disabled={!link.trim() || !!bezig} className="n-knop2 shrink-0 disabled:opacity-50">
                  {bezig === "lezen" ? "Lezen…" : "Lees pagina"}
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="n-label">{soort === "product" ? "Productnaam" : "Naam van je dienst of bedrijf"}</label>
                <input
                  value={onderwerp.naam}
                  onChange={(e) => setOnderwerp({ ...onderwerp, naam: e.target.value })}
                  placeholder={soort === "product" ? "Bijvoorbeeld: Barista Pro 3000" : "Bijvoorbeeld: Schoonmaakbedrijf Glans"}
                  className="n-invoer mt-1.5"
                />
              </div>
              <div className="col-span-2">
                <label className="n-label">Wat is het, en voor wie?</label>
                <textarea
                  value={onderwerp.omschrijving}
                  onChange={(e) => setOnderwerp({ ...onderwerp, omschrijving: e.target.value })}
                  rows={2}
                  className="n-invoer mt-1.5 resize-none"
                />
              </div>
              <div className="col-span-2">
                <label className="n-label">Voordelen (mag leeg)</label>
                <div className="mt-1.5 space-y-1.5">
                  {voordelen.map((v, i) => (
                    <input
                      key={i}
                      value={v}
                      onChange={(e) => setOnderwerp({ ...onderwerp, voordelen: voordelen.map((x, j) => (j === i ? e.target.value : x)) })}
                      placeholder={`Voordeel ${i + 1}`}
                      className="n-invoer"
                    />
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className="n-label">Website (mag leeg)</label>
                <input value={onderwerp.website} onChange={(e) => setOnderwerp({ ...onderwerp, website: e.target.value })} placeholder="jouwbedrijf.nl" className="n-invoer mt-1.5" />
              </div>
            </div>

            {soort === "product" && (
              <div>
                <label className="n-label">Productfoto — de creator houdt dit vast</label>
                {fotos.length > 0 && (
                  <div className="mt-1.5 grid grid-cols-6 gap-1.5">
                    {fotos.slice(0, 6).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFoto({ url: f })}
                        className={`aspect-square rounded-lg overflow-hidden border-2 bg-white ${foto?.url === f ? "border-blue-500" : "border-transparent"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f} alt="" className="w-full h-full object-contain" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-2">
                  <BeeldKiezer waarde={foto && !fotos.includes(foto.url) ? foto : null} onKies={setFoto} leeg="Upload een foto van je product" />
                </div>
              </div>
            )}
          </div>

          {/* 2. Creator */}
          <div className="n-kaart space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-tekst">2. Kies je creator</h2>
              <button onClick={() => setNieuweCreator((x) => !x)} className="text-xs text-blue-500 hover:text-blue-400">
                {nieuweCreator ? "Annuleren" : "＋ Eigen creator maken"}
              </button>
            </div>

            {nieuweCreator && (
              <div className="rounded-2xl border border-rand p-3 space-y-2">
                <input value={cNaam} onChange={(e) => setCNaam(e.target.value)} placeholder="Naam, bijv. Mark" className="n-invoer" />
                <textarea
                  value={cBeschrijving}
                  onChange={(e) => setCBeschrijving(e.target.value)}
                  rows={2}
                  placeholder="Wie is het? Bijv. man van 38, kort bruin haar, bril, blauw overhemd, vriendelijk"
                  className="n-invoer resize-none"
                />
                <div className="flex gap-2">
                  <select value={cStem} onChange={(e) => setCStem(e.target.value)} className="n-invoer flex-1">
                    {UGC_STEMMEN.map((s) => (
                      <option key={s.id} value={s.id}>{s.naam} · {s.geslacht} · {s.omschrijving}</option>
                    ))}
                  </select>
                  <button onClick={() => speel(cStem)} className="n-knop2 shrink-0" aria-label="Stem beluisteren">▶</button>
                </div>
                <p className="text-[11px] text-tekst-3">Altijd een verzonnen persoon: bekende of bestaande mensen kun je niet namaken.</p>
                <button onClick={maakCreator} disabled={!!bezig || !cNaam.trim() || cBeschrijving.trim().length < 10} className="btn-primary w-full disabled:opacity-50">
                  {bezig === "creator" ? "Bezig…" : `Maak creator · ${CREDIT_COSTS.IMAGE_GENERATION_PRO} credits`}
                </button>
              </div>
            )}

            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {alle.map((c) => {
                const laden = "bezig" in c && c.bezig;
                return (
                  <div key={c.id} className="relative">
                    <button
                      disabled={!!laden}
                      onClick={() => { setCreatorId(c.id); setScript(null); }}
                      className={`block w-full aspect-[3/4] rounded-xl overflow-hidden border-2 ${creatorId === c.id ? "border-blue-500" : "border-transparent hover:border-rand"}`}
                    >
                      {laden || !c.portretUrl ? (
                        <div className="w-full h-full bg-paneel-2 flex items-center justify-center">
                          <div className="w-5 h-5 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.portretUrl} alt={c.naam} className="w-full h-full object-cover" />
                      )}
                    </button>
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-tekst truncate">{c.naam}</div>
                        <div className="text-[10px] text-tekst-3 truncate">{c.omschrijving}</div>
                      </div>
                      <button onClick={() => speel(c.stem)} className="text-[10px] text-tekst-3 hover:text-tekst shrink-0" aria-label={`Stem van ${c.naam}`}>
                        ▶
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Lengte */}
          <div className="n-kaart space-y-3">
            <h2 className="font-bold text-tekst">3. Hoe lang?</h2>
            <div className="grid grid-cols-3 gap-2">
              {UGC_LENGTES.map((l) => (
                <button
                  key={l.sec}
                  onClick={() => { setSec(l.sec); setScript(null); }}
                  className={`rounded-xl border px-3 py-2 text-left ${sec === l.sec ? "border-blue-500 bg-blue-500/10" : "border-rand hover:border-blue-500/40"}`}
                >
                  <div className="text-sm font-semibold text-tekst">{l.naam}</div>
                  <div className="text-[11px] text-tekst-3">{l.uitleg}</div>
                </button>
              ))}
            </div>
            <label className="flex items-start gap-2 text-sm text-tekst-2 cursor-pointer">
              <input type="checkbox" checked={broll} onChange={(e) => { setBroll(e.target.checked); setScript(null); }} className="mt-1" />
              <span>
                Productbeelden tussendoor (B-roll)
                <span className="block text-[11px] text-tekst-3">Close-ups van je {soort} terwijl de stem doorloopt. Voelt echter aan.</span>
              </span>
            </label>
            <button onClick={schrijf} disabled={!klaarVoorScript || !!bezig} className={`${script ? "n-knop2" : "btn-primary"} w-full disabled:opacity-50`}>
              {bezig === "script" ? "Script schrijven…" : script ? "✍️ Schrijf een nieuw script · gratis" : "✍️ Schrijf het script · gratis"}
            </button>
            {!klaarVoorScript && <p className="text-[11px] text-tekst-3">Vul eerst een naam in en kies een creator.</p>}
          </div>

          {/* 4. Script */}
          {script && (
            <div className="n-kaart space-y-3">
              <h2 className="font-bold text-tekst">4. Het script</h2>
              <p className="text-xs text-tekst-3">Pas aan wat {creator?.naam ?? "de creator"} zegt. Spreektaal werkt het best.</p>
              {script.stukjes.map((s, i) => (
                <div key={i} className="rounded-2xl border border-rand p-3">
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-tekst-3">
                    <span>{i === 0 ? "De haak" : s.soort === "broll" ? "Productbeeld" : `Stukje ${i + 1}`}{s.soort === "broll" ? " · stem loopt door" : ""}</span>
                    <span className="normal-case font-normal">{stukjeCredits(s)} cr.</span>
                  </div>
                  <p className="text-xs text-tekst-3 mt-1">{s.uitleg}</p>
                  <textarea
                    value={s.tekst}
                    onChange={(e) => setScript({ stukjes: script.stukjes.map((x, j) => (j === i ? { ...x, tekst: e.target.value } : x)) })}
                    rows={2}
                    className="n-invoer mt-1.5 resize-none"
                  />
                </div>
              ))}
              <button onClick={maak} disabled={!!bezig || !creator} className="btn-primary w-full disabled:opacity-50">
                {bezig === "maken" ? "Bezig met insturen…" : `🎬 Maak de video · ${kosten} credits`}
              </button>
              <p className="text-[11px] text-tekst-3">
                Duurt meestal 4 tot 8 minuten. Je kunt ondertussen gewoon verder; de video komt vanzelf in je bibliotheek. Mislukt het, dan krijg je je credits terug.
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
          <h2 className="text-sm font-semibold text-tekst-2 mb-3">Jouw UGC-video&apos;s</h2>
          {videos.laden && videos.creaties.length === 0 ? (
            <p className="text-sm text-tekst-3">Laden…</p>
          ) : videos.creaties.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-rand p-12 text-center text-tekst-3">
              <div className="text-4xl mb-3">🤳</div>
              Je video&apos;s komen hier te staan.
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 items-start">
              {videos.creaties.map((c) => (
                <CreatieKaart key={c.id} creatie={c} onOpen={() => setOpen(c)} onFavoriet={async () => videos.werkBij(await zetFavoriet(c))} />
              ))}
            </div>
          )}
        </div>
      </div>

      {open && (
        <CreatieDetail
          creatie={videos.creaties.find((c) => c.id === open.id) ?? open}
          onSluit={() => setOpen(null)}
          onGewijzigd={videos.werkBij}
          onWeg={videos.haalWeg}
          onNieuw={(c) => c.maker === "ugc" && videos.zetVoor(c)}
        />
      )}
    </div>
  );
}
