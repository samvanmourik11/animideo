import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { maakVoorkant } from "@/lib/infographics/voorkant";
import { uiterlijkUitBlad } from "@/lib/infographics/uiterlijk-uit-blad";
import type { DialogueCastMember } from "@/lib/infographics/dialogue-schema";

export const runtime = "nodejs";
export const maxDuration = 60;

// Legt per personage vast hoe het ECHT getekend is: het vooraanzicht uit zijn model sheet,
// en een beschrijving van precies dat plaatje. Beide gaan daarna mee naar elk beeld, zodat
// plaatje en tekst hetzelfde zeggen (zie voorkant.ts en uiterlijk-uit-blad.ts).
// Voorbereiding voor het storyboard, dus gratis; alleen een kleine kijkvraag.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canUseDialoog(user.email)) return NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 });

    const { lid } = (await req.json()) as { lid?: DialogueCastMember };
    if (!lid?.modelSheetUrl) return NextResponse.json({ error: "Personage zonder model sheet" }, { status: 400 });

    const voorkantUrl = await maakVoorkant(supabase, user.id, lid.modelSheetUrl);
    // Lukt de beschrijving niet, dan blijft de oude tekst staan: het vooraanzicht alleen
    // haalt de tegenstrijdige plaatjes al weg.
    const uiterlijk = await uiterlijkUitBlad(lid, voorkantUrl);
    return NextResponse.json({
      voorkantUrl,
      voorkantVanBlad: lid.modelSheetUrl,
      appearance: uiterlijk?.appearance ?? null,
      kleding: uiterlijk ? uiterlijk.kleding : undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-voorkant failed:", msg);
    return NextResponse.json({ error: "Vooraanzicht maken mislukt", detail: msg }, { status: 500 });
  }
}
