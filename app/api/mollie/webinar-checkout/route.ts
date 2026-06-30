import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const MOLLIE_BASE = "https://api.mollie.com/v2";

export async function POST(req: NextRequest) {
  const apiKey = process.env.MOLLIE_API_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!apiKey || !appUrl) {
    return NextResponse.json({ error: "Mollie niet geconfigureerd" }, { status: 500 });
  }

  const { email, acceptedTerms, acceptedSubscription, newsletter } = await req.json() as {
    email?: string;
    acceptedTerms?: boolean;
    acceptedSubscription?: boolean;
    newsletter?: boolean;
  };
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Ongeldig e-mailadres" }, { status: 400 });
  }
  // Consent verplicht: voorkomt chargebacks doordat akkoord (voorwaarden +
  // abonnement-begrip) aantoonbaar is afgedwongen, niet alleen client-side.
  if (acceptedTerms !== true || acceptedSubscription !== true) {
    return NextResponse.json({ error: "Akkoord met de voorwaarden en het abonnement is verplicht." }, { status: 400 });
  }
  const consentAt = new Date().toISOString();

  const supabase = createServiceClient();
  const { data: pending, error: insertError } = await supabase
    .from("pending_checkouts")
    .insert({
      email: email.toLowerCase(),
      plan: "starter",
      status: "pending",
      is_cursus: true,
    })
    .select("id, email, plan")
    .single();

  if (insertError || !pending) {
    return NextResponse.json({ error: "Database fout" }, { status: 500 });
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
      description: "JouwAnimatieVideo A.I., Webinar aanbod (eerste maand €1, daarna €49/m)",
      sequenceType: "first",
      customerId,
      redirectUrl: `${appUrl}/checkout/success?checkout_id=${pending.id}&email=${encodeURIComponent(pending.email)}&plan=${pending.plan}`,
      webhookUrl: `${appUrl}/api/mollie/webhook`,
      metadata: {
        planId: pending.plan,
        guestCheckoutId: pending.id,
        isGuest: true,
        isCursus: true,
        // Consent-bewijs bij de betaling (handig bij chargeback-disputes).
        consent: { terms: true, subscription: true, newsletter: newsletter === true, at: consentAt },
      },
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
