import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openai } from "@/lib/openai";
import { BEELDREGIE_SCHEMA, leesRegie, regiePrompt } from "@/lib/infographics/beeldregie";
import type { DialogueSpec } from "@/lib/infographics/dialogue-schema";

export const runtime = "nodejs";
export const maxDuration = 120;

// De beeldregie vóór het storyboard: per scène een eigen plekje en per regel wat
// je ziet. Zie lib/infographics/beeldregie.ts voor waarom.
//
// Geen credits: het is één GPT-4o-tekstaanroep, net als de andere denkstappen
// (SCRIPT_GENERATION staat op 0).
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { spec } = (await req.json().catch(() => ({}))) as { spec?: DialogueSpec };
    if (!spec || !Array.isArray(spec.scenes) || !Array.isArray(spec.cast)) {
      return NextResponse.json({ error: "Geen geldige dialoog-spec" }, { status: 400 });
    }

    const { systeem, vraag } = regiePrompt(spec);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      // Een video van vijf minuten heeft zo'n 75 regels; elk beeld is een zin of twee.
      max_tokens: 8000,
      messages: [
        { role: "system", content: systeem },
        { role: "user", content: vraag },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "beeldregie",
          strict: true,
          schema: BEELDREGIE_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });

    let ruw: unknown;
    try {
      ruw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    } catch {
      return NextResponse.json({ error: "Ongeldig antwoord van het model" }, { status: 500 });
    }

    const regie = leesRegie(ruw);
    const beelden = regie.scenes.reduce((n, s) => n + s.regels.length, 0);
    const gebieden = new Set(regie.scenes.map((s) => s.gebied).filter(Boolean));
    console.log(`[dialogue-beeldregie] ${regie.scenes.length} scènes, ${gebieden.size} gebied(en), ${beelden} beelden`);
    return NextResponse.json({ regie });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-beeldregie failed:", msg);
    return NextResponse.json({ error: "Beeldregie mislukt", detail: msg }, { status: 500 });
  }
}
