import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUseMotion } from "@/lib/studio/access";
import { controleerPlan } from "@/lib/motion/plan";
import { leesBeelden } from "@/lib/motion/beelden";
import { regisseer, type RegieBericht } from "@/lib/motion/regisseur";
import { stijlVan } from "@/lib/motion/stijlen";
import { MOTION_LENGTES, isMotionLengte, isMotionSoort, isMotionTaal } from "@/lib/motion/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const kort = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

// Motion graphics: het gesprek met de regisseur. Gratis, net als het script schrijven; pas
// "Maak de video" kost credits. Het gesprek komt elke keer mee vanuit de browser.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  if (!canUseMotion(user.email)) return NextResponse.json({ error: "Deze studio is nog niet beschikbaar voor jouw account." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const berichten: RegieBericht[] = (Array.isArray(body.berichten) ? body.berichten : [])
    .map((b) => {
      const o = (b ?? {}) as Record<string, unknown>;
      return { van: o.van === "regisseur" ? ("regisseur" as const) : ("klant" as const), tekst: typeof o.tekst === "string" ? o.tekst.trim().slice(0, 16000) : "" };
    })
    .filter((b) => b.tekst)
    .slice(-40);
  if (!berichten.length || berichten[berichten.length - 1].van !== "klant") return NextResponse.json({ error: "Typ eerst een bericht." }, { status: 400 });

  // Het script dat de klant nu voor zich heeft; een kapot script telt als geen script.
  let plan = null;
  try {
    if (body.plan) plan = controleerPlan(body.plan, MOTION_LENGTES[MOTION_LENGTES.length - 1].sec);
  } catch {}

  try {
    const antwoord = await regisseer({
      berichten,
      plan,
      soort: isMotionSoort(body.soort) ? body.soort : "bedrijf",
      lengte: isMotionLengte(body.lengte) ? body.lengte : 30,
      staand: body.formaat === "9:16",
      taal: isMotionTaal(body.taal) ? body.taal : "nl",
      stijl: stijlVan(typeof body.stijl === "string" ? body.stijl : "")?.id ?? "",
      bedrijf: kort(body.bedrijf, 40),
      toon: kort(body.toon, 600),
      nietDoen: kort(body.nietDoen, 600),
      beelden: leesBeelden(body.beelden),
    });
    return NextResponse.json(antwoord);
  } catch (e) {
    console.error("[motion/regisseur]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "De regisseur reageert even niet. Probeer het opnieuw." }, { status: 500 });
  }
}
