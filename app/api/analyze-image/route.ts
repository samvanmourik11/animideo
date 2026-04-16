import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64) return NextResponse.json({ error: "Geen afbeelding meegegeven" }, { status: 400 });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 120,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType ?? "image/jpeg"};base64,${imageBase64}`,
                detail: "low",
              },
            },
            {
              type: "text",
              text: `Analyseer deze afbeelding en stel een beknopte camerabewegingsinstructie voor een 5-seconden videoclip voor.
Wees specifiek en concreet. Voorbeelden: "Langzame camera pan naar rechts langs het landschap", "Zachte zoom naar het midden van de afbeelding", "Subtiele omhoog beweging, alsof de camera opstijgt".
Geef alleen de bewegingsinstructie terug, in het Nederlands, zonder uitleg.`,
            },
          ],
        },
      ],
    });

    const motionPrompt = response.choices[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ motionPrompt });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[analyze-image]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
