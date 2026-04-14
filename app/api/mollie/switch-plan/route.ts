import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MOLLIE_BASE = "https://api.mollie.com/v2";

const PLAN_CREDITS: Record<string, number> = {
  free: 100,
  starter: 500,
  pro: 1500,
  agency: 5000,
};

const PLAN_AMOUNT: Record<string, string> = {
  starter: "49.00",
  pro: "99.00",
  agency: "249.00",
};

const PLAN_DESCRIPTION: Record<string, string> = {
  starter: "JouwAnimatieVideo A.I. — Starter (maandelijks abonnement)",
  pro: "JouwAnimatieVideo A.I. — Pro (maandelijks abonnement)",
  agency: "JouwAnimatieVideo A.I. — Agency (maandelijks abonnement)",
};

// Handles plan switches that don't require a new checkout (downgrades + free cancellation)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { planId } = await req.json() as { planId: string };

  const apiKey = process.env.MOLLIE_API_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!apiKey || !appUrl) return NextResponse.json({ error: "Mollie niet geconfigureerd" }, { status: 500 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("mollie_customer_id, mollie_subscription_id")
    .eq("id", user.id)
    .single();

  const customerId = profile?.mollie_customer_id;

  // Cancel all active subscriptions
  if (customerId) {
    const subsRes = await fetch(`${MOLLIE_BASE}/customers/${customerId}/subscriptions?limit=50`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    if (subsRes.ok) {
      const subsData = await subsRes.json();
      const activeSubs = (subsData._embedded?.subscriptions ?? []).filter(
        (s: { status: string }) => s.status === "active" || s.status === "pending"
      );
      await Promise.all(activeSubs.map((s: { id: string }) =>
        fetch(`${MOLLIE_BASE}/customers/${customerId}/subscriptions/${s.id}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${apiKey}` },
        })
      ));
    }
  }

  // If switching to free, just cancel and downgrade
  if (planId === "free") {
    await supabase.from("profiles").update({
      plan: "free",
      subscription_status: "canceled",
      mollie_subscription_id: null,
      credits_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).eq("id", user.id);

    return NextResponse.json({ success: true });
  }

  // For paid downgrades: find existing mandate and create new subscription directly (no checkout)
  let mandateId: string | null = null;
  if (customerId) {
    const mandatesRes = await fetch(`${MOLLIE_BASE}/customers/${customerId}/mandates`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    if (mandatesRes.ok) {
      const mandatesData = await mandatesRes.json();
      const validMandate = (mandatesData._embedded?.mandates ?? []).find(
        (m: { status: string }) => m.status === "valid"
      );
      mandateId = validMandate?.id ?? null;
    }
  }

  if (!mandateId || !customerId) {
    return NextResponse.json({ error: "Geen geldig mandaat gevonden. Doorloop de betaalpagina." }, { status: 400 });
  }

  // Create new subscription at new price using existing mandate
  const subRes = await fetch(`${MOLLIE_BASE}/customers/${customerId}/subscriptions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { currency: "EUR", value: PLAN_AMOUNT[planId] },
      times: null,
      interval: "1 month",
      description: PLAN_DESCRIPTION[planId],
      mandateId,
      webhookUrl: `${appUrl}/api/mollie/webhook`,
      metadata: { userId: user.id, planId },
    }),
  });

  let subscriptionId: string | null = null;
  if (subRes.ok) {
    const sub = await subRes.json();
    subscriptionId = sub.id;
  }

  const credits = PLAN_CREDITS[planId] ?? 100;

  await supabase.from("profiles").update({
    plan: planId,
    credits,
    subscription_status: "active",
    mollie_subscription_id: subscriptionId,
    credits_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }).eq("id", user.id);

  await supabase.from("credit_transactions").insert({
    user_id: user.id,
    amount: credits,
    reason: `Plan gewijzigd naar: ${planId}`,
  });

  return NextResponse.json({ success: true });
}
