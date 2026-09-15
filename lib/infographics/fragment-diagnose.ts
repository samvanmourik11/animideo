// Wat er mis is met één fragment, en wat er dus opnieuw moet.
//
// Het videoscherm heeft één knop: opnieuw. Wie erop drukt, vindt iets niet goed,
// maar hoeft niet te weten of dat aan het beeld of aan de beweging ligt. De
// achterkant kijkt eerst zelf (zie dialogue-diagnose) en kiest dan: zit de fout al
// in het bronbeeld, dan een nieuw beeld met een gerichte aanwijzing; anders alleen
// een nieuwe beweging, en het beeld dat al goed was blijft staan.

export interface FragmentDiagnose {
  /** Wat er fout is, in een paar woorden per fout. Leeg = niets duidelijk fout. */
  fouten: string[];
  /** "beeld" = nieuw bronbeeld én nieuwe beweging; "beweging" = alleen de clip. */
  opnieuw: "beeld" | "beweging";
  /** Engelse aanwijzing voor het nieuwe bronbeeld. Alleen bij "beeld". */
  beeldAanwijzing: string;
  /** Engelse aanwijzing voor de nieuwe beweging. */
  bewegingAanwijzing: string;
}

const tekst = (v: unknown, max = 500) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * Het antwoord van het visie-model, nagekeken.
 *
 * Zonder bronbeeld valt er niets te hergebruiken, dus dan is het altijd "beeld",
 * wat het model ook zegt.
 */
export function leesDiagnose(ruw: unknown, heeftBeeld: boolean): FragmentDiagnose {
  const r = (ruw && typeof ruw === "object" ? ruw : {}) as Record<string, unknown>;
  const fouten = Array.isArray(r.fouten) ? r.fouten.map((f) => tekst(f, 200)).filter(Boolean).slice(0, 6) : [];
  const opnieuw: FragmentDiagnose["opnieuw"] = !heeftBeeld || r.opnieuw === "beeld" ? "beeld" : "beweging";
  return {
    fouten,
    opnieuw,
    beeldAanwijzing: opnieuw === "beeld" ? tekst(r.beeldAanwijzing) : "",
    bewegingAanwijzing: tekst(r.bewegingAanwijzing),
  };
}
