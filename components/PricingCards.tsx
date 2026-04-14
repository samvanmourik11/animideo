"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Plan {
  id: string;
  name: string;
  price: string;
  period?: string;
  credits: string;
  badge?: string;
  features: string[];
  highlight: boolean;
}

const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, agency: 3 };

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Gratis",
    price: "€0",
    credits: "100 credits/maand",
    features: [
      "100 credits per maand",
      "Script genereren (1 credit)",
      "Afbeelding genereren (1 credit)",
      "Video beweging (5 credits)",
      "Watermark op exports",
    ],
    highlight: false,
  },
  {
    id: "starter",
    name: "Starter",
    price: "€49",
    period: "/maand",
    credits: "500 credits/maand",
    features: [
      "500 credits per maand",
      "Script genereren (1 credit)",
      "Afbeelding genereren (1 credit)",
      "Video beweging (5 credits)",
      "Geen watermark",
      "Prioriteit rendering",
      "Email support",
    ],
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "€99",
    period: "/maand",
    credits: "1.500 credits/maand",
    badge: "MEEST GEKOZEN",
    features: [
      "1.500 credits per maand",
      "Script genereren (1 credit)",
      "Afbeelding genereren (1 credit)",
      "Video beweging (5 credits)",
      "Geen watermark",
      "HD exports",
      "Prioriteit support",
    ],
    highlight: true,
  },
  {
    id: "agency",
    name: "Agency",
    price: "€249",
    period: "/maand",
    credits: "5.000 credits/maand",
    features: [
      "5.000 credits per maand",
      "Script genereren (1 credit)",
      "Afbeelding genereren (1 credit)",
      "Video beweging (5 credits)",
      "Geen watermark",
      "4K exports",
      "Dedicated support",
      "Meerdere teamleden",
    ],
    highlight: false,
  },
];

export default function PricingCards({ currentPlan }: { currentPlan: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [upgraded, setUpgraded] = useState(false);

  // Refresh credits after returning from Mollie payment
  useEffect(() => {
    if (searchParams.get("upgraded") === "true") {
      setUpgraded(true);
      const timer = setTimeout(() => {
        router.refresh();
        setUpgraded(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, router]);

  async function handleUpgrade(planId: string) {
    if (planId === "free" || planId === currentPlan) return;
    setLoading(planId);
    setError("");
    try {
      const res = await fetch("/api/mollie/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        setError(data.error ?? "Er ging iets fout. Probeer het opnieuw.");
        return;
      }
      router.push(data.checkoutUrl);
    } catch {
      setError("Er ging iets fout. Controleer je internetverbinding.");
    } finally {
      setLoading(null);
    }
  }

  function getCtaLabel(plan: Plan): string {
    if (loading === plan.id) return "Bezig…";
    const isCurrent = plan.id === currentPlan;
    if (isCurrent) return "Huidig plan";
    if (plan.id === "free") return "Huidig plan";
    const currentRank = PLAN_RANK[currentPlan] ?? 0;
    const targetRank = PLAN_RANK[plan.id] ?? 0;
    if (targetRank > currentRank) return "Upgraden →";
    return "Downgraden →";
  }

  function isDisabled(plan: Plan): boolean {
    if (plan.id === currentPlan) return true;
    if (plan.id === "free") return true;
    if (loading !== null) return true;
    return false;
  }

  function getButtonStyle(plan: Plan): string {
    const isCurrent = plan.id === currentPlan;
    if (isCurrent || plan.id === "free") {
      return "bg-white/5 text-slate-600 cursor-default border border-white/[0.05]";
    }
    const currentRank = PLAN_RANK[currentPlan] ?? 0;
    const targetRank = PLAN_RANK[plan.id] ?? 0;
    if (targetRank < currentRank) {
      return "bg-white/5 hover:bg-white/10 text-slate-400 border border-white/10 hover:border-white/20 disabled:opacity-60";
    }
    if (plan.highlight) {
      return "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] disabled:opacity-60";
    }
    return "bg-white/10 hover:bg-white/15 text-white border border-white/10 hover:border-white/20 disabled:opacity-60";
  }

  return (
    <div>
      {upgraded && (
        <div className="mb-6 bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-2xl px-4 py-3 text-center">
          Betaling ontvangen — je abonnement en credits worden bijgewerkt…
        </div>
      )}

      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-2xl px-4 py-3 text-center">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-6 transition-all duration-200 ${
                plan.highlight
                  ? "bg-gradient-to-b from-blue-600/10 to-blue-500/5 border-blue-500/40 shadow-[0_0_40px_rgba(59,130,246,0.15)]"
                  : "bg-[#0c1428] border-white/[0.07] hover:border-white/15"
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-blue-600 to-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-[0_0_12px_rgba(59,130,246,0.5)]">
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* Current plan indicator */}
              {isCurrent && (
                <div className="absolute -top-3 right-4">
                  <span className="bg-green-500/20 border border-green-500/30 text-green-400 text-[10px] font-bold px-3 py-1 rounded-full">
                    Huidig plan
                  </span>
                </div>
              )}

              {/* Price */}
              <div className="mb-5">
                <h3 className="text-base font-bold text-white mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white">{plan.price}</span>
                  {plan.period && <span className="text-slate-500 text-sm">{plan.period}</span>}
                </div>
                <p className="mt-1 text-xs font-semibold text-blue-400">{plan.credits}</p>
              </div>

              {/* Features */}
              <ul className="flex-1 space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-400">
                    <span className="text-blue-400 mt-0.5 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={isDisabled(plan)}
                className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${getButtonStyle(plan)}`}
              >
                {getCtaLabel(plan)}
              </button>
            </div>
          );
        })}
      </div>

      {/* Credits explanation */}
      <div className="mt-10 bg-[#0c1428] border border-white/[0.07] rounded-2xl p-6">
        <h3 className="font-semibold text-white mb-4">Hoe werken credits?</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { action: "Script genereren", cost: "1 credit", icon: "📝" },
            { action: "Afbeelding genereren", cost: "1 credit", icon: "🎨" },
            { action: "Video beweging (Runway)", cost: "5 credits", icon: "🎬" },
            { action: "HD export", cost: "2 credits", icon: "💾" },
          ].map((item) => (
            <div key={item.action} className="text-center bg-white/[0.03] rounded-xl p-4">
              <div className="text-2xl mb-2">{item.icon}</div>
              <p className="text-sm font-bold text-white">{item.cost}</p>
              <p className="text-xs text-slate-500 mt-1">{item.action}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
