import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { draai } from "@/lib/regisseur/agent";

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
  const { tekst } = (await req.json().catch(() => ({}))) as { tekst?: unknown };
  const t = typeof tekst === "string" ? tekst.trim().slice(0, 4000) : "";
  if (t.length < 3) return NextResponse.json({ error: "Vertel wat je wilt maken." }, { status: 400 });
  const { data, error } = await createServiceClient()
    .from("regie_projecten")
    .insert({ user_id: user.id, titel: t.length > 60 ? `${t.slice(0, 57)}…` : t, berichten: [{ role: "user", content: t }], status: "denkt" })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: "Project aanmaken mislukt." }, { status: 500 });
  after(() => draai(data.id));
  return NextResponse.json({ id: data.id });
}
