// Moedertaalstemmen per taal voor motion graphics en docu (Sam 14-11-2026: "alleen voice-overs
// die bij die taal passen"). De bibliotheek (bibliotheek.json) is Nederlands: die stemmen
// spreken andere talen met een Nederlands accent. Deze komen uit de gedeelde ElevenLabs-
// bibliotheek; elke stem is via fal getest. De eerste per taal is een vaste documentaireverteller,
// als die er is. Nederlands: gewoon de bibliotheek, met Hugo vooraan.
import data from "./taalstemmen.json";

export interface TaalStem {
  id: string;
  naam: string;
  typering: string;
  geslacht: string;
  leeftijd: string;
  accent: string;
  /** Een voorbeeld in de taal zelf (ElevenLabs). */
  voorbeeld: string;
}

const LIJST = data as Record<string, TaalStem[]>;

/** De moedertaalstemmen voor een taal; leeg voor Nederlands (dan geldt de bibliotheek). */
export const taalStemmen = (taal: string): TaalStem[] => (taal === "nl" ? [] : LIJST[taal] ?? []);
export const isTaalStem = (taal: string, id: unknown): boolean => taalStemmen(taal).some((s) => s.id === id);
