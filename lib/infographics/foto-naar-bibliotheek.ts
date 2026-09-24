// EEN FOTO WORDT EEN BIBLIOTHEEKITEM.
//
// "Ik heb een foto van mijn kantoor" of "van onze machine" is de kortste weg naar
// een omgeving of voorwerp dat in elke video klopt: de klant hoeft niet in het
// Engels te beschrijven hoe zijn ding eruitziet, want dat staat op de foto.
//
// Twee stappen: een visiemodel schrijft op wat het ziet (dat wordt de vaste
// beschrijving die naar het beeldmodel gaat), en daarna wordt de foto in de
// gekozen tekenstijl nagetekend. De foto zelf gaat nooit de video in — die is te
// fotografisch naast een getekende scène, en bij de realistische stijl juist
// precies goed.

import { openai } from "@/lib/openai";

export type FotoSoort = "voorwerp" | "omgeving";

export interface FotoLezing {
  /** Korte Nederlandse naam, bruikbaar als naam in de bibliotheek. */
  naam: string;
  /** Engelse beschrijving die naar het beeldmodel gaat. */
  beschrijving: string;
  /** Wat dit ding herkenbaar maakt; bij een omgeving de vaste punten in beeld. */
  kenmerken: string[];
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["naam", "beschrijving", "kenmerken"],
  properties: {
    naam: { type: "string" },
    beschrijving: { type: "string" },
    kenmerken: { type: "array", items: { type: "string" } },
  },
} as const;

const VOORWERP = [
  "Je kijkt naar een foto van één voorwerp dat in video's steeds hetzelfde moet zijn (een machine, een product, een voertuig, een apparaat).",
  "",
  '- "naam": hoe je het ding in het Nederlands zou noemen, kort (bijv. "onze verpakkingsmachine").',
  '- "beschrijving": ÉÉN Engelse alinea die precies zegt hoe het eruitziet, zo concreet dat een tekenaar het zonder de foto kan natekenen: wat voor ding het is, de vorm, de hoofdkleur en de accentkleuren, het materiaal, de opvallende onderdelen en waar die zitten, en hoe groot het is naast een mens. Geen merknamen, geen tekst die op het apparaat staat.',
  '- "kenmerken": drie tot zes korte Engelse punten die dit ding herkenbaar maken ("a red control panel on the left side").',
].join("\n");

const OMGEVING = [
  "Je kijkt naar een foto van een plek die in video's steeds dezelfde plek moet zijn (een kantoor, een werkplaats, een winkel, een lokaal).",
  "",
  '- "naam": hoe je de plek in het Nederlands zou noemen, kort (bijv. "ons kantoor").',
  '- "beschrijving": ÉÉN Engelse alinea die de plek beschrijft zoals een tekenaar hem zou moeten tekenen: wat voor ruimte het is, de indeling, wat er waar staat, de kleuren van muren, vloer en meubels, het licht en de sfeer. Beschrijf de PLEK, niet de mensen: laat iedereen die toevallig op de foto staat weg.',
  '- "kenmerken": drie tot zes korte Engelse punten die deze plek herkenbaar maken en in elk beeld terug moeten komen ("a long window wall on the right", "a blue couch in the corner").',
].join("\n");

/** Leest een foto en schrijft op wat er te zien is. Mislukt dit, dan null. */
export async function leesFoto(fotoDataUrl: string, soort: FotoSoort): Promise<FotoLezing | null> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: fotoDataUrl, detail: "high" } },
            { type: "text", text: soort === "voorwerp" ? VOORWERP : OMGEVING },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "foto_lezing", strict: true, schema: SCHEMA as unknown as Record<string, unknown> },
      },
    });
    const ruw = JSON.parse(res.choices[0]?.message?.content ?? "{}") as Partial<FotoLezing>;
    const beschrijving = (ruw.beschrijving ?? "").trim();
    if (!beschrijving) return null;
    return {
      naam: (ruw.naam ?? "").trim().slice(0, 80) || (soort === "voorwerp" ? "Mijn voorwerp" : "Mijn omgeving"),
      beschrijving: beschrijving.slice(0, 700),
      kenmerken: (Array.isArray(ruw.kenmerken) ? ruw.kenmerken : [])
        .map((k) => String(k).trim())
        .filter(Boolean)
        .slice(0, 6),
    };
  } catch (e) {
    console.error("[foto-naar-bibliotheek] foto lezen mislukt:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * De tekenopdracht om van de foto een getekende versie te maken.
 *
 * De foto gaat als referentie mee; deze tekst zegt wat er mee moet gebeuren. Bij
 * een voorwerp wordt het een blad op een lege achtergrond (zoals het castblad
 * voor personages), bij een omgeving een lege plek zonder mensen.
 */
export function tekenOpdrachtUitFoto(lezing: FotoLezing, soort: FotoSoort, metFoto = true): string {
  const kenmerken = lezing.kenmerken.length
    ? `These details belong to it and must be clearly visible: ${lezing.kenmerken.join(", ")}. `
    : "";
  if (soort === "voorwerp") {
    return (
      `A reference sheet for ONE object: ${lezing.beschrijving} ${kenmerken}` +
      (metFoto
        ? "The reference image is a PHOTO of that exact object: keep its real shape, proportions, colours and details, " +
          "but draw it in the illustration style of this video — never paste or trace the photo. "
        : "") +
      "Draw the object once, centred on a plain light neutral background. " +
      "No people, no animals, no other objects and no scenery. " +
      "No text, no names, no labels, no numbers and no frames anywhere in the image."
    );
  }
  return (
    `A location background for an animated film: a wide establishing view of this place. ${lezing.beschrijving} ${kenmerken}` +
    (metFoto
      ? "The reference image is a PHOTO of that exact place: keep the same layout, the same furniture and objects in the " +
        "same positions, the same colours and the same light, but draw it in the illustration style of this video — never " +
        "paste or trace the photo. "
      : "Draw it exactly as described above: the same layout, the same furniture and objects in the same positions and " +
        "the same colours. ") +
    "EMPTY PLACE: there are no people, no animals and no characters anywhere in this image — only the place itself. " +
    "No text, no letters, no labels, no logos and no frames anywhere in the image."
  );
}
