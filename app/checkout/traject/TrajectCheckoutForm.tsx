"use client";

import { useState } from "react";
import Link from "next/link";

export default function TrajectCheckoutForm() {
  const [email, setEmail] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [newsletter, setNewsletter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = email.includes("@") && agreeTerms && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreeTerms) {
      setError("Vink het verplichte vakje aan om door te gaan.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/mollie/traject-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, acceptedTerms: agreeTerms, newsletter }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Er ging iets mis");
        setLoading(false);
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setError("Er ging iets mis. Probeer opnieuw.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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

      <div className="space-y-2.5">
        <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={agreeTerms}
            onChange={(e) => setAgreeTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
            required
          />
          <span>
            Ik ga akkoord met de{" "}
            <Link href="/algemene-voorwaarden" target="_blank" className="text-blue-400 underline hover:text-blue-300">
              algemene voorwaarden
            </Link>{" "}
            en het{" "}
            <Link href="/privacybeleid" target="_blank" className="text-blue-400 underline hover:text-blue-300">
              privacybeleid
            </Link>, en begrijp dat dit een <strong className="text-white">eenmalige betaling van €246</strong> is
            waarmee ik <strong className="text-white">3000 credits</strong> ontvang (geen doorlopend abonnement).
          </span>
        </label>

        <label className="flex items-start gap-2.5 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={newsletter}
            onChange={(e) => setNewsletter(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
          />
          <span>Ja, houd me via de nieuwsbrief op de hoogte van tips, updates en aanbiedingen (optioneel).</span>
        </label>
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="btn-primary w-full py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Doorsturen naar betaling…" : "Afrekenen · €246 →"}
      </button>
    </form>
  );
}
