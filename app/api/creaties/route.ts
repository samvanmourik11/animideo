import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startCreatie, verversLopende, WachtrijFout } from "@/lib/creaties/wachtrij";
import type { Creatie } from "@/lib/creaties/types";

export const runtime = "nodejs";
// Afronden betekent het resultaat downloaden en naar onze opslag kopiëren; bij video's
// van een paar MB, en tot acht tegelijk.
// Een reclame wordt na het antwoord gemonteerd (after() in lib/reclame/regie.ts); die
// montage valt binnen de tijd van dít verzoek.
export const maxDuration = 300;

const PAGINA = 40;

// De bibliotheek: alles wat iemand in de nieuwe app maakte, nieuwste eerst. Wat nog
// bezig is, wordt meteen ververst — zo is opvragen ook meteen de wachtrij laten lopen.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

  const p = req.nextUrl.searchParams;
  let q = supabase
    .from("creaties")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(PAGINA);

  const soort = p.get("soort");
  if (soort === "beeld" || soort === "video" || soort === "audio") q = q.eq("soort", soort);
  const maker = p.get("maker");
  if (maker) q = q.eq("maker", maker);
  const recept = p.get("recept");
  if (recept) q = q.eq("invoer->>receptId", recept);
  if (p.get("favoriet") === "1") q = q.eq("favoriet", true);
  const map = p.get("map");
  if (map) q = q.eq("map_id", map);
  const zoek = p.get("zoek")?.trim();
  // Komma's en haakjes hebben een betekenis in het filter van Supabase; weg ermee.
  if (zoek) q = q.ilike("prompt", `%${zoek.replace(/[%_,()]/g, " ")}%`);
  const voor = p.get("voor");
  if (voor) q = q.lt("created_at", voor);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const creaties = await verversLopende((data ?? []) as Creatie[]);
  return NextResponse.json({ creaties, meer: (data ?? []).length === PAGINA });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

  let body: { maker?: unknown; invoer?: unknown; ouderId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });
  }
  const invoer = body.invoer && typeof body.invoer === "object" ? (body.invoer as Record<string, unknown>) : {};
  const ouderId = typeof body.ouderId === "string" ? body.ouderId : null;

  try {
    const creatie = await startCreatie(user.id, String(body.maker ?? ""), invoer, ouderId);
    return NextResponse.json({ creatie });
  } catch (e) {
    if (e instanceof WachtrijFout) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/creaties] starten mislukt:", e);
    return NextResponse.json({ error: "Er ging iets mis. Probeer het opnieuw." }, { status: 500 });
  }
}
