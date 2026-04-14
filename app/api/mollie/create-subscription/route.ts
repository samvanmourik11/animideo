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
    .select("mollie_customer_id")
    .eq("id", user.id)
    .single();

  let customerId = profile?.mollie_customer_id;

  if (!customerId) {
    const custRes = await fetch(`${MOLLIE_BASE}/customers`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: user.email,
        email: user.email,
        metadata: { userId: user.id },
      }),
    });
    if (!custRes.ok) {
      return NextResponse.json({ error: "Kon Mollie klant niet aanmaken" }, { status: 500 });
    }
    const customer = await custRes.json();
    customerId = customer.id;
    await supabase
      .from("profiles")
      .update({ mollie_customer_id: customerId })
      .eq("id", user.id);
  }

  const plan = PLANS[planId];

  // Create first payment (sequenceType: first) — this sets up the mandate
  const paymentRes = await fetch(`${MOLLIE_BASE}/payments`, {
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

  if (!paymentRes.ok) {
    const err = await paymentRes.text();
    return NextResponse.json({ error: `Mollie betalingsfout: ${err}` }, { status: 500 });
  }

  const payment = await paymentRes.json();
  return NextResponse.json({ checkoutUrl: payment._links.checkout.href });
}
