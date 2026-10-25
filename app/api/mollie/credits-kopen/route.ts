import { magGebruiker } from "@/lib/plan-rechten-server";
import { upgradeTekst } from "@/lib/plan-rechten";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CREDIT_PAKKETTEN } from "@/lib/credit-costs";

// Losse credits bijkopen (Sam, 25-10-2026: "net als Higgsfield"). Een eenmalige betaling,
// geen mandaat: de webhook schrijft de credits bij zodra Mollie "paid" meldt. Alleen voor
// abonnees, zodat bijkopen nooit goedkoper uitvalt dan een abonnement.

const MOLLIE_BASE = "https://api.mollie.com/v2";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Log eerst in." }, { status: 401 });

  const { pakket: pakketId } = (await req.json().catch(() => ({}))) as { pakket?: string };
  const pakket = CREDIT_PAKKETTEN.find((p) => p.id === pakketId);
  if (!pakket) return NextResponse.json({ error: "Onbekend pakket." }, { status: 400 });

  const apiKey = process.env.MOLLIE_API_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!apiKey || !appUrl) return NextResponse.json({ error: "Mollie niet geconfigureerd" }, { status: 500 });

  const { data: profiel } = await supabase
    .from("profiles")
    .select("plan, subscription_status, mollie_customer_id")
    .eq("id", user.id)
    .single();
  if (!profiel || profiel.plan === "free" || profiel.subscription_status !== "active") {
    return NextResponse.json({ error: "Losse credits kun je bijkopen met een abonnement." }, { status: 403 });
  }
  if (!(await magGebruiker(user.id, "losseCredits"))) return NextResponse.json({ error: upgradeTekst("losseCredits") }, { status: 403 });

  const betaling = async (metKlant: boolean) =>
    fetch(`${MOLLIE_BASE}/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: { currency: "EUR", value: pakket.prijs.toFixed(2) },
        description: `Animideo (JouwAnimatieVideo), ${pakket.credits} losse credits`,
        // Met de klant erbij staat de betaling in Mollie bij zijn abonnement.
        ...(metKlant && profiel.mollie_customer_id ? { customerId: profiel.mollie_customer_id } : {}),
        redirectUrl: `${appUrl}/pricing?gekocht=${pakket.credits}`,
        webhookUrl: `${appUrl}/api/mollie/webhook`,
        metadata: { userId: user.id, creditPakket: pakket.id },
      }),
    });

  let res = await betaling(true);
  // Een klant uit de verkeerde modus (test/live) mag de aankoop niet blokkeren: dan zonder.
  if (!res.ok) res = await betaling(false);
  if (!res.ok) {
    console.error("[credits-kopen] Mollie:", await res.text());
    return NextResponse.json({ error: "Afrekenen lukte niet. Probeer het zo nog eens." }, { status: 502 });
  }
  const payment = await res.json();
  return NextResponse.json({ checkoutUrl: payment._links.checkout.href });
}
