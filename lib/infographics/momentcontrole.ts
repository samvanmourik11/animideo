import { VERTELLER_ID } from "./dialogue-schema";

// Controles op één geschreven moment, vóór het in het draaiboek komt. Alles hier is
// gratis en zeker: klopt een moment aantoonbaar niet, dan schrijft de scenarist het
// één keer opnieuw met de fout erbij. Dat is goedkoper dan een clip die je moet
// weggooien.

type RegelLike = { kind?: string; characterId?: string; text?: string };

// Alleen woorden die in het Nederlands niet (of nauwelijks) voorkomen. "of", "was"
// en "is" staan er bewust niet in: die zijn in beide talen gewoon.
const ENGELS = new Set([
  "the", "and", "as", "they", "their", "them", "with", "to", "are", "reveals", "looks", "look", "at",
  "into", "while", "she", "he", "her", "his", "it", "its", "this", "that", "what", "where", "you",
  "our", "off", "from", "an", "a", "be", "were", "can", "how", "so", "for", "realize", "exchange",
]);
const NEDERLANDS = new Set([
  "de", "het", "een", "en", "van", "ze", "zij", "hij", "met", "naar", "zijn", "wat", "niet", "je",
  "jullie", "wij", "dit", "dat", "op", "ik", "er", "hier", "zo", "ook", "nog", "maar", "kijk", "waar",
  "hoe", "voor", "aan", "om", "te",
]);

/**
 * Staat deze gesproken zin in het Engels?
 *
 * De actiebeschrijving is Engels (die gaat naar het beeldmodel), de gesproken tekst
 * niet. Soms kopieerde de scenarist de ene in de andere, en dan zei oma in een
 * Nederlandse video "Grandma reveals the Wonderwagen, pulling off the cloth."
 */
export function lijktEngels(tekst: string): boolean {
  const woorden = tekst.toLowerCase().match(/[a-zà-ÿ']+/g) ?? [];
  if (woorden.length < 4) return false;
  const en = woorden.filter((w) => ENGELS.has(w)).length;
  const nl = woorden.filter((w) => NEDERLANDS.has(w)).length;
  return en >= 2 && en > nl * 2;
}

function isEngels(taal: string): boolean {
  return /^(engels|english)$/i.test(taal.trim());
}

/**
 * Wat er aantoonbaar mis is met een geschreven moment, als zinnen die je de
 * scenarist kunt teruggeven. Leeg = niets gevonden.
 */
export function momentProblemen(lines: RegelLike[], taal: string): string[] {
  const problemen: string[] = [];

  const engels = isEngels(taal) ? [] : lines.filter((l) => lijktEngels(l.text ?? ""));
  if (engels.length) {
    problemen.push(
      `Deze gesproken zinnen staan in het Engels, maar alles wat hardop gezegd wordt moet in het ${taal}: ` +
      `${engels.map((l) => `"${(l.text ?? "").trim()}"`).join(", ")}. Alleen "actie" en "setting" zijn Engels.`
    );
  }

  // Bij de basiliek sprak alleen de verteller, met drie stille beelden erachter:
  // een diavoorstelling. De regel stond al in de opdracht, maar werd genegeerd.
  const personagePraat = lines.some((l) => {
    const wie = (l.characterId ?? "").trim().toLowerCase();
    return wie && wie !== VERTELLER_ID && (l.text ?? "").trim();
  });
  if (!personagePraat) {
    problemen.push(
      "Geen enkel personage zegt iets: alleen de verteller praat, of er zijn alleen stille beelden. Laat de " +
      "personages die in beeld zijn minstens twee korte zinnen zeggen over wat ze zien of beleven."
    );
  }

  return problemen;
}

/**
 * Het vangnet als ook de tweede poging Engelse zinnen bevat: liever een stil beeld
 * met muziek dan een Engelse zin in een Nederlandse video. Een actiebeeld houdt zijn
 * beeld maar verliest de zin; een gewone regel of een Engelse vertellerzin vervalt.
 */
export function zonderVerkeerdeTaal<T extends RegelLike>(lines: T[], taal: string): T[] {
  if (isEngels(taal)) return lines;
  return lines.flatMap((l) => {
    if (!lijktEngels(l.text ?? "")) return [l];
    const verteller = (l.characterId ?? "").trim().toLowerCase() === VERTELLER_ID;
    if (l.kind === "actie" && !verteller) return [{ ...l, text: "" }];
    return [];
  });
}
