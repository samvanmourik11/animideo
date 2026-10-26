"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [resending, setResending] = useState(false);

  const guestEmail = searchParams.get("guest_email");

  // Save idea from URL into localStorage so PendingIdeaHandler can pick it up
  useEffect(() => {
    const idea = searchParams.get("idea");
    if (idea) localStorage.setItem("pending_idea", idea);
  }, [searchParams]);

  // Pre-fill (and lock) email when arriving from a paid guest checkout
  useEffect(() => {
    if (guestEmail) setEmail(guestEmail);
  }, [guestEmail]);

  // Gratis registratie is afgeschaft: wie niet via een betaalde (€1-)checkout
  // komt (geen guest_email), wordt doorgestuurd naar het €1-aanbod.
  useEffect(() => {
    if (!guestEmail) router.replace("/start");
  }, [guestEmail, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Gratis accounts zijn afgeschaft: een account kan ALLEEN na een betaalde
    // (€1-)checkout worden aangemaakt. Zonder guest_email hoort niemand hier;
    // stuur die door naar het €1-aanbod.
    if (!guestEmail) {
      router.replace("/start");
      return;
    }

    const supabase = createClient();
    try {
      // guest-signup maakt alleen een account aan als er ÉCHT een betaalde
      // pending_checkout voor dit e-mailadres bestaat. Geen betaling = geen account.
      const res = await fetch("/api/auth/guest-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) { setError(signInError.message); setLoading(false); return; }
        router.push("/welkom");
        router.refresh();
        return;
      }
      if (res.status === 409 || data.error === "exists") {
        setError("Dit e-mailadres heeft al een account. Log hieronder in of herstel je wachtwoord.");
        setLoading(false);
        return;
      }
      // 422 (no_paid_checkout): betaling (nog) niet gevonden. NOOIT een gratis
      // account aanmaken — laat de gebruiker de betaling afronden of retryen.
      setError("We konden je betaling of verificatie nog niet vinden. Net afgerond? Wacht een paar seconden en klik nogmaals op “Account aanmaken”.");
      setLoading(false);
      return;
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
      setLoading(false);
      return;
    }
  }

  async function handleResend() {
    setResendMsg("");
    setResending(true);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${appUrl}/welkom` },
    });
    setResendMsg(
      error
        ? `Versturen mislukt: ${error.message}`
        : "Nieuwe bevestigingslink verstuurd."
    );
    setResending(false);
  }

  // Directe (gratis) bezoeker: toon niets, de effect stuurt door naar het €1-aanbod.
  if (!guestEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-tekst-3 text-sm">
        Een moment…
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.18) 0%, transparent 70%)" }}>
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">📬</div>
          <h1 className="text-2xl font-bold text-tekst mb-2">Check je inbox</h1>
          <div className="card shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
            <p className="text-tekst-2 font-medium">Bevestigingslink verstuurd</p>
            <p className="text-tekst-3 text-sm mt-1">
              We hebben een link gestuurd naar <strong className="text-tekst">{email}</strong>.
            </p>
            <p className="text-tekst-3 text-xs mt-3">
              Geen mail na een paar minuten? Check je spam-map of vraag een nieuwe link aan.
            </p>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-blue-600 hover:text-blue-700 transition-colors text-sm font-medium mt-2"
            >
              {resending ? "Versturen…" : "Nieuwe link versturen"}
            </button>
            {resendMsg && (
              <p className="text-tekst-3 text-xs mt-2">{resendMsg}</p>
            )}
          </div>
          <p className="text-center text-sm text-tekst-3 mt-5">
            Al bevestigd?{" "}
            <Link href="/login" className="text-blue-600 hover:text-blue-700 transition-colors font-medium">
              Inloggen
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
          <h1 className="text-3xl font-extrabold tracking-tight text-tekst mb-1">
            Animideo<span className="text-blue-500">.</span>
          </h1>
          <p className="text-tekst-3 text-sm">Rond je account af en ga direct aan de slag</p>
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
                readOnly={!!guestEmail}
                aria-readonly={!!guestEmail}
              />
              {guestEmail && (
                <p className="text-xs text-tekst-3 mt-1">
                  Gekoppeld aan je betaling — niet wijzigbaar.
                </p>
              )}
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
              {loading ? "Account aanmaken…" : "Account aanmaken →"}
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

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
