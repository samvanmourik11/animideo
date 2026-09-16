import { openai } from "@/lib/openai";
import { beeldVoorKijkvraag } from "@/lib/infographics/beeld-inline";

/**
 * Beschrijft een personage zoals het ECHT getekend is, vanaf zijn model sheet of portret.
 *
 * Bij "de drie gouden sleutels" (16-09-2026) zei de tekst "an older king with gray hair"
 * terwijl het blad een krullenpruik, snor en grote neus liet zien: het beeldmodel koos
 * per shot, en de helft van de koningen werd een oma met een bob. Het draakje droeg op
 * zijn blad een trui en laarzen, maar had geen kleding in de tekst, en de beeldregels
 * zeggen "dragons wear nothing unless described": ook dat werd per shot een gok.
 * Beschrijven wat er op één duidelijk blad staat is iets wat een kijkmodel wél goed
 * kan (vergelijken en tellen kon het niet, zie de dialoogmodus-notities).
 */
export async function uiterlijkUitBlad(
  lid: { name: string; soort?: string | null; appearance?: string | null; kleding?: string | null },
  bladUrl: string,
): Promise<{ appearance: string; kleding: string | null } | null> {
  try {
    const beeld = await beeldVoorKijkvraag(bladUrl, 1024);
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You describe a character exactly as drawn on a reference sheet, so an illustrator can redraw the SAME character in every shot of an animated video. Describe only what you see; never add or improve. Be specific about everything that makes this character recognisable and that another artist might otherwise change:
- species/type and apparent age
- head and face: face shape, nose (size, shape), eyes, eyebrows, cheeks
- hair: colour, length, texture (curly/straight/wavy), exact style and volume; for creatures: spikes, crests, horns, ears — shape and number
- body: build and proportions (head size relative to body), tail, wings (size, colour)
- skin/scale colour and markings
Answer as JSON: {"appearance": "one or two English sentences, no clothing and no facial hair", "facialHair": "look closely at the upper lip, chin and jaw: describe any moustache or beard (colour, size, shape), or the word NONE", "clothing": "every visible garment and accessory from head to toe, with colours (crown, robe, belt, cape, sweater, boots...), or the word NONE if the character wears nothing"}.`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Character: ${lid.name}${lid.soort ? ` (${lid.soort})` : ""}. The current text description, which may be too vague or even wrong: "${lid.appearance ?? ""}" Outfit: "${lid.kleding ?? ""}". Describe the character on this sheet.` },
            { type: "image_url", image_url: { url: beeld } },
          ],
        },
      ],
    });
    const uit = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { appearance?: string; facialHair?: string; clothing?: string };
    // Gezichtsbeharing als eigen vraag: in één zin schreef het model "clean-shaven" én
    // "a small mustache" over dezelfde koning.
    const baard = uit.facialHair?.trim();
    const zin = (t: string) => t.replace(/\.?$/, ".");
    const basis = uit.appearance?.trim().replace(/[^.]*clean[- ]shaven[^.]*\.?\s*/gi, "").trim();
    if (!basis) return null;
    const appearance = baard && !/^none\.?$/i.test(baard) ? `${zin(basis)} Facial hair: ${zin(baard)}` : zin(basis);
    const kleding = uit.clothing?.trim();
    return { appearance, kleding: kleding && !/^none\.?$/i.test(kleding) ? kleding : null };
  } catch (e) {
    console.warn("[uiterlijk-uit-blad] mislukt:", e instanceof Error ? e.message : e);
    return null;
  }
}
