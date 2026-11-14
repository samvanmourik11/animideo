import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startAanpassing } from "@/lib/motion/regie";
import { WachtrijFout } from "@/lib/creaties/wachtrij";

export const runtime = "nodejs";
// Het aanpassen zelf loopt na het antwoord door (Claude + proefbeelden, een paar minuten).
export const maxDuration = 800;

// Een opgeleverde motion- of docu-video aanpassen (lib/motion/aanpassen.ts):
//   POST {id, punten, alleenPrijs: true} — wat het kost
//   POST {id, punten}                     — betalen en starten; geeft de nieuwe rij terug
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; punten?: unknown; alleenPrijs?: unknown };
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({ error: "Onbekende video" }, { status: 400 });
  try {
    const uit = await startAanpassing(user.id, body.id, body.punten, body.alleenPrijs === true);
    return NextResponse.json(uit);
  } catch (e) {
    const status = e instanceof WachtrijFout ? e.status : 500;
    if (status === 500) console.error("[motion] aanpassen starten mislukt:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
