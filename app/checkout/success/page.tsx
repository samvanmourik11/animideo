"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  agency: "Agency",
};

function SuccessContent() {
  const searchParams = useSearchParams();
  const email   = searchParams.get("email") ?? "";
  const plan    = searchParams.get("plan")  ?? "pro";
  const planLabel = PLAN_LABELS[plan] ?? plan;

  const signupUrl = `/signup?guest_email=${encodeURIComponent(email)}&plan=${plan}`;

  return (
    <div className="min-h-screen bg-[#060d1f] flex items-center justify-center px-4"
      style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(34,197,94,0.12) 0%, transparent 70%)" }}>
      <div className="w-full max-w-sm text-center">
        {/* Checkmark */}
        <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6">
          <svg width="36" height="36" fill="none" stroke="#4ade80" strokeWidth="2.5" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Betaling geslaagd!</h1>
        <p className="text-slate-400 text-sm mb-8">
          Je <span className="text-white font-semibold">{planLabel}</span> abonnement is actief.<br />
          Maak nu je account aan om te beginnen.
        </p>

        <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-5 mb-6 text-left">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <p className="text-sm font-semibold text-white">Betaling verwerkt</p>
          </div>
          <p className="text-xs text-slate-500 ml-5">
            {email && <>{email} · </>}Pakket: {planLabel}
          </p>
        </div>

        <Link href={signupUrl} className="btn-primary block w-full py-3 text-base">
          Account aanmaken →
        </Link>

        <p className="text-xs text-slate-600 mt-4">
          Je credits worden automatisch gekoppeld na registratie.
        </p>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
