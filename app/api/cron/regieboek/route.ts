import { NextRequest, NextResponse } from "next/server";
import { leerronde } from "@/lib/regisseur/leren";

// Wekelijks (Vercel Cron, maandagochtend, zie vercel.json): de leerronde van het regieboek.
// Nieuwe regels komen als voorstel op /admin/regieboek; Sam zet ze aan.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Vercel Cron stuurt `Authorization: Bearer $CRON_SECRET` mee.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await leerronde());
}
