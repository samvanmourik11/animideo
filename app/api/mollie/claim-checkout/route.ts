import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const PLAN_CREDITS: Record<string, number> = {
  starter: 500,
  pro: 1500,
  agency: 5000,
};

export async function POST(req: NextRequest) {
  const { userId, email } = await req.json() as { userId: string; email: string };
  if (!userId || !email) return NextResponse.json({ claimed: false });

  const supabase = createServiceClient();

  // Look for a paid (unclaimed) checkout for this email
  const { data: pending } = await supabase
    .from("pending_checkouts")
    .select("*")
    .eq("email", email.toLowerCase())
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!pending) return NextResponse.json({ claimed: false });

  // Starttraject: eenmalige aankoop → 3000 credits + Starter-toegang, géén
  // doorlopend abonnement (geen mollie_subscription_id, geen credit-reset).
  const isTraject = pending.plan === "traject";
  const credits = isTraject ? 3000 : (PLAN_CREDITS[pending.plan] ?? 100);
  const planForProfile = isTraject ? "starter" : pending.plan;

  // Link to user account
  await supabase
    .from("profiles")
    .update({
      plan: planForProfile,
      credits,
      mollie_customer_id: pending.mollie_customer_id,
      mollie_subscription_id: pending.mollie_subscription_id,
      subscription_status: "active",
      credits_reset_date: isTraject ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", userId);

  await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount: credits,
    reason: isTraject ? "Starttraject geactiveerd: 3000 credits" : `Abonnement gekoppeld na registratie: ${pending.plan}`,
  });

  // Mark checkout as claimed
  await supabase
    .from("pending_checkouts")
    .update({ status: "claimed" })
    .eq("id", pending.id);

  return NextResponse.json({ claimed: true, plan: pending.plan, credits });
}
