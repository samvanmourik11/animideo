"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const PLANS = {
  starter: { label: "Starter",  price: "€49",  credits: "500",  color: "rgba(37,99,235,.04)" },
  pro:     { label: "Pro",       price: "€99",  credits: "1.500", color: "rgba(37,99,235,.1)" },
  agency:  { label: "Agency",   price: "€249", credits: "4.000", color: "rgba(99,102,241,.1)" },
} as const;

type PlanId = keyof typeof PLANS;

function CheckoutForm() {
  const searchParams = useSearchParams();
  const planId = (searchParams.get("plan") ?? "pro") as PlanId;
  const plan = PLANS[planId] ?? PLANS.pro;

  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/mollie/guest-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Er ging iets mis"); setLoading(false); return; }
      window.location.href = data.checkoutUrl;
    } catch {
      setError("Er ging iets mis. Probeer opnieuw.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-vlak flex items-start sm:items-center justify-center px-4 py-8"
      style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.15) 0%, transparent 70%)" }}>
      <div className="w-full max-w-md">
        {/* Back */}
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-tekst-3 hover:text-tekst transition-colors mb-8">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m7-7-7 7 7 7"/>
          </svg>
          Terug
        </Link>

        {/* Plan card */}
        <div className="rounded-2xl border border-blue-200 p-5 mb-6"
          style={{ background: plan.color }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-tekst-3 uppercase tracking-wider mb-1">Gekozen pakket</p>
              <p className="text-xl font-black text-tekst">{plan.label}</p>
              <p className="text-sm text-blue-600 font-medium mt-0.5">{plan.credits} credits / maand</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-tekst">{plan.price}</p>
              <p className="text-xs text-tekst-3">/maand</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="bg-paneel border border-rand rounded-2xl p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
          <h1 className="text-xl font-bold text-tekst mb-1">Betaalgegevens</h1>
          <p className="text-sm text-tekst-3 mb-6">Vul je e-mailadres in — je maakt daarna een account aan.</p>

          <form onSubmit={handleCheckout} className="space-y-4">
            <div>
              <label className="label">E-mailadres</label>
              <input
                type="email"
                className="input"
                placeholder="jij@voorbeeld.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
            )}

            <button type="submit" className="btn-primary w-full py-3 text-base mt-2" disabled={loading}>
              {loading ? "Doorsturen naar betaling…" : `Afrekenen — ${plan.price}/maand →`}
            </button>
          </form>

          <p className="text-xs text-tekst-3 text-center mt-4">
            Beveiligd via Mollie · SEPA / iDEAL · Maandelijks opzegbaar
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutForm />
    </Suspense>
  );
}
