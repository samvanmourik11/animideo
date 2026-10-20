import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leesProductpagina } from "@/lib/reclame/pagina";

export const runtime = "nodejs";
export const maxDuration = 60;

// Link → reclame, stap 1: de productpagina lezen. Gratis; de klant ziet het resultaat
// en past het aan vóór er iets kost.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

  const { url } = (await req.json().catch(() => ({}))) as { url?: unknown };
  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "Plak eerst een link." }, { status: 400 });
  }
  try {
    return NextResponse.json({ product: await leesProductpagina(url) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
