"use client";

import { useState } from "react";

export default function PayButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handlePay() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/mollie/cursus-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
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
    <>
      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-3">{error}</p>
      )}
      <button
        type="button"
        onClick={handlePay}
        disabled={loading}
        className="btn-primary w-full py-3 text-base"
      >
        {loading ? "Doorsturen naar betaling…" : "Betaal €1 →"}
      </button>
    </>
  );
}
