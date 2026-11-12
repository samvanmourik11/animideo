import type { NextRequest } from "next/server";
import { klik } from "@/lib/bio-bron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ naam: string }> }) {
  return klik(req, "tt", (await params).naam);
}
