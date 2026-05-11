import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface CharacterDescription {
  description: string;
  gender:      string | null;
  age_range:   string | null;
}

/**
 * Vraagt een vision-LLM om een korte, scriptable beschrijving van een persoon.
 * Wordt gebruikt om bij upload/generatie van een character de tekstuele
 * beschrijving te creëren die later mee gaat in script- en image-prompts.
 */
export async function describeCharacter(imageUrl: string): Promise<CharacterDescription> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: `Je krijgt een afbeelding van een personage te zien. Beschrijf het personage zodat het later consistent in scenes kan worden gebruikt.

Antwoord ALLEEN met geldige JSON, zonder markdown of code-fences:
{
  "description": "<2-3 zinnen Nederlands. Beschrijf fysieke kenmerken (haar, ogen, lichaamsbouw), kleding en uitstraling. Geen achtergrond.>",
  "gender":      "<man | vrouw | onduidelijk>",
  "age_range":   "<bijv. 20-30, 30-40, 40-50, 50-60, 60+>"
}`,
        },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    }],
    max_tokens:  300,
    temperature: 0.4,
  });

  const raw = (completion.choices[0]?.message?.content ?? "").trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as Partial<CharacterDescription>;
    const gender = parsed.gender && parsed.gender !== "onduidelijk" ? parsed.gender : null;
    return {
      description: (parsed.description ?? "").trim(),
      gender,
      age_range:   (parsed.age_range ?? "").trim() || null,
    };
  } catch {
    return { description: cleaned, gender: null, age_range: null };
  }
}
