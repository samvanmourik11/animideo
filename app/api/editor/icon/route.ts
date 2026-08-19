// "Genereer mijn icoon": staat er niet tussen, dan maakt hij hem alsnog.
//
// De bibliotheek dekt het meeste af en is gratis; dit is voor het icoon dat er
// net niet bij zit. Zelfde stijl-instructie als de bibliotheek, zodat een
// zelfgemaakt icoon niet uit de toon valt tussen de rest.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUseEditor } from "@/lib/editor/access";
import { genereerElement } from "@/lib/editor/elements";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 120;

// Zelfde stijl als scripts/generate-icon-library.mjs — één set, één look.
const STIJL =
  "Flat vector illustration icon, simple bold shapes, clean thin dark outline, " +
  "friendly modern business style, bright saturated colors, subtle shading, " +
  "centered, complete object, front view";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseEditor(user.email)) return NextResponse.json({ error: "Geen toegang tot de editor" }, { status: 403 });

  const { beschrijving } = (await req.json().catch(() => ({}))) as { beschrijving?: string };
  const wens = (beschrijving ?? "").trim();
  if (wens.length < 2) {
    return NextResponse.json({ error: "Beschrijf kort wat voor icoon je wilt" }, { status: 400 });
  }

  const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Eigen icoon maken");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
      { status: 402 }
    );
  }

  try {
    const { url } = await genereerElement(supabase, user.id, wens, STIJL);
    return NextResponse.json({ url, label: wens });
  } catch (err) {
    await addCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Refund: icoon maken mislukt").catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[editor-icon]", msg);
    return NextResponse.json({ error: "Het icoon maken lukte niet. Probeer het nog eens." }, { status: 500 });
  }
}
