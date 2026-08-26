// De stemmen die in de storytelling-tool gekozen kunnen worden. De id moet
// exact overeenkomen met een naam uit ALLOWED_VOICES in de scene-voice route
// (fal-ai/elevenlabs). De preview is een vooraf gegenereerde mp3 in
// public/voice-previews/<id>.mp3, zodat luisteren naar een stem niets kost
// (er wordt niets gegenereerd, alleen een statisch bestand afgespeeld).
//
// Naast de vaste ElevenLabs-stemmen (op naam) kan een id ook een ElevenLabs
// voice-id zijn. Dat is de enige manier om aan een échte Vlaamse stem te komen:
// ElevenLabs kent geen aparte taalcode voor Vlaams — "nl" levert altijd een
// Nederlandse uitspraak op — dus het accent moet uit de stem zelf komen.

export interface StoryVoice {
  id: string;
  label: string;
  description: string;
  /**
   * Is dit een KINDERstem? De picker zet ze apart en de dialoog-assistent kiest
   * er een als een personage een kind is.
   */
  kind?: boolean;
  /**
   * Talen waarvoor deze stem beschikbaar is. Leeg/afwezig = alle talen (de
   * meertalige standaardstemmen). Een Vlaamse stem wil je niet aanbieden bij
   * een Franstalig verhaal.
   */
  languages?: string[];
}

export const STORY_VOICES: StoryVoice[] = [
  { id: "Charlotte", label: "Charlotte", description: "warme vrouwenstem" },
  { id: "Sarah", label: "Sarah", description: "heldere vrouwenstem" },
  { id: "Daniel", label: "Daniel", description: "rustige mannenstem" },
  { id: "George", label: "George", description: "warme mannenstem" },
  // KINDERSTEMMEN.
  //
  // ElevenLabs heeft geen Nederlandse kinderstemmen: de stemmenbibliotheek geeft
  // op "child" + nl alleen volwassenen die AAN kinderen voorlezen. Deze zes zijn
  // kinderstemmen uit andere talen; eleven-v3 is meertalig, dus ze spreken gewoon
  // Nederlands. Alle zes zijn gecontroleerd met Whisper op een Nederlandse zin —
  // een zevende kandidaat maakte van "wonderwagen" een "wommenwagen" en viel af.
  // Een licht accent kan blijven hangen; daarom staan ze er met previews bij,
  // zodat je hoort wat je kiest voordat je een video maakt.
  { id: "5krdMTA5HonvWAlY2vSx", label: "Tuur", description: "jongensstem, verwonderd", kind: true },
  { id: "ihKwLOjVUMG4lgUI6meZ", label: "Finn", description: "jongensstem, nieuwsgierig", kind: true },
  { id: "XjGYkUkzth8BPs29fmcV", label: "Boaz", description: "jongensstem, uitbundig", kind: true },
  { id: "EeQEodFZVtBkjtgK3HBc", label: "Fien", description: "meisjesstem, expressief", kind: true },
  { id: "hO2yZ8lxM3axUxL8OeKX", label: "Saar", description: "meisjesstem, hoog en vrolijk", kind: true },
  { id: "0luPAj5RsdhmnkZaiYcb", label: "Noor", description: "meisjesstem, levendig", kind: true },

  // Vlaamse stemmen (ElevenLabs voice-id's uit de stemmenbibliotheek).
  { id: "02TPKkY2rZbgnKFIPrT9", label: "Katleen", description: "warme Vlaamse vrouwenstem", languages: ["Vlaams"] },
  { id: "Yv0oyZ3obP9foTH7emqG", label: "Jeroen", description: "warme Vlaamse mannenstem", languages: ["Vlaams"] },
  { id: "AgeYjqDIfXtkcA3mOcsH", label: "Gunther", description: "rustige Vlaamse verteller", languages: ["Vlaams"] },
];

export const DEFAULT_VOICE = "Charlotte";

/** Standaardstem per taal: bij Vlaams een Vlaamse stem, anders Charlotte. */
export const DEFAULT_VOICE_PER_LANGUAGE: Record<string, string> = {
  Vlaams: "02TPKkY2rZbgnKFIPrT9",
};

/**
 * De stemmen die bij deze taal horen. Bij Vlaams tonen we alléén de Vlaamse
 * stemmen: de Nederlandse standaardstemmen klinken hoorbaar Hollands en dat is
 * precies wat een Vlaamse klant niet wil.
 */
export function voicesForLanguage(language?: string | null): StoryVoice[] {
  const taal = language || "Nederlands";
  const specifiek = STORY_VOICES.filter((v) => v.languages?.includes(taal));
  if (specifiek.length > 0) return specifiek;
  return STORY_VOICES.filter((v) => !v.languages);
}

/** Past de gekozen stem bij deze taal? Zo niet, geef de standaard voor die taal. */
export function voiceForLanguage(voiceId: string | null | undefined, language?: string | null): string {
  const beschikbaar = voicesForLanguage(language);
  if (voiceId && beschikbaar.some((v) => v.id === voiceId)) return voiceId;
  return DEFAULT_VOICE_PER_LANGUAGE[language || ""] ?? beschikbaar[0]?.id ?? DEFAULT_VOICE;
}

// Pad naar de ingebakken preview-mp3 voor een stem.
export function voicePreviewUrl(voiceId: string): string {
  return `/voice-previews/${voiceId}.mp3`;
}

/**
 * Kiest een vertellerstem die NIET door de cast gebruikt wordt.
 *
 * Een verteller die klinkt als een van de personages laat de kijker denken dat
 * dat personage praat terwijl je iets anders in beeld ziet — precies de verwarring
 * die we met de sprekercontrole hebben opgelost.
 */
export function kiesVertellerStem(bezet: string[], taal?: string | null): string {
  const beschikbaar = STORY_VOICES.filter(
    (v) => !v.languages || (taal ? v.languages.includes(taal) : false)
  );
  // Een verteller is nooit een kind: die leest het verhaal vóór. Zonder deze
  // uitsluiting kon een kinderstem als verteller uit de bus komen zodra de
  // volwassen stemmen door de cast bezet waren.
  const kandidaten = (beschikbaar.length ? beschikbaar : STORY_VOICES)
    .filter((v) => !v.kind && !bezet.includes(v.id));
  return (kandidaten[0] ?? STORY_VOICES.find((v) => !v.kind) ?? STORY_VOICES[0]).id;
}
