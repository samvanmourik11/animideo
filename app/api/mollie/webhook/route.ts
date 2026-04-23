import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

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
  starter: "Animideo A.I. — Starter",
  pro: "Animideo A.I. — Pro",
  agency: "Animideo A.I. — Agency",
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

  const userId          = metadata?.userId          as string | undefined;
  const planId          = metadata?.planId          as string | undefined;
  const isGuest         = metadata?.isGuest         as boolean | undefined;
  const guestCheckoutId = metadata?.guestCheckoutId as string | undefined;

  const supabase = createServiceClient();

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
    }
    return NextResponse.json({ received: true });
  }

  if (!userId || !planId) {
    // Could be a test ping from Mollie — just return 200
    return NextResponse.json({ received: true });
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
    const credits = PLAN_CREDITS[planId] ?? 100;

    await supabase
      .from("profiles")
      .update({
        credits,
        credits_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", userId);

    await supabase.from("credit_transactions").insert({
      user_id: userId,
      amount: credits,
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
        credits: 100,
        subscription_status: "canceled",
        mollie_subscription_id: null,
        credits_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", userId);
  }

  return NextResponse.json({ received: true });
}
