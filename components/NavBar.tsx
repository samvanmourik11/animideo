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
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="font-bold text-blue-600 text-lg">
          Animideo
        </Link>
        <div className="flex items-center gap-4">
          {/* Credits badge */}
          <div className="relative">
            <button
              onClick={() => setShowCreditsMenu((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                lowCredits
                  ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                  : "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
              }`}
            >
              {lowCredits && <span className="text-red-500">⚠</span>}
              <span>{credits} credits</span>
            </button>

            {showCreditsMenu && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowCreditsMenu(false)}
                />
                {/* Dropdown */}
                <div className="absolute right-0 top-10 z-20 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Jouw account
                    </span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      {planLabels[plan] ?? plan}
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Credits over</span>
                      <span className={`text-sm font-semibold ${lowCredits ? "text-red-600" : "text-gray-900"}`}>
                        {credits}
                      </span>
                    </div>
                    {resetDate && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Reset op</span>
                        <span className="text-sm text-gray-700">{resetDate}</span>
                      </div>
                    )}
                  </div>

                  {lowCredits && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">
                      Je credits raken op. Upgrade om door te gaan.
                    </p>
                  )}

                  <Link
                    href="/pricing"
                    onClick={() => setShowCreditsMenu(false)}
                    className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                  >
                    Abonnement upgraden →
                  </Link>
                </div>
              </>
            )}
          </div>

          <span className="text-sm text-gray-400 hidden sm:block">{email}</span>
          <button
            onClick={signOut}
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Uitloggen
          </button>
        </div>
      </div>
    </header>
  );
}
