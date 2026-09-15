import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  leesBibliotheekVoorwerp, tabelOntbreekt, MAX_NAAM, MAX_UITERLIJK, type BibliotheekVoorwerp,
} from "@/lib/infographics/voorwerp-bibliotheek";

// De voorwerpenbibliotheek: lijst, toevoegen en bijwerken. Zie voorwerp-bibliotheek.ts.
//
// Kost geen credits: een voorwerp bewaren is een rij in de database. Het blad wordt
// getekend in de video waarin het voorwerp voor het eerst in een stijl voorkomt.

const NIET_ACTIEF =
  "De voorwerpenbibliotheek is nog niet actief: de databasetabel ontbreekt (migratie 041_voorwerpen.sql).";

async function authGuard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!canUseDialoog(user.email)) return { error: NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 }) };
  return { supabase, user };
}

export async function GET() {
  const guard = await authGuard();
  if ("error" in guard) return guard.error;
  const { supabase, user } = guard;

  const { data, error } = await supabase
    .from("voorwerpen")
    .select("id, naam, uiterlijk, bladen, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  // Zonder tabel geen foutscherm: de dialoogmodus werkt dan gewoon zonder bibliotheek.
  if (tabelOntbreekt(error)) return NextResponse.json({ voorwerpen: [], nietActief: true, melding: NIET_ACTIEF });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const voorwerpen = (data ?? []).map(leesBibliotheekVoorwerp).filter((v): v is BibliotheekVoorwerp => !!v);
  return NextResponse.json({ voorwerpen });
}

interface Body {
  /** Weglaten = nieuw voorwerp. */
  id?: string;
  naam?: string;
  uiterlijk?: string;
  /** Samen met bladUrl: het blad van dit voorwerp in deze tekenstijl bewaren. */
  styleId?: string;
  bladUrl?: string;
}

export async function POST(req: NextRequest) {
  const guard = await authGuard();
  if ("error" in guard) return guard.error;
  const { supabase, user } = guard;

  const body = (await req.json().catch(() => ({}))) as Body;
  const naam = (body.naam ?? "").trim().slice(0, MAX_NAAM);
  const uiterlijk = (body.uiterlijk ?? "").trim().slice(0, MAX_UITERLIJK);
  const styleId = (body.styleId ?? "").trim();
  const bladUrl = (body.bladUrl ?? "").trim();
  const metBlad = !!styleId && /^https:\/\//.test(bladUrl);
  if (!naam || !uiterlijk) {
    return NextResponse.json({ error: "Een voorwerp heeft een naam en een beschrijving nodig" }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  if (id) {
    const { data: bestaand, error: leesFout } = await supabase
      .from("voorwerpen")
      .select("id, naam, uiterlijk, bladen")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (tabelOntbreekt(leesFout)) return NextResponse.json({ error: NIET_ACTIEF }, { status: 503 });
    if (leesFout) return NextResponse.json({ error: leesFout.message }, { status: 500 });
    const vorig = leesBibliotheekVoorwerp(bestaand);
    if (!vorig) return NextResponse.json({ error: "Voorwerp niet gevonden" }, { status: 404 });

    // Een andere beschrijving maakt de bladen ongeldig: die tonen het oude voorwerp.
    const zelfdeUiterlijk = vorig.uiterlijk.trim() === uiterlijk;
    const bladen = { ...(zelfdeUiterlijk ? vorig.bladen : {}), ...(metBlad ? { [styleId]: bladUrl } : {}) };
    const { data: rij, error } = await supabase
      .from("voorwerpen")
      .update({ naam, uiterlijk, bladen, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, naam, uiterlijk, bladen, created_at, updated_at")
      .single();
    if (error || !rij) return NextResponse.json({ error: error?.message ?? "Bijwerken mislukt" }, { status: 500 });
    return NextResponse.json({ voorwerp: leesBibliotheekVoorwerp(rij) });
  }

  const { data: rij, error } = await supabase
    .from("voorwerpen")
    .insert({ user_id: user.id, naam, uiterlijk, bladen: metBlad ? { [styleId]: bladUrl } : {} })
    .select("id, naam, uiterlijk, bladen, created_at, updated_at")
    .single();
  if (tabelOntbreekt(error)) return NextResponse.json({ error: NIET_ACTIEF }, { status: 503 });
  if (error || !rij) return NextResponse.json({ error: error?.message ?? "Bewaren mislukt" }, { status: 500 });
  return NextResponse.json({ voorwerp: leesBibliotheekVoorwerp(rij) });
}
