import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MOLLIE_BASE = "https://api.mollie.com/v2";

/** Lijst van betaalde transacties van de ingelogde gebruiker (voor bonnetjes). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Mollie niet geconfigureerd" }, { status: 500 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("mollie_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.mollie_customer_id) {
    return NextResponse.json({ payments: [] });
  }

  const res = await fetch(
    `${MOLLIE_BASE}/customers/${profile.mollie_customer_id}/payments?limit=250`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Kon betalingen niet ophalen" }, { status: 502 });
  }

  const data = await res.json();
  const payments = ((data._embedded?.payments ?? []) as Array<{
    id: string;
    status: string;
    description: string;
    paidAt?: string;
    createdAt: string;
    amount: { value: string; currency: string };
  }>)
    .filter((p) => p.status === "paid")
    .map((p) => ({
      id: p.id,
      description: p.description,
      date: p.paidAt ?? p.createdAt,
      amount: p.amount.value,
      currency: p.amount.currency,
    }));

  return NextResponse.json({ payments });
}
