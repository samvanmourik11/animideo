import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Gratis account aanmaken via een GEHEIME link (voor traject-klanten e.d.).
 *
 * De publieke /signup blijft betaald (€1-checkout). Deze route maakt — alleen
 * met de juiste geheime code — een vooraf-bevestigd account aan.
 *
 * Elke code bepaalt hoeveel credits er automatisch worden ingeladen:
 *   FREE_SIGNUP_CODE      → 0 credits (default 'free'); Sam vult handmatig aan.
 *   FREE_SIGNUP_CODE_500  → 500 credits + 'starter' (bv. klant die €1 betaalde
 *                           maar nog geen account had). Ná aanmelding meteen klaar.
 *
 * De codes staan server-side (niet in de client-bundle). Rouleren? Pas de env-vars
 * FREE_SIGNUP_CODE / FREE_SIGNUP_CODE_500 aan in Vercel.
 */
const FREE_SIGNUP_CODE = process.env.FREE_SIGNUP_CODE || "gratis-a7f3k9x2m4qp";
const FREE_SIGNUP_CODE_500 = process.env.FREE_SIGNUP_CODE_500 || "crs-eenmalig-9f4k2m7x";

/**
 * Geldige codes → hoeveel credits + welk plan er na aanmelding worden gezet.
 *
 * Zet je `email`, dan is de code PERSOONLIJK én EENMALIG: hij werkt alleen voor
 * dat e-mailadres, en zodra dat account bestaat geeft een tweede poging "bestaat
 * al" (409) — dus geen tweede account en nooit dubbel credits.
 */
type SignupGrant = { credits: number; plan: string; email?: string };
const SIGNUP_CODES: Record<string, SignupGrant> = {
  [FREE_SIGNUP_CODE]: { credits: 0, plan: "free" },
  [FREE_SIGNUP_CODE_500]: { credits: 500, plan: "starter", email: "info@creativereggaestudio.nl" },
};

export async function POST(req: NextRequest) {
  const { email, password, code } = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    code?: string;
  };

  // Geheime code verplicht — zonder een geldige code geen account.
  const grant = code ? SIGNUP_CODES[code] : undefined;
  if (!grant) {
    return NextResponse.json({ error: "invalid_code" }, { status: 403 });
  }

  if (!email || !email.includes("@") || !password || password.length < 8) {
    return NextResponse.json({ error: "Ongeldige gegevens (min. 8 tekens wachtwoord)" }, { status: 400 });
  }

  const normalized = email.toLowerCase();

  // Persoonlijke code: alleen bruikbaar met het gekoppelde e-mailadres.
  if (grant.email && normalized !== grant.email.toLowerCase()) {
    return NextResponse.json({ error: "Deze link hoort bij een ander e-mailadres." }, { status: 403 });
  }

  const supabase = createServiceClient();

  // Vooraf-bevestigd account, zodat de klant meteen kan inloggen (geen mail nodig).
  const { data: created, error } = await supabase.auth.admin.createUser({
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

  // Credits automatisch inladen als de gebruikte code dat regelt. De profielrij
  // is al aangemaakt door de on_auth_user_created-trigger, dus we updaten 'm hier.
  const userId = created?.user?.id;
  if (userId && grant.credits > 0) {
    await supabase
      .from("profiles")
      .update({
        credits: grant.credits,
        plan: grant.plan,
        credits_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", userId);

    await supabase.from("credit_transactions").insert({
      user_id: userId,
      amount: grant.credits,
      reason: `Uitnodigingslink: ${grant.credits} credits (${grant.plan})`,
    });
  }

  return NextResponse.json({ ok: true });
}
