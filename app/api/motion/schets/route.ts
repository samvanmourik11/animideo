import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUseMotion } from "@/lib/studio/access";
import { controleerPlan } from "@/lib/motion/plan";
import { schetsPagina } from "@/lib/motion/schets";
import { isMotionFormaat, motionFont } from "@/lib/motion/types";
import { stijlVan } from "@/lib/motion/stijlen";

export const runtime = "nodejs";

// POST {plan, lengte, formaat, stijl, kleur, kleur2, font, bedrijf, website} — de pagina met
// schetsbeelden per scene; de browser van de klant tekent ze (gratis, geen AI).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  if (!canUseMotion(user.email)) return NextResponse.json({ error: "Deze studio is nog niet beschikbaar voor jouw account." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kleur = (v: unknown, s: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : s);
  const tekst = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  try {
    // Ruim: een te lang script mag hier nog een schets krijgen; de melding komt bij betalen.
    const plan = controleerPlan(b.plan, 600);
    const r = await schetsPagina({
      plan,
      formaat: isMotionFormaat(b.formaat) ? b.formaat : "16:9",
      stijl: stijlVan(typeof b.stijl === "string" ? b.stijl : "")?.id ?? "",
      kleur: kleur(b.kleur, "#1c72ed"),
      kleur2: kleur(b.kleur2, "#ffc21a"),
      font: motionFont(b.font),
      bedrijf: tekst(b.bedrijf, 40),
      website: tekst(b.website, 60),
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
