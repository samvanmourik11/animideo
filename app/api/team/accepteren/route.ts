import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TeamFout, accepteer } from "@/lib/team/team";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Log eerst in." }, { status: 401 });
  const { token } = (await req.json().catch(() => ({}))) as { token?: unknown };
  try {
    const teamNaam = await accepteer(user.id, user.email ?? "", typeof token === "string" ? token : "");
    return NextResponse.json({ teamNaam });
  } catch (e) {
    if (e instanceof TeamFout) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/team/accepteren]", e);
    return NextResponse.json({ error: "Er ging iets mis. Probeer het opnieuw." }, { status: 500 });
  }
}
