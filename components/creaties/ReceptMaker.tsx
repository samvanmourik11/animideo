"use client";

import { useState } from "react";
import Link from "next/link";
import { recept as zoekRecept, receptPad, RECEPTEN } from "@/lib/creaties/recepten";
import type { Creatie } from "@/lib/creaties/types";
import CreatieKaart from "./CreatieKaart";
import CreatieDetail from "./CreatieDetail";
import BeeldKiezer, { type GekozenBeeld } from "./BeeldKiezer";
import { startMaker, useCreaties, zetFavoriet } from "./gebruik-creaties";

// Het scherm van één effect of app: foto erin, (soms) één zinnetje, klikken. De opdracht
// erachter blijft op de server; de klant ziet alleen wat hij moet aanleveren.

export default function ReceptMaker({ receptId }: { receptId: string }) {
  const r = zoekRecept(receptId)!;
  const [foto, setFoto] = useState<GekozenBeeld | null>(null);
  const [tekst, setTekst] = useState("");
  const [toestemming, setToestemming] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState<Creatie | null>(null);

  const lijst = useCreaties({ maker: "recept", recept: r.id });
  const klaar = !!foto && (!r.tekst?.verplicht || !!tekst.trim()) && (!r.gezicht || toestemming);
  const terug = r.groep === "effect" ? { href: "/effecten", label: "Effecten" } : { href: "/apps", label: "Apps" };
  const meer = RECEPTEN.filter((x) => x.id !== r.id && (x.groep === "effect") === (r.groep === "effect")).slice(0, 4);

  async function maak() {
    setBezig(true);
    setFout(null);
    try {
      const c = await startMaker(
        "recept",
        { receptId: r.id, fotoUrl: foto!.url, tekst, formaat: foto!.formaat, toestemming },
        foto!.id ?? null,
      );
      lijst.zetVoor(c);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-10">
      <div className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">
        <div className="n-kaart space-y-5 lg:sticky lg:top-8">
          <Link href={terug.href} className="text-xs text-blue-500 hover:text-blue-400">← {terug.label}</Link>
          <div className={`rounded-2xl p-4 bg-gradient-to-br ${r.kleur} to-transparent`}>
            <div className="text-4xl">{r.icoon}</div>
            <h1 className="mt-2 text-xl font-bold text-tekst">{r.naam}</h1>
            <p className="text-sm text-tekst-2 mt-1">{r.uitleg}</p>
          </div>

          <div>
            <label className="n-label">{r.fotoLabel}</label>
            <div className="mt-1.5">
              <BeeldKiezer waarde={foto} onKies={setFoto} leeg={r.fotoLabel} />
            </div>
          </div>

          {r.tekst && (
            <div>
              <label className="n-label">{r.tekst.label}</label>
              <input
                value={tekst}
                onChange={(e) => setTekst(e.target.value)}
                placeholder={r.tekst.placeholder}
                className="n-invoer mt-1.5"
              />
            </div>
          )}

          {r.gezicht && (
            // Regels vooraf in plaats van een controle achteraf: wie een gezicht gebruikt,
            // bevestigt dat het mag. Zo zetten we geen bekende of onwetende mensen in een effect.
            <label className="flex items-start gap-2 text-xs text-tekst-2 cursor-pointer">
              <input type="checkbox" checked={toestemming} onChange={(e) => setToestemming(e.target.checked)} className="mt-0.5" />
              <span>Dit ben ik zelf, of ik heb toestemming van wie er op de foto staat.</span>
            </label>
          )}

          <button onClick={maak} disabled={bezig || !klaar} className="btn-primary w-full disabled:opacity-50">
            {bezig ? "Bezig met insturen…" : `Maak · ${r.credits} credit${r.credits === 1 ? "" : "s"}`}
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
            {r.soort === "video"
              ? "Een effect duurt meestal 1 tot 3 minuten. Je kunt ondertussen gewoon verder."
              : "Meestal binnen 20 seconden klaar."}{" "}
            Mislukt het, dan krijg je je credits terug.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-tekst-2 mb-3">Jouw resultaten</h2>
          {lijst.laden && lijst.creaties.length === 0 ? (
            <p className="text-sm text-tekst-3">Laden…</p>
          ) : lijst.creaties.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-rand p-12 text-center text-tekst-3">
              <div className="text-4xl mb-3">{r.icoon}</div>
              Kies links een foto en klik op Maak.
            </div>
          ) : (
            <div className="columns-1 sm:columns-2 gap-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
              {lijst.creaties.map((c) => (
                <CreatieKaart
                  key={c.id}
                  creatie={c}
                  onOpen={() => setOpen(c)}
                  onFavoriet={async () => lijst.werkBij(await zetFavoriet(c))}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {meer.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-tekst-2 mb-3">Probeer ook</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {meer.map((m) => (
              <Link key={m.id} href={receptPad(m)} className="flex items-center gap-3 rounded-2xl border border-rand bg-paneel p-3 hover:border-blue-500/50">
                <span className="text-2xl">{m.icoon}</span>
                <span className="text-sm font-medium text-tekst">{m.naam}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {open && (
        <CreatieDetail
          creatie={lijst.creaties.find((c) => c.id === open.id) ?? open}
          onSluit={() => setOpen(null)}
          onGewijzigd={lijst.werkBij}
          onWeg={lijst.haalWeg}
          onNieuw={(c) => {
            if ((c.invoer as { receptId?: string }).receptId === r.id) lijst.zetVoor(c);
          }}
        />
      )}
    </div>
  );
}
