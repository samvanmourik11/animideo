import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { schrijfPlan } from "@/lib/reclame/plan";
import { leesProduct } from "@/lib/reclame/regie";
import { isStijl } from "@/lib/reclame/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Link → reclame, stap 2: het script. Gratis, zo vaak als de klant wil.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isStijl(body.stijl)) return NextResponse.json({ error: "Kies eerst een stijl." }, { status: 400 });

  let product;
  try {
    product = leesProduct(body.product);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  try {
    return NextResponse.json({ plan: await schrijfPlan(product, body.stijl) });
  } catch (e) {
    console.error("[reclame/plan]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Script schrijven mislukt." }, { status: 500 });
  }
}
