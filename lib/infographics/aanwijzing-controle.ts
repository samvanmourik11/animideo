// IS DE AANPASSING ÉCHT GEBEURD?
//
// De app zei "aangepast" en toonde een beeld waarin niets van de aanwijzing terug te
// zien was. Dat is het grootste ergernispunt van de tool: een AI-foutje mag, maar je
// moet het kunnen herstellen (Sam, 19-09-2026).
//
// Vragen of "de aanpassing gelukt is" heeft geen zin: daar antwoordt gpt-4o altijd ja
// op, ook bij een onveranderd beeld. Vragen naar wat er te ZIEN is ("staat het doel in
// het linkerderde deel van het beeld?") werkt wél — dat is dezelfde ontdekking als bij
// de beeldcontrole (zie dialogue-verify).

import { openai } from "@/lib/openai";
import { beeldAlsDataUrl } from "./beeld-inline";
import type { DialogueCastMember } from "./dialogue-schema";

export interface ControleUitslag {
  /** null = niet kunnen kijken (beeld niet opgehaald of het model gaf onzin terug). */
  ja: boolean | null;
  waarom: string;
}

const SYSTEEM =
  "You look at one picture from an animated storyboard and answer one factual question about what is visible. " +
  "Judge ONLY what you can actually see in this picture. Do not guess what the maker intended, do not compare " +
  "with anything you have seen before, and do not be polite: if the thing asked about is not clearly visible, " +
  'the answer is "no". Answer with JSON: {"ja": true|false, "waarom": "<one short English sentence describing what you actually see>"}. ' +
  "The sentence is read by the illustrator who has to fix it, so describe the picture, not your reasoning.";

/**
 * De controlevraag op één beeld stellen. Kost geen credits: het is een kijkvraag,
 * net als de beeldcontrole.
 */
export async function controleerAanwijzing(beeldUrl: string, vraag: string): Promise<ControleUitslag> {
  const beeld = await beeldAlsDataUrl(beeldUrl, { maxZijde: 1024 });
  if (!beeld) return { ja: null, waarom: "Het beeld kon niet worden opgehaald." };
  try {
    const antwoord = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 200,
      messages: [
        { role: "system", content: SYSTEEM },
        {
          role: "user",
          content: [
            { type: "text", text: `QUESTION: ${vraag}` },
            { type: "image_url", image_url: { url: beeld, detail: "high" } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "controle",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["ja", "waarom"],
            properties: { ja: { type: "boolean" }, waarom: { type: "string" } },
          },
        },
      },
    });
    const uit = JSON.parse(antwoord.choices[0]?.message?.content ?? "{}") as { ja?: unknown; waarom?: unknown };
    if (typeof uit.ja !== "boolean") return { ja: null, waarom: "" };
    return { ja: uit.ja, waarom: typeof uit.waarom === "string" ? uit.waarom.trim() : "" };
  } catch (e) {
    console.error("[aanwijzing-controle] kijken mislukt:", e);
    return { ja: null, waarom: "" };
  }
}

/**
 * Wat er bij een correctie van de personages is afgevallen.
 *
 * Een shot opnieuw tekenen om één ding te verplaatsen kostte Coco zijn pet (gemeten
 * 19-09-2026): de aanwijzing lukte, maar het personage klopte niet meer. En juist
 * consistentie is waar deze tool op wordt afgerekend. Wat hier uit komt, wordt er met
 * een kleine bewerking weer bij getekend — dat soort detailcorrecties lukt wél.
 *
 * Alleen dingen uit de beschrijving van het personage; niets wat het kijkmodel zelf
 * mooi zou vinden.
 */
export async function ontbrekendeKleding(
  shotUrl: string,
  cast: Pick<DialogueCastMember, "name" | "appearance" | "kleding">[],
): Promise<string[]> {
  const beschrijving = cast
    .map((c) => `- ${c.name}: ${[c.appearance, c.kleding].filter(Boolean).join(" Outfit: ")}`.trim())
    .filter((r) => r.length > 4)
    .join("\n");
  if (!beschrijving) return [];
  const beeld = await beeldAlsDataUrl(shotUrl, { maxZijde: 1024 });
  if (!beeld) return [];
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You check one picture from an animated storyboard against how the characters should look. " +
            'Answer JSON: {"ontbreekt": ["..."]} — every item from the descriptions that you do NOT see on that ' +
            "character in this picture: a cap, a whistle, a shirt number, a print, a badge, a garment, a colour. " +
            "Name the character with the item, in English: \"Coco's red cap\". Only items that are described and " +
            "genuinely absent — not items that are merely hidden behind the character's body or outside the frame, " +
            "and nothing about pose, expression or background. Empty list if everything is there.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `The characters should look like this:\n${beschrijving}` },
            { type: "image_url", image_url: { url: beeld, detail: "high" } },
          ],
        },
      ],
    });
    const uit = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { ontbreekt?: unknown };
    return Array.isArray(uit.ontbreekt) ? uit.ontbreekt.map(String).filter(Boolean).slice(0, 4) : [];
  } catch (e) {
    console.warn("[aanwijzing-controle] kledingcontrole mislukt:", e instanceof Error ? e.message : e);
    return [];
  }
}
