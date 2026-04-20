import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/credits";
import Link from "next/link";

const PLAN_CREDITS: Record<string, number> = {
  free: 100, starter: 500, pro: 1500, agency: 5000,
};

const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  "Script genereren":         { label: "Script",      color: "bg-blue-500" },
  "Afbeelding genereren":     { label: "Afbeelding",  color: "bg-purple-500" },
  "Video beweging genereren": { label: "Video",        color: "bg-indigo-500" },
  "HD export":                { label: "HD Export",    color: "bg-amber-500" },
};

function formatAmount(amount: number) {
  return amount > 0 ? `+${amount}` : `${amount}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default async function CreditsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [profile, { data: transactions }] = await Promise.all([
    getProfile(user!.id),
    supabase
      .from("credit_transactions")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const planMax = PLAN_CREDITS[profile.plan] ?? 100;
  const resetDate = profile.credits_reset_date
    ? new Date(profile.credits_reset_date).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })
    : null;

  // Usage breakdown: sum negatives per category
  const usage: Record<string, number> = {};
  let totalSpent = 0;
  for (const tx of transactions ?? []) {
    if (tx.amount < 0) {
      const cat = tx.reason ?? "Overig";
      usage[cat] = (usage[cat] ?? 0) + Math.abs(tx.amount);
      totalSpent += Math.abs(tx.amount);
    }
  }

  return (
    <div className="space-y-6">

      {/* Balance card */}
      <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Huidig saldo</p>
            <p className="text-5xl font-bold text-white">{profile.credits}</p>
            <p className="text-sm text-slate-500 mt-1">
              van de {planMax} credits op je plan
            </p>
          </div>
          {profile.plan === "free" && (
            <Link href="/pricing" className="btn-primary text-sm shrink-0">
              Upgraden →
            </Link>
          )}
        </div>

        <div className="w-full bg-white/[0.06] rounded-full h-2 mb-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all shadow-[0_0_8px_rgba(59,130,246,0.4)]"
            style={{ width: `${Math.min(100, Math.round((profile.credits / planMax) * 100))}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-400">
          <span>{profile.credits} beschikbaar</span>
          {resetDate && <span>Reset op {resetDate}</span>}
        </div>
      </div>

      {/* Usage breakdown */}
      {totalSpent > 0 && (
        <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-5">
          <p className="text-sm font-semibold text-white mb-4">Verbruik per categorie</p>
          <div className="space-y-3">
            {Object.entries(usage)
              .sort((a, b) => b[1] - a[1])
              .map(([reason, spent]) => {
                const cat = CATEGORY_MAP[reason];
                const pct = Math.round((spent / totalSpent) * 100);
                return (
                  <div key={reason}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300">{cat?.label ?? reason}</span>
                      <span className="text-slate-500">{spent} cr · {pct}%</span>
                    </div>
                    <div className="w-full bg-white/[0.06] rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${cat?.color ?? "bg-slate-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Transaction log */}
      <div>
        <p className="text-sm font-semibold text-white mb-3">Transactiegeschiedenis</p>
        {!transactions || transactions.length === 0 ? (
          <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-8 text-center">
            <p className="text-slate-500 text-sm">Nog geen transacties</p>
          </div>
        ) : (
          <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl divide-y divide-white/[0.04]">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm text-slate-300">{tx.reason ?? "Credits"}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{formatDate(tx.created_at)}</p>
                </div>
                <span className={`text-sm font-bold tabular-nums ${tx.amount < 0 ? "text-red-400" : "text-green-400"}`}>
                  {formatAmount(tx.amount)} cr
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
