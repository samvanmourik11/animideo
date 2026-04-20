import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MOLLIE_BASE = "https://api.mollie.com/v2";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Mollie niet geconfigureerd" }, { status: 500 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("mollie_customer_id, mollie_subscription_id")
    .eq("id", user.id)
    .single();

  if (!profile?.mollie_subscription_id || !profile?.mollie_customer_id) {
    return NextResponse.json({ error: "Geen actief abonnement gevonden" }, { status: 400 });
  }

  const res = await fetch(
    `${MOLLIE_BASE}/customers/${profile.mollie_customer_id}/subscriptions/${profile.mollie_subscription_id}`,
    {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${apiKey}` },
    }
  );

  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    return NextResponse.json({ error: `Mollie annuleringsfout: ${err}` }, { status: 500 });
  }

  await supabase
    .from("profiles")
    .update({
      plan: "free",
      credits: 100,
      subscription_status: "canceled",
      mollie_subscription_id: null,
    })
    .eq("id", user.id);

  return NextResponse.json({ success: true });
}
