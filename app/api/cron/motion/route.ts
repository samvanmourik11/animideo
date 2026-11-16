import { NextRequest, NextResponse } from "next/server";
import { motionOnderhoud } from "@/lib/motion/regie";

// Elke 2 minuten (Vercel Cron, zie vercel.json): motion- en docu-video's die bezig zijn een
// stap verder zetten, ook als de klant de studio dicht heeft (stem, animatie), en mailen als
// een video op de browser van de klant wacht. Alleen die laatste stap heeft de studio nodig.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await motionOnderhoud());
}
