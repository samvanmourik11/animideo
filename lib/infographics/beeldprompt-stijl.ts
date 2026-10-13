import { openai } from "@/lib/openai";

// DE STIJL UIT EEN KANT-EN-KLARE BEELDPROMPT HALEN.
//
// Een draaiboek met een NANO BANANA-kolom levert per scene een complete
// beeldprompt, inclusief een eigen huisstijlblok (tekenstijl, kleuren, papier).
// Die ging letterlijk naar het beeldmodel, en dan won de stijl uit het script
// van de stijl die in de app gekozen was (Sam, 13-10-2026: "hij moet de stijl
// van de app gebruiken").
//
// De inhoud van zo'n prompt is juist goed — vaste outfits, de juiste tijd, de
// grap — dus die blijft woord voor woord staan. Alleen de zinnen over HOE het
// eruitziet gaan eruit; de gekozen stijl komt er daarna weer voor.

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["prompts"],
  properties: {
    prompts: { type: "array", items: { type: "string" } },
  },
} as const;

const OPDRACHT =
  `Je krijgt een lijst Engelse beeldprompts. Haal uit elke prompt ALLEEN de delen weg die over de visuele stijl gaan: ` +
  `tekenstijl of medium (illustration, vector, watercolour, photo, 3D, cartoon, editorial, mid-century, paper texture), ` +
  `huisstijlblokken ("HOUSE STYLE ..."), kleurpaletten en vaste kleuren van de stijl, lijnvoering, belichtingsstijl, ` +
  `korrel/textuur en verwijzingen naar kunstenaars of studio's. ` +
  `Laat ALLES wat over de inhoud gaat letterlijk staan, woord voor woord: wie en wat er in beeld is, kleding en uiterlijk ` +
  `van personen (ook de kleur van een jas of een vlag — dat is inhoud, geen stijl), de plek, de tijd, de actie, de compositie ` +
  `en camerahoek, de grap, en tekst tussen aanhalingstekens. Vat niets samen, vertaal niets en voeg niets toe. ` +
  `Geef precies evenveel prompts terug, in dezelfde volgorde.`;

/**
 * Dezelfde prompts zonder stijlzinnen. Mislukt het, dan komen de originelen
 * terug — de stijlregel in buildIllustrationPrompt (STIJL_VOORRANG) zegt het
 * beeldmodel dan nog steeds dat de gekozen stijl voorgaat.
 */
export async function haalStijlUitBeeldPrompts(prompts: string[]): Promise<string[]> {
  const metInhoud = prompts.map((p) => p.trim());
  if (!metInhoud.some(Boolean)) return metInhoud;
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: Math.min(16000, metInhoud.join("").length + 2000),
      messages: [
        { role: "system", content: OPDRACHT },
        { role: "user", content: JSON.stringify({ prompts: metInhoud }) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "beeldprompts", strict: true, schema: SCHEMA as unknown as Record<string, unknown> },
      },
    });
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { prompts?: string[] };
    if (!Array.isArray(parsed.prompts) || parsed.prompts.length !== metInhoud.length) return metInhoud;
    // Een lege of piepkleine uitkomst betekent dat er te veel weg is: dan het origineel.
    return metInhoud.map((orig, i) => {
      const schoon = (parsed.prompts![i] ?? "").trim();
      return !orig || schoon.length < Math.min(40, orig.length / 4) ? orig : schoon;
    });
  } catch (e) {
    console.error("[beeldprompt-stijl] stijl eruit halen mislukt, originele prompts gebruikt:", e);
    return metInhoud;
  }
}
