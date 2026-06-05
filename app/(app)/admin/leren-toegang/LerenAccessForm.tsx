"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LerenAccessForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState<"hide" | "show" | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  async function submit(hide: boolean) {
    setError("");
    setResult("");
    setLoading(hide ? "hide" : "show");
    try {
      const res = await fetch("/api/admin/leren-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, hide }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Er ging iets mis");
      } else {
        setResult(
          data.hide_leren
            ? `Leren is nu verborgen voor ${data.email}.`
            : `Leren is nu weer zichtbaar voor ${data.email}.`
        );
        setEmail("");
        router.refresh();
      }
    } catch {
      setError("Er ging iets mis. Probeer opnieuw.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-6">
      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
        <div>
          <label className="label">E-mailadres klant</label>
          <input
            type="email"
            className="input"
            placeholder="klant@voorbeeld.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setResult(""); setError(""); }}
            required
            autoFocus
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
        )}
        {result && (
          <p className="text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">{result}</p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => submit(true)}
            className="btn-primary flex-1 py-3"
            disabled={loading !== null || !email}
          >
            {loading === "hide" ? "Bezig..." : "Leren verbergen"}
          </button>
          <button
            type="button"
            onClick={() => submit(false)}
            className="flex-1 py-3 rounded-xl border border-white/[0.12] text-slate-300 hover:bg-white/[0.05] transition-colors text-sm font-semibold disabled:opacity-50"
            disabled={loading !== null || !email}
          >
            {loading === "show" ? "Bezig..." : "Leren tonen"}
          </button>
        </div>
      </form>
    </div>
  );
}
