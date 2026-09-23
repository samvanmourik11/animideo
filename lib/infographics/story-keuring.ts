// Elk scene-beeld nakijken vóór het in de video belandt.
//
// De dialoogtool doet dit al sinds 15 september: tellen, keuren, herkansen en het
// minst foute beeld bewaren. De storytelling-tool deed niets van dat alles, en dat
// zie je terug in de video's — een personage dat er twee keer in staat, een
// tekstballon met letterbrij, een verzonnen logo in de hoek, een beeld dat in
// tweeën is gesplitst.
//
// Bewust één aanroep per beeld met een KORTE foutenlijst: een open vraag als "is
// dit een goed beeld?" levert beleefde antwoorden op, een lijst met benoemde
// fouten niet. Mislukt de keuring, dan komt er geen fout terug: een beeld tegen-
// houden op basis van een kapotte controle is erger dan een beeld doorlaten.

import { openai } from "@/lib/openai";
import { beeldVoorKijkvraag } from "./beeld-inline";
import { STORY_FOUTEN, schoonFouten, type StoryKeuring } from "./story-keuring-regels";

export * from "./story-keuring-regels";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fouten", "uitleg"],
  properties: {
    fouten: { type: "array", items: { type: "string", enum: [...STORY_FOUTEN] } },
    uitleg: { type: "string" },
  },
} as const;

const SYSTEEM = [
  "Je keurt één beeld uit een animatievideo. Je noemt alleen fouten die je ECHT ziet; wees streng maar niet kieskeurig.",
  "",
  "Mogelijke fouten:",
  '- "dubbel": dezelfde persoon staat twee keer in beeld (zelfde gezicht, haar én kleding op twee plekken). Twee verschillende mensen die op elkaar lijken is GEEN fout, en figuranten op de achtergrond ook niet.',
  '- "tekst": er staat tekst, een woord, een letter, een cijfer, een logo, een merkteken of een watermerk in beeld — ook op een bordje, een verpakking, een scherm of in een tekstballon. Alleen benoemen als je het echt kunt zien.',
  '- "gesplitst": het beeld is in twee of meer panelen, helften of stroken geknipt, of er zit een rand/balk in die er niet hoort.',
  '- "gezichtloos": een persoon zonder gezicht — een leeg hoofd, of alleen haar en kleding waar een gezicht hoort. Iemand die van de zijkant of van achteren te zien is, is GEEN fout.',
  '- "anatomie": een persoon met te veel of vergroeide ledematen, een hoofd zonder lijf, iemand die in een meubel of muur vastzit.',
  '- "zwevend": voorwerpen, iconen, sterretjes of vormen die zonder reden in de lucht hangen.',
  "",
  'Is er niets mis, geef dan een lege lijst. Zet in "uitleg" één korte zin in het Engels over wat je zag; die gaat mee naar de tekenaar als het beeld opnieuw gemaakt wordt.',
].join("\n");

/** Kijkt één scene-beeld na. Bij een fout in de controle zelf: geen fouten. */
export async function keurStoryBeeld(imageUrl: string): Promise<StoryKeuring> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 400,
      messages: [
        { role: "system", content: SYSTEEM },
        {
          role: "user",
          content: [
            { type: "text", text: "Keur dit beeld." },
            // Zelf ophalen: met alleen de link faalde deze controle in de
            // dialoogtool geregeld stil op een download-timeout.
            { type: "image_url", image_url: { url: await beeldVoorKijkvraag(imageUrl), detail: "high" } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "story_keuring", strict: true, schema: SCHEMA as unknown as Record<string, unknown> },
      },
    });
    const ruw = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { fouten?: unknown; uitleg?: unknown };
    return { fouten: schoonFouten(ruw.fouten), uitleg: typeof ruw.uitleg === "string" ? ruw.uitleg.trim().slice(0, 300) : "" };
  } catch (e) {
    console.error("[story-keuring] keuren mislukt, beeld doorgelaten:", e);
    return { fouten: [], uitleg: "" };
  }
}

