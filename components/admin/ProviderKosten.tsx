"use client";

import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/admin/primitives";
import type { KostenSamenvatting } from "@/lib/admin/provider-kosten";

// Wat fal ons kost, naast wat abonnementen opleveren. Credits laten alleen zien
// wat klanten betalen; demo's en eigen content op de interne accounts kosten ook
// geld en schrijven niets af. Dit blok maakt dat zichtbaar.

const eur = (n: number) => n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });

export default function ProviderKosten() {
  const [data, setData] = useState<KostenSamenvatting | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/provider-kosten", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Fout ${r.status}`);
        setData(j);
      })
      .catch((e) => setFout(e instanceof Error ? e.message : "Onbekende fout"));
  }, []);

  if (fout) {
    return (
      <Card className="border-amber-500/20">
        <SectionTitle>Kosten AI-leveranciers (fal)</SectionTitle>
        <p className="text-amber-400 text-sm">{fout}</p>
      </Card>
    );
  }
  if (!data) return null;

  const boven = data.vandaagEur > data.daggrensEur;
  const hoogste = Math.max(1, ...data.perDag.map((d) => d.eur));

  return (
    <Card className={boven ? "border-red-500/30" : ""}>
      <SectionTitle right={<span className="text-xs text-slate-500">schatting op fal-tarieven</span>}>
        Kosten AI-leveranciers (fal)
      </SectionTitle>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Tegel label="Vandaag" waarde={eur(data.vandaagEur)} rood={boven} sub={boven ? `boven de daggrens van ${eur(data.daggrensEur)}` : `daggrens ${eur(data.daggrensEur)}`} />
        <Tegel label="Laatste 7 dagen" waarde={eur(data.zevenDagenEur)} />
        <Tegel label="Laatste 30 dagen" waarde={eur(data.dertigDagenEur)} />
        <Tegel label="Intern (eigen accounts)" waarde={`${data.internAandeel}%`} sub="van de laatste 7 dagen" />
      </div>

      <div className="flex items-end gap-2 h-24 mb-1">
        {data.perDag.map((d) => (
          <div key={d.dag} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.dag}: ${eur(d.eur)}`}>
            <div
              className={`w-full rounded-t ${d.eur > data.daggrensEur ? "bg-red-400/70" : "bg-blue-400/60"}`}
              style={{ height: `${Math.max(2, (d.eur / hoogste) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mb-5">
        {data.perDag.map((d) => (
          <div key={d.dag} className="flex-1 text-center text-[10px] text-slate-500">
            {new Date(d.dag).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric" })}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Lijst titel="Per account (7 dagen)" posten={data.perAccount} />
        <Lijst titel="Per soort actie (7 dagen)" posten={data.perActie} />
      </div>
    </Card>
  );
}

function Tegel({ label, waarde, sub, rood }: { label: string; waarde: string; sub?: string; rood?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-lg font-semibold ${rood ? "text-red-400" : "text-white"}`}>{waarde}</div>
      {sub && <div className={`text-[10px] ${rood ? "text-red-400/80" : "text-slate-500"}`}>{sub}</div>}
    </div>
  );
}

function Lijst({ titel, posten }: { titel: string; posten: KostenSamenvatting["perAccount"] }) {
  return (
    <div>
      <div className="text-xs text-slate-400 mb-2">{titel}</div>
      {posten.length === 0 ? (
        <p className="text-xs text-slate-500">Nog niets gelogd.</p>
      ) : (
        <ul className="space-y-1">
          {posten.map((p) => (
            <li key={p.naam} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-slate-300">
                {p.naam}
                {p.intern && <span className="ml-1.5 text-[10px] text-amber-300/80">intern</span>}
              </span>
              <span className="shrink-0 text-slate-400 tabular-nums">
                {eur(p.eur)} <span className="text-[10px] text-slate-600">· {p.aantal}×</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
