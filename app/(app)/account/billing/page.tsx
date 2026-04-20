import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/credits";
import Link from "next/link";
import CancelSubscriptionButton from "./CancelSubscriptionButton";

const PLAN_INFO: Record<string, {
  label: string;
  price: string;
  credits: number;
  color: string;
  features: string[];
}> = {
  free: {
    label: "Gratis",
    price: "€0",
    credits: 100,
    color: "border-slate-500/30 bg-slate-500/5",
    features: ["100 credits/maand", "Watermark op video's", "Alle AI-tools beschikbaar"],
  },
  starter: {
    label: "Starter",
    price: "€49/maand",
    credits: 500,
    color: "border-blue-500/30 bg-blue-500/5",
    features: ["500 credits/maand", "Geen watermark", "Brand kit", "E-mail support"],
  },
  pro: {
    label: "Pro",
    price: "€99/maand",
    credits: 1500,
    color: "border-purple-500/30 bg-purple-500/5",
    features: ["1.500 credits/maand", "Geen watermark", "Onbeperkte brand kits", "Prioriteit support"],
  },
  agency: {
    label: "Agency",
    price: "€249/maand",
    credits: 5000,
    color: "border-amber-500/30 bg-amber-500/5",
    features: ["5.000 credits/maand", "Geen watermark", "Onbeperkte brand kits", "Dedicated support"],
  },
};

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await getProfile(user!.id);

  const plan = PLAN_INFO[profile.plan] ?? PLAN_INFO.free;
  const isPaid = profile.plan !== "free";

  const resetDate = profile.credits_reset_date
    ? new Date(profile.credits_reset_date).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="space-y-6">

      {/* Current plan card */}
      <div className={`border rounded-2xl p-6 ${plan.color}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Huidig plan</p>
            <p className="text-2xl font-bold text-white">{plan.label}</p>
            <p className="text-slate-400 text-sm mt-0.5">{plan.price}</p>
          </div>
          {isPaid && (
            <span className={`text-xs font-medium px-3 py-1 rounded-full border ${
              profile.subscription_status === "active"
                ? "bg-green-500/15 text-green-400 border-green-500/20"
                : "bg-red-500/15 text-red-400 border-red-500/20"
            }`}>
              {profile.subscription_status === "active" ? "Actief" : profile.subscription_status ?? "Onbekend"}
            </span>
          )}
        </div>

        <ul className="space-y-2 mb-4">
          {plan.features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-slate-300">
              <span className="text-green-400 text-xs">✓</span>
              {f}
            </li>
          ))}
        </ul>

        {isPaid && resetDate && (
          <div className="pt-4 border-t border-white/[0.06]">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Volgende factuurdatum</span>
              <span className="text-slate-300">{resetDate}</span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-5 space-y-4">
        <p className="text-sm font-semibold text-white">Plan wijzigen</p>

        {profile.plan === "free" ? (
          <div>
            <p className="text-sm text-slate-400 mb-3">
              Upgrade naar een betaald plan voor meer credits en video&apos;s zonder watermark.
            </p>
            <Link href="/pricing" className="btn-primary inline-block text-sm">
              Bekijk plannen →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              Je kunt upgraden of downgraden via de prijzenpagina.
            </p>
            <Link href="/pricing" className="btn-secondary inline-block text-sm">
              Plannen vergelijken →
            </Link>
          </div>
        )}
      </div>

      {/* Cancel subscription */}
      {isPaid && profile.subscription_status === "active" && (
        <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-5">
          <p className="text-sm font-semibold text-white mb-1">Abonnement opzeggen</p>
          <p className="text-sm text-slate-500 mb-4">
            Na opzegging gaat je account terug naar het gratis plan. Je resterende credits blijven behouden tot het einde van je factureringsperiode.
          </p>
          <CancelSubscriptionButton />
        </div>
      )}
    </div>
  );
}
