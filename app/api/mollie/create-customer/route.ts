import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MOLLIE_BASE = "https://api.mollie.com/v2";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Mollie niet geconfigureerd" }, { status: 500 });

  // Check if customer already exists
  const { data: profile } = await supabase
    .from("profiles")
    .select("mollie_customer_id, email")
    .eq("id", user.id)
    .single();

  if (profile?.mollie_customer_id) {
    return NextResponse.json({ customerId: profile.mollie_customer_id });
  }

  // Create new Mollie customer
  const res = await fetch(`${MOLLIE_BASE}/customers`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: user.email,
      email: user.email,
      metadata: { userId: user.id },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Mollie fout: ${err}` }, { status: 500 });
  }

  const customer = await res.json();

  // Save to profile
  await supabase
    .from("profiles")
    .update({ mollie_customer_id: customer.id })
    .eq("id", user.id);

  return NextResponse.json({ customerId: customer.id });
}
