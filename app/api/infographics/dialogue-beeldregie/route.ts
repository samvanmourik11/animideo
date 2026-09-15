import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openai } from "@/lib/openai";
import {
  BEELDREGIE_SCHEMA, dubbelePlekken, dubbelePlekVraag, leesRegie, regiePrompt, type Beeldregie,
} from "@/lib/infographics/beeldregie";
import type { DialogueSpec } from "@/lib/infographics/dialogue-schema";

export const runtime = "nodejs";
export const maxDuration = 120;

type Bericht = { role: "system" | "user" | "assistant"; content: string };

/** Eén ronde bij het model; null als het antwoord geen JSON is. */
async function vraag(berichten: Bericht[]): Promise<{ regie: Beeldregie; ruw: string } | null> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.4,
    // Een video van vijf minuten heeft zo'n 75 regels; elk beeld is een zin of twee.
    max_tokens: 8000,
    messages: berichten,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "beeldregie",
        strict: true,
        schema: BEELDREGIE_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });
  const ruw = completion.choices[0]?.message?.content ?? "{}";
  try {
    return { regie: leesRegie(JSON.parse(ruw)), ruw };
  } catch {
    return null;
  }
}

// De beeldregie vóór het storyboard: per scène een eigen plekje en per regel wat
// je ziet. Zie lib/infographics/beeldregie.ts voor waarom.
//
// Geen credits: het zijn GPT-4o-tekstaanroepen, net als de andere denkstappen
// (SCRIPT_GENERATION staat op 0).
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canUseDialoog(user.email)) return NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 });

    const { spec } = (await req.json().catch(() => ({}))) as { spec?: DialogueSpec };
    if (!spec || !Array.isArray(spec.scenes) || !Array.isArray(spec.cast)) {
      return NextResponse.json({ error: "Geen geldige dialoog-spec" }, { status: 400 });
    }

    const { systeem, vraag: opdracht } = regiePrompt(spec);
    const berichten: Bericht[] = [
      { role: "system", content: systeem },
      { role: "user", content: opdracht },
    ];
    const eerste = await vraag(berichten);
    if (!eerste) return NextResponse.json({ error: "Ongeldig antwoord van het model" }, { status: 500 });
    let regie = eerste.regie;

    // Eén herkansing als scènes exact dezelfde plek kregen. De opdracht vraagt al om
    // eigen plekken, maar in een draaiboek dat overal dezelfde plek noemde gaf het
    // model zes keer hetzelfde terug. Na één herkansing nemen we wat er is.
    const dubbel = dubbelePlekken(spec, regie);
    if (dubbel.length) {
      console.warn(`[dialogue-beeldregie] dezelfde plek voor scènes ${dubbel.map((g) => g.join("+")).join(", ")}; herkansing`);
      const tweede = await vraag([
        ...berichten,
        { role: "assistant", content: eerste.ruw },
        { role: "user", content: dubbelePlekVraag(dubbel) },
      ]);
      if (tweede && tweede.regie.scenes.length) regie = tweede.regie;
    }

    const beelden = regie.scenes.reduce((n, s) => n + s.regels.length, 0);
    const gebieden = new Set(regie.scenes.map((s) => s.gebied).filter(Boolean));
    const plekken = new Set(regie.scenes.map((s) => s.plek).filter(Boolean));
    console.log(
      `[dialogue-beeldregie] ${regie.scenes.length} scènes, ${gebieden.size} gebied(en), ` +
      `${plekken.size} verschillende plekken, ${beelden} beelden`,
    );
    return NextResponse.json({ regie });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-beeldregie failed:", msg);
    return NextResponse.json({ error: "Beeldregie mislukt", detail: msg }, { status: 500 });
  }
}
