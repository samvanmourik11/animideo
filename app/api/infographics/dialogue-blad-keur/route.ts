import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bladKlopt, uiterlijkUitBlad } from "@/lib/infographics/uiterlijk-uit-blad";
import type { DialogueCastMember } from "@/lib/infographics/dialogue-schema";

export const runtime = "nodejs";
export const maxDuration = 120;

// BESTAANDE HOUDINGENBLADEN NAKIJKEN.
//
// Een blad dat al in het project zat, is nooit gecontroleerd: in Sams voetbalverhaal
// stonden Leo's ogen dicht op zijn blad van de dag ervoor, en die dichte ogen zaten
// daarna in het halve storyboard. Nieuwe bladen worden bij het maken al gecontroleerd
// (dialogue-model-sheet); dit is voor de bladen die er al waren. Gratis: kijkvragen.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canUseDialoog(user.email)) return NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 });

    const { cast } = (await req.json().catch(() => ({}))) as { cast?: DialogueCastMember[] };
    if (!Array.isArray(cast)) return NextResponse.json({ error: "Geen cast" }, { status: 400 });

    const uitslag = await Promise.all(cast.map(async (lid) => {
      const blad = (lid.modelSheetUrl ?? "").trim();
      if (!blad || !lid.portraitUrl) return { id: lid.id, ok: true, ogenDicht: false, ontbreekt: [] as string[] };
      const verwacht = (await uiterlijkUitBlad(lid, lid.portraitUrl)) ?? { appearance: lid.appearance ?? "", kleding: lid.kleding ?? "" };
      const oordeel = await bladKlopt(blad, verwacht);
      if (!oordeel) return { id: lid.id, ok: true, ogenDicht: false, ontbreekt: [] as string[] };
      return { id: lid.id, ok: !oordeel.ogenDicht && oordeel.ontbreekt.length === 0, ...oordeel };
    }));
    console.log(`[dialogue-blad-keur] ${uitslag.filter((u) => !u.ok).length} van de ${uitslag.length} bladen klopt niet`);
    return NextResponse.json({ uitslag });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-blad-keur failed:", msg);
    return NextResponse.json({ error: "Bladen nakijken mislukt", detail: msg }, { status: 500 });
  }
}
