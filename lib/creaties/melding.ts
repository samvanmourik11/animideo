// Een lange melding (een ffmpeg-opdracht van duizenden tekens) houdt het begin en het eind:
// de echte reden staat bij ffmpeg altijd achteraan.
export function kortMetEinde(reden: string, max = 500): string {
  return reden.length <= max ? reden : `${reden.slice(0, 150)} … ${reden.slice(-(max - 153))}`;
}

/**
 * Wat de klant ziet als iets mislukt. De opgeslagen melding komt vaak rechtstreeks van een
 * model of van ffmpeg (Engels, technisch); die vertalen we naar één gewone zin. Onze eigen
 * Nederlandse meldingen ("Het duurde te lang.") blijven zoals ze zijn.
 */
export function klantReden(foutmelding: string | null | undefined): string {
  const m = (foutmelding ?? "").trim();
  if (!m) return "Er ging iets mis bij het maken.";
  if (/^montage mislukt/i.test(m)) return "De clips zijn gemaakt, maar het samenvoegen tot één video lukte niet.";
  if (/could not generate|given prompts and images/i.test(m)) return "Het model kon met deze foto of opdracht niets maken. Probeer een andere foto of omschrijf het anders.";
  if (/download mislukt|HTTP 4\d\d|not found/i.test(m)) return "Een bestand kon niet worden opgehaald. Probeer het opnieuw.";
  if (/command failed|ffmpeg|\b(the|could|please|failed|error|invalid|unable|request)\b/i.test(m)) return "Er ging iets mis bij het maken.";
  return m;
}
