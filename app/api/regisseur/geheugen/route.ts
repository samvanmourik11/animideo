import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { leesGeheugen } from "@/lib/regisseur/tools";

export const runtime = "nodejs";

// Het geheugen van de Regisseur: de gebruiker mag zien én aanpassen wat er over hem
// onthouden wordt. Een geheugen dat je niet kunt inzien, voelt als bespied worden.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  return NextResponse.json({ tekst: await leesGeheugen(user.id) });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const { tekst } = (await req.json().catch(() => ({}))) as { tekst?: unknown };
  const t = typeof tekst === "string" ? tekst.slice(0, 3000) : "";
  const { error } = await createServiceClient().from("regie_geheugen").upsert({ user_id: user.id, tekst: t, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: "Opslaan mislukt." }, { status: 500 });
  return NextResponse.json({ tekst: t });
}
