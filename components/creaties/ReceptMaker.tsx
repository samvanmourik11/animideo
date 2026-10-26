"use client";

import { useState } from "react";
import Link from "next/link";
import { branche, recept as zoekRecept, receptPad, RECEPTEN } from "@/lib/creaties/recepten";
import { voorbeeld } from "@/lib/creaties/voorbeelden";
import type { Creatie } from "@/lib/creaties/types";
import CreatieKaart from "./CreatieKaart";
import CreatieDetail from "./CreatieDetail";
import BeeldKiezer, { type GekozenBeeld } from "./BeeldKiezer";
import { startMaker, useCreaties, zetFavoriet } from "./gebruik-creaties";
import HuisstijlKiezer, { huisstijlVoorServer } from "./HuisstijlKiezer";

// Het scherm van één effect of app: foto erin, (soms) één zinnetje, klikken. De opdracht
// erachter blijft op de server; de klant ziet alleen wat hij moet aanleveren.

export default function ReceptMaker({ receptId }: { receptId: string }) {
  const r = zoekRecept(receptId)!;
  const v = voorbeeld(r.id);
  const [foto, setFoto] = useState<GekozenBeeld | null>(null);
  const [tekst, setTekst] = useState("");
  const [toestemming, setToestemming] = useState(false);
  const [formaat, setFormaat] = useState<string>(r.zonderFoto?.formaat ?? "1:1");
  const [huisstijl, setHuisstijl] = useState("");
  // Alleen bij de branche-sjablonen met een beeld als uitkomst: daar hoort de zaak in beeld.
  const metHuisstijl = r.groep === "branche" && r.soort !== "video";
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState<Creatie | null>(null);

  const lijst = useCreaties({ maker: "recept", recept: r.id });
  const klaar = (!!foto || !!r.zonderFoto) && (!r.tekst?.verplicht || !!tekst.trim()) && (!r.gezicht || toestemming);
  const b = branche(r.branche);
  const terug = b
    ? { href: `/branches/${b.id}`, label: b.naam }
    : r.groep === "effect"
      ? { href: "/effecten", label: "Effecten" }
      : { href: "/apps", label: "Apps" };
  // "Probeer ook": uit dezelfde hoek (dezelfde branche, of effecten bij effecten).
  const meer = RECEPTEN.filter((x) =>
    x.id !== r.id && (b ? x.branche === b.id : x.groep !== "branche" && (x.groep === "effect") === (r.groep === "effect")),
  ).slice(0, 4);

  async function maak() {
    setBezig(true);
    setFout(null);
    try {
      const c = r.zonderFoto
        ? await startMaker("recept", { receptId: r.id, tekst, formaat, ...(metHuisstijl ? huisstijlVoorServer(huisstijl) : {}) })
        : await startMaker(
            "recept",
            { receptId: r.id, fotoUrl: foto!.url, tekst, formaat: foto!.formaat, toestemming, ...(metHuisstijl ? huisstijlVoorServer(huisstijl) : {}) },
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
      <div className="grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] gap-6 items-start">
        <div className="n-kaart space-y-5 lg:sticky lg:top-8">
          <Link href={terug.href} className="text-xs text-blue-500 hover:text-blue-400">← {terug.label}</Link>
          <div className={`rounded-2xl p-4 bg-gradient-to-br ${r.kleur} to-transparent`}>
            <div className="text-4xl">{r.icoon}</div>
            <h1 className="mt-2 text-xl font-bold text-tekst">{r.naam}</h1>
            <p className="text-sm text-tekst-2 mt-1">{r.uitleg}</p>
          </div>

          {!r.zonderFoto && (
            <div>
              <label className="n-label">{r.fotoLabel}</label>
              <div className="mt-1.5">
                <BeeldKiezer waarde={foto} onKies={setFoto} leeg={r.fotoLabel} />
              </div>
            </div>
          )}

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

          {r.zonderFoto && (
            <div>
              <label className="n-label">Formaat</label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {[
                  { id: "1:1", naam: "Vierkant", uitleg: "Feed" },
                  { id: "9:16", naam: "Staand", uitleg: "Story, poster" },
                  { id: "16:9", naam: "Liggend", uitleg: "Website" },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFormaat(f.id)}
                    className={`rounded-xl border px-2 py-1.5 text-left ${formaat === f.id ? "border-blue-500 bg-blue-500/10" : "border-rand hover:border-blue-500/40"}`}
                  >
                    <div className="text-sm font-semibold text-tekst">{f.naam}</div>
                    <div className="text-[11px] text-tekst-3">{f.uitleg}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {r.gezicht && (
            // Regels vooraf in plaats van een controle achteraf: wie een gezicht gebruikt,
            // bevestigt dat het mag. Zo zetten we geen bekende of onwetende mensen in een effect.
            <label className="flex items-start gap-2 text-xs text-tekst-2 cursor-pointer">
              <input type="checkbox" checked={toestemming} onChange={(e) => setToestemming(e.target.checked)} className="mt-0.5" />
              <span>
                {/ouders/i.test(r.fotoLabel ?? "")
                  ? "Ik heb toestemming van de ouders van de kinderen op de foto."
                  : /groep|team|klas/i.test(r.fotoLabel ?? "")
                    ? "Ik heb toestemming van iedereen die op de foto staat."
                    : "Dit ben ik zelf, ik heb toestemming van wie er op de foto staat, of het is een door AI bedacht personage."}
              </span>
            </label>
          )}

          {metHuisstijl && <HuisstijlKiezer waarde={huisstijl} onKies={setHuisstijl} />}

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
              : "Meestal binnen een halve minuut klaar."}{" "}
            Mislukt het, dan krijg je je credits terug.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-tekst-2 mb-3">Jouw resultaten</h2>
          {lijst.laden && lijst.creaties.length === 0 ? (
            <p className="text-sm text-tekst-3">Laden…</p>
          ) : lijst.creaties.length === 0 ? (
            v ? (
              <div className="n-kaart p-4">
                <p className="text-sm text-tekst-2 mb-3">Zo ziet het eruit — links de foto die erin ging, rechts het resultaat:</p>
                <div className="grid grid-cols-[1fr_auto_1.6fr] items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={v.invoer} alt="Voor" className="w-full rounded-2xl border border-rand" />
                  <span className="text-2xl text-tekst-3">→</span>
                  {v.soort === "video" ? (
                    <video src={v.resultaat} autoPlay muted loop playsInline className="w-full rounded-2xl border border-rand" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.resultaat} alt="Na" className="w-full rounded-2xl border border-rand" />
                  )}
                </div>
                <p className="text-xs text-tekst-3 mt-3">Voorbeeld met een door AI bedachte persoon. Kies links je eigen foto en klik op Maak.</p>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-rand p-12 text-center text-tekst-3">
                <div className="text-4xl mb-3">{r.icoon}</div>
                {r.zonderFoto ? "Vul links de tekst in en klik op Maak." : "Kies links een foto en klik op Maak."}
              </div>
            )
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
                {voorbeeld(m.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={voorbeeld(m.id)!.soort === "video" ? voorbeeld(m.id)!.invoer : voorbeeld(m.id)!.resultaat} alt="" className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <span className="text-2xl">{m.icoon}</span>
                )}
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
