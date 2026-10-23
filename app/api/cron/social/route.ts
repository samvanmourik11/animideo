import { NextRequest, NextResponse } from "next/server";
import { verwerk } from "@/lib/social/kalender";
import { meldTeKeuren } from "@/lib/social/mail";

// Elke 5 minuten (Vercel Cron, zie vercel.json): posts van de komende week maken, klare
// beelden/video's doorzetten (keuren of inplannen) en controleren of ingeplande posts echt
// online staan. Daarna één mail per kalender met de posts die klaarstaan om te keuren.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Vercel Cron stuurt `Authorization: Bearer $CRON_SECRET` mee.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const stand = await verwerk();
  return NextResponse.json({ ...stand, gemaild: await meldTeKeuren() });
}
