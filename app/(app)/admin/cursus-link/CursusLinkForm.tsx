"use client";

import { useState } from "react";

export default function CursusLinkForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLink("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/cursus-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Er ging iets mis");
      } else {
        setLink(data.url);
      }
    } catch {
      setError("Er ging iets mis. Probeer opnieuw.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">E-mailadres cursist</label>
          <input
            type="email"
            className="input"
            placeholder="cursist@voorbeeld.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setLink(""); }}
            required
            autoFocus
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
        )}

        <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
          {loading ? "Bezig..." : "Genereer betaallink"}
        </button>
      </form>

      {link && (
        <div className="mt-6 pt-6 border-t border-white/[0.07]">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Betaallink</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={link}
              className="input flex-1 text-sm"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={handleCopy}
              className="btn-primary px-4 py-2 text-sm whitespace-nowrap"
            >
              {copied ? "Gekopieerd!" : "Kopieer"}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Mail deze link naar {email}. Link werkt eenmalig.
          </p>
        </div>
      )}
    </div>
  );
}
