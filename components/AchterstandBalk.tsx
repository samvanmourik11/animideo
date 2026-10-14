import { createServiceClient } from "@/lib/supabase/service";
import { euro } from "@/lib/achterstand-mail";

// Balk bovenin de app zolang er een teruggeboekte incasso openstaat. Zonder deze
// uitleg zou een klant op slot alleen "niet genoeg credits" zien en denken dat
// de app kapot is.
export default async function AchterstandBalk({ userId }: { userId: string }) {
  const { data } = await createServiceClient()
    .from("chargebacks")
    .select("id, amount, created_at")
    .eq("user_id", userId)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  const open = data ?? [];
  if (open.length === 0) return null;
  const totaal = open.reduce((s, p) => s + Number(p.amount ?? 0), 0);

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30">
      <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3 text-sm text-amber-100">
        <span className="flex-1 min-w-[16rem]">
          Er staat een teruggeboekte betaling open van <strong>{euro(totaal)}</strong>. Je account staat op slot tot
          dit bedrag is betaald.
        </span>
        <a
          href={`/betalen/${open[0].id}`}
          className="rounded-lg bg-amber-400 px-3 py-1.5 font-semibold text-slate-900 hover:bg-amber-300"
        >
          Nu betalen
        </a>
      </div>
    </div>
  );
}
