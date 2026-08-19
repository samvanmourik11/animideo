// "Achtergrond wissen" op een geplaatst beeld.
//
// Eén van de weinige plekken in de editor waar een model aan te pas komt, en
// bewust een die niets verzint: rembg bepaalt alleen wélke pixels doorzichtig
// worden. Wat er in beeld staat blijft precies wat het was.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUseEditor } from "@/lib/editor/access";
import { wisAchtergrond } from "@/lib/editor/elements";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseEditor(user.email)) return NextResponse.json({ error: "Geen toegang tot de editor" }, { status: 403 });

  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: "Geen bruikbare afbeelding" }, { status: 400 });
  }

  const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Achtergrond wissen");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
      { status: 402 }
    );
  }

  try {
    return NextResponse.json({ url: await wisAchtergrond(supabase, user.id, url) });
  } catch (err) {
    await addCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Refund: achtergrond wissen mislukt").catch(() => {});
    console.error("[editor-achtergrond]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Het uitknippen lukte niet. Probeer het nog eens." }, { status: 500 });
  }
}
