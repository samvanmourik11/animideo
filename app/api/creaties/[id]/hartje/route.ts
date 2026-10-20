import { NextRequest, NextResponse } from "next/server";
import { wisselHartje } from "@/lib/delen/profiel";
import { foutAntwoord, gebruiker } from "@/lib/delen/route-hulp";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Log in om een hartje te geven." }, { status: 401 });
  try {
    return NextResponse.json(await wisselHartje(user.id, id));
  } catch (e) {
    return foutAntwoord(e, "api/creaties/hartje");
  }
}
