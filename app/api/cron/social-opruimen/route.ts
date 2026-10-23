import { NextRequest, NextResponse } from "next/server";
import { ruimOp } from "@/lib/social/opruimen";

// Dagelijks (Vercel Cron, zie vercel.json): socialmedia-kanalen van klanten die niet meer
// betalen eerst waarschuwen, na 14 dagen ontkoppelen (zie lib/social/opruimen.ts).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Vercel Cron stuurt `Authorization: Bearer $CRON_SECRET` mee.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await ruimOp());
}
