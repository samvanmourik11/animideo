import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/ontdek";

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL("/login?error=missing_token", origin));
  }

  // Wachtwoord herstellen: de code hier nog niet gebruiken. Mailprogramma's en virusscanners
  // (vooral Outlook/Hotmail) openen links vooraf; dan was de link al op voordat de klant klikte.
  // De resetpagina wisselt de code pas in als de klant zijn nieuwe wachtwoord opslaat.
  if (type === "recovery") {
    const url = new URL("/wachtwoord-resetten", origin);
    url.searchParams.set("token_hash", token_hash);
    url.searchParams.set("type", type);
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
