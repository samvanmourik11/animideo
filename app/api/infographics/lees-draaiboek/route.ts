// Leest een aangeleverd draaiboek en zet het om in shots (voice-over, beeld,
// beweging). Gratis: dit is een leesstap vóór het genereren, zodat de gebruiker
// eerst ziet wat eruit komt en pas daarna credits uitgeeft aan beelden.
//
// Zie lib/infographics/draaiboek.ts voor de opdracht aan het model en de
// controle achteraf (staat elke voice-over echt in het document?).
import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { DRAAIBOEK_SCHEMA, DRAAIBOEK_SYSTEEM, keurLezing } from "@/lib/infographics/draaiboek";

export const runtime = "nodejs";
export const maxDuration = 120;

// Een draaiboek met shotlijst én een uitgeschreven script is al gauw 6.000
// tekens; 30.000 vangt ook de uitgebreide varianten zonder het model te laten
// afkappen.
const MAX_TEKENS = 30000;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { document } = (await req.json().catch(() => ({}))) as { document?: string };
    const tekst = (document ?? "").trim().slice(0, MAX_TEKENS);
    if (!tekst) return NextResponse.json({ error: "Geen document opgegeven" }, { status: 400 });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      // Laag: dit is overtypen en ordenen, niet schrijven.
      temperature: 0.1,
      max_tokens: 12000,
      messages: [
        { role: "system", content: DRAAIBOEK_SYSTEEM },
        { role: "user", content: `DRAAIBOEK:\n"""\n${tekst}\n"""\n\nGeef de shots als JSON.` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "draaiboek", strict: true, schema: DRAAIBOEK_SCHEMA as unknown as Record<string, unknown> },
      },
    });

    let ruw: unknown;
    try {
      ruw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    } catch {
      return NextResponse.json({ error: "Het draaiboek kon niet gelezen worden" }, { status: 500 });
    }

    const lezing = keurLezing(ruw, tekst);
    if (!lezing) return NextResponse.json({ error: "Geen shots gevonden in dit document" }, { status: 422 });

    return NextResponse.json({ lezing });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[lees-draaiboek]", msg);
    return NextResponse.json({ error: "Het draaiboek lezen is mislukt", detail: msg }, { status: 500 });
  }
}
