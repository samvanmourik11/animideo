import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Guest-signup zonder mailbevestiging.
 *
 * Voor betalende guest-checkouts (o.a. webinar-aanbod) maken we het account
 * server-side direct aangemaakt én bevestigd (`email_confirm: true`), zodat de
 * lead meteen kan inloggen en niet op een (mogelijk in spam belande)
 * bevestigingsmail hoeft te wachten. De plan/credits-koppeling gebeurt daarna
 * automatisch via PendingCheckoutHandler -> /api/mollie/claim-checkout.
 *
 * Veiligheid: we maken alleen een vooraf-bevestigd account aan als er écht een
 * betaalde pending_checkout voor dit e-mailadres bestaat (bewijs van betaling).
 * Zonder die check zou iedereen via dit endpoint accounts kunnen aanmaken.
 */
export async function POST(req: NextRequest) {
  const { email, password } = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };

  if (!email || !email.includes("@") || !password || password.length < 8) {
    return NextResponse.json({ error: "Ongeldige gegevens" }, { status: 400 });
  }

  const normalized = email.toLowerCase();
  const supabase = createServiceClient();

  // Alleen vooraf-bevestigd account aanmaken als er een betaalde checkout is.
  const { data: pending } = await supabase
    .from("pending_checkouts")
    .select("id")
    .eq("email", normalized)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) {
    // Geen (nog niet verwerkte) betaling gevonden -> client valt terug op de
    // normale signUp-flow met mailbevestiging.
    return NextResponse.json({ error: "no_paid_checkout" }, { status: 422 });
  }

  const { error } = await supabase.auth.admin.createUser({
    email: normalized,
    password,
    email_confirm: true,
  });

  if (error) {
    const already = /already|registered|exists/i.test(error.message);
    return NextResponse.json(
      { error: already ? "exists" : error.message },
      { status: already ? 409 : 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
