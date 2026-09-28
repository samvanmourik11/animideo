// De stemmen die in de storytelling-tool gekozen kunnen worden. De id moet
// exact overeenkomen met een naam uit ALLOWED_VOICES in de scene-voice route
// (fal-ai/elevenlabs). De preview is een vooraf gegenereerde mp3 in
// public/voice-previews/<id>.mp3, zodat luisteren naar een stem niets kost
// (er wordt niets gegenereerd, alleen een statisch bestand afgespeeld).
//
// Naast de vaste ElevenLabs-stemmen (op naam) kan een id ook een ElevenLabs
// voice-id zijn. Dat is de enige manier om aan een échte Vlaamse stem te komen:
// ElevenLabs kent geen aparte taalcode voor Vlaams — "nl" levert altijd een
// Nederlandse uitspraak op — dus het accent moet uit de stem zelf komen. Om
// dezelfde reden staan de meeste stemmen hieronder nu op een echt Nederlands
// voice-id uit de ElevenLabs-stemmenbibliotheek (opgehaald via /v1/shared-voices
// ?language=nl) in plaats van de Engelse standaardstemmen die Nederlands via het
// meertalige model "nabootsen" — dat klinkt merkbaar minder Nederlands.
//
// Uitgebreid op verzoek van Sam (27-09-2026): "we hebben maar een paar stemmen"
// → een echte bibliotheek met onderscheid tussen mannen, vrouwen en de twee
// kinderstem-categorieën. De oude vier (Charlotte/Sarah/Daniel/George) + Hugo
// blijven bestaan en ONGETAGD (geen `languages`): ze zijn nog de stem van
// bestaande projecten, en `voiceForLanguage()` valt bij een taalwissel terug op
// de eerste stem uit de lijst voor die taal — zou je ze hier verwijderen of
// exclusief aan een taal koppelen, dan verspringt de stem van een al bewaard
// project stilletjes.

export interface StoryVoice {
  id: string;
  label: string;
  description: string;
  /** "man" of "vrouw" — bepaalt de groepering in de stemkiezer (samen met `kind`). */
  gender: "man" | "vrouw";
  /**
   * Is dit een KINDERstem? Alleen voor de dialoogtool: de assistent kiest er een als
   * een personage een kind is. De storytelling-tool biedt ze (nog) niet aan.
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
  // Bestaande meertalige standaardstemmen (Engelse ElevenLabs-namen, klinken
  // via eleven-v3 ook in het Nederlands). Blijven ongetagd staan, zie boven.
  { id: "Charlotte", label: "Charlotte", description: "warme vrouwenstem", gender: "vrouw" },
  { id: "Sarah", label: "Sarah", description: "heldere vrouwenstem", gender: "vrouw" },
  { id: "Daniel", label: "Daniel", description: "rustige mannenstem", gender: "man" },
  { id: "George", label: "George", description: "warme mannenstem", gender: "man" },
  // Hugo V uit de ElevenLabs-stemmenbibliotheek (op voice-id, zoals de Vlaamse stemmen).
  // Een echte Nederlandse stem: enthousiast en verkopend, op verzoek van Sam in alle tools.
  { id: "rbqBOMK4BPTMGvIB7N8w", label: "Hugo", description: "enthousiaste Nederlandse mannenstem", gender: "man" },

  // NEDERLANDSE MANNENSTEMMEN — echte Nederlandse voice-id's (niet getagd met
  // `languages`, dus ze staan naast Charlotte e.a. voor élke taal; het accent is
  // hoorbaar Nederlands, wat voor een Nederlandstalig verhaal juist de bedoeling is).
  { id: "rN2gFSK0c2RP1mgdpt69", label: "Tom", description: "warme, natuurlijke verteller", gender: "man" },
  { id: "MkRWZTk4OBui6Jb2lgK0", label: "Ruben", description: "jong en ontspannen", gender: "man" },
  { id: "yGnXd97Wft6RDkIaLXiR", label: "Pepijn", description: "rustig en zakelijk", gender: "man" },
  { id: "0qLmDzgqulxcvv0yf3kg", label: "Remko", description: "heldere verteller", gender: "man" },
  { id: "SFlhmoT9q6x81D3fl3dp", label: "Daan", description: "energiek en jong", gender: "man" },
  { id: "YWWzyiP9IlB03CVK6QXN", label: "Niels", description: "casual, alledaags", gender: "man" },
  { id: "2GJZCZIWrWiGFDntCFaz", label: "Bram", description: "diep en betrouwbaar", gender: "man" },
  { id: "FsohHqfNToVd5t03K9nL", label: "Sjaak", description: "nieuwsgierig en optimistisch", gender: "man" },
  // Op verzoek van Sam (27-09-2026): een stem die specifiek als storyteller/
  // verteller in de ElevenLabs-bibliotheek staat (use_case "narrative_story"),
  // niet zomaar een algemene mannenstem die ook verhalen kan doen.
  { id: "YXgx21dvgkRwunWFpa5d", label: "Jamie", description: "diepe, kalme verteller — gespecialiseerd in storytelling", gender: "man" },

  // NEDERLANDSE VROUWENSTEMMEN.
  { id: "7qdUFMklKPaaAVMsBTBt", label: "Roos", description: "helder en zelfverzekerd", gender: "vrouw" },
  { id: "XCOm4Hr4NoqIsKeVFU2y", label: "Linda", description: "warm en professioneel", gender: "vrouw" },
  { id: "qpYcCnnbKrqp5HBM19ou", label: "Mia", description: "vriendelijk en rustig", gender: "vrouw" },
  { id: "6e6TrJGLhrDGMKOy5x2i", label: "Noa", description: "fris, goed voor verhalen", gender: "vrouw" },
  { id: "kZQ3IGqYUStQ8u1Y62s6", label: "Lieke", description: "levendig, social-media-stijl", gender: "vrouw" },
  { id: "46eAUFOjYHnAbq9XpWMc", label: "Anne", description: "vriendelijk en zorgzaam", gender: "vrouw" },
  { id: "tfweP7lGJyLeNV9dH1Rm", label: "Marianne", description: "warme seniorenstem", gender: "vrouw" },
  { id: "DiUBVrSFwkMaPz4XqWvR", label: "Jolanda", description: "aangenaam en geruststellend", gender: "vrouw" },

  // KINDERSTEMMEN.
  //
  // ElevenLabs heeft geen Nederlandse kinderstemmen: de stemmenbibliotheek geeft
  // op "child" + nl alleen volwassenen die AAN kinderen voorlezen. Deze zes zijn
  // kinderstemmen uit andere talen; eleven-v3 is meertalig, dus ze spreken gewoon
  // Nederlands. Alle zes zijn gecontroleerd met Whisper op een Nederlandse zin —
  // een zevende kandidaat maakte van "wonderwagen" een "wommenwagen" en viel af.
  // Een licht accent kan blijven hangen; daarom staan ze er met previews bij,
  // zodat je hoort wat je kiest voordat je een video maakt.
  { id: "5krdMTA5HonvWAlY2vSx", label: "Tuur", description: "jongensstem, verwonderd", gender: "man", kind: true },
  { id: "ihKwLOjVUMG4lgUI6meZ", label: "Finn", description: "jongensstem, nieuwsgierig", gender: "man", kind: true },
  { id: "XjGYkUkzth8BPs29fmcV", label: "Boaz", description: "jongensstem, uitbundig", gender: "man", kind: true },
  { id: "EeQEodFZVtBkjtgK3HBc", label: "Fien", description: "meisjesstem, expressief", gender: "vrouw", kind: true },
  { id: "hO2yZ8lxM3axUxL8OeKX", label: "Saar", description: "meisjesstem, hoog en vrolijk", gender: "vrouw", kind: true },
  { id: "0luPAj5RsdhmnkZaiYcb", label: "Noor", description: "meisjesstem, levendig", gender: "vrouw", kind: true },

  // Vlaamse stemmen (ElevenLabs voice-id's uit de stemmenbibliotheek). De
  // beschrijving bevat bewust het woord "Vlaams" — de opzet-route herkent een
  // Vlaamse stem daaraan (zie app/api/infographics/dialogue-setup/route.ts).
  { id: "02TPKkY2rZbgnKFIPrT9", label: "Katleen", description: "warme Vlaamse vrouwenstem", gender: "vrouw", languages: ["Vlaams"] },
  { id: "Yv0oyZ3obP9foTH7emqG", label: "Jeroen", description: "warme Vlaamse mannenstem", gender: "man", languages: ["Vlaams"] },
  { id: "AgeYjqDIfXtkcA3mOcsH", label: "Gunther", description: "rustige Vlaamse verteller", gender: "man", languages: ["Vlaams"] },
  { id: "wwW0aOSbbYgXMec1zRTp", label: "Dauphine", description: "zachte Vlaamse vertelster", gender: "vrouw", languages: ["Vlaams"] },
  { id: "4Q02te4SdfFsVbcIKmbk", label: "Elenor", description: "jonge Vlaamse (Antwerpse) stem", gender: "vrouw", languages: ["Vlaams"] },
  { id: "LoLnBvKBzvdDcAUMNbKV", label: "Rutger", description: "rustige, welbespraakte Vlaamse stem", gender: "man", languages: ["Vlaams"] },
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
  // Zonder de kinderstemmen: die horen bij de dialoogtool, en de storytelling-tool
  // biedt ze nog niet aan.
  return STORY_VOICES.filter((v) => !v.languages && !v.kind);
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

// ---------- Groeperen voor de stemkiezer ----------

export type VoiceCategory = "man" | "vrouw" | "jongen" | "meisje";

export const VOICE_CATEGORY_LABELS: Record<VoiceCategory, string> = {
  man: "Mannen",
  vrouw: "Vrouwen",
  jongen: "Jongens (kind)",
  meisje: "Meisjes (kind)",
};

const CATEGORY_ORDER: VoiceCategory[] = ["man", "vrouw", "jongen", "meisje"];

export function voiceCategory(v: StoryVoice): VoiceCategory {
  if (v.kind) return v.gender === "vrouw" ? "meisje" : "jongen";
  return v.gender;
}

export interface VoiceGroup {
  category: VoiceCategory;
  label: string;
  voices: StoryVoice[];
}

/** Groepeert een lijst stemmen in vaste volgorde: mannen, vrouwen, jongens, meisjes. Lege groepen vallen weg. */
export function groupVoices(voices: StoryVoice[]): VoiceGroup[] {
  return CATEGORY_ORDER
    .map((category) => ({
      category,
      label: VOICE_CATEGORY_LABELS[category],
      voices: voices.filter((v) => voiceCategory(v) === category),
    }))
    .filter((g) => g.voices.length > 0);
}
