import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const MOLLIE_BASE = "https://api.mollie.com/v2";

// Het Starttraject: EENMALIGE betaling van €246 → 3000 credits + Starter-toegang.
// Geen abonnement (sequenceType oneoff, geen mandaat). De credit-toekenning
// gebeurt bij het claimen na registratie (zie claim-checkout, plan="traject").
const TRAJECT_AMOUNT = "246.00";
const TRAJECT_CREDITS = 3000;

export async function POST(req: NextRequest) {
  const apiKey = process.env.MOLLIE_API_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!apiKey || !appUrl) {
    return NextResponse.json({ error: "Mollie niet geconfigureerd" }, { status: 500 });
  }

  const { email, acceptedTerms, newsletter } = (await req.json()) as {
    email?: string;
    acceptedTerms?: boolean;
    newsletter?: boolean;
  };
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Ongeldig e-mailadres" }, { status: 400 });
  }
  // Consent aantoonbaar server-side afdwingen (voorkomt chargebacks).
  if (acceptedTerms !== true) {
    return NextResponse.json({ error: "Akkoord met de voorwaarden is verplicht." }, { status: 400 });
  }
  const consentAt = new Date().toISOString();

  const supabase = createServiceClient();
  const { data: pending, error: insertError } = await supabase
    .from("pending_checkouts")
    .insert({
      email: email.toLowerCase(),
      plan: "traject", // gemarkeerd als traject; claim kent 3000 credits + Starter toe
      status: "pending",
    })
    .select("id, email, plan")
    .single();

  if (insertError || !pending) {
    return NextResponse.json({ error: "Database fout" }, { status: 500 });
  }

  // Eenmalige betaling (geen customer/mandaat nodig).
  const paymentRes = await fetch(`${MOLLIE_BASE}/payments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { currency: "EUR", value: TRAJECT_AMOUNT },
      description: "JouwAnimatieVideo A.I., Starttraject (6 maanden + begeleiding)",
      redirectUrl: `${appUrl}/checkout/traject/success?checkout_id=${pending.id}&email=${encodeURIComponent(pending.email)}`,
      webhookUrl: `${appUrl}/api/mollie/webhook`,
      metadata: {
        planId: "traject",
        guestCheckoutId: pending.id,
        isTraject: true,
        credits: TRAJECT_CREDITS,
        consent: { terms: true, newsletter: newsletter === true, at: consentAt },
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
    .update({ mollie_payment_id: payment.id })
    .eq("id", pending.id);

  return NextResponse.json({ checkoutUrl: payment._links.checkout.href });
}
