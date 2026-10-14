"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card, SectionTitle } from "@/components/admin/primitives";
import { dateShort, eur } from "@/components/admin/format";
import type { OpenDossier } from "@/lib/achterstand";

// Klanten met een openstaande terugboeking en waar hun mailreeks staat. Antwoorden
// ze op een mail, dan stopt de reeks vanzelf; bellen ze of mailen ze los naar
// info@, dan zet je hem hier met de hand stil. Het account blijft op slot tot er
// betaald is.

const MAIL_NL = { eerste: "1e mail", herinnering: "herinnering", laatste: "laatste herinnering" } as const;

export default function Achterstanden() {
  const [dossiers, setDossiers] = useState<OpenDossier[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);

  const laad = useCallback(() => {
    fetch("/api/admin/achterstand", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Fout ${r.status}`);
        setDossiers(j.dossiers);
      })
      .catch((e) => setFout(e instanceof Error ? e.message : "Onbekende fout"));
  }, []);
  useEffect(laad, [laad]);

  async function zet(d: OpenDossier, stoppen: boolean) {
    setBezig(d.postId);
    setFout(null);
    try {
      const r = await fetch("/api/admin/achterstand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: d.postId, stoppen }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Fout ${r.status}`);
      laad();
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setBezig(null);
    }
  }

  if (!dossiers && !fout) return null;
  const lijst = dossiers ?? [];
  const totaal = lijst.reduce((s, d) => s + d.totaal, 0);

  return (
    <Card className={lijst.length ? "border-amber-500/20" : ""}>
      <SectionTitle
        right={lijst.length ? <Badge tone="amber">{lijst.length} · {eur(totaal)}</Badge> : <Badge tone="green">geen</Badge>}
      >
        Openstaande terugboekingen (automatische mails)
      </SectionTitle>
      {fout && <p className="text-amber-400 text-sm mb-3">{fout}</p>}
      {lijst.length === 0 ? (
        <p className="text-sm text-slate-500">Niemand heeft op dit moment een openstaand bedrag.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3 font-medium">Klant</th>
                <th className="py-2 pr-3 font-medium">Open</th>
                <th className="py-2 pr-3 font-medium">Sinds</th>
                <th className="py-2 pr-3 font-medium">Mails</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {lijst.map((d) => (
                <tr key={d.postId} className="border-t border-white/[0.05]">
                  <td className="py-2.5 pr-3 text-slate-200">
                    {d.email ?? "—"}
                    {d.redenCode && <span className="ml-2 text-xs text-slate-500">{d.redenCode}</span>}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-white">
                    {eur(d.totaal)}
                    {d.aantal > 1 && <span className="ml-1 text-xs text-slate-500">({d.aantal}×)</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-400">{dateShort(d.sinds)}</td>
                  <td className="py-2.5 pr-3">
                    {d.gereageerdOp ? (
                      <Badge tone="slate">gestopt {dateShort(d.gereageerdOp)}</Badge>
                    ) : d.laatsteMail ? (
                      <span className="text-slate-400">
                        {MAIL_NL[d.laatsteMail]} {d.laatsteMailOp ? dateShort(d.laatsteMailOp) : ""}
                      </span>
                    ) : (
                      <span className="text-slate-500">nog niet gemaild</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => zet(d, !d.gereageerdOp)}
                      disabled={bezig === d.postId}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-50 ${
                        d.gereageerdOp
                          ? "border-white/10 text-slate-300 hover:bg-white/5"
                          : "border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                      }`}
                    >
                      {bezig === d.postId ? "Bezig…" : d.gereageerdOp ? "Reeks hervatten" : "Reeks stoppen"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
