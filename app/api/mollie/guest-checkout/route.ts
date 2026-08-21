import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isBillingBlockedByEmail, BILLING_BLOCKED_MESSAGE } from "@/lib/chargeback";
import { zoekBlokkade, BLOKKADE_MELDING } from "@/lib/billing-blocklist";

const MOLLIE_BASE = "https://api.mollie.com/v2";

const PLANS = {
  starter: { amount: "49.00", label: "Starter",  description: "JouwAnimatieVideo A.I., Starter (maandelijks abonnement)" },
  pro:     { amount: "99.00", label: "Pro",       description: "JouwAnimatieVideo A.I., Pro (maandelijks abonnement)" },
  agency:  { amount: "249.00", label: "Agency",   description: "JouwAnimatieVideo A.I., Agency (maandelijks abonnement)" },
} as const;

type PlanId = keyof typeof PLANS;

export async function POST(req: NextRequest) {
  const apiKey  = process.env.MOLLIE_API_KEY;
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL;
  if (!apiKey || !appUrl) {
    return NextResponse.json({ error: "Mollie niet geconfigureerd" }, { status: 500 });
  }

  const { planId, email } = await req.json() as { planId: PlanId; email: string };
  if (!PLANS[planId]) return NextResponse.json({ error: "Ongeldig pakket" }, { status: 400 });
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Ongeldig e-mailadres" }, { status: 400 });

  // Terugboeking op dit e-mailadres: geen nieuw mandaat opzetten.
  if (await isBillingBlockedByEmail(email)) {
    return NextResponse.json({ error: BILLING_BLOCKED_MESSAGE }, { status: 403 });
  }
  // Naast een geblokkeerd account ook de zwarte lijst: die kent adressen van
  // mensen die (nog) geen account hebben.
  if (await zoekBlokkade({ email })) {
    return NextResponse.json({ error: BLOKKADE_MELDING }, { status: 403 });
  }

  const plan = PLANS[planId];

  // 1. Create Mollie customer
  const custRes = await fetch(`${MOLLIE_BASE}/customers`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: email, email }),
  });
  if (!custRes.ok) {
    const err = await custRes.text();
    return NextResponse.json({ error: `Kon klant niet aanmaken: ${err}` }, { status: 500 });
  }
  const customer = await custRes.json();
  const customerId = customer.id as string;

  // 2. Insert pending_checkout row first (we need the row id for metadata)
  const supabase = createServiceClient();
  const { data: pending, error: dbErr } = await supabase
    .from("pending_checkouts")
    .insert({ email: email.toLowerCase(), plan: planId, mollie_customer_id: customerId, status: "pending" })
    .select("id")
    .single();

  if (dbErr || !pending) {
    return NextResponse.json({ error: "Database fout" }, { status: 500 });
  }

  // 3. Create first payment — redirect back to success page
  const paymentRes = await fetch(`${MOLLIE_BASE}/payments`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { currency: "EUR", value: plan.amount },
      description: plan.description,
      sequenceType: "first",
      customerId,
      redirectUrl: `${appUrl}/checkout/success?checkout_id=${pending.id}&email=${encodeURIComponent(email)}&plan=${planId}`,
      webhookUrl:  `${appUrl}/api/mollie/webhook`,
      metadata: { planId, guestCheckoutId: pending.id, isGuest: true },
    }),
  });

  if (!paymentRes.ok) {
    const err = await paymentRes.text();
    return NextResponse.json({ error: `Mollie betalingsfout: ${err}` }, { status: 500 });
  }

  const payment = await paymentRes.json();

  // 4. Store payment ID
  await supabase
    .from("pending_checkouts")
    .update({ mollie_payment_id: payment.id })
    .eq("id", pending.id);

  return NextResponse.json({ checkoutUrl: payment._links.checkout.href });
}
