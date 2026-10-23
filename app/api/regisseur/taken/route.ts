import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { draai } from "@/lib/regisseur/agent";
import { datumTekst, ritmeTekst, startUitvoering, volgendeKeer, type Taak } from "@/lib/regisseur/taken";

export const runtime = "nodejs";
// "Nu uitvoeren" laat de Regisseur na het antwoord doorwerken (after()).
export const maxDuration = 800;

async function gebruiker() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// De vaste taken van de gebruiker, met het ritme en de volgende keer al in gewone taal.
export async function GET() {
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const { data } = await createServiceClient().from("regie_taken").select("*").eq("user_id", user.id).order("created_at");
  const taken = ((data ?? []) as Taak[]).map((t) => ({ ...t, ritmeTekst: ritmeTekst(t), volgendeTekst: datumTekst(t.volgende_op), laatstTekst: t.laatst_op ? datumTekst(t.laatst_op) : null }));
  return NextResponse.json({ taken });
}

// Pauzeren/hervatten, maximum aanpassen, meteen uitvoeren of weghalen.
export async function POST(req: NextRequest) {
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; actie?: unknown; actief?: unknown; max_credits?: unknown };
  const db = createServiceClient();
  const { data } = await db.from("regie_taken").select("*").eq("id", String(b.id ?? "")).eq("user_id", user.id).maybeSingle();
  const t = data as Taak | null;
  if (!t) return NextResponse.json({ error: "Taak niet gevonden." }, { status: 404 });

  if (b.actie === "weg") {
    await db.from("regie_taken").delete().eq("id", t.id);
    return NextResponse.json({ ok: true });
  }
  if (b.actie === "actief") {
    // Bij hervatten vanaf nu rekenen, anders draait een lang gepauzeerde taak meteen.
    const aan = b.actief === true;
    await db.from("regie_taken").update({ actief: aan, ...(aan ? { volgende_op: new Date(volgendeKeer(t, Date.now())).toISOString() } : {}) }).eq("id", t.id);
    return NextResponse.json({ ok: true });
  }
  if (b.actie === "maximum") {
    const max = Math.round(Number(b.max_credits));
    if (!Number.isFinite(max) || max < 1 || max > 500) return NextResponse.json({ error: "Het maximum moet tussen 1 en 500 credits liggen." }, { status: 400 });
    await db.from("regie_taken").update({ max_credits: max }).eq("id", t.id);
    return NextResponse.json({ ok: true });
  }
  if (b.actie === "nu") {
    const project = await startUitvoering(t);
    after(() => draai(project));
    return NextResponse.json({ project });
  }
  return NextResponse.json({ error: "Onbekende actie." }, { status: 400 });
}
