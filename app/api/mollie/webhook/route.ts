import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handleChargeback, revokeMollieBilling } from "@/lib/chargeback";
import { zoekBlokkade } from "@/lib/billing-blocklist";

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
  starter: "JouwAnimatieVideo A.I., Starter",
  pro: "JouwAnimatieVideo A.I., Pro",
  agency: "JouwAnimatieVideo A.I., Agency",
};

// Mollie webhooks are publicly accessible — no auth required
export async function POST(req: NextRequest) {
  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Mollie niet geconfigureerd" }, { status: 500 });

  const body = await req.formData().catch(() => null);
  const paymentId = body?.get("id") as string | null;

  if (!paymentId) {
    return NextResponse.json({ error: "Geen payment ID ontvangen" }, { status: 400 });
  }

  // Fetch payment details from Mollie
  const paymentRes = await fetch(`${MOLLIE_BASE}/payments/${paymentId}`, {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });

  if (!paymentRes.ok) {
    return NextResponse.json({ error: "Kon betaling niet ophalen" }, { status: 500 });
  }

  const payment = await paymentRes.json();
  const { status, metadata, sequenceType, mandateId, customerId } = payment;

  let userId            = metadata?.userId          as string | undefined;
  let planId            = metadata?.planId          as string | undefined;
  const isGuest         = metadata?.isGuest         as boolean | undefined;
  const guestCheckoutId = metadata?.guestCheckoutId as string | undefined;
  const isCursus        = metadata?.isCursus        as boolean | undefined;
  const isTrial         = metadata?.isTrial         as boolean | undefined;
  const isTraject       = metadata?.isTraject       as boolean | undefined;

  const supabase = createServiceClient();

  // ── Terugboeking (chargeback / SEPA-storno) ───────────────────────────────
  // Mollie roept déze webhook aan zodra er op de betaling wordt teruggeboekt;
  // de betaalstatus blijft dan gewoon "paid" en alleen `amountChargedback`
  // loopt op. Deze controle staat daarom bewust vóór alle andere takken: zonder
  // die volgorde zou een teruggeboekte incasso hieronder als geslaagde
  // vervolgbetaling worden gelezen en zouden er credits worden bíjgeschreven.
  // ── Zwarte lijst ──────────────────────────────────────────────────────────
  // Het rekeningnummer kennen we pas hier: bij het starten van de checkout is
  // er alleen een e-mailadres, en dat verzint deze persoon elke keer opnieuw.
  // Staat de rekening op de lijst, dan draaien we de betaling meteen terug in
  // dienstverlening: abonnement eruit, mandaat eruit, geen account, geen
  // credits. De betaling zelf laten we staan — terugstorten is een beslissing
  // van een mens, niet van een webhook.
  const rekening = payment.details?.consumerAccount as string | undefined;
  const rekeninghouder = payment.details?.consumerName as string | undefined;
  const zwarteLijst = await zoekBlokkade({ iban: rekening, naam: rekeninghouder });
  if (zwarteLijst) {
    console.warn(
      `[webhook] betaling ${paymentId} geweigerd — ${zwarteLijst.soort} staat op de zwarte lijst (${zwarteLijst.reden ?? "geen reden vastgelegd"})`
    );
    if (customerId) {
      await revokeMollieBilling(customerId).catch((e) =>
        console.error("[webhook] intrekken bij Mollie mislukt:", e instanceof Error ? e.message : String(e))
      );
    }
    if (guestCheckoutId) {
      await supabase.from("pending_checkouts").update({ status: "blocked" }).eq("id", guestCheckoutId);
    }
    if (userId) {
      await supabase
        .from("profiles")
        .update({
          billing_blocked: true,
          billing_blocked_at: new Date().toISOString(),
          billing_blocked_reason: `Betaling ${paymentId} vanaf een geblokkeerde ${zwarteLijst.soort}`,
        })
        .eq("id", userId);
    }
    return NextResponse.json({ received: true });
  }

  const teruggeboekt = Number(payment.amountChargedback?.value ?? 0) > 0;
  if (teruggeboekt) {
    await handleChargeback({
      userId,
      customerId,
      paymentId,
      amount: payment.amountChargedback?.value,
      currency: payment.amountChargedback?.currency,
      guestCheckoutId,
    });
    return NextResponse.json({ received: true });
  }

  // ── Starttraject (eenmalige betaling €246 → 3000 credits) ────────────────
  // Volledig geïsoleerd: markeer de checkout als betaald en stop. Geen
  // abonnement/mandaat. De 3000 credits worden bij claim-checkout toegekend
  // zodra de klant na registratie inlogt. Raakt géén bestaande abonnee-logica.
  if (isTraject && guestCheckoutId) {
    if (status === "paid") {
      await supabase
        .from("pending_checkouts")
        .update({ status: "paid" })
        .eq("id", guestCheckoutId);
    }
    return NextResponse.json({ received: true });
  }

  // ── Guest checkout (no account yet) ──────────────────────────────────────
  if (isGuest && guestCheckoutId && planId) {
    if (status === "paid" && sequenceType === "first") {
      // Resolve mandate
      let resolvedMandateId: string | null = mandateId as string | null;
      if (!resolvedMandateId && customerId) {
        const mandatesRes = await fetch(`${MOLLIE_BASE}/customers/${customerId}/mandates`, {
          headers: { "Authorization": `Bearer ${apiKey}` },
        });
        if (mandatesRes.ok) {
          const mandatesData = await mandatesRes.json();
          const validMandate = (mandatesData._embedded?.mandates ?? []).find(
            (m: { status: string }) => m.status === "valid"
          );
          resolvedMandateId = validMandate?.id ?? null;
        }
      }

      // Create recurring subscription
      const subBody: Record<string, unknown> = {
        amount: { currency: "EUR", value: PLAN_AMOUNT[planId] },
        times: null,
        interval: "1 month",
        description: PLAN_DESCRIPTION[planId],
        webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/mollie/webhook`,
        metadata: { planId, guestCheckoutId, isGuest: true },
      };
      if (resolvedMandateId) subBody.mandateId = resolvedMandateId;
      if (isTrial) {
        // €1 trial: full €49/m starts 7 days later
        const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        subBody.startDate = start.toISOString().slice(0, 10);
      } else if (isCursus) {
        // First month was €1; recurring billing of full price starts 30 days later
        const start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        subBody.startDate = start.toISOString().slice(0, 10);
      }

      let subscriptionId: string | null = null;
      const subRes = await fetch(`${MOLLIE_BASE}/customers/${customerId}/subscriptions`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(subBody),
      });
      if (subRes.ok) {
        const sub = await subRes.json();
        subscriptionId = sub.id;
      }

      // Mark checkout as paid + store subscription
      await supabase
        .from("pending_checkouts")
        .update({ status: "paid", mollie_subscription_id: subscriptionId })
        .eq("id", guestCheckoutId);
      return NextResponse.json({ received: true });
    }

    // Een betaalde maandverlenging van een abonnement dat als gast begon. Hier stond
    // een kale `return` voor élke gastbetaling, ook voor de verlengingen: 72 betaalde
    // maanden bij 41 klanten zonder één credit erbij (gevonden 15-09-2026). De
    // metadata heeft geen userId, want het account bestond bij de aanmelding nog
    // niet; het account vinden we via het e-mailadres van de checkout.
    if (!(status === "paid" && sequenceType === "recurring")) {
      return NextResponse.json({ received: true });
    }
    const { data: checkout } = await supabase
      .from("pending_checkouts")
      .select("email")
      .eq("id", guestCheckoutId)
      .maybeSingle();
    if (checkout?.email) {
      const { data: account } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", checkout.email.replace(/[\\%_]/g, "\\$&"))
        .maybeSingle();
      userId = account?.id ?? userId;
    }
    // Geen account gevonden? Dan probeert de terugval via het Mollie-customer-id
    // hieronder het nog; lukt ook dat niet, dan valt er niets bij te schrijven.
  }

  // Vervolgbetalingen dragen de metadata van de ABONNEMENTS-aanmaak, en bij een
  // gast-checkout bestond het account toen nog niet — daar zit dus geen userId in.
  // Zonder deze terugval viel elke maandelijkse verlenging stil uit de webhook en
  // werden de credits nooit ververst (51 betaalde vervolgmaanden, 2 verversingen).
  // Daarom: klant opzoeken via het Mollie-customer-id op het profiel.
  if ((!userId || !planId) && customerId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, plan")
      .eq("mollie_customer_id", customerId)
      .maybeSingle();
    if (prof) {
      userId = userId ?? prof.id;
      // Plan uit de metadata is leidend; anders het plan dat op het profiel staat.
      planId = planId ?? (prof.plan && prof.plan !== "free" ? prof.plan : "starter");
    }
  }

  if (!userId || !planId) {
    // Could be a test ping from Mollie — just return 200
    return NextResponse.json({ received: true });
  }

  // Een account dat na een terugboeking op slot staat mag nooit meer via de
  // webhook geactiveerd of bijgeschreven worden. Landt er tóch nog een betaling,
  // dan trekken we de resterende incassosporen (nogmaals) in.
  const { data: blokkade } = await supabase
    .from("profiles")
    .select("billing_blocked")
    .eq("id", userId)
    .maybeSingle();
  if (blokkade?.billing_blocked) {
    if (customerId) {
      await revokeMollieBilling(customerId).catch((e) =>
        console.error("[webhook] intrekken na blokkade mislukt:", e instanceof Error ? e.message : String(e))
      );
    }
    console.warn(`[webhook] betaling ${paymentId} genegeerd — account ${userId} geblokkeerd na terugboeking`);
    return NextResponse.json({ received: true, blocked: true });
  }

  // ── Successful first payment: create subscription + update profile ────────
  if (status === "paid" && sequenceType === "first") {
    // mandateId may not be directly on the payment for SEPA — fetch from customer mandates
    let resolvedMandateId = mandateId as string | null;
    if (!resolvedMandateId && customerId) {
      const mandatesRes = await fetch(`${MOLLIE_BASE}/customers/${customerId}/mandates`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      if (mandatesRes.ok) {
        const mandatesData = await mandatesRes.json();
        const validMandate = (mandatesData._embedded?.mandates ?? []).find(
          (m: { status: string; id: string }) => m.status === "valid"
        );
        resolvedMandateId = validMandate?.id ?? null;
      }
    }

    const credits = PLAN_CREDITS[planId] ?? 100;

    // Create recurring subscription
    const subBody: Record<string, unknown> = {
      amount: { currency: "EUR", value: PLAN_AMOUNT[planId] },
      times: null, // unlimited
      interval: "1 month",
      description: PLAN_DESCRIPTION[planId],
      webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/mollie/webhook`,
      metadata: { userId, planId },
    };
    if (resolvedMandateId) subBody.mandateId = resolvedMandateId;

    const subRes = await fetch(`${MOLLIE_BASE}/customers/${customerId}/subscriptions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(subBody),
    });

    let subscriptionId: string | null = null;
    if (subRes.ok) {
      const sub = await subRes.json();
      subscriptionId = sub.id;
    }

    await supabase
      .from("profiles")
      .update({
        plan: planId,
        credits,
        subscription_status: "active",
        mollie_subscription_id: subscriptionId,
        credits_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", userId);

    await supabase.from("credit_transactions").insert({
      user_id: userId,
      amount: credits,
      reason: `Abonnement gestart: ${planId}`,
    });

    return NextResponse.json({ received: true });
  }

  // ── Successful recurring payment: renew credits ───────────────────────────
  if (status === "paid" && sequenceType === "recurring") {
    // Een teruggeboekte incasso wordt hierboven al afgehandeld; dubbel veilig.
    if (Number(payment.amountChargedback?.value ?? 0) > 0) {
      return NextResponse.json({ received: true });
    }

    // Eén vernieuwing per betaling. Mollie kan dezelfde betaling meer dan eens melden;
    // een vernieuwing die ná het betaalmoment al geboekt is, hoort bij déze betaling.
    // Tien minuten speling voor klokverschil tussen Mollie en de database.
    const betaaldOp = new Date(payment.paidAt ?? Date.now()).getTime();
    const { data: alGeboekt } = await supabase
      .from("credit_transactions")
      .select("id")
      .eq("user_id", userId)
      .like("reason", "Credits vernieuwd%")
      .gte("created_at", new Date(betaaldOp - 10 * 60 * 1000).toISOString())
      .limit(1);
    if (alGeboekt?.length) {
      return NextResponse.json({ received: true });
    }

    // Bij elke betaalde maand de volledige maandbundel erbij, zonder plafond (Sam,
    // 15-09-2026). Hier stond een grens van twee maandbundels; wie betaalt, krijgt
    // de credits van die maand, ook als hij de maand ervoor weinig gebruikte.
    const bundel = PLAN_CREDITS[planId] ?? 100;
    const { data: prof } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .maybeSingle();
    const credits = (prof?.credits ?? 0) + bundel;

    await supabase
      .from("profiles")
      .update({
        credits,
        credits_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", userId);

    await supabase.from("credit_transactions").insert({
      user_id: userId,
      amount: bundel,
      reason: `Credits vernieuwd: ${planId}`,
    });

    return NextResponse.json({ received: true });
  }

  // ── Cancelled subscription ────────────────────────────────────────────────
  if (status === "canceled" || status === "expired") {
    await supabase
      .from("profiles")
      .update({
        plan: "free",
        // Credits blijven staan: die zijn al betaald. Opzeggen stopt alleen
        // nieuwe maandbundels, het bestaande saldo blijft bruikbaar.
        subscription_status: "canceled",
        mollie_subscription_id: null,
        credits_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", userId);
  }

  return NextResponse.json({ received: true });
}
