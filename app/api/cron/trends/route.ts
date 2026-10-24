import { NextRequest, NextResponse } from "next/server";
import { speurtocht } from "@/lib/trends/speuren";

// Elke ochtend (Vercel Cron, zie vercel.json): zoeken wat er viral gaat. Nieuwe trends komen
// als voorstel op /admin/trends en Sam krijgt een mail; klanten zien ze pas na zijn akkoord.

export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function GET(req: NextRequest) {
  // Vercel Cron stuurt `Authorization: Bearer $CRON_SECRET` mee.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await speurtocht());
}
