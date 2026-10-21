// STEM & LIPSYNC — client-veilig. De bibliotheek zelf (ruim 1.000 stemmen) staat in
// bibliotheek.json en komt via /api/stem/bibliotheek; die is te groot voor elke pagina.

import { CREDIT_COSTS } from "@/lib/credit-costs";

export interface BibliotheekStem {
  id: string;
  naam: string;
  typering: string;
  geslacht: "man" | "vrouw" | "neutraal";
  leeftijd: "jong" | "volwassen" | "ouder";
  accent: string;
  taal: "nl" | "en" | "de" | string;
  gebruik: string;
  beschrijving: string;
  voorbeeld: string;
  populariteit: number;
}

export const STEM_CATEGORIEEN = [
  { id: "nl", naam: "🇳🇱 Nederlands" },
  { id: "vlaams", naam: "🇧🇪 Vlaams" },
  { id: "internationaal", naam: "🌍 Internationaal" },
] as const;

export const GEBRUIK_LABEL: Record<string, string> = {
  "narrative story": "Verteller",
  conversational: "Gewoon praten",
  "social media": "Social media",
  "informative educational": "Uitleg",
  "characters animation": "Personage",
  "entertainment tv": "Radio & tv",
  advertisement: "Reclame",
};

/** Een eigen (gekloonde) stem heet in de app "eigen:<creatie-id>". */
export const EIGEN = "eigen:";

/** ElevenLabs en MiniMax rekenen per 1.000 tekens (~$0,10); wij per begonnen 1.000. */
export function voiceOverCredits(tekst: string): number {
  return CREDIT_COSTS.VOICE * Math.max(1, Math.ceil(tekst.trim().length / 1000));
}

/** Je eigen stem trainen: MiniMax voice-clone kost $1,50 (Sam, 21-10-2026: 20 credits). */
export const KLOON_CREDITS = 20;

/** Zo lang moet een opname minimaal zijn; 30-60 s geeft een veel betere kloon. */
export const MIN_OPNAME_SEC = 10;
