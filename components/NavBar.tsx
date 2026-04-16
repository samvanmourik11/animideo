"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface NavBarProps {
  email: string;
  credits: number;
  plan: string;
  creditsResetDate: string | null;
}

export default function NavBar({ email, credits, plan, creditsResetDate }: NavBarProps) {
  const router = useRouter();
  const [showCreditsMenu, setShowCreditsMenu] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const lowCredits = credits < 20;
  const resetDate = creditsResetDate
    ? new Date(creditsResetDate).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })
    : null;

  const planLabels: Record<string, string> = {
    free: "Gratis",
    starter: "Starter",
    pro: "Pro",
    agency: "Agency",
  };

  return (
    <header className="border-b border-white/[0.07] bg-[#060d1f]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo + nav */}
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-bold text-lg bg-gradient-to-r from-blue-400 to-blue-300 bg-clip-text text-transparent">
            Animideo
          </Link>
          <Link href="/brand" className="text-sm text-slate-500 hover:text-slate-200 transition-colors">
            Huisstijlen
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {/* Credits badge */}
          <div className="relative">
            <button
              onClick={() => setShowCreditsMenu((v) => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                lowCredits
                  ? "bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20"
                  : "bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20"
              }`}
            >
              {lowCredits ? (
                <span className="text-red-400">⚠</span>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              )}
              <span>{credits} credits</span>
            </button>

            {showCreditsMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowCreditsMenu(false)} />
                <div className="absolute right-0 top-11 z-20 w-64 bg-[#0c1428] border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Account</span>
                    <span className="text-xs bg-blue-500/15 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-medium">
                      {planLabels[plan] ?? plan}
                    </span>
                  </div>

                  <div className="space-y-2.5 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">Credits over</span>
                      <span className={`text-sm font-bold ${lowCredits ? "text-red-400" : "text-white"}`}>
                        {credits}
                      </span>
                    </div>
                    {resetDate && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-400">Reset op</span>
                        <span className="text-sm text-slate-300">{resetDate}</span>
                      </div>
                    )}
                  </div>

                  {lowCredits && (
                    <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-3">
                      Je credits raken op. Upgrade om door te gaan.
                    </p>
                  )}

                  <Link
                    href="/pricing"
                    onClick={() => setShowCreditsMenu(false)}
                    className="block w-full text-center bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-sm font-semibold py-2 px-4 rounded-xl shadow-[0_0_16px_rgba(59,130,246,0.3)] transition-all"
                  >
                    Abonnement upgraden →
                  </Link>
                </div>
              </>
            )}
          </div>

          <span className="text-sm text-slate-500 hidden sm:block">{email}</span>
          <button
            onClick={signOut}
            className="text-sm text-slate-500 hover:text-slate-200 transition-colors"
          >
            Uitloggen
          </button>
        </div>
      </div>
    </header>
  );
}
