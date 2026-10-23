"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// Overzicht van de vaste taken van de Regisseur. Aanmaken gaat in het gesprek ("maak dit
// elke maandag"); hier pauzeer je ze, pas je het maximum aan of laat je er een meteen draaien.

interface Taak {
  id: string;
  titel: string;
  opdracht: string;
  max_credits: number;
  actief: boolean;
  laatste_project: string | null;
  ritmeTekst: string;
  volgendeTekst: string;
  laatstTekst: string | null;
}

export default function VasteTaken() {
  const [taken, setTaken] = useState<Taak[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const laad = useCallback(async () => {
    const d = await fetch("/api/regisseur/taken", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    setTaken(d.taken ?? []);
  }, []);
  useEffect(() => {
    laad();
  }, [laad]);

  async function doe(id: string, body: Record<string, unknown>) {
    setBezig(id);
    setFout(null);
    const res = await fetch("/api/regisseur/taken", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    const d = await res.json().catch(() => ({}));
    setBezig(null);
    if (!res.ok) return setFout(d.error ?? "Dat lukte niet.");
    if (d.project) return (window.location.href = `/regisseur?project=${d.project}`);
    laad();
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <div>
        <Link href="/regisseur" className="text-sm text-tekst-3 hover:text-tekst">← Regisseur</Link>
        <h1 className="text-2xl font-bold text-tekst mt-2">🔁 Vaste taken</h1>
        <p className="text-sm text-tekst-2 mt-1">
          Dingen die de Regisseur op een vast moment zelf voor je maakt, bijvoorbeeld elke maandag drie Instagram-posts. Hij geeft per keer nooit meer uit dan het maximum; kost het meer, dan wacht hij op jou. Na elke keer krijg je een mail.
        </p>
      </div>
      {fout && <p className="text-sm text-red-600 dark:text-red-300">{fout}</p>}
      {taken === null ? (
        <p className="text-sm text-tekst-3">Laden…</p>
      ) : taken.length === 0 ? (
        <div className="n-kaart text-sm text-tekst-2 space-y-3">
          <p>Je hebt nog geen vaste taken. Vraag het de Regisseur, bijvoorbeeld:</p>
          <p className="italic text-tekst">&ldquo;Maak voortaan elke maandagochtend 3 Instagram-posts voor mijn bakkerij, in onze huisstijl.&rdquo;</p>
          <Link href="/regisseur" className="btn-primary inline-block">Naar de Regisseur</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {taken.map((t) => (
            <div key={t.id} className={`n-kaart space-y-3 ${t.actief ? "" : "opacity-70"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-tekst">{t.titel}</h2>
                  <p className="text-sm text-tekst-2">
                    {t.ritmeTekst} · max {t.max_credits} credits per keer
                  </p>
                  <p className="text-xs text-tekst-3 mt-1">
                    {t.actief ? `Volgende keer: ${t.volgendeTekst}` : "Gepauzeerd"}
                    {t.laatstTekst && (
                      <>
                        {" · "}Laatst: {t.laatste_project ? <Link href={`/regisseur?project=${t.laatste_project}`} className="underline">{t.laatstTekst}</Link> : t.laatstTekst}
                      </>
                    )}
                  </p>
                </div>
                <span className={`shrink-0 text-xs rounded-full px-2 py-0.5 ${t.actief ? "bg-green-500/15 text-green-700 dark:text-green-300" : "bg-paneel-2 text-tekst-3"}`}>
                  {t.actief ? "Actief" : "Gepauzeerd"}
                </span>
              </div>
              <button onClick={() => setOpen(open === t.id ? null : t.id)} className="text-xs text-tekst-3 hover:text-tekst">
                {open === t.id ? "Opdracht verbergen" : "Opdracht bekijken"}
              </button>
              {open === t.id && <p className="text-sm text-tekst-2 whitespace-pre-wrap rounded-xl bg-paneel-2 p-3">{t.opdracht}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <button disabled={bezig === t.id} onClick={() => doe(t.id, { actie: "nu" })} className="n-knop2 text-sm">▶ Nu uitvoeren</button>
                <button disabled={bezig === t.id} onClick={() => doe(t.id, { actie: "actief", actief: !t.actief })} className="n-knop2 text-sm">
                  {t.actief ? "⏸ Pauzeren" : "▶ Hervatten"}
                </button>
                <label className="flex items-center gap-1.5 text-sm text-tekst-2">
                  Max
                  <input
                    type="number"
                    min={1}
                    max={500}
                    defaultValue={t.max_credits}
                    onBlur={(e) => Number(e.target.value) !== t.max_credits && doe(t.id, { actie: "maximum", max_credits: Number(e.target.value) })}
                    className="w-20 rounded-lg border border-rand bg-paneel px-2 py-1 text-tekst"
                  />
                  credits
                </label>
                <button
                  disabled={bezig === t.id}
                  onClick={() => window.confirm(`"${t.titel}" weghalen? Wat al gemaakt is, blijft in je bibliotheek.`) && doe(t.id, { actie: "weg" })}
                  className="ml-auto text-sm text-red-600 dark:text-red-300 hover:underline"
                >
                  Weghalen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
