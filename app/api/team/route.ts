import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TeamFout, hefOp, maakTeam } from "@/lib/team/team";
import { teamOverzicht } from "@/lib/team/overzicht";

export const runtime = "nodejs";

async function gebruiker() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function fout(e: unknown) {
  if (e instanceof TeamFout) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[api/team]", e);
  return NextResponse.json({ error: "Er ging iets mis. Probeer het opnieuw." }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  try {
    return NextResponse.json(await teamOverzicht(user.id, req.nextUrl.origin));
  } catch (e) {
    return fout(e);
  }
}

export async function POST(req: NextRequest) {
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const { naam } = (await req.json().catch(() => ({}))) as { naam?: unknown };
  try {
    await maakTeam(user.id, typeof naam === "string" ? naam : "");
    return NextResponse.json(await teamOverzicht(user.id, req.nextUrl.origin));
  } catch (e) {
    return fout(e);
  }
}

export async function DELETE(req: NextRequest) {
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  try {
    await hefOp(user.id);
    return NextResponse.json(await teamOverzicht(user.id, req.nextUrl.origin));
  } catch (e) {
    return fout(e);
  }
}
