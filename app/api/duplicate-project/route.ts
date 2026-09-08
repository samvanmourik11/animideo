import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Een project kopiëren onder een andere naam.
//
// Klantvraag: "kan ik een clip die nog bewerkt wordt kopiëren en een andere naam
// geven?" Dat kon niet — je kon een project alleen verwijderen. Wie een tweede
// versie wilde (een kortere montage, een andere voice-over, een variant voor een
// andere klas) moest alles opnieuw opbouwen.
//
// De kopie verwijst naar dezelfde beelden en clips in de opslag. Dat mag: die
// bestanden worden nooit overschreven — elke nieuwe generatie schrijft naar een
// nieuw pad met een eigen UUID. Beide projecten kunnen dus los bewerkt worden
// zonder dat het ene het andere aanpast.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, title } = (await req.json()) as { projectId?: string; title?: string };
  if (!projectId) return NextResponse.json({ error: "Geen project opgegeven" }, { status: 400 });

  // Ophalen mét user_id-filter: zo kan niemand het project van een ander kopiëren.
  const { data: bron, error: leesFout } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (leesFout || !bron) {
    return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  }

  // Alles overnemen behalve de velden die de database zelf zet.
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = bron as Record<string, unknown>;
  void _id; void _c; void _u;

  const nieuweTitel = (title ?? "").trim() || `${bron.title ?? "Project"} (kopie)`;

  const { data: kopie, error: schrijfFout } = await supabase
    .from("projects")
    .insert({ ...rest, user_id: user.id, title: nieuweTitel.slice(0, 200) })
    .select("*")
    .single();

  if (schrijfFout) {
    console.error("duplicate-project failed:", schrijfFout.message);
    return NextResponse.json({ error: "Kopiëren mislukt" }, { status: 500 });
  }

  return NextResponse.json({ project: kopie });
}
