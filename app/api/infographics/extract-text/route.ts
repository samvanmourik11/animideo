// Haalt de leesbare tekst van een webpagina op zodat de gebruiker een blog/artikel
// als brontekst kan gebruiken ("blog → video", verbeterplan B3). Puur scrapen, geen
// LLM — dus geen credits.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractPageText } from "@/lib/brand/extract-from-website";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url?.trim()) return NextResponse.json({ error: "Geen URL opgegeven" }, { status: 400 });

  try {
    const text = await extractPageText(url.trim());
    return NextResponse.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
