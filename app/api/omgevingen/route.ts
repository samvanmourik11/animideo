import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tabelOntbreekt } from "@/lib/infographics/voorwerp-bibliotheek";
import {
  leesBibliotheekOmgeving, MAX_OMGEVING_NAAM, MAX_OMGEVING_BESCHRIJVING, type BibliotheekOmgeving,
} from "@/lib/infographics/omgeving-bibliotheek";
import { OMGEVING_VARIANTEN, type OmgevingVariantSoort } from "@/lib/infographics/omgeving";

// De omgevingenbibliotheek: lijst, toevoegen en bijwerken. Zie omgeving-bibliotheek.ts.
//
// Kost geen credits: een plek bewaren is een rij in de database. De beelden worden
// getekend door /api/infographics/omgeving-tekenen.

const NIET_ACTIEF =
  "De omgevingenbibliotheek is nog niet actief: de databasetabel ontbreekt (migratie 043_omgevingen.sql).";

const KOLOMMEN = "id, naam, beschrijving, kenmerken, varianten, created_at, updated_at";

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
    .from("omgevingen")
    .select(KOLOMMEN)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  // Zonder tabel geen foutscherm: de dialoogmodus werkt dan gewoon zonder bibliotheek.
  if (tabelOntbreekt(error)) return NextResponse.json({ omgevingen: [], nietActief: true, melding: NIET_ACTIEF });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const omgevingen = (data ?? []).map(leesBibliotheekOmgeving).filter((o): o is BibliotheekOmgeving => !!o);
  return NextResponse.json({ omgevingen });
}

interface Body {
  /** Weglaten = nieuwe omgeving. */
  id?: string;
  naam?: string;
  beschrijving?: string;
  /** Afgelezen van het getekende beeld; alleen meesturen als er net getekend is. */
  kenmerken?: string[];
  /** Samen met varianten: de beelden van deze plek in deze tekenstijl bewaren. */
  styleId?: string;
  nieuweVarianten?: Partial<Record<OmgevingVariantSoort, string>>;
}

export async function POST(req: NextRequest) {
  const guard = await authGuard();
  if ("error" in guard) return guard.error;
  const { supabase, user } = guard;

  const body = (await req.json().catch(() => ({}))) as Body;
  const naam = (body.naam ?? "").trim().slice(0, MAX_OMGEVING_NAAM);
  const beschrijving = (body.beschrijving ?? "").trim().slice(0, MAX_OMGEVING_BESCHRIJVING);
  const styleId = (body.styleId ?? "").trim();
  const kenmerken = Array.isArray(body.kenmerken) ? body.kenmerken.map(String).filter(Boolean).slice(0, 8) : null;
  const nieuw: Partial<Record<OmgevingVariantSoort, string>> = {};
  for (const soort of OMGEVING_VARIANTEN) {
    const url = body.nieuweVarianten?.[soort];
    if (typeof url === "string" && /^https:\/\//.test(url)) nieuw[soort] = url;
  }
  const metBeelden = !!styleId && Object.keys(nieuw).length > 0;
  if (!naam || !beschrijving) {
    return NextResponse.json({ error: "Een omgeving heeft een naam en een beschrijving nodig" }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  if (id) {
    const { data: bestaand, error: leesFout } = await supabase
      .from("omgevingen").select(KOLOMMEN).eq("id", id).eq("user_id", user.id).maybeSingle();
    if (tabelOntbreekt(leesFout)) return NextResponse.json({ error: NIET_ACTIEF }, { status: 503 });
    if (leesFout) return NextResponse.json({ error: leesFout.message }, { status: 500 });
    const vorig = leesBibliotheekOmgeving(bestaand);
    if (!vorig) return NextResponse.json({ error: "Omgeving niet gevonden" }, { status: 404 });

    // Een andere beschrijving maakt de beelden ongeldig: die tonen de oude plek.
    const zelfde = vorig.beschrijving.trim() === beschrijving;
    const varianten = { ...(zelfde ? vorig.varianten : {}) };
    if (metBeelden) varianten[styleId] = { ...(zelfde ? varianten[styleId] : {}), ...nieuw };
    const { data: rij, error } = await supabase
      .from("omgevingen")
      .update({
        naam,
        beschrijving,
        kenmerken: kenmerken ?? (zelfde ? vorig.kenmerken : []),
        varianten,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id).eq("user_id", user.id).select(KOLOMMEN).single();
    if (error || !rij) return NextResponse.json({ error: error?.message ?? "Bijwerken mislukt" }, { status: 500 });
    return NextResponse.json({ omgeving: leesBibliotheekOmgeving(rij) });
  }

  const { data: rij, error } = await supabase
    .from("omgevingen")
    .insert({
      user_id: user.id,
      naam,
      beschrijving,
      kenmerken: kenmerken ?? [],
      varianten: metBeelden ? { [styleId]: nieuw } : {},
    })
    .select(KOLOMMEN).single();
  if (tabelOntbreekt(error)) return NextResponse.json({ error: NIET_ACTIEF }, { status: 503 });
  if (error || !rij) return NextResponse.json({ error: error?.message ?? "Bewaren mislukt" }, { status: 500 });
  return NextResponse.json({ omgeving: leesBibliotheekOmgeving(rij) });
}
