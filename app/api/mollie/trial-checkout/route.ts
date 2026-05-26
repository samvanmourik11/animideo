import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const MOLLIE_BASE = "https://api.mollie.com/v2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.MOLLIE_API_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!apiKey || !appUrl) {
    return json({ error: "Mollie niet geconfigureerd" }, 500);
  }

  const { email } = await req.json() as { email?: string };
  if (!email || !email.includes("@")) {
    return json({ error: "Ongeldig e-mailadres" }, 400);
  }

  const supabase = createServiceClient();
  const { data: pending, error: insertError } = await supabase
    .from("pending_checkouts")
    .insert({
      email: email.toLowerCase(),
      plan: "starter",
      status: "pending",
      is_trial: true,
    })
    .select("id, email, plan")
    .single();

  if (insertError || !pending) {
    return json({ error: "Database fout" }, 500);
  }

  const custRes = await fetch(`${MOLLIE_BASE}/customers`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: pending.email, email: pending.email }),
  });
  if (!custRes.ok) {
    const err = await custRes.text();
    return json({ error: `Kon klant niet aanmaken: ${err}` }, 500);
  }
  const customer = await custRes.json();
  const customerId = customer.id as string;

  const paymentRes = await fetch(`${MOLLIE_BASE}/payments`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { currency: "EUR", value: "1.00" },
      description: "JouwAnimatieVideo A.I., 7 dagen proef (€1, daarna €49/m Starter)",
      sequenceType: "first",
      customerId,
      redirectUrl: `${appUrl}/checkout/success?checkout_id=${pending.id}&email=${encodeURIComponent(pending.email)}&plan=${pending.plan}`,
      webhookUrl: `${appUrl}/api/mollie/webhook`,
      metadata: { planId: pending.plan, guestCheckoutId: pending.id, isGuest: true, isTrial: true },
    }),
  });

  if (!paymentRes.ok) {
    const err = await paymentRes.text();
    return json({ error: `Mollie betalingsfout: ${err}` }, 500);
  }

  const payment = await paymentRes.json();

  await supabase
    .from("pending_checkouts")
    .update({ mollie_customer_id: customerId, mollie_payment_id: payment.id })
    .eq("id", pending.id);

  return json({ checkoutUrl: payment._links.checkout.href });
}
