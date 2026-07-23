import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Gratis account aanmaken via een GEHEIME link (voor traject-klanten e.d.).
 *
 * De publieke /signup blijft betaald (€1-checkout). Deze route maakt — alleen
 * met de juiste geheime code — een vooraf-bevestigd gratis account aan. Sam
 * laadt daarna handmatig credits in / upgradet het account.
 *
 * De code staat server-side (niet in de client-bundle). Wil je 'm rouleren:
 * pas FREE_SIGNUP_CODE aan (of zet FREE_SIGNUP_CODE als env-var in Vercel).
 */
const FREE_SIGNUP_CODE = process.env.FREE_SIGNUP_CODE || "gratis-a7f3k9x2m4qp";

export async function POST(req: NextRequest) {
  const { email, password, code } = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    code?: string;
  };

  // Geheime code verplicht — zonder de juiste code geen gratis account.
  if (!code || code !== FREE_SIGNUP_CODE) {
    return NextResponse.json({ error: "invalid_code" }, { status: 403 });
  }

  if (!email || !email.includes("@") || !password || password.length < 8) {
    return NextResponse.json({ error: "Ongeldige gegevens (min. 8 tekens wachtwoord)" }, { status: 400 });
  }

  const normalized = email.toLowerCase();
  const supabase = createServiceClient();

  // Vooraf-bevestigd account, zodat de klant meteen kan inloggen (geen mail nodig).
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
