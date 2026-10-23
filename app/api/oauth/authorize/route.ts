import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { controleerAanvraag, maakCode, OAuthFout } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

// De knop "Toestaan" of "Weigeren" op /oauth/authorize. Pas hier, met een ingelogde klant
// en een gecontroleerde aanvraag, sturen we terug naar het programma.
export async function POST(req: NextRequest) {
  const f = await req.formData();
  const a = {
    response_type: String(f.get("response_type") ?? ""),
    client_id: String(f.get("client_id") ?? ""),
    redirect_uri: String(f.get("redirect_uri") ?? ""),
    code_challenge: String(f.get("code_challenge") ?? ""),
    code_challenge_method: String(f.get("code_challenge_method") ?? ""),
    state: f.get("state") ? String(f.get("state")) : undefined,
    resource: f.get("resource") ? String(f.get("resource")) : undefined,
  };
  try {
    await controleerAanvraag(a);
  } catch (e) {
    return new NextResponse(e instanceof OAuthFout ? e.message : "Er ging iets mis.", { status: 400 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Log eerst in.", { status: 401 });

  const terug = new URL(a.redirect_uri);
  if (f.get("besluit") !== "ja") {
    terug.searchParams.set("error", "access_denied");
  } else {
    terug.searchParams.set("code", await maakCode(user.id, a));
  }
  if (a.state) terug.searchParams.set("state", a.state);
  return NextResponse.redirect(terug, 303);
}
