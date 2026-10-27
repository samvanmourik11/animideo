"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Teruggestuurd vanaf een link uit een mail die niet meer werkt (al gebruikt of verlopen).
  useEffect(() => {
    const fout = new URLSearchParams(window.location.search).get("error");
    if (!fout) return;
    setError(
      /invalid|expired/i.test(fout) ? "Deze link uit je mail werkt niet meer: hij is al gebruikt of verlopen. Wachtwoord vergeten? Vraag hieronder een nieuwe link aan."
      : /missing_token/i.test(fout) ? "Deze link is niet compleet. Klik op de knop in de mail, of vraag een nieuwe link aan."
      : fout
    );
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Supabase geeft Engelse meldingen; de twee die klanten echt zien vertalen we.
      setError(
        /invalid login credentials/i.test(error.message) ? "Dit e-mailadres of wachtwoord klopt niet."
        : /email not confirmed/i.test(error.message) ? "Bevestig eerst je e-mailadres via de link in je mail."
        : error.message
      );
      setLoading(false);
    } else {
      // Terug naar waar iemand vandaan kwam (bv. een teamuitnodiging). Alleen eigen paden,
      // anders is dit een open deur om na het inloggen naar een nepsite te sturen.
      const volgende = new URLSearchParams(window.location.search).get("volgende") ?? "";
      router.push(/^\/(?!\/)/.test(volgende) ? volgende : "/ontdek");
      router.refresh();
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
          <p className="text-tekst-3 text-sm">Welkom terug, log in op je account</p>
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
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <label className="label mb-0">Wachtwoord</label>
                <Link href="/wachtwoord-vergeten" className="text-xs text-blue-600 hover:text-blue-700 transition-colors">
                  Wachtwoord vergeten?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="input pr-11"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              {loading ? "Bezig met inloggen…" : "Inloggen →"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-tekst-3 mt-5">
          Nog geen account?{" "}
          <Link href="/checkout/webinar" className="text-blue-600 hover:text-blue-700 transition-colors font-medium">
            Start voor €1
          </Link>
        </p>
      </div>
    </div>
  );
}
