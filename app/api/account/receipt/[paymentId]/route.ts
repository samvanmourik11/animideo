import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildReceiptPdf,
  vatBreakdown,
  toCents,
  receiptNumber,
  dateLabelNL,
} from "@/lib/receipt";

const MOLLIE_BASE = "https://api.mollie.com/v2";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const { paymentId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Mollie niet geconfigureerd" }, { status: 500 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("mollie_customer_id, email")
    .eq("id", user.id)
    .single();

  if (!profile?.mollie_customer_id) {
    return NextResponse.json({ error: "Geen betalingen gevonden" }, { status: 404 });
  }

  const res = await fetch(`${MOLLIE_BASE}/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    return NextResponse.json({ error: "Betaling niet gevonden" }, { status: 404 });
  }

  const payment = await res.json();

  // Eigendoms- en statuscontrole: de betaling moet bij deze klant horen en betaald zijn.
  if (payment.customerId !== profile.mollie_customer_id || payment.status !== "paid") {
    return NextResponse.json({ error: "Geen toegang tot dit bonnetje" }, { status: 403 });
  }

  const incl = toCents(payment.amount.value);
  const { exclCents, vatCents } = vatBreakdown(incl);
  const date = payment.paidAt ?? payment.createdAt;

  const pdf = await buildReceiptPdf({
    receiptNumber: receiptNumber(payment.id, date),
    dateLabel: dateLabelNL(date),
    customerEmail: profile.email ?? user.email ?? "",
    description: payment.description ?? "JouwAnimatieVideo A.I.",
    inclCents: incl,
    exclCents,
    vatCents,
    paymentId: payment.id,
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${receiptNumber(payment.id, date)}.pdf"`,
    },
  });
}
