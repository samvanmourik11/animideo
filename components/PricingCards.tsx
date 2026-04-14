"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Plan {
  id: string;
  name: string;
  price: string | null;
  credits: string;
  badge?: string;
  features: string[];
  cta: string;
  highlight: boolean;
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Gratis",
    price: "€0",
    credits: "30 credits/maand",
    features: [
      "30 credits per maand",
      "Script genereren (1 credit)",
      "Afbeelding genereren (1 credit)",
      "Video beweging (5 credits)",
      "Watermark op exports",
      "Standaard kwaliteit",
    ],
    cta: "Huidig plan",
    highlight: false,
  },
  {
    id: "starter",
    name: "Starter",
    price: "€49",
    credits: "500 credits/maand",
    badge: "MEEST GEKOZEN",
    features: [
      "500 credits per maand",
      "Script genereren (1 credit)",
      "Afbeelding genereren (1 credit)",
      "Video beweging (5 credits)",
      "Geen watermark",
      "Prioriteit rendering",
      "Email support",
    ],
    cta: "Upgraden →",
    highlight: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "€99",
    credits: "1.500 credits/maand",
    features: [
      "1.500 credits per maand",
      "Script genereren (1 credit)",
      "Afbeelding genereren (1 credit)",
      "Video beweging (5 credits)",
      "Geen watermark",
      "Prioriteit rendering",
      "HD exports",
      "Prioriteit support",
    ],
    cta: "Upgraden →",
    highlight: false,
  },
  {
    id: "agency",
    name: "Agency",
    price: "€249",
    credits: "5.000 credits/maand",
    features: [
      "5.000 credits per maand",
      "Script genereren (1 credit)",
      "Afbeelding genereren (1 credit)",
      "Video beweging (5 credits)",
      "Geen watermark",
      "Prioriteit rendering",
      "4K exports",
      "Dedicated support",
      "Meerdere teamleden",
    ],
    cta: "Upgraden →",
    highlight: false,
  },
];

export default function PricingCards({ currentPlan }: { currentPlan: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

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

  return (
    <div>
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 text-center">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border-2 p-6 transition-shadow ${
                plan.highlight
                  ? "border-blue-500 shadow-lg shadow-blue-100"
                  : "border-gray-200"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    {plan.badge}
                  </span>
                </div>
              )}

              {isCurrent && (
                <div className="absolute -top-3 right-4">
                  <span className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    Huidig plan
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-gray-900">{plan.price}</span>
                  {plan.price !== "€0" && (
                    <span className="text-sm text-gray-500">/maand</span>
                  )}
                </div>
                <p className="mt-1 text-sm font-medium text-blue-600">{plan.credits}</p>
              </div>

              <ul className="flex-1 space-y-2.5 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={isCurrent || loading === plan.id || plan.id === "free"}
                className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors ${
                  isCurrent
                    ? "bg-gray-100 text-gray-400 cursor-default"
                    : plan.id === "free"
                    ? "bg-gray-100 text-gray-400 cursor-default"
                    : plan.highlight
                    ? "bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
                    : "bg-gray-900 hover:bg-gray-700 text-white disabled:opacity-60"
                }`}
              >
                {loading === plan.id
                  ? "Bezig..."
                  : isCurrent
                  ? "Huidig plan"
                  : plan.cta}
              </button>
            </div>
          );
        })}
      </div>

      {/* Credits explanation */}
      <div className="mt-10 bg-gray-50 border border-gray-200 rounded-2xl p-6">
        <h3 className="font-semibold text-gray-900 mb-3">Hoe werken credits?</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { action: "Script genereren", cost: "1 credit" },
            { action: "Afbeelding genereren", cost: "1 credit" },
            { action: "Video beweging (Runway)", cost: "5 credits" },
            { action: "HD export", cost: "2 credits" },
          ].map((item) => (
            <div key={item.action} className="text-center">
              <p className="text-sm font-semibold text-gray-900">{item.cost}</p>
              <p className="text-xs text-gray-500 mt-0.5">{item.action}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
