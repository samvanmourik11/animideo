import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TeamFout, nodigUit } from "@/lib/team/team";
import { mailUitnodiging } from "@/lib/team/mail";
import { teamOverzicht, uitnodigingsLink } from "@/lib/team/overzicht";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: unknown };
  try {
    const u = await nodigUit(user.id, typeof email === "string" ? email : "");
    const link = uitnodigingsLink(req.nextUrl.origin, u.token);
    const mailFout = await mailUitnodiging(u.email, { teamNaam: u.teamNaam, door: user.email ?? "Een collega", link });
    if (mailFout) console.error("[team] uitnodigingsmail mislukt:", mailFout);
    return NextResponse.json({ ...(await teamOverzicht(user.id, req.nextUrl.origin)), gemaild: !mailFout, link });
  } catch (e) {
    if (e instanceof TeamFout) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/team/uitnodigen]", e);
    return NextResponse.json({ error: "Er ging iets mis. Probeer het opnieuw." }, { status: 500 });
  }
}
