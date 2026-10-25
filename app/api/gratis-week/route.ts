import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { mollieFetch } from "@/lib/mollie";
import { alGehad, PAKKET_NAAM, PAKKET_PRIJS, verificatieBedrag } from "@/lib/gratis-week";

export const runtime = "nodejs";

// Aanmelden voor de gratis week: e-mail + pakket + akkoord → iDEAL-verificatie bij Mollie.
// Het akkoord wordt hier opnieuw gecontroleerd (niet alleen in de browser) en gaat mee in de
// betaling: bij een terugboeking is dan aantoonbaar dat de klant wist dat het een abonnement is.
export async function POST(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return NextResponse.json({ error: "Betalen is nog niet ingesteld." }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as { email?: string; plan?: string; akkoordVoorwaarden?: boolean; akkoordAbonnement?: boolean; nieuwsbrief?: boolean; bron?: string };
  const email = (b.email ?? "").trim().toLowerCase();
  const plan = b.plan ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Vul een geldig e-mailadres in." }, { status: 400 });
  if (!PAKKET_PRIJS[plan]) return NextResponse.json({ error: "Kies een pakket." }, { status: 400 });
  if (b.akkoordVoorwaarden !== true || b.akkoordAbonnement !== true) {
    return NextResponse.json({ error: "Vink de twee verplichte vakjes aan om door te gaan." }, { status: 400 });
  }
  if (await alGehad(email)) {
    return NextResponse.json({ error: "Met dit e-mailadres is al een gratis week gebruikt. Log in om verder te gaan." }, { status: 409 });
  }

  const db = createServiceClient();
  const { data: pending, error } = await db
    .from("pending_checkouts")
    .insert({ email, plan, status: "pending", is_trial: true })
    .select("id")
    .single();
  if (error || !pending) return NextResponse.json({ error: "Er ging iets mis. Probeer het opnieuw." }, { status: 500 });

  const bedrag = verificatieBedrag();
  try {
    const klant = await mollieFetch<{ id: string }>("/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: email, email }),
    });
    const betaling = await mollieFetch<{ id: string; _links: { checkout: { href: string } } }>("/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: { currency: "EUR", value: bedrag },
        // Zo staat het ook op het bankafschrift: verificatie, en wat er daarna gebeurt.
        description: `Animideo verificatie (terug). Na 7 dagen gratis €${PAKKET_PRIJS[plan].replace(".", ",")}/m ${PAKKET_NAAM[plan]}`,
        method: "ideal",
        sequenceType: "first",
        customerId: klant.id,
        redirectUrl: `${appUrl}/start/klaar?checkout_id=${pending.id}&email=${encodeURIComponent(email)}&plan=${plan}`,
        webhookUrl: `${appUrl}/api/mollie/webhook`,
        metadata: {
          planId: plan,
          guestCheckoutId: pending.id,
          isGuest: true,
          gratisWeek: true,
          bron: (b.bron ?? "").slice(0, 40) || undefined,
          consent: { terms: true, subscription: true, newsletter: b.nieuwsbrief === true, at: new Date().toISOString() },
        },
      }),
    });
    await db.from("pending_checkouts").update({ mollie_customer_id: klant.id, mollie_payment_id: betaling.id }).eq("id", pending.id);
    await db.from("gratis_weken").insert({ checkout_id: pending.id, email, plan, bedrag, mollie_payment_id: betaling.id });
    return NextResponse.json({ checkoutUrl: betaling._links.checkout.href });
  } catch (e) {
    console.error("[gratis-week]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Verbinden met de bank lukte niet. Probeer het zo opnieuw." }, { status: 502 });
  }
}
