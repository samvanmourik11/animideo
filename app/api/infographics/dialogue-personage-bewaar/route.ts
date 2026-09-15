// EEN GETEKEND PERSONAGE BEWAREN IN DE BIBLIOTHEEK.
//
// Personages die de opzet zelf tekende (zie tekenPersonage in dialogue-setup) staan
// niet in de bibliotheek. Wie zo'n personage goed vindt, bewaart het hier met één
// klik, zodat het in een volgende video gewoon te kiezen is. Het portret bestaat al,
// dus dit kost niets: het is alleen een rij in de bibliotheek.
import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Character } from "@/lib/types";

export const runtime = "nodejs";

interface Body {
  naam?: string;
  portraitUrl?: string;
  beschrijving?: string;
  leeftijd?: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canUseDialoog(user.email)) return NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 });

    const body = (await req.json()) as Body;
    const naam = (body.naam ?? "").trim().slice(0, 80);
    const portraitUrl = (body.portraitUrl ?? "").trim();
    if (!naam || !/^https:\/\//.test(portraitUrl)) {
      return NextResponse.json({ error: "Naam en portret zijn nodig" }, { status: 400 });
    }

    const { data: rij, error } = await supabase
      .from("characters")
      .insert({
        user_id: user.id,
        name: naam,
        description: (body.beschrijving ?? "").trim().slice(0, 1000) || null,
        image_url: portraitUrl,
        source_type: "generated",
        age_range: (body.leeftijd ?? "").trim().slice(0, 40) || null,
      })
      .select()
      .single();
    if (error || !rij) return NextResponse.json({ error: error?.message ?? "Bewaren mislukt" }, { status: 500 });

    return NextResponse.json({ character: rij as Character });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-personage-bewaar failed:", msg);
    return NextResponse.json({ error: "Bewaren mislukt", detail: msg }, { status: 500 });
  }
}
