import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { schrijfTrailer } from "@/lib/trailer/plan";
import { GENRES, TRAILER_LENGTES, type GenreId, type TrailerLengte } from "@/lib/trailer/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Trailerstudio: de trailer uitschrijven volgens het regelboek van het genre. Gratis.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const verhaal = typeof b.verhaal === "string" ? b.verhaal.trim().slice(0, 2000) : "";
  if (verhaal.length < 20) return NextResponse.json({ error: "Vertel iets meer over het verhaal." }, { status: 400 });
  const personages = (Array.isArray(b.personages) ? b.personages : [])
    .map((p) => ({ naam: String((p as { naam?: unknown }).naam ?? "").trim().slice(0, 40), omschrijving: String((p as { omschrijving?: unknown }).omschrijving ?? "").trim().slice(0, 300) }))
    .filter((p) => p.naam)
    .slice(0, 4);
  try {
    const plan = await schrijfTrailer({
      titel: typeof b.titel === "string" ? b.titel.trim().slice(0, 60) : "",
      verhaal,
      personages,
      genre: (GENRES.some((g) => g.id === b.genre) ? b.genre : "fantasy") as GenreId,
      sec: (TRAILER_LENGTES.some((l) => l.sec === b.sec) ? b.sec : 60) as TrailerLengte,
    });
    return NextResponse.json({ plan });
  } catch (e) {
    console.error("[trailer/plan]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Trailer schrijven mislukt." }, { status: 500 });
  }
}
