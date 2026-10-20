import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DeelFout, deel, deelLink, stopDelen } from "@/lib/delen/delen";

export const runtime = "nodejs";
// Bij een video maakt het delen eerst een voorbeeldplaatje met ffmpeg.
export const maxDuration = 60;

async function gebruiker() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function fout(e: unknown) {
  if (e instanceof DeelFout) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[api/creaties/delen]", e);
  return NextResponse.json({ error: "Er ging iets mis. Probeer het opnieuw." }, { status: 500 });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const { toestemming } = (await req.json().catch(() => ({}))) as { toestemming?: unknown };
  try {
    const creatie = await deel(user.id, id, toestemming === true);
    return NextResponse.json({ creatie, link: deelLink(req.nextUrl.origin, creatie.deel_code!) });
  } catch (e) {
    return fout(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  try {
    return NextResponse.json({ creatie: await stopDelen(user.id, id) });
  } catch (e) {
    return fout(e);
  }
}
