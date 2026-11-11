import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUseMotion } from "@/lib/studio/access";
import { schrijfPlan } from "@/lib/motion/plan";
import { isMotionLengte } from "@/lib/motion/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// Motion graphics, stap 1: het script. Gratis, zo vaak als de klant wil.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  if (!canUseMotion(user.email)) return NextResponse.json({ error: "Deze studio is nog niet beschikbaar voor jouw account." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const onderwerp = typeof body.onderwerp === "string" ? body.onderwerp.trim().slice(0, 4000) : "";
  const bedrijf = typeof body.bedrijf === "string" ? body.bedrijf.trim().slice(0, 40) : "";
  if (onderwerp.length < 10) return NextResponse.json({ error: "Vertel eerst waar de video over moet gaan." }, { status: 400 });
  if (!bedrijf) return NextResponse.json({ error: "Vul eerst de naam van je bedrijf in." }, { status: 400 });
  const lengte = isMotionLengte(body.lengte) ? body.lengte : 30;

  try {
    return NextResponse.json({ plan: await schrijfPlan({ onderwerp, bedrijf, lengte, staand: body.formaat === "9:16" }) });
  } catch (e) {
    console.error("[motion/plan]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Script schrijven mislukt." }, { status: 500 });
  }
}
