// STEM & LIPSYNC — client-veilig. De bibliotheek zelf (de 100 beste stemmen voor
// Nederlands, zie scripts/sync-stemmen.ts) staat in bibliotheek.json en komt via
// /api/stem/bibliotheek, zodat niet elke pagina hem meesleept.

import { CREDIT_COSTS, INKOOP_USD, creditsVoorInkoop } from "@/lib/credit-costs";

export interface BibliotheekStem {
  id: string;
  naam: string;
  typering: string;
  geslacht: "man" | "vrouw" | "neutraal";
  leeftijd: "jong" | "volwassen" | "ouder";
  /** Nederlands, Vlaams of Brabants: hoe de stem klinkt als hij Nederlands spreekt. */
  accent: string;
  /** Nederlandstalige stem; anders een internationale stem die ook goed Nederlands spreekt. */
  moedertaal: boolean;
  taal: "nl" | "en" | "de" | string;
  /** Talen die ElevenLabs voor deze stem heeft gecontroleerd, Nederlands altijd eerst. */
  talen: string[];
  gebruik: string;
  beschrijving: string;
  voorbeeld: string;
  populariteit: number;
}

/** Vlag + naam per taalcode, voor de vlaggetjes bij een stem en de taalkeuze. */
export const TAAL: Record<string, { vlag: string; naam: string }> = {
  nl: { vlag: "🇳🇱", naam: "Nederlands" },
  en: { vlag: "🇬🇧", naam: "Engels" },
  de: { vlag: "🇩🇪", naam: "Duits" },
  fr: { vlag: "🇫🇷", naam: "Frans" },
  es: { vlag: "🇪🇸", naam: "Spaans" },
  it: { vlag: "🇮🇹", naam: "Italiaans" },
  pt: { vlag: "🇵🇹", naam: "Portugees" },
  pl: { vlag: "🇵🇱", naam: "Pools" },
  tr: { vlag: "🇹🇷", naam: "Turks" },
  ar: { vlag: "🇸🇦", naam: "Arabisch" },
  da: { vlag: "🇩🇰", naam: "Deens" },
  sv: { vlag: "🇸🇪", naam: "Zweeds" },
  no: { vlag: "🇳🇴", naam: "Noors" },
  fi: { vlag: "🇫🇮", naam: "Fins" },
  cs: { vlag: "🇨🇿", naam: "Tsjechisch" },
  sk: { vlag: "🇸🇰", naam: "Slowaaks" },
  hu: { vlag: "🇭🇺", naam: "Hongaars" },
  ro: { vlag: "🇷🇴", naam: "Roemeens" },
  bg: { vlag: "🇧🇬", naam: "Bulgaars" },
  hr: { vlag: "🇭🇷", naam: "Kroatisch" },
  el: { vlag: "🇬🇷", naam: "Grieks" },
  uk: { vlag: "🇺🇦", naam: "Oekraïens" },
  ru: { vlag: "🇷🇺", naam: "Russisch" },
  hi: { vlag: "🇮🇳", naam: "Hindi" },
  ta: { vlag: "🇮🇳", naam: "Tamil" },
  id: { vlag: "🇮🇩", naam: "Indonesisch" },
  ms: { vlag: "🇲🇾", naam: "Maleis" },
  fil: { vlag: "🇵🇭", naam: "Filipijns" },
  vi: { vlag: "🇻🇳", naam: "Vietnamees" },
  zh: { vlag: "🇨🇳", naam: "Chinees" },
  ja: { vlag: "🇯🇵", naam: "Japans" },
  ko: { vlag: "🇰🇷", naam: "Koreaans" },
};

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

/** Je eigen stem trainen: MiniMax voice-clone kost $1,50 (prijsregel van credit-costs.ts). */
export const KLOON_CREDITS = creditsVoorInkoop(INKOOP_USD.stemKlonen);

/** Zo lang moet een opname minimaal zijn; 30-60 s geeft een veel betere kloon. */
export const MIN_OPNAME_SEC = 10;
