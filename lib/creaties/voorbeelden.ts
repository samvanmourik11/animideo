// De voorbeelden op de tegels van de effecten en apps: per recept de voorbeeldfoto (voor)
// en wat het recept ervan maakte (na). Gemaakt met scripts/maak-voorbeelden.ts.
import data from "./voorbeelden.json";

export interface Voorbeeld {
  invoer: string;
  resultaat: string;
  soort: "beeld" | "video";
}

const VOORBEELDEN = data as Record<string, Voorbeeld>;

export function voorbeeld(receptId: string): Voorbeeld | null {
  return VOORBEELDEN[receptId] ?? null;
}
