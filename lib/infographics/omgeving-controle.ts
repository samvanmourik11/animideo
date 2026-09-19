// KIJKEN OF EEN PLEK NOG DEZELFDE PLEK IS.
//
// Twee beelden naast elkaar leggen en vragen "is dit dezelfde plek?" werkt niet: daar
// zegt het kijkmodel altijd ja op (zelfde ontdekking als bij de beeldcontrole en bij de
// aanwijzingen). Vragen naar wat er te ZIEN is werkt wél. Daarom heeft elke omgeving een
// lijstje herkenningspunten, afgelezen van het eerste getekende beeld van die plek, en
// controleren we daarna per beeld welke daarvan er staan.

import { openai } from "@/lib/openai";
import { beeldAlsDataUrl } from "./beeld-inline";

/**
 * De herkenningspunten van een plek aflezen van het beeld dat er net van gemaakt is.
 *
 * Bewust van het BEELD en niet van de omschrijving: wat de gebruiker intikte is een
 * wens, wat er getekend staat is wat de rest van de video moet volgen. Dezelfde reden
 * waarom het uiterlijk van een personage van zijn tekening wordt afgelezen.
 */
export async function kenmerkenUitBeeld(beeldUrl: string, beschrijving: string): Promise<string[]> {
  const beeld = await beeldAlsDataUrl(beeldUrl, { maxZijde: 1024 });
  if (!beeld) return [];
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You look at a picture of a location from an animated film and list what makes this place recognisable, " +
            'so another illustrator can draw the same place again. Answer JSON: {"kenmerken": ["..."]} — between three ' +
            "and six short English phrases, each one thing you can actually SEE, with its colour and its position: " +
            '"a white football goal on the right", "a low red brick wall behind the field", "tall dark green oak trees ' +
            'along the left side", "a bright blue sky with a few clouds". Name only things that stay put: buildings, ' +
            "trees, walls, fences, furniture, ground, sky. No people, no animals, no moving objects, no camera talk.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `This is the location: ${beschrijving}` },
            { type: "image_url", image_url: { url: beeld, detail: "high" } },
          ],
        },
      ],
    });
    const uit = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { kenmerken?: unknown };
    return Array.isArray(uit.kenmerken)
      ? uit.kenmerken.map(String).map((k) => k.trim()).filter((k) => k.length > 2).slice(0, 6)
      : [];
  } catch (e) {
    console.warn("[omgeving-controle] kenmerken aflezen mislukt:", e instanceof Error ? e.message : e);
    return [];
  }
}

export interface PlekOordeel {
  /** Welke herkenningspunten je in dit beeld terugziet. */
  gezien: string[];
  /** Welke niet. Bij een close-up hoeft dat niets te betekenen: de camera ziet ze niet allemaal. */
  gemist: string[];
}

/**
 * Welke herkenningspunten staan er in dit beeld?
 *
 * Geen ja/nee over "dezelfde plek": per punt kijken of het er staat. Een beeld waarin
 * geen enkel punt terugkomt, speelt ergens anders.
 */
export async function plekKlopt(beeldUrl: string, kenmerken: string[]): Promise<PlekOordeel | null> {
  const lijst = kenmerken.filter(Boolean).slice(0, 6);
  if (!lijst.length) return null;
  const beeld = await beeldAlsDataUrl(beeldUrl, { maxZijde: 1024 });
  if (!beeld) return null;
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You check which of the listed things are visible in this picture. Judge only what you can see. " +
            'Answer JSON: {"gezien": ["..."], "gemist": ["..."]} — copy each listed phrase into exactly one of the ' +
            "two lists, unchanged. Something counts as seen when it is there in the same colour and roughly the same " +
            "kind of shape, even if the camera is closer or further away, or shows it from another side. " +
            "Something that is simply outside the frame belongs in the second list.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `The things to look for:\n${lijst.map((k) => `- ${k}`).join("\n")}` },
            { type: "image_url", image_url: { url: beeld, detail: "high" } },
          ],
        },
      ],
    });
    const uit = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { gezien?: unknown; gemist?: unknown };
    const lees = (r: unknown) => (Array.isArray(r) ? r.map(String).filter(Boolean) : []);
    return { gezien: lees(uit.gezien), gemist: lees(uit.gemist) };
  } catch (e) {
    console.warn("[omgeving-controle] plek controleren mislukt:", e instanceof Error ? e.message : e);
    return null;
  }
}
