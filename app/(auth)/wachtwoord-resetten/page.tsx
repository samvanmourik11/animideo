"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) setSessionReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setSessionReady(true);
      }
    });

    const timeout = setTimeout(() => {
      if (cancelled) return;
      setSessionReady((ready) => {
        if (!ready) setLinkInvalid(true);
        return ready;
      });
    }, 4000);

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Wachtwoord moet minstens 8 tekens zijn.");
      return;
    }
    if (password !== confirm) {
      setError("Wachtwoorden komen niet overeen.");
      return;
    }
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (linkInvalid) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(239,68,68,0.12) 0%, transparent 70%)" }}>
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white mb-2">Link verlopen of ongeldig</h1>
          <div className="card shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
            <p className="text-slate-300 text-sm">
              Deze reset-link werkt niet meer. Vraag een nieuwe link aan.
            </p>
          </div>
          <Link href="/wachtwoord-vergeten" className="btn-primary inline-block w-full mt-5">
            Nieuwe reset-link aanvragen
          </Link>
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
            Nieuw wachtwoord
          </h1>
          <p className="text-slate-500 text-sm">Kies een nieuw wachtwoord voor je account</p>
        </div>

        <div className="card shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
          {!sessionReady ? (
            <p className="text-slate-400 text-sm text-center py-6">Reset-link controleren…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Nieuw wachtwoord</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="input pr-11"
                    placeholder="Min. 8 tekens"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors text-sm"
                    tabIndex={-1}
                  >
                    {showPassword ? "Verberg" : "Toon"}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Bevestig wachtwoord</label>
                <input
                  type={showPassword ? "text" : "password"}
                  className="input"
                  placeholder="Herhaal je wachtwoord"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                  required
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}

              <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
                {loading ? "Opslaan…" : "Wachtwoord opslaan →"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
