import { NextRequest, NextResponse } from "next/server";
import { verwerkProeven } from "@/lib/trends/proef";

// Elke 10 minuten (Vercel Cron, zie vercel.json): lopende trendproeven verder zetten. Een
// video kan een kwartier duren; is hij klaar, dan beoordeelt Claude hem (lib/trends/proef.ts).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ log: await verwerkProeven() });
}
