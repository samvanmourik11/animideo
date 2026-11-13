import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUseDocu } from "@/lib/studio/access";
import { zoekFotos } from "@/lib/docu/fotos";
import { controleerPlan } from "@/lib/motion/plan";
import { isDocuLengte } from "@/lib/docu/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// Docu, stap 2: vrije foto's van Wikimedia Commons bij de scenes. Gratis voor de klant
// (het kiezen kost ons een paar cent); de foto's komen op onze eigen opslag.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  if (!canUseDocu(user.email)) return NextResponse.json({ error: "Deze studio is nog niet beschikbaar voor jouw account." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isDocuLengte(body.lengte)) return NextResponse.json({ error: "Kies een lengte." }, { status: 400 });
  const zoek = (Array.isArray(body.fotoZoek) ? body.fotoZoek : []).map((t) => (typeof t === "string" ? t.slice(0, 80) : ""));
  try {
    const plan = controleerPlan(body.plan, body.lengte);
    const { fotos, usd } = await zoekFotos(user.id, plan, zoek);
    console.log(`[docu/fotos] ${fotos.length} van ${zoek.filter(Boolean).length} gevonden, $${usd.toFixed(3)}`);
    return NextResponse.json({ fotos });
  } catch (e) {
    console.error("[docu/fotos]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Foto's zoeken mislukt." }, { status: 500 });
  }
}
