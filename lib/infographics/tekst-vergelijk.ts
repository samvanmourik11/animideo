// VERGELIJKEN VAN BEDOELDE EN GELEZEN BEELDTEKST.
//
// De spellingcontrole (tekst-controle.ts) was gebouwd voor korte labels: één of
// twee woorden bij een balk of een icoon. Daar hoort een harde eis bij — staat
// er "Onderwjis", dan moet dat weg.
//
// Sinds de gebruiker ook een hele zin mag vragen ("op het scherm staat: De
// afspraak is vrijdag om 14.00 uur in vergaderruimte B") werkte die harde eis
// averechts. Het vision-model leest zo'n zin bijna nooit als één blok en bijna
// nooit teken voor teken gelijk: hij knipt hem in tweeën, leest "14.00" als
// "14:00", of mist een punt. De controle zag dat als "staat er niet in", de
// correctie haalde het er niet uit, en de laatste stap wiste álle tekst uit het
// beeld. De klant vroeg dus om een zin en kreeg gegarandeerd een leeg scherm
// (gemeten bij twee klantmeldingen, 24 en 25-09-2026).
//
// Daarom twee maatstaven naast elkaar: kort label = letterlijk goed, zin = in
// de kern goed. Een zin met een kommafout is voor de kijker prima; een leeg
// scherm is dat niet.

/** Kleine verschillen die er niet toe doen wegpoetsen. */
export function normaliseer(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9€%]+/g, " ")
    .trim();
}

/** De losse woorden van een genormaliseerde tekst. */
export function woorden(t: string): string[] {
  return normaliseer(t).split(" ").filter(Boolean);
}

/**
 * Is dit label een zin die de gebruiker zelf heeft gevraagd, of een kort label
 * dat de app er zelf bij verzint? Drie woorden is de grens: "Meer omzet" is een
 * label, "De afspraak is vrijdag" is een zin.
 */
export function isZin(label: string): boolean {
  return woorden(label).length >= 3;
}

/**
 * Welk deel van de woorden van `bedoeld` komt voor in `gelezen` (0..1)?
 * `gelezen` is alle tekst die in het beeld gevonden is, aan elkaar geplakt —
 * een zin mag dus over meerdere tekstblokken verdeeld staan.
 */
export function woordDekking(bedoeld: string, gelezen: string): number {
  const wil = woorden(bedoeld);
  if (wil.length === 0) return 1;
  const heb = new Set(woorden(gelezen));
  return wil.filter((w) => heb.has(w)).length / wil.length;
}

/** Vanaf welke dekking een gevraagde zin als "staat erin" telt. */
export const ZIN_DREMPEL = 0.8;

/**
 * Staat het bedoelde label goed genoeg in beeld? Korte labels moeten letterlijk
 * kloppen; bij een zin telt of de woorden er staan.
 */
export function staatErin(bedoeld: string, gevonden: string[]): boolean {
  const norm = normaliseer(bedoeld);
  if (!norm) return true;
  if (gevonden.some((g) => normaliseer(g).includes(norm))) return true;
  if (!isZin(bedoeld)) return false;
  return woordDekking(bedoeld, gevonden.join(" ")) >= ZIN_DREMPEL;
}

/**
 * Hoort dit gelezen tekstblok bij een van de bedoelde labels, of is het
 * brabbeltekst die het beeldmodel er zelf bij verzonnen heeft?
 *
 * Bij een zin kijken we andersom dan bij een label: een blok is een stuk van de
 * zin, dus we vragen of de woorden van het blok in de zin zitten.
 */
export function hoortErbij(blok: string, bedoeld: string[]): boolean {
  const gn = normaliseer(blok);
  if (!gn) return true;
  return bedoeld.some((b) => {
    const bn = normaliseer(b);
    if (!bn) return false;
    if (bn.includes(gn) || gn.includes(bn)) return true;
    return isZin(b) && woordDekking(blok, bn) >= ZIN_DREMPEL;
  });
}

/**
 * Haalt de zin uit een beeldopdracht die letterlijk in beeld moet komen.
 *
 * De planner hoort zo'n zin zelf in "labels" te zetten, maar doet dat niet
 * betrouwbaar: bij dezelfde vraag laat hij hem de ene keer wél en de andere
 * keer níét in de lijst staan. Staat hij er niet in, dan ziet de opruimstap de
 * tekst als brabbeltekst en gumt hij de hele tekstballon weg — dezelfde klacht,
 * maar nu bij toeval (gemeten 25-09-2026). Daarom lezen we de zin ook zelf uit
 * de opdracht: die staat er altijd tussen aanhalingstekens in.
 */
export function gevraagdeZin(opdracht: string): string | null {
  const treffers = [...(opdracht ?? "").matchAll(/["'“”‘’]([^"'“”‘’]{3,200})["'“”‘’]/g)]
    .map((m) => m[1].trim())
    .filter((t) => isZin(t));
  if (treffers.length === 0) return null;
  return treffers.sort((a, b) => b.length - a.length)[0];
}

/**
 * Staat het label er LETTERLIJK, teken voor teken? Strenger dan staatErin, dat
 * bij een zin een leesafwijking toelaat. Gebruikt om te bepalen of een
 * spellingcorrectie nog zin heeft: "De afspreak is vrijdag" telt als aanwezig,
 * maar mag wel nog een verbeterronde krijgen.
 */
export function exactErin(bedoeld: string, gevonden: string[]): boolean {
  const norm = normaliseer(bedoeld);
  if (!norm) return true;
  return gevonden.some((g) => normaliseer(g).includes(norm));
}
