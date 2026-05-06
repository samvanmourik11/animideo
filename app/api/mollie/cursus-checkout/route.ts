import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const MOLLIE_BASE = "https://api.mollie.com/v2";

export async function POST(req: NextRequest) {
  const apiKey = process.env.MOLLIE_API_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!apiKey || !appUrl) {
    return NextResponse.json({ error: "Mollie niet geconfigureerd" }, { status: 500 });
  }

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: "Geen checkout id" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: pending } = await supabase
    .from("pending_checkouts")
    .select("id, email, plan, status, is_cursus")
    .eq("id", id)
    .single();

  if (!pending) return NextResponse.json({ error: "Link niet gevonden" }, { status: 404 });
  if (!pending.is_cursus) return NextResponse.json({ error: "Geen cursus-link" }, { status: 400 });
  if (pending.status !== "pending") {
    return NextResponse.json({ error: "Deze link is al gebruikt" }, { status: 410 });
  }

  const custRes = await fetch(`${MOLLIE_BASE}/customers`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: pending.email, email: pending.email }),
  });
  if (!custRes.ok) {
    const err = await custRes.text();
    return NextResponse.json({ error: `Kon klant niet aanmaken: ${err}` }, { status: 500 });
  }
  const customer = await custRes.json();
  const customerId = customer.id as string;

  const paymentRes = await fetch(`${MOLLIE_BASE}/payments`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { currency: "EUR", value: "1.00" },
      description: "Animideo A.I. — Cursusaanbod (eerste maand €1, daarna €49/m)",
      sequenceType: "first",
      customerId,
      redirectUrl: `${appUrl}/checkout/success?checkout_id=${pending.id}&email=${encodeURIComponent(pending.email)}&plan=${pending.plan}`,
      webhookUrl: `${appUrl}/api/mollie/webhook`,
      metadata: { planId: pending.plan, guestCheckoutId: pending.id, isGuest: true, isCursus: true },
    }),
  });

  if (!paymentRes.ok) {
    const err = await paymentRes.text();
    return NextResponse.json({ error: `Mollie betalingsfout: ${err}` }, { status: 500 });
  }

  const payment = await paymentRes.json();

  await supabase
    .from("pending_checkouts")
    .update({ mollie_customer_id: customerId, mollie_payment_id: payment.id })
    .eq("id", pending.id);

  return NextResponse.json({ checkoutUrl: payment._links.checkout.href });
}
