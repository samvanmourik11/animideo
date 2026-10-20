import { NextRequest, NextResponse } from "next/server";
import { bewaarProfiel, mijnProfiel } from "@/lib/delen/profiel";
import { foutAntwoord, gebruiker, nietIngelogd } from "@/lib/delen/route-hulp";

export const runtime = "nodejs";

export async function GET() {
  const user = await gebruiker();
  if (!user) return nietIngelogd();
  return NextResponse.json({ profiel: await mijnProfiel(user.id) });
}

export async function PUT(req: NextRequest) {
  const user = await gebruiker();
  if (!user) return nietIngelogd();
  try {
    return NextResponse.json({ profiel: await bewaarProfiel(user.id, await req.json().catch(() => ({}))) });
  } catch (e) {
    return foutAntwoord(e, "api/profiel");
  }
}
