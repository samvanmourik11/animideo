import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Filmstudio: de films van de gebruiker (lezen mag de eigenaar zelf, via RLS).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const { data, error } = await supabase.from("films").select("id, titel, regie_project_id, data, updated_at").order("updated_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "Films laden mislukt." }, { status: 500 });
  return NextResponse.json({ films: data ?? [] });
}
