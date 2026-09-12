import { borgBeeldtekst } from "./tekst-controle";

/**
 * Verzonnen tekst uit een dialoogbeeld vegen.
 *
 * In de dialoogmodus hoort er NOOIT tekst in beeld te staan: de personages
 * praten, er is geen tekstlaag. Het beeldmodel tekent hem toch — een kalender
 * met dubbele dagen en een onleesbare krabbel eronder, een blaadje op tafel vol
 * gekras, en labels onder portretkaartjes die nergens op slaan.
 *
 * De storytelling-tool haalde dat er al uit met borgBeeldtekst(); de
 * dialoogroutes riepen die controle nergens aan. Met een lege lijst "bedoelde"
 * woorden betekent de controle: alles eruit.
 *
 * Staat bewust NIET in dialogue-staging.ts. Dat bestand bouwt alleen prompts op
 * en is daardoor te testen zonder API-sleutel; deze functie doet een echte
 * AI-aanroep en zou die eigenschap slopen.
 *
 * Zacht: mislukt de controle, dan houden we het beeld zoals het was. Een beeld
 * met een lelijke kalender is beter dan een scène zonder beeld.
 */
export async function zonderTekst(
  imageUrl: string,
  format?: string,
  language?: string | null,
): Promise<string> {
  try {
    const uit = await borgBeeldtekst(imageUrl, [], format, language ?? "Nederlands");
    return uit.imageUrl;
  } catch (e) {
    console.error("[dialogue] tekstcontrole mislukt, beeld behouden:", e);
    return imageUrl;
  }
}
