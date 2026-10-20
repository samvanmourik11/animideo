import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TeamFout, trekUitnodigingIn } from "@/lib/team/team";
import { teamOverzicht } from "@/lib/team/overzicht";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  try {
    await trekUitnodigingIn(user.id, id);
    return NextResponse.json(await teamOverzicht(user.id, req.nextUrl.origin));
  } catch (e) {
    if (e instanceof TeamFout) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Er ging iets mis. Probeer het opnieuw." }, { status: 500 });
  }
}
