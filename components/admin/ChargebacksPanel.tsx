"use client";

// ── Terugboekingen ───────────────────────────────────────────────────────────
//
// Wie heeft er gestorneerd, en met welke rekening. Dat laatste is het belangrijk-
// ste gegeven op dit scherm: een e-mailadres verzint iemand zo opnieuw, een
// bankrekening niet. Staat er "4×" achter, dan is het geen ongelukje.
//
// De knop doet alles tegelijk wat je anders in twee schermen moet doen: bij
// Mollie het abonnement opzeggen en het mandaat intrekken, en bij ons het
// account op slot met e-mailadres en rekening op de zwarte lijst. Terugstorten
// zit er bewust níet in — dat is geld, en dat hoort een mens in Mollie te doen.

import { useState } from "react";
import type { ChargebackRow } from "@/lib/admin/metrics";
import { Card, SectionTitle, Badge } from "./primitives";
import { eur, dateShort } from "./format";

interface Uitkomst {
  opgezegdeAbonnementen: string[];
  ingetrokkenMandaten: string[];
  accountGeblokkeerd: boolean;
  checkoutsGeblokkeerd: number;
  opZwarteLijst: string[];
  waarschuwingen: string[];
}

export function ChargebacksPanel({
  rows,
  onKlaar,
}: {
  rows: ChargebackRow[];
  /** Dashboard opnieuw laten laden, zodat de blokkade meteen zichtbaar is. */
  onKlaar: () => void;
}) {
  const [bezig, setBezig] = useState<string | null>(null);
  const [klaar, setKlaar] = useState<Record<string, Uitkomst>>({});
  const [fout, setFout] = useState<Record<string, string>>({});
  const [bevestig, setBevestig] = useState<string | null>(null);

  const totaal = rows.reduce((s, r) => s + r.amount, 0);
  const herhalers = new Set(rows.filter((r) => r.aantalVanDezeRekening > 1).map((r) => r.iban)).size;

  async function blokkeer(r: ChargebackRow) {
    setBezig(r.chargebackId);
    setBevestig(null);
    setFout((f) => ({ ...f, [r.chargebackId]: "" }));
    try {
      const res = await fetch("/api/admin/blokkeer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: r.customerId,
          email: r.email !== "—" ? r.email : null,
          iban: r.iban,
          reden: `Terugboeking van ${eur(r.amount)} op ${dateShort(r.date)} (${r.reason})`,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Fout ${res.status}`);
      setKlaar((k) => ({ ...k, [r.chargebackId]: j as Uitkomst }));
      onKlaar();
    } catch (e) {
      setFout((f) => ({ ...f, [r.chargebackId]: e instanceof Error ? e.message : "Onbekende fout" }));
    } finally {
      setBezig(null);
    }
  }

  return (
    <Card className={rows.length ? "border-red-500/20" : ""}>
      <SectionTitle
        right={
          rows.length === 0 ? (
            <Badge tone="green">geen</Badge>
          ) : (
            <Badge tone="red">
              {rows.length} · {eur(totaal)}
            </Badge>
          )
        }
      >
        Terugboekingen
      </SectionTitle>

      {rows.length === 0 && (
        <p className="text-sm text-slate-500">Nog geen storno&apos;s. Mooi zo.</p>
      )}

      {herhalers > 0 && (
        <p className="text-xs text-amber-400 mb-3">
          {herhalers} rekening{herhalers === 1 ? " heeft" : "en hebben"} meer dan één keer teruggeboekt.
        </p>
      )}

      <div className="space-y-2">
        {rows.map((r) => {
          const uitkomst = klaar[r.chargebackId];
          const geblokkeerd = r.billingBlocked || !!uitkomst;
          return (
            <div key={r.chargebackId} className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">
                    {r.email}
                    {r.name ? <span className="text-slate-500"> · {r.name}</span> : null}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {eur(r.amount)} · {dateShort(r.date)} · {r.reason}
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5 truncate">
                    {r.iban ? (
                      <>
                        {r.iban}
                        {r.accountName ? ` · ${r.accountName}` : ""}
                        {r.aantalVanDezeRekening > 1 && (
                          <span className="text-amber-400"> · {r.aantalVanDezeRekening}× teruggeboekt</span>
                        )}
                      </>
                    ) : (
                      "rekening onbekend"
                    )}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  {geblokkeerd ? (
                    <Badge tone="slate">geblokkeerd</Badge>
                  ) : bevestig === r.chargebackId ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => blokkeer(r)}
                        disabled={bezig === r.chargebackId}
                        className="text-[11px] px-2.5 py-1.5 rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white"
                      >
                        {bezig === r.chargebackId ? "Bezig…" : "Ja, blokkeren"}
                      </button>
                      <button
                        onClick={() => setBevestig(null)}
                        className="text-[11px] px-2 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-slate-300"
                      >
                        Annuleren
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setBevestig(r.chargebackId)}
                      className="text-[11px] px-2.5 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300"
                    >
                      Blokkeren en stopzetten
                    </button>
                  )}
                </div>
              </div>

              {bevestig === r.chargebackId && (
                <p className="text-[11px] text-amber-300/90 mt-2 leading-snug">
                  Abonnement wordt opgezegd en het mandaat ingetrokken bij Mollie (dat komt niet terug),
                  het account gaat op slot en e-mailadres{r.iban ? " en rekening" : ""} gaan op de zwarte lijst.
                  De €-betaling zelf blijft staan; terugstorten doe je zelf in Mollie.
                </p>
              )}

              {uitkomst && (
                <p className="text-[11px] text-emerald-400/90 mt-2 leading-snug">
                  {uitkomst.opgezegdeAbonnementen.length} abonnement(en) opgezegd ·{" "}
                  {uitkomst.ingetrokkenMandaten.length} mandaat/mandaten ingetrokken ·{" "}
                  {uitkomst.accountGeblokkeerd ? "account op slot" : "geen account gevonden"} ·{" "}
                  {uitkomst.checkoutsGeblokkeerd} checkout(s) geblokkeerd
                  {uitkomst.opZwarteLijst.length > 0 && ` · op de lijst: ${uitkomst.opZwarteLijst.join(", ")}`}
                </p>
              )}
              {uitkomst?.waarschuwingen.length ? (
                <p className="text-[11px] text-amber-400 mt-1 leading-snug">
                  Let op: {uitkomst.waarschuwingen.join(" · ")}
                </p>
              ) : null}
              {fout[r.chargebackId] && (
                <p className="text-[11px] text-red-400 mt-1">Mislukt: {fout[r.chargebackId]}</p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
