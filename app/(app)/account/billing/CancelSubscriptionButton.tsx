"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelSubscriptionButton() {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCancel() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/mollie/cancel-subscription");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Opzeggen mislukt");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Er ging iets mis");
    } finally {
      setLoading(false);
      setConfirm(false);
    }
  }

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="text-sm px-4 py-2 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
      >
        Abonnement opzeggen
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
        Weet je het zeker? Je account gaat terug naar het gratis plan.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={handleCancel}
          disabled={loading}
          className="text-sm px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
        >
          {loading ? "Bezig…" : "Ja, zeg op"}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="btn-secondary text-sm"
        >
          Annuleren
        </button>
      </div>
    </div>
  );
}
