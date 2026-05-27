"use client";

import { useState } from "react";

export default function TrialCheckoutForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/mollie/trial-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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
    <form onSubmit={handleSubmit} className="space-y-3">
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
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full py-3 text-base"
      >
        {loading ? "Doorsturen naar betaling…" : "Betaal €1 en start direct →"}
      </button>
    </form>
  );
}
