// De 100 stemmen uit bibliotheek.json, voor de server (Regisseur, montage, UGC). Het zijn
// allemaal ElevenLabs-voice-ids, dus ze werken overal waar we eleven-v3 via fal gebruiken.

import bibliotheek from "./bibliotheek.json";
import type { BibliotheekStem } from "./types";

export const BIBLIOTHEEK = bibliotheek as BibliotheekStem[];

export function isBibliotheekStem(id: unknown): id is string {
  return BIBLIOTHEEK.some((s) => s.id === id);
}

/**
 * Een stem op id of naam ("Roos", "stem Roos"). Namen komen dubbel voor (twee keer Ruth);
 * dan wint de populairste, want de lijst staat al op volgorde.
 */
export function vindStem(idOfNaam: unknown): BibliotheekStem | undefined {
  const z = String(idOfNaam ?? "").replace(/^stem\s+/i, "").trim();
  if (!z) return undefined;
  return BIBLIOTHEEK.find((s) => s.id === z) ?? BIBLIOTHEEK.find((s) => s.naam.toLowerCase() === z.toLowerCase());
}
