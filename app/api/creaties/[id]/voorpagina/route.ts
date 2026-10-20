import { NextRequest, NextResponse } from "next/server";
import { stuurIn } from "@/lib/delen/profiel";
import { foutAntwoord, gebruiker, nietIngelogd } from "@/lib/delen/route-hulp";

export const runtime = "nodejs";
// Aanzetten deelt het werk ook; bij een video maakt dat eerst een voorbeeldplaatje.
export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await gebruiker();
  if (!user) return nietIngelogd();
  const { aan, toestemming } = (await req.json().catch(() => ({}))) as { aan?: unknown; toestemming?: unknown };
  try {
    return NextResponse.json({ creatie: await stuurIn(user.id, id, aan === true, toestemming === true) });
  } catch (e) {
    return foutAntwoord(e, "api/creaties/voorpagina");
  }
}
