"use client";

import { useState } from "react";
import { CREDIT_PAKKETTEN, type PakketId } from "@/lib/credit-costs";

// Losse credits bijkopen, naast het abonnement (Sam, 25-10-2026). Alleen voor abonnees;
// wie nog geen abonnement heeft, ziet waarom niet in plaats van een knop die faalt.

export default function CreditPakketten({ magKopen, gekocht }: { magKopen: boolean; gekocht?: number | null }) {
  const [bezig, setBezig] = useState<PakketId | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function koop(id: PakketId) {
    setBezig(id);
    setFout(null);
    const res = await fetch("/api/mollie/credits-kopen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pakket: id }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.checkoutUrl) {
      window.location.href = d.checkoutUrl;
      return;
    }
    setFout(d.error ?? "Dat lukte niet.");
    setBezig(null);
  }

  return (
    <div className="mt-10 bg-paneel border border-rand rounded-2xl p-6">
      <h3 className="font-semibold text-tekst">Credits bijkopen</h3>
      <p className="text-sm text-tekst-3 mt-1">
        Even meer nodig dan je abonnement geeft? Koop losse credits bij. Ze komen bovenop je saldo en blijven staan, ook na je maandelijkse aanvulling.
      </p>
      {gekocht ? (
        <p className="mt-4 text-sm rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-300 px-3 py-2">
          Bedankt! Zodra de betaling binnen is, staan er {gekocht} credits extra op je saldo (meestal binnen een minuut).
        </p>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
        {CREDIT_PAKKETTEN.map((p) => (
          <div key={p.id} className="rounded-xl border border-rand bg-paneel-2/60 p-4 text-center">
            <p className="text-2xl font-extrabold text-tekst">{p.credits.toLocaleString("nl-NL")}</p>
            <p className="text-xs text-tekst-3">credits</p>
            <p className="mt-3 text-lg font-bold text-tekst">€{p.prijs}</p>
            <p className="text-[11px] text-tekst-3">€{(p.prijs / p.credits).toFixed(3).replace(".", ",")} per credit</p>
            <button
              onClick={() => koop(p.id)}
              disabled={!magKopen || !!bezig}
              className="btn-primary w-full mt-4 text-sm disabled:opacity-50"
            >
              {bezig === p.id ? "Even geduld…" : "Kopen"}
            </button>
          </div>
        ))}
      </div>
      {!magKopen && <p className="mt-4 text-xs text-tekst-3">Losse credits zijn er voor abonnees. Kies hierboven eerst een abonnement.</p>}
      {fout && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{fout}</p>}
    </div>
  );
}
