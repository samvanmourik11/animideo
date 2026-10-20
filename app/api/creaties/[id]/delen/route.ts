import { NextRequest, NextResponse } from "next/server";
import { deel, deelLink, stopDelen } from "@/lib/delen/delen";
import { foutAntwoord, gebruiker } from "@/lib/delen/route-hulp";

export const runtime = "nodejs";
// Bij een video maakt het delen eerst een voorbeeldplaatje met ffmpeg.
export const maxDuration = 60;

const fout = (e: unknown) => foutAntwoord(e, "api/creaties/delen");

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
