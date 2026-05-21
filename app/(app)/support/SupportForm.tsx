"use client";

import { useState } from "react";

const CATEGORIES = [
  "Vraag over gebruik",
  "Bug of technisch probleem",
  "Facturering en abonnement",
  "Idee of feedback",
  "Anders",
];

export default function SupportForm({ email }: { email: string }) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, subject, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Er ging iets mis. Probeer het opnieuw.");
        setLoading(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
      setLoading(false);
    }
  }

  function reset() {
    setDone(false);
    setLoading(false);
    setSubject("");
    setMessage("");
    setCategory(CATEGORIES[0]);
  }

  if (done) {
    return (
      <div className="card">
        <div className="text-3xl mb-2">✅</div>
        <h2 className="text-lg font-bold text-white">Bericht verstuurd</h2>
        <p className="text-slate-400 text-sm mt-1">
          We hebben je ticket ontvangen en reageren zo snel mogelijk via e-mail op{" "}
          <strong className="text-white">{email}</strong>.
        </p>
        <button
          type="button"
          onClick={reset}
          className="text-blue-400 hover:text-blue-300 transition-colors text-sm font-medium mt-4"
        >
          Nog een ticket insturen
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div>
        <label className="label">Categorie</label>
        <select
          className="input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Onderwerp</label>
        <input
          type="text"
          className="input"
          placeholder="Korte samenvatting van je vraag"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          required
        />
      </div>

      <div>
        <label className="label">Bericht</label>
        <textarea
          className="input min-h-[140px] resize-y"
          placeholder="Beschrijf je vraag of probleem zo duidelijk mogelijk. Bij een bug: welke stappen leidden ertoe?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={5000}
          required
        />
      </div>

      <div>
        <label className="label">Je e-mailadres</label>
        <input type="email" className="input opacity-60" value={email} readOnly />
        <p className="text-xs text-slate-500 mt-1">We reageren op dit adres.</p>
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? "Versturen…" : "Ticket insturen →"}
      </button>
    </form>
  );
}
