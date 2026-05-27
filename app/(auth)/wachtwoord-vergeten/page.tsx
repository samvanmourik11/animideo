"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/wachtwoord-resetten`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.18) 0%, transparent 70%)" }}>
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">📬</div>
          <h1 className="text-2xl font-bold text-white mb-2">Check je inbox</h1>
          <div className="card shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
            <p className="text-slate-300 font-medium">Reset-link verstuurd</p>
            <p className="text-slate-500 text-sm mt-1">
              Als er een account bestaat met <strong className="text-white">{email}</strong>, ontvang je binnen een paar minuten een mail met een link om een nieuw wachtwoord in te stellen.
            </p>
            <p className="text-slate-500 text-xs mt-3">
              Geen mail na een paar minuten? Check je spam-map of probeer het opnieuw.
            </p>
          </div>
          <p className="text-center text-sm text-slate-500 mt-5">
            <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors font-medium">
              Terug naar inloggen
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.18) 0%, transparent 70%)" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-blue-300 bg-clip-text text-transparent mb-1">
            Wachtwoord vergeten
          </h1>
          <p className="text-slate-500 text-sm">Vul je e-mail in, we sturen je een reset-link</p>
        </div>

        <div className="card shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
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

            {error && (
              <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
              {loading ? "Versturen…" : "Stuur reset-link →"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500 mt-5">
          Wachtwoord weer ingevallen?{" "}
          <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors font-medium">
            Terug naar inloggen
          </Link>
        </p>
      </div>
    </div>
  );
}
