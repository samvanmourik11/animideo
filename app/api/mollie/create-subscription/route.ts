import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MOLLIE_BASE = "https://api.mollie.com/v2";

const PLANS = {
  starter: { amount: "49.00", description: "JouwAnimatieVideo A.I. — Starter (maandelijks abonnement)" },
  pro:     { amount: "99.00", description: "JouwAnimatieVideo A.I. — Pro (maandelijks abonnement)" },
  agency:  { amount: "249.00", description: "JouwAnimatieVideo A.I. — Agency (maandelijks abonnement)" },
} as const;

type PlanId = keyof typeof PLANS;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { planId } = await req.json() as { planId: PlanId };
  if (!PLANS[planId]) {
    return NextResponse.json({ error: "Ongeldig abonnement" }, { status: 400 });
  }

  const apiKey = process.env.MOLLIE_API_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!apiKey || !appUrl) {
    return NextResponse.json({ error: "Mollie niet geconfigureerd" }, { status: 500 });
  }

  // Ensure customer exists
  const { data: profile } = await supabase
    .from("profiles")
    .select("mollie_customer_id, mollie_subscription_id")
    .eq("id", user.id)
    .single();

  let customerId = profile?.mollie_customer_id;

  // Cancel ALL active subscriptions for this customer before creating a new one
  if (customerId) {
    const subsRes = await fetch(`${MOLLIE_BASE}/customers/${customerId}/subscriptions?limit=50`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    if (subsRes.ok) {
      const subsData = await subsRes.json();
      const activeSubs = (subsData._embedded?.subscriptions ?? []).filter(
        (s: { status: string; id: string }) => s.status === "active" || s.status === "pending"
      );
      await Promise.all(activeSubs.map((s: { id: string }) =>
        fetch(`${MOLLIE_BASE}/customers/${customerId}/subscriptions/${s.id}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${apiKey}` },
        })
      ));
    }
    await supabase
      .from("profiles")
      .update({ mollie_subscription_id: null })
      .eq("id", user.id);
  }

  async function createMollieCustomer() {
    const custRes = await fetch(`${MOLLIE_BASE}/customers`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: user!.email,
        email: user!.email,
        metadata: { userId: user!.id },
      }),
    });
    if (!custRes.ok) return null;
    const customer = await custRes.json();
    await supabase
      .from("profiles")
      .update({ mollie_customer_id: customer.id })
      .eq("id", user!.id);
    return customer.id as string;
  }

  if (!customerId) {
    const newId = await createMollieCustomer();
    if (!newId) return NextResponse.json({ error: "Kon Mollie klant niet aanmaken" }, { status: 500 });
    customerId = newId;
  }

  const plan = PLANS[planId];

  // Create first payment (sequenceType: first) — this sets up the mandate
  let paymentRes = await fetch(`${MOLLIE_BASE}/payments`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: { currency: "EUR", value: plan.amount },
      description: plan.description,
      sequenceType: "first",
      customerId,
      redirectUrl: `${appUrl}/dashboard?upgraded=true`,
      webhookUrl: `${appUrl}/api/mollie/webhook`,
      metadata: { userId: user.id, planId, interval: "1 month" },
    }),
  });

  // If customer exists in wrong mode, create a fresh one and retry
  if (!paymentRes.ok) {
    const errBody = await paymentRes.json().catch(() => ({}));
    if (errBody?.detail?.includes("wrong mode")) {
      const newId = await createMollieCustomer();
      if (!newId) return NextResponse.json({ error: "Kon Mollie klant niet aanmaken" }, { status: 500 });
      customerId = newId;
      paymentRes = await fetch(`${MOLLIE_BASE}/payments`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: { currency: "EUR", value: plan.amount },
          description: plan.description,
          sequenceType: "first",
          customerId,
          redirectUrl: `${appUrl}/dashboard?upgraded=true`,
          webhookUrl: `${appUrl}/api/mollie/webhook`,
          metadata: { userId: user.id, planId, interval: "1 month" },
        }),
      });
    }
  }

  if (!paymentRes.ok) {
    const err = await paymentRes.text();
    return NextResponse.json({ error: `Mollie betalingsfout: ${err}` }, { status: 500 });
  }

  const payment = await paymentRes.json();
  return NextResponse.json({ checkoutUrl: payment._links.checkout.href });
}
