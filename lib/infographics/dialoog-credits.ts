// CREDITS IN DE DIALOOGTOOL — een kwart van wat het was.
//
// Een video van 81 seconden (7 scènes, 21 zinnen) kostte 96 credits: 33 beelden, 21
// stemmen en 21 clips van 2 credits, en daar kwamen de herkansingen nog bij. Sam wil
// dat klanten voelen dat het creditverbruik meevalt (15-09-2026). Nu kost diezelfde
// video 28 credits:
//  - het storyboard 1 credit per scène: het plekbeeld plus alle beelden van de zinnen;
//  - 1 credit per clip;
//  - stemmen, castblad, model sheets, voorwerpplaatjes en nieuwe personages gratis —
//    dat is voorbereiding voor het storyboard;
//  - een los beeld opnieuw maken of aanpassen 1 credit, zodat eindeloos opnieuw maken
//    niet gratis is;
//  - wat de app zelf opnieuw maakt na een afgekeurd beeld of clip is gratis: daar
//    vroeg de klant niet om.
//
// Bewust los van CREDIT_COSTS: de andere tools houden hun tarieven. Pure functies, dus
// ook in de browser te gebruiken voor de bedragen op de knoppen.

import { bruikbareRegel, regelKlaar, type DialogueSpec } from "./dialogue-schema";

export const DIALOOG_CREDITS = {
  /** Het storyboard van één scène: het plekbeeld en de beelden van alle zinnen. */
  SCENE: 1,
  /** Eén clip. */
  CLIP: 1,
  /** Eén beeld los opnieuw maken of aanpassen. */
  LOS_BEELD: 1,
  STEM: 0,
  /** Castblad, model sheets, voorwerpplaatjes en nieuw getekende personages. */
  VOORBEREIDING: 0,
  /** Een poging die de app zelf opnieuw doet na een afgekeurd beeld of clip. */
  HERKANSING: 0,
} as const;

/** "gratis", "1 credit" of "5 credits". */
export function creditTekst(credits: number): string {
  if (credits <= 0) return "gratis";
  return credits === 1 ? "1 credit" : `${credits} credits`;
}

/** Credits voor het storyboard: één per scène die nog geen plekbeeld heeft. */
export function schatStoryboardCredits(spec: Pick<DialogueSpec, "scenes">): number {
  return spec.scenes.filter((s) => !s.twoShotUrl).length * DIALOOG_CREDITS.SCENE;
}

/**
 * Credits voor alles wat nog gemaakt moet worden: de clips die er nog niet zijn, plus
 * het storyboard als dat nog niet af is. Herkansingen zijn gratis en tellen dus niet mee.
 */
export function schatCredits(spec: Pick<DialogueSpec, "scenes">): number {
  const clips = spec.scenes.flatMap((s) => s.lines).filter((l) => bruikbareRegel(l) && !regelKlaar(l)).length;
  return clips * DIALOOG_CREDITS.CLIP + schatStoryboardCredits(spec);
}
