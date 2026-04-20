import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { deductCredits } from "@/lib/credits";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const credit = await deductCredits(user.id, 1, "Merk analyseren");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: 1 },
        { status: 402 }
      );
    }

    const { images } = await req.json() as {
      images: Array<{ base64: string; mimeType: string }>;
    };

    if (!images?.length) {
      return NextResponse.json({ error: "Geen afbeeldingen meegegeven" }, { status: 400 });
    }

    const imageContent = images.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
        detail: "high" as const,
      },
    }));

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: [
            ...imageContent,
            {
              type: "text",
              text: `Analyseer deze merkafbeeldingen (website screenshots, logo's, of huisstijlmateriaal) en extraheer de merkidentiteit.

Geef een JSON object terug met ALLEEN deze velden:
{
  "description": "beknopte visuele stijlomschrijving in 2-3 zinnen",
  "tone_of_voice": "communicatietoon, bijv: warm en informeel, professioneel en zakelijk, speels en energiek",
  "brand_values": ["waarde1", "waarde2", "waarde3"],
  "colors": {
    "primary": "omschrijving primaire kleur, bijv: diepblauw (#1a3c6e)",
    "secondary": "omschrijving secundaire kleur",
    "accent": "omschrijving accentkleur",
    "background": "omschrijving achtergrondkleur"
  },
  "fonts": {
    "primary": "lettertype naam of omschrijving stijl",
    "secondary": "secundair lettertype indien aanwezig"
  },
  "environment": "terugkerende visuele omgevingen of settings",
  "do_nots": "elementen die niet bij het merk passen"
}

Antwoord met alleen het JSON object, geen markdown, geen uitleg.`,
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    let result: Record<string, unknown> = {};
    try {
      result = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "Analyse kon niet worden verwerkt" }, { status: 500 });
    }

    return NextResponse.json({ analysis: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[analyze-brand]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
