import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { molliePaginate, mollieFetch } from "@/lib/mollie";
import { handleChargeback } from "@/lib/chargeback";

// Vangnet naast de webhook. Een gemiste of gefaalde webhookaanroep zou anders
// betekenen dat een teruggeboekte klant gewoon abonnee blijft en volgende maand
// opnieuw geïncasseerd wordt. Deze sweep haalt de terugboekingen van de laatste
// 90 dagen bij Mollie op en verwerkt alles wat nog niet in `chargebacks` staat.
// Draait dagelijks via Vercel Cron (zie vercel.json).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VENSTER_DAGEN = 90;

interface MollieChargeback {
  id: string;
  paymentId: string;
  amount?: { value: string; currency: string };
  createdAt?: string;
}

export async function GET(req: NextRequest) {
  // Vercel Cron stuurt `Authorization: Bearer $CRON_SECRET` mee.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sinds = new Date(Date.now() - VENSTER_DAGEN * 24 * 60 * 60 * 1000).toISOString();

  let chargebacks: MollieChargeback[];
  try {
    chargebacks = await molliePaginate<MollieChargeback>("/chargebacks", "chargebacks", {
      stopAtOlderThan: sinds,
      max: 500,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Mollie niet bereikbaar: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  const recent = chargebacks.filter((c) => !c.createdAt || c.createdAt >= sinds);

  // Alleen de nog niet verwerkte betalingen, zodat we niet elke dag opnieuw
  // langs Mollie gaan voor terugboekingen die de webhook al heeft afgehandeld.
  const supabase = createServiceClient();
  const paymentIds = [...new Set(recent.map((c) => c.paymentId).filter(Boolean))];
  const { data: bekend } = await supabase
    .from("chargebacks")
    .select("mollie_payment_id")
    .in("mollie_payment_id", paymentIds.length ? paymentIds : ["-"]);
  const alVerwerkt = new Set((bekend ?? []).map((r) => r.mollie_payment_id));

  const nieuw = recent.filter((c) => !alVerwerkt.has(c.paymentId));
  const verwerkt: string[] = [];
  const mislukt: { paymentId: string; error: string }[] = [];

  for (const cb of nieuw) {
    try {
      // De betaling levert de klant en (bij bestaande accounts) de userId.
      const payment = await mollieFetch<{
        customerId?: string;
        metadata?: { userId?: string; guestCheckoutId?: string };
      }>(`/payments/${cb.paymentId}`);

      await handleChargeback({
        userId: payment.metadata?.userId ?? null,
        customerId: payment.customerId ?? null,
        paymentId: cb.paymentId,
        amount: cb.amount?.value,
        currency: cb.amount?.currency,
        guestCheckoutId: payment.metadata?.guestCheckoutId ?? null,
      });
      verwerkt.push(cb.paymentId);
    } catch (e) {
      mislukt.push({ paymentId: cb.paymentId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (verwerkt.length || mislukt.length) {
    console.warn(
      `[cron/chargebacks] ${verwerkt.length} alsnog verwerkt, ${mislukt.length} mislukt ` +
      `(${recent.length} terugboekingen in venster van ${VENSTER_DAGEN} dagen)`
    );
  }

  return NextResponse.json({
    gecontroleerd: recent.length,
    alVerwerkt: recent.length - nieuw.length,
    verwerkt,
    mislukt,
  });
}
