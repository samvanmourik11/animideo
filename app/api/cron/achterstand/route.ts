import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ACHTERSTAND_START, recenteTerugboekingen, verstuurHerinneringen, verwerkTerugboeking } from "@/lib/achterstand";

// Dagelijks (Vercel Cron, zie vercel.json):
//  1. Vangnet naast de webhook: terugboekingen die Mollie wel kent maar wij
//     niet (gemiste of mislukte webhook), alsnog vastleggen en mailen.
//  2. Herinneringen versturen: 7 en 14 dagen na de eerste mail.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel Cron stuurt `Authorization: Bearer $CRON_SECRET` mee.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Niet verder terug dan 30 dagen: Mollie levert nieuwste eerst, en wat ouder
  // is heeft de sweep van eerdere dagen al gezien.
  const sinds = new Date(Math.max(new Date(ACHTERSTAND_START).getTime(), Date.now() - 30 * 24 * 60 * 60 * 1000)).toISOString();
  const vastgelegd: string[] = [];
  const mislukt: { paymentId: string; fout: string }[] = [];

  try {
    const cbs = await recenteTerugboekingen(sinds);
    const ids = [...new Set(cbs.map((c) => c.paymentId))];
    const { data: bekend } = await createServiceClient()
      .from("chargebacks")
      .select("mollie_payment_id")
      .in("mollie_payment_id", ids.length ? ids : ["-"]);
    const al = new Set((bekend ?? []).map((r) => r.mollie_payment_id));
    for (const id of ids.filter((i) => !al.has(i))) {
      try {
        const r = await verwerkTerugboeking(id);
        if (r.nieuw) vastgelegd.push(id);
      } catch (e) {
        mislukt.push({ paymentId: id, fout: e instanceof Error ? e.message : String(e) });
      }
    }
  } catch (e) {
    mislukt.push({ paymentId: "-", fout: `Mollie niet bereikbaar: ${e instanceof Error ? e.message : String(e)}` });
  }

  const herinneringen = await verstuurHerinneringen();

  if (vastgelegd.length || mislukt.length || herinneringen.length) {
    console.warn(
      `[cron/achterstand] ${vastgelegd.length} alsnog vastgelegd, ${herinneringen.length} mails, ${mislukt.length} mislukt`
    );
  }
  return NextResponse.json({ vastgelegd, herinneringen, mislukt });
}
