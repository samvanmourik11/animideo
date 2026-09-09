import { openai } from "@/lib/openai";
import { editIllustration } from "@/lib/image-gen";

// SPELLINGCONTROLE OP WAT ER ÉCHT IN BEELD STAAT.
//
// Korte labels maken een uitleganimatie duidelijker ("Zorg", "Onderwijs", een
// jaartal bij een balk), maar een beeldmodel spelt ze net zo makkelijk fout:
// "Onderwjis", een verdubbelde letter, of half Engels. Zo'n woord staat groot en
// pontificaal in beeld en maakt de video juist onduidelijker dan helemaal geen
// tekst — en het is precies het soort fout dat een kijker meteen ziet.
//
// Daarom kijkt een vision-model na het genereren wat er daadwerkelijk staat en
// vergelijkt dat met de bedoelde woorden. Klopt het niet, dan volgt één gerichte
// correctie. Klopt het dán nog niet, dan halen we de tekst weg: geen tekst is
// altijd beter dan foute tekst.

export interface TekstOordeel {
  ok: boolean;
  /** Wat er letterlijk in beeld staat, zoals het vision-model het leest. */
  gevonden: string[];
  /** Staat er een logo, badge of watermerk in beeld dat er niet hoort? */
  merkteken: boolean;
  /** Korte beschrijving van wat er mis is (leeg als ok). */
  probleem: string;
}

/**
 * Leest letterlijk over wat er in het beeld staat.
 *
 * Cruciaal: het model krijgt de BEDOELDE woorden NIET te zien. In de eerste versie
 * stonden die er wel bij, met de vraag "klopt dit?" — en dan leest een vision-model
 * wat het verwacht te zien in plaats van wat er staat. "Vertrouwnen" werd zo netjes
 * gelezen als "Vertrouwen" en de fout kwam ongezien in de video terecht.
 *
 * Overtypen is een makkelijkere taak dan beoordelen, en het oordeel zelf doen we
 * daarna in code: een tekenvergelijking liegt niet.
 */
async function leesBeeldtekst(imageUrl: string): Promise<{ tekst: string[]; merkteken: boolean }> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 300,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url" as const, image_url: { url: imageUrl, detail: "high" as const } },
            {
              type: "text" as const,
              text:
                `Typ ALLE tekst over die in deze afbeelding staat, precies zoals hij er staat: letter voor letter, ` +
                `inclusief kleine tekst op objecten, borden, documenten, schermen en verpakkingen.\n\n` +
                `BELANGRIJK: de tekst in dit beeld is door een AI getekend en bevat mogelijk SPELFOUTEN, ` +
                `verdubbelde of ontbrekende letters, of onzinwoorden. Verbeter niets en vul niets aan. Typ exact de ` +
                `lettervolgorde over die je ziet, ook als het woord daardoor fout of onzinnig is. Zie je "Vertrouwnen", ` +
                `dan schrijf je "Vertrouwnen".\n\n` +
                `Kijk daarnaast of er een LOGO, beeldmerk, badge, embleem, watermerk of handtekening in het beeld ` +
                `staat — vaak klein in een hoek. Het échte logo van de klant wordt er later als aparte laag overheen ` +
                `gelegd, dus alles wat het beeldmodel zelf aan merktekens tekent is fout.\n\n` +
                `Antwoord met JSON: {"tekst": ["elk los tekstblok, letterlijk overgetypt"], "merkteken": boolean}. ` +
                `Staat er geen enkele tekst in het beeld, dan een lege lijst.`,
            },
          ],
        },
      ],
    });
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { tekst?: unknown; merkteken?: unknown };
    return {
      tekst: Array.isArray(parsed.tekst) ? parsed.tekst.map((t) => String(t).trim()).filter(Boolean) : [],
      merkteken: parsed.merkteken === true,
    };
  } catch (e) {
    console.error("[tekst-controle] overtypen mislukt:", e);
    return { tekst: [], merkteken: false };
  }
}

/** Voor de vergelijking: kleine verschillen die er niet toe doen wegpoetsen. */
function normaliseer(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9€%]+/g, " ")
    .trim();
}

export async function controleerBeeldtekst(
  imageUrl: string,
  labels: string[],
  /**
   * Hoort er een merkteken in beeld? Waar. als de gebruiker zelf een logo of
   * product heeft meegestuurd ("zet dit logo op de auto"). Zonder deze uitzondering
   * zou de controle precies weghalen waar hij om gevraagd heeft.
   */
  merkToegestaan = false
): Promise<TekstOordeel> {
  const bedoeld = labels.map((l) => l.trim()).filter(Boolean);
  const { tekst: gevonden, merkteken } = await leesBeeldtekst(imageUrl);

  const bedoeldNorm = bedoeld.map(normaliseer);
  const problemen: string[] = [];
  // Een verzonnen logo is altijd fout, met of zonder tekst in beeld.
  if (merkteken && !merkToegestaan) problemen.push("er staat een verzonnen logo of watermerk in beeld");

  // Niets gelezen en geen merkteken: dan is er niets aan de hand. Hoorde er wél
  // tekst te staan, dan helpt een correctie niet — het model kan geen woorden
  // toevoegen die de illustratie niet heeft — dus laten we het beeld staan.
  if (gevonden.length === 0) {
    return { ok: problemen.length === 0, gevonden: [], merkteken, probleem: problemen.join("; ") };
  }

  // 1. Staat elk bedoeld woord er exact zo?
  for (let i = 0; i < bedoeld.length; i++) {
    const treffer = gevonden.some((g) => normaliseer(g).includes(bedoeldNorm[i]));
    if (!treffer) problemen.push(`"${bedoeld[i]}" staat er niet (goed) in`);
  }

  // 2. Staat er tekst die er niet hoort? Elk gelezen blok moet in een bedoeld
  //    label passen; wat overblijft is brabbeltekst of een verzonnen kop.
  for (const g of gevonden) {
    const gn = normaliseer(g);
    if (!gn) continue;
    const hoortErbij = bedoeldNorm.some((b) => b.includes(gn) || gn.includes(b));
    if (!hoortErbij) problemen.push(`"${g}" hoort er niet te staan`);
  }

  return {
    ok: problemen.length === 0,
    gevonden,
    merkteken,
    probleem: problemen.slice(0, 4).join("; "),
  };
}

/**
 * Controleert de tekst in een beeld en herstelt hem zo nodig. Geeft de URL van
 * het (eventueel gecorrigeerde) beeld terug — nooit een fout.
 *
 * Drie stappen, met opzet in deze volgorde: controleren, één keer gericht
 * corrigeren, en anders de tekst helemaal weghalen.
 */
export async function borgBeeldtekst(
  imageUrl: string,
  labels: string[],
  format?: string,
  language = "Nederlands",
  /** Waar als de gebruiker zelf een logo/product meestuurde; dat merk mag blijven. */
  merkToegestaan = false
): Promise<{ imageUrl: string; hersteld: boolean; tekstVerwijderd: boolean }> {
  const bedoeld = labels.map((l) => l.trim()).filter(Boolean);
  const oordeel = await controleerBeeldtekst(imageUrl, bedoeld, merkToegestaan);
  if (oordeel.ok) return { imageUrl, hersteld: false, tekstVerwijderd: false };

  const woorden = bedoeld.map((w) => `"${w}"`).join(", ");
  // Alleen merktekens weghalen als ze er niet horen. Heeft de gebruiker een logo
  // meegestuurd, dan laten we dat met rust.
  const merkRegel = merkToegestaan
    ? ""
    : ", and remove every logo, brand mark, badge, emblem, watermark or signature, in every corner and on every object";
  try {
    const correctie = bedoeld.length
      ? `Fix the text in this image. The only words that may appear are ${woorden}, each spelled exactly like that, ` +
        `character for character, in ${language === "Nederlands" ? "Dutch" : language}. Correct every misspelled or garbled word to the exact spelling given, ` +
        `remove every other word, letter, number and caption${merkRegel}. Fill the freed area with the surrounding ` +
        `flat colour. Keep the composition, all shapes, objects, figures, colours and the illustration style exactly the same.`
      : `Remove every letter, word, number, label and caption from this image${merkRegel}. Fill the freed area with the ` +
        `surrounding flat colour. Keep the composition, all shapes, objects, figures, colours and the illustration style exactly the same.`;
    const hersteld = await editIllustration(imageUrl, correctie, format);

    // Eén hercontrole. Nog steeds fout? Dan liever helemaal geen tekst.
    const naOordeel = await controleerBeeldtekst(hersteld.imageUrl, bedoeld, merkToegestaan);
    if (naOordeel.ok) return { imageUrl: hersteld.imageUrl, hersteld: true, tekstVerwijderd: false };

    const kaal = await editIllustration(
      hersteld.imageUrl,
      `Remove every letter, word, number, label and caption from this image${merkRegel}, and ` +
        `fill the freed area with the surrounding flat colour. Keep the composition, all shapes, objects, figures, ` +
        `colours and the illustration style exactly the same.`,
      format
    );
    return { imageUrl: kaal.imageUrl, hersteld: true, tekstVerwijderd: true };
  } catch (e) {
    // Correctie mislukt: het originele beeld teruggeven is beter dan geen beeld.
    console.error("[tekst-controle] herstellen mislukt, oorspronkelijk beeld behouden:", e);
    return { imageUrl, hersteld: false, tekstVerwijderd: false };
  }
}
