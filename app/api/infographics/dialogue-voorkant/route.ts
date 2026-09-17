import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { zorgVoorVoorkant } from "@/lib/infographics/voorkant";
import type { DialogueCastMember } from "@/lib/infographics/dialogue-schema";

export const runtime = "nodejs";
export const maxDuration = 60;

// Legt per personage vast hoe het ECHT getekend is (vooraanzicht + beschrijving), zodat de
// pagina het in het project bewaart. De beeldroutes doen hetzelfde zelf als het ontbreekt;
// zie voorkant.ts. Voorbereiding, dus gratis.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canUseDialoog(user.email)) return NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 });

    const { lid } = (await req.json()) as { lid?: DialogueCastMember };
    if (!lid?.modelSheetUrl) return NextResponse.json({ error: "Personage zonder model sheet" }, { status: 400 });

    const klaar = await zorgVoorVoorkant(supabase, user.id, lid);
    if (!klaar.voorkantUrl) return NextResponse.json({ error: "Vooraanzicht maken mislukt" }, { status: 500 });
    return NextResponse.json({
      voorkantUrl: klaar.voorkantUrl,
      voorkantVanBlad: klaar.voorkantVanBlad,
      appearance: klaar.appearance !== lid.appearance ? klaar.appearance : null,
      kleding: klaar.kleding !== lid.kleding ? klaar.kleding : undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-voorkant failed:", msg);
    return NextResponse.json({ error: "Vooraanzicht maken mislukt", detail: msg }, { status: 500 });
  }
}
