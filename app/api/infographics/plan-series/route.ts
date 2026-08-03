// Serie-generatie (verbeterplan B4): splitst één bron/onderwerp in meerdere losse
// korte-video-ideeën ("afleveringen"). Elke aflevering is een zelfstandige
// invalshoek/processtap die de gebruiker daarna als apart verhaal kan uitwerken.
// Kern-use-case uit de transcripts (Super50Carz: "per kleine processtappen").
import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Body {
  topic?: string;
  text?: string;
  count?: number;
  language?: string;
}

const SERIES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["episodes"],
  properties: {
    episodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "angle", "brief"],
        properties: {
          title: { type: "string" },
          angle: { type: "string" },
          brief: { type: "string" },
        },
      },
    },
  },
} as const;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as Body;
    const topic = (body.topic ?? "").trim();
    const text = (body.text ?? "").trim();
    if (!topic && !text) return NextResponse.json({ error: "Geen onderwerp of brontekst" }, { status: 400 });
    const count = Math.max(2, Math.min(8, Math.round(body.count ?? 4)));
    const lang = body.language || "Nederlands";

    const credit = await deductCredits(user.id, CREDIT_COSTS.SCRIPT_GENERATION, "Serie plannen");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.SCRIPT_GENERATION },
        { status: 402 }
      );
    }

    const system = `Je bent een contentstrateeg voor korte social-video's. Splits het onderwerp/de bron in ${count} LOSSE, zelfstandige video-ideeën ("afleveringen"). ` +
      `Elke aflevering behandelt één duidelijke invalshoek of processtap en is geschikt als aparte video van ~60 seconden. ` +
      `Samen dekken ze het onderwerp logisch af, zonder overlap. Gebruik ALLEEN informatie uit de bron; verzin geen feiten. ` +
      `Schrijf alles in het ${lang}. Per aflevering lever je: "title" (pakkende titel), "angle" (één zin die de invalshoek samenvat), en "brief" (2-4 zinnen met de concrete kernpunten uit de bron die deze video behandelt).`;
    const userMsg = `ONDERWERP: ${topic || "(leid af uit de bron)"}\n\nBRON:\n"""\n${text.slice(0, 8000) || topic}\n"""\n\nGeef ${count} afleveringen als JSON.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.5,
      max_tokens: 2000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "series", strict: true, schema: SERIES_SCHEMA as unknown as Record<string, unknown> },
      },
    });

    let parsed: { episodes?: { title: string; angle: string; brief: string }[] };
    try {
      parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    } catch {
      return NextResponse.json({ error: "Ongeldige JSON van model" }, { status: 500 });
    }
    const episodes = Array.isArray(parsed.episodes) ? parsed.episodes : [];
    if (episodes.length === 0) return NextResponse.json({ error: "Geen afleveringen gegenereerd" }, { status: 500 });

    return NextResponse.json({ episodes });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("infographics/plan-series failed:", msg);
    return NextResponse.json({ error: "Serie plannen mislukt", detail: msg }, { status: 500 });
  }
}
