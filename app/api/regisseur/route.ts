import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { draai, maakInhoud, type BijlageInvoer } from "@/lib/regisseur/agent";

export const runtime = "nodejs";
// Een ronde van de Regisseur draait na het antwoord door (after()): Claude denkt na en
// start stappen, soms een paar keer achter elkaar.
export const maxDuration = 800;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const { data } = await supabase
    .from("regie_projecten")
    .select("id, titel, status, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  return NextResponse.json({ projecten: data ?? [] });
}

// Nieuw project: de eerste wens van de gebruiker. De titel is het begin daarvan; de
// Regisseur begint meteen.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const { tekst, bijlagen } = (await req.json().catch(() => ({}))) as { tekst?: unknown; bijlagen?: unknown };
  const t = typeof tekst === "string" ? tekst.trim().slice(0, 4000) : "";
  const lijst = (Array.isArray(bijlagen) ? bijlagen : []) as BijlageInvoer[];
  if (t.length < 3 && !lijst.length) return NextResponse.json({ error: "Vertel wat je wilt maken." }, { status: 400 });
  const { inhoud, fotoIds } = await maakInhoud(user.id, t, lijst);
  const titel = t || String(lijst[0]?.naam ?? "Nieuw project");
  const { data, error } = await createServiceClient()
    .from("regie_projecten")
    .insert({ user_id: user.id, titel: titel.length > 60 ? `${titel.slice(0, 57)}…` : titel, berichten: [{ role: "user", content: inhoud }], galerij: fotoIds, status: "denkt" })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: "Project aanmaken mislukt." }, { status: 500 });
  after(() => draai(data.id));
  return NextResponse.json({ id: data.id });
}
