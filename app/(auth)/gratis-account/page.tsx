"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function FreeSignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Zonder code is dit geen geldige uitnodigingslink.
  if (!code) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-xl font-bold text-tekst mb-2">Deze link is niet geldig</h1>
          <p className="text-tekst-3 text-sm">Vraag Animideo om een geldige uitnodigingslink.</p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/free-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, code }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const supabase = createClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) { setError(signInError.message); setLoading(false); return; }
        router.push("/welkom");
        router.refresh();
        return;
      }
      if (res.status === 409 || data.error === "exists") {
        setError("Dit e-mailadres heeft al een account. Log hieronder in.");
      } else if (res.status === 403) {
        setError("Deze uitnodigingslink is niet (meer) geldig.");
      } else {
        setError(data.error ?? "Er ging iets mis. Probeer het opnieuw.");
      }
      setLoading(false);
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.18) 0%, transparent 70%)" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-tekst mb-1">
            Animideo<span className="text-blue-500">.</span>
          </h1>
          <p className="text-tekst-3 text-sm">Maak je gratis account aan en ga aan de slag</p>
        </div>

        <div className="card shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
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
            <div>
              <label className="label">Wachtwoord</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="input pr-11"
                  placeholder="Min. 8 tekens"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-tekst-3 hover:text-tekst transition-colors text-sm"
                  tabIndex={-1}
                >
                  {showPassword ? "Verberg" : "Toon"}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
              {loading ? "Account aanmaken…" : "Gratis account aanmaken →"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-tekst-3 mt-5">
          Al een account?{" "}
          <Link href="/login" className="text-blue-600 hover:text-blue-700 transition-colors font-medium">
            Inloggen
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function GratisAccountPage() {
  return (
    <Suspense>
      <FreeSignupForm />
    </Suspense>
  );
}
