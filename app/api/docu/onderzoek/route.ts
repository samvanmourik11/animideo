import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUseDocu } from "@/lib/studio/access";
import { doeOnderzoek, lengteVoorScript, verdeelEigenScript } from "@/lib/docu/onderzoek";
import { DOCU_LENGTES, isDocuLengte } from "@/lib/docu/types";
import { leesTaal } from "@/lib/motion/types";

export const runtime = "nodejs";
// Zoeken, schrijven en de feitencontrole duren samen een paar minuten.
export const maxDuration = 800;

const kort = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

// Docu, stap 1: onderzoek, script en feitencontrole. Nog geen credits: de klant ziet eerst
// het script. Het kost ons wel ±$1,50 per keer; zolang de studio alleen voor ons team open
// is geen probleem, maar vóór hij voor klanten opengaat hoort hier een dagelijks maximum bij.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  if (!canUseDocu(user.email)) return NextResponse.json({ error: "Deze studio is nog niet beschikbaar voor jouw account." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const onderwerp = kort(body.onderwerp, 300);
  if (onderwerp.length < 3) return NextResponse.json({ error: "Waar gaat je documentaire over?" }, { status: 400 });
  // Eigen script: geen onderzoek, de lengte volgt uit het aantal woorden.
  const script = typeof body.script === "string" ? body.script.trim().slice(0, 20000) : "";
  if (script) {
    const woorden = script.split(/\s+/).filter(Boolean).length;
    if (woorden < 60) return NextResponse.json({ error: "Je script is wel heel kort. Een docu heeft minstens een paar alinea's nodig." }, { status: 400 });
    const lengte = lengteVoorScript(woorden, DOCU_LENGTES.map((l) => l.sec));
    if (!lengte) return NextResponse.json({ error: `Je script heeft ${woorden} woorden; dat is langer dan de langste docu (±10 minuten). Kort het in of maak er twee afleveringen van.` }, { status: 400 });
    try {
      const uit = await verdeelEigenScript({ onderwerp, lengte, taal: leesTaal(body.taal), kanaal: kort(body.kanaal, 40), script });
      console.log(`[docu/onderzoek] eigen script "${onderwerp}": ${woorden} woorden, $${uit.usd.toFixed(2)}, afwijking=${uit.afwijking}`);
      return NextResponse.json({ ...uit, lengte });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Het verdelen in scenes lukte niet. Probeer het opnieuw." }, { status: 500 });
    }
  }
  if (!isDocuLengte(body.lengte)) return NextResponse.json({ error: "Kies een lengte." }, { status: 400 });

  const begin = Date.now();
  try {
    const uit = await doeOnderzoek({ onderwerp, wens: kort(body.wens, 2000), lengte: body.lengte, taal: leesTaal(body.taal), kanaal: kort(body.kanaal, 40) });
    console.log(`[docu/onderzoek] "${onderwerp}": $${uit.usd.toFixed(2)}, ${Math.round((Date.now() - begin) / 1000)} s, ${uit.feiten.length} feiten, ${uit.controle.verbeterd.length} verbeterd`);
    return NextResponse.json(uit);
  } catch (e) {
    console.error("[docu/onderzoek]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Het onderzoek is mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
