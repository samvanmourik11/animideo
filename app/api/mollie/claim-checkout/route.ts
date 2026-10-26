import { PLAN_CREDITS } from "@/lib/credit-costs";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { GRATIS_WEEK_CREDITS, isGratisWeek } from "@/lib/gratis-week";


// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_req: NextRequest) {
  // Wie het is, komt uit de sessie, niet uit wat de browser meestuurt: eerder stonden userId en
  // e-mail in de body, en kon iedereen andermans betaalde checkout aan zijn eigen account hangen.
  const sessie = await createClient();
  const { data: { user } } = await sessie.auth.getUser();
  if (!user?.email) return NextResponse.json({ claimed: false }, { status: 401 });
  const userId = user.id;
  const email = user.email;

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
  // De gratis week krijgt 200 credits; de maandbundel komt bij de eerste echte incasso.
  const gratisWeek = !isTraject && (await isGratisWeek(pending.id));
  const credits = isTraject ? 3000 : gratisWeek ? GRATIS_WEEK_CREDITS : (PLAN_CREDITS[pending.plan] ?? 100);
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
    reason: isTraject ? "Starttraject geactiveerd: 3000 credits" : gratisWeek ? `Gratis week gestart: ${pending.plan}` : `Abonnement gekoppeld na registratie: ${pending.plan}`,
  });

  // Mark checkout as claimed
  await supabase
    .from("pending_checkouts")
    .update({ status: "claimed" })
    .eq("id", pending.id);

  return NextResponse.json({ claimed: true, plan: pending.plan, credits });
}
