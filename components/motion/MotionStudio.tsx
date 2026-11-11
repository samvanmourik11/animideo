"use client";

import { useState } from "react";
import Link from "next/link";
import type { Creatie } from "@/lib/creaties/types";
import CreatieKaart from "@/components/creaties/CreatieKaart";
import CreatieDetail from "@/components/creaties/CreatieDetail";
import { startMaker, useCreaties, zetFavoriet } from "@/components/creaties/gebruik-creaties";
import {
  MOTION_FORMATEN,
  MOTION_LENGTES,
  MOTION_MUZIEK,
  maxWoorden,
  motionCredits,
  type MotionFormaat,
  type MotionLengte,
  type MotionPlan,
} from "@/lib/motion/types";

// Motion graphics-studio. Twee stappen op één scherm: vertellen waar de video over gaat,
// en het script nalopen. Pas de laatste knop kost credits; het script schrijven is gratis,
// zodat de klant het rustig kan bijsturen. Het script is hier het controlemoment: wat er
// staat, wordt gemaakt.

async function post<T>(pad: string, body: unknown): Promise<T> {
  const res = await fetch(pad, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Er ging iets mis. Probeer het opnieuw.");
  return data as T;
}

export default function MotionStudio() {
  const [onderwerp, setOnderwerp] = useState("");
  const [bedrijf, setBedrijf] = useState("");
  const [website, setWebsite] = useState("");
  const [kleur, setKleur] = useState("#1c72ed");
  const [kleur2, setKleur2] = useState("#ffc21a");
  const [formaat, setFormaat] = useState<MotionFormaat>("16:9");
  const [lengte, setLengte] = useState<MotionLengte>(30);
  const [muziek, setMuziek] = useState<string>(MOTION_MUZIEK[0].slug);
  const [plan, setPlan] = useState<MotionPlan | null>(null);
  const [bezig, setBezig] = useState<null | "script" | "maken">(null);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState<Creatie | null>(null);

  const lijst = useCreaties({ maker: "motion" });

  async function doe(wat: "script" | "maken", actie: () => Promise<void>) {
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
    return doe("script", async () => {
      const { plan: p } = await post<{ plan: MotionPlan }>("/api/motion/plan", { onderwerp, bedrijf, lengte, formaat });
      setPlan(p);
    });
  }

  function maak() {
    return doe("maken", async () => {
      const c = await startMaker("motion", { onderwerp, bedrijf, website, kleur, kleur2, formaat, lengte, muziek, plan });
      lijst.zetVoor(c);
    });
  }

  function wijzigScene(i: number, veld: Partial<MotionPlan["scenes"][number]>) {
    setPlan((p) => (p ? { ...p, scenes: p.scenes.map((s, j) => (j === i ? { ...s, ...veld } : s)) } : p));
  }
  function wijzigEind(veld: Partial<MotionPlan["eind"]>) {
    setPlan((p) => (p ? { ...p, eind: { ...p.eind, ...veld } } : p));
  }

  const woorden = plan ? [...plan.scenes.map((s) => s.tekst), plan.eind.tekst].join(" ").split(/\s+/).filter(Boolean).length : 0;
  const max = Math.round(maxWoorden(lengte) * 1.25);
  const teLang = woorden > max;
  const credits = motionCredits(lengte);
  const kanSchrijven = onderwerp.trim().length >= 10 && bedrijf.trim().length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-tekst tracking-tight">✨ Motion graphics</h1>
        <p className="text-tekst-3 mt-1 max-w-2xl">
          Een strakke uitlegvideo met bewegende vormen, cijfers en tekst, precies op de stem. Vertel waar het over gaat; wij schrijven het script,
          Hugo spreekt het in en de animatie wordt voor jouw verhaal getekend, in je eigen kleuren.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-6 items-start">
        <div className="space-y-4">
          {/* Stap 1 — waar gaat het over */}
          <div className="n-kaart space-y-4">
            <h2 className="font-bold text-tekst">1. Waar gaat de video over?</h2>
            <div>
              <label className="n-label">Onderwerp, of plak je eigen script</label>
              <textarea
                value={onderwerp}
                onChange={(e) => setOnderwerp(e.target.value)}
                rows={5}
                placeholder="Bijvoorbeeld: leg uit hoe ons onderhoudsabonnement voor cv-ketels werkt. Voor € 9,95 per maand komen we elk jaar langs en ben je verzekerd van hulp binnen 24 uur bij storing."
                className="n-invoer mt-1.5 resize-none"
              />
              <p className="text-[11px] text-tekst-3 mt-1">Hoe concreter (bedragen, stappen, voor wie), hoe beter de video. Cijfers en claims nemen we letterlijk over.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="n-label">Bedrijfsnaam</label>
                <input value={bedrijf} onChange={(e) => setBedrijf(e.target.value)} maxLength={40} className="n-invoer mt-1.5" />
              </div>
              <div>
                <label className="n-label">Website (op de eindkaart)</label>
                <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="jouwbedrijf.nl" className="n-invoer mt-1.5" />
              </div>
              <div>
                <label className="n-label">Merkkleur</label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input type="color" value={kleur} onChange={(e) => setKleur(e.target.value)} className="h-10 w-12 rounded-lg border border-rand bg-transparent cursor-pointer" />
                  <span className="text-xs text-tekst-3">De hoofdkleur van de video</span>
                </div>
              </div>
              <div>
                <label className="n-label">Tweede kleur</label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input type="color" value={kleur2} onChange={(e) => setKleur2(e.target.value)} className="h-10 w-12 rounded-lg border border-rand bg-transparent cursor-pointer" />
                  <span className="text-xs text-tekst-3">Voor accenten en de knop</span>
                </div>
              </div>
            </div>

            <div>
              <label className="n-label">Lengte</label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {MOTION_LENGTES.map((l) => (
                  <button
                    key={l.sec}
                    onClick={() => setLengte(l.sec)}
                    className={`rounded-xl border px-3 py-2 text-left ${lengte === l.sec ? "border-blue-500 bg-blue-500/10" : "border-rand hover:border-blue-500/40"}`}
                  >
                    <div className="text-sm font-semibold text-tekst">{l.naam}</div>
                    <div className="text-[11px] text-tekst-3 leading-snug">{l.uitleg}</div>
                    <div className="text-[11px] text-tekst-2 mt-1">{motionCredits(l.sec)} credits</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="n-label">Formaat</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {MOTION_FORMATEN.map((f) => (
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

            <div>
              <label className="n-label">Muziek</label>
              <select value={muziek} onChange={(e) => setMuziek(e.target.value)} className="n-invoer mt-1.5">
                {MOTION_MUZIEK.map((m) => (
                  <option key={m.slug} value={m.slug}>{m.naam}</option>
                ))}
              </select>
            </div>

            <button onClick={schrijf} disabled={!kanSchrijven || !!bezig} className={`${plan ? "n-knop2" : "btn-primary"} w-full disabled:opacity-50`}>
              {bezig === "script" ? "Script schrijven…" : plan ? "✍️ Schrijf een nieuw script · gratis" : "✍️ Schrijf het script · gratis"}
            </button>
          </div>

          {/* Stap 2 — het script nalopen */}
          {plan && (
            <div className="n-kaart space-y-4">
              <div>
                <h2 className="font-bold text-tekst">2. Je script</h2>
                <p className="text-xs text-tekst-3 mt-0.5">Pas gerust aan. Wat hier staat, wordt precies zo ingesproken en getekend.</p>
              </div>
              <div className="space-y-2">
                {plan.scenes.map((s, i) => (
                  <div key={i} className="rounded-2xl border border-rand p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-tekst-3">Scene {i + 1}</div>
                    <label className="block text-[11px] text-tekst-3 mt-2">Wat de stem zegt</label>
                    <textarea value={s.tekst} onChange={(e) => wijzigScene(i, { tekst: e.target.value })} rows={3} className="n-invoer mt-1 resize-none" />
                    <label className="block text-[11px] text-tekst-3 mt-2">Wat je ziet</label>
                    <textarea value={s.beeld} onChange={(e) => wijzigScene(i, { beeld: e.target.value })} rows={3} className="n-invoer mt-1 resize-none text-sm" />
                  </div>
                ))}
                <div className="rounded-2xl border border-rand p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-tekst-3">Eindkaart · met je logo, knop en website</div>
                  <label className="block text-[11px] text-tekst-3 mt-2">Wat de stem zegt</label>
                  <textarea value={plan.eind.tekst} onChange={(e) => wijzigEind({ tekst: e.target.value })} rows={2} className="n-invoer mt-1 resize-none" />
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="block text-[11px] text-tekst-3">Regel 1 in beeld</label>
                      <input value={plan.eind.regel1} onChange={(e) => wijzigEind({ regel1: e.target.value })} maxLength={34} className="n-invoer mt-1" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-tekst-3">Regel 2 in beeld</label>
                      <input value={plan.eind.regel2} onChange={(e) => wijzigEind({ regel2: e.target.value })} maxLength={34} className="n-invoer mt-1" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] text-tekst-3">Tekst op de knop</label>
                      <input value={plan.eind.knop} onChange={(e) => wijzigEind({ knop: e.target.value })} maxLength={30} className="n-invoer mt-1" />
                    </div>
                  </div>
                </div>
              </div>
              <p className={`text-[11px] ${teLang ? "text-red-500" : "text-tekst-3"}`}>
                {woorden} woorden {teLang ? `— te lang voor ±${lengte} seconden: maak het korter of kies een langere video` : `(ongeveer ${Math.round(woorden / 2.5)} seconden)`}
              </p>

              <button onClick={maak} disabled={!!bezig || teLang || !bedrijf.trim()} className="btn-primary w-full disabled:opacity-50">
                {bezig === "maken" ? "Bezig met insturen…" : `✨ Maak de video · ${credits} credits`}
              </button>
              <p className="text-[11px] text-tekst-3">
                Dit duurt meestal 10 tot 15 minuten: de animatie wordt speciaal voor jouw script getekend en daarna nagekeken. Je kunt ondertussen
                gewoon verder; de video komt vanzelf in je bibliotheek. Mislukt het, dan krijg je je credits terug.
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
          <h2 className="text-sm font-semibold text-tekst-2 mb-3">Jouw motion graphics</h2>
          {lijst.laden && lijst.creaties.length === 0 ? (
            <p className="text-sm text-tekst-3">Laden…</p>
          ) : lijst.creaties.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-rand p-12 text-center text-tekst-3">
              <div className="text-4xl mb-3">✨</div>
              Vertel links waar je video over gaat. Je video&apos;s komen hier te staan.
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
          onNieuw={(c) => c.maker === "motion" && lijst.zetVoor(c)}
        />
      )}
    </div>
  );
}
