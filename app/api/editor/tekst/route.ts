// "Schrijf mee": een korte zin voor in beeld.
//
// Bewust het kleinst mogelijke stukje AI in het tekstpaneel. Het model bedenkt
// alleen de wóórden; lettertype, kleur, plek en effect blijven handwerk. Dat is
// de hele afspraak van deze editor: waar iets fout kan gaan, moet je het zelf
// kunnen corrigeren, en tekst die je zelf opmaakt gaat nooit "een beetje fout"
// zoals een gegenereerd plaatje dat doet.
//
// De gesproken tekst van de scène gaat mee als context — die staat al in het
// document (ClipMeta.transcript), dus daar hoeft niets voor geanalyseerd te
// worden.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUseEditor } from "@/lib/editor/access";
import { openai } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Langer dan dit past niet leesbaar in beeld, hoe mooi de zin ook is. */
const MAX_TEKENS = 90;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseEditor(user.email)) return NextResponse.json({ error: "Geen toegang tot de editor" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    opdracht?: string;
    context?: { gesproken?: string | null; beeld?: string | null };
  };
  const opdracht = (body.opdracht ?? "").trim();
  if (opdracht.length < 2) {
    return NextResponse.json({ error: "Zeg kort waar de tekst over moet gaan" }, { status: 400 });
  }

  const context = [
    body.context?.gesproken ? `In deze scène wordt gezegd: "${body.context.gesproken}"` : null,
    body.context?.beeld ? `In beeld is te zien: ${body.context.beeld}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const antwoord = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.7,
      max_tokens: 60,
      messages: [
        {
          role: "system",
          content:
            "Je schrijft korte teksten die in beeld komen bij een animatievideo. " +
            `Antwoord met één zin van maximaal ${MAX_TEKENS} tekens, in het Nederlands, ` +
            "zonder aanhalingstekens, zonder uitleg en zonder punt aan het eind tenzij het een hele zin is. " +
            "Kort en concreet: het moet leesbaar zijn in een paar seconden.",
        },
        { role: "user", content: context ? `${context}\n\nOpdracht: ${opdracht}` : opdracht },
      ],
    });

    const tekst = (antwoord.choices[0]?.message?.content ?? "")
      .trim()
      .replace(/^["'“”]|["'“”]$/g, "")
      .slice(0, MAX_TEKENS);

    if (!tekst) return NextResponse.json({ error: "Er kwam geen tekst uit" }, { status: 502 });
    return NextResponse.json({ tekst });
  } catch (err) {
    console.error("[editor-tekst]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Het schrijven lukte niet. Probeer het nog eens." }, { status: 500 });
  }
}
