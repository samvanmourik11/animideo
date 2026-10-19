import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Favoriet en map wijzigen gaat via de server: de gebruiker mag de rij zelf niet
// bijwerken (zie 100_creaties.sql — status en credits horen bij elkaar).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

  let body: { favoriet?: unknown; mapId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });
  }

  const wijziging: Record<string, unknown> = {};
  if (typeof body.favoriet === "boolean") wijziging.favoriet = body.favoriet;
  if (body.mapId === null) wijziging.map_id = null;
  if (typeof body.mapId === "string") {
    const { data: map } = await supabase
      .from("creatie_mappen")
      .select("id")
      .eq("id", body.mapId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!map) return NextResponse.json({ error: "Map niet gevonden" }, { status: 404 });
    wijziging.map_id = body.mapId;
  }
  if (Object.keys(wijziging).length === 0) return NextResponse.json({ error: "Niets te wijzigen" }, { status: 400 });

  const { data, error } = await createServiceClient()
    .from("creaties")
    .update(wijziging)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  return NextResponse.json({ creatie: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

  const { error } = await supabase.from("creaties").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
