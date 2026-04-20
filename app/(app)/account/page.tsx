import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/credits";
import Link from "next/link";

const PLAN_CREDITS: Record<string, number> = {
  free: 100, starter: 500, pro: 1500, agency: 5000,
};

const PLAN_LABELS: Record<string, string> = {
  free: "Gratis", starter: "Starter", pro: "Pro", agency: "Agency",
};

const PLAN_COLORS: Record<string, string> = {
  free:    "bg-slate-500/15 text-slate-400 border-slate-500/20",
  starter: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  pro:     "bg-purple-500/15 text-purple-400 border-purple-500/20",
  agency:  "bg-amber-500/15 text-amber-400 border-amber-500/20",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function formatAmount(amount: number) {
  if (amount > 0) return `+${amount}`;
  return `${amount}`;
}

export default async function AccountOverviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [profile, { data: transactions }, { count: projectCount }] = await Promise.all([
    getProfile(user!.id),
    supabase
      .from("credit_transactions")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user!.id),
  ]);

  const planMax = PLAN_CREDITS[profile.plan] ?? 100;
  const usedEstimate = Math.max(0, planMax - profile.credits);
  const usedPct = Math.min(100, Math.round((usedEstimate / planMax) * 100));

  const greeting = profile.name
    ? `Welkom terug, ${profile.name.split(" ")[0]}`
    : `Welkom terug`;

  const resetDate = profile.credits_reset_date ? formatDate(profile.credits_reset_date) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">{greeting}</h2>
        <p className="text-sm text-slate-500 mt-0.5">{profile.email}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Credits</p>
          <p className="text-3xl font-bold text-white">{profile.credits}</p>
          {resetDate && (
            <p className="text-xs text-slate-400 mt-1">Reset op {resetDate}</p>
          )}
          <div className="mt-3 w-full bg-white/[0.06] rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${100 - usedPct}%` }}
            />
          </div>
        </div>

        <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Projecten</p>
          <p className="text-3xl font-bold text-white">{projectCount ?? 0}</p>
          <Link href="/dashboard" className="text-xs text-blue-400 hover:text-blue-300 mt-1 block transition-colors">
            Bekijk alle →
          </Link>
        </div>

        <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Plan</p>
          <span className={`inline-block text-sm font-semibold px-3 py-1 rounded-full border ${PLAN_COLORS[profile.plan] ?? PLAN_COLORS.free}`}>
            {PLAN_LABELS[profile.plan] ?? profile.plan}
          </span>
          {profile.plan === "free" ? (
            <Link href="/pricing" className="text-xs text-blue-400 hover:text-blue-300 mt-2 block transition-colors">
              Upgraden →
            </Link>
          ) : (
            <Link href="/account/billing" className="text-xs text-slate-500 hover:text-slate-300 mt-2 block transition-colors">
              Abonnement beheren →
            </Link>
          )}
        </div>
      </div>

      {/* Recente activiteit */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-white">Recente activiteit</p>
          <Link href="/account/credits" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
            Alles bekijken →
          </Link>
        </div>

        {!transactions || transactions.length === 0 ? (
          <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-6 text-center">
            <p className="text-sm text-slate-500">Nog geen activiteit</p>
          </div>
        ) : (
          <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl divide-y divide-white/[0.04]">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm text-slate-300">{tx.reason ?? "Credits"}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(tx.created_at).toLocaleDateString("nl-NL", {
                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className={`text-sm font-semibold ${tx.amount < 0 ? "text-red-400" : "text-green-400"}`}>
                  {formatAmount(tx.amount)} cr
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/account/settings"
          className="bg-[#0c1428] border border-white/[0.07] hover:border-white/20 rounded-2xl p-4 transition-colors group"
        >
          <p className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">Instellingen</p>
          <p className="text-xs text-slate-500 mt-1">Naam, e-mail, wachtwoord</p>
        </Link>
        <Link
          href="/brand"
          className="bg-[#0c1428] border border-white/[0.07] hover:border-white/20 rounded-2xl p-4 transition-colors group"
        >
          <p className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">Huisstijlen</p>
          <p className="text-xs text-slate-500 mt-1">Brand kits beheren</p>
        </Link>
      </div>
    </div>
  );
}
