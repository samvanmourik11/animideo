// Story-spec voor de storytelling-infographic (animatiemarkt-stijl).
// De AI levert UITSLUITEND deze gestructureerde data: een verhaalboog van scenes,
// elk met een gesproken voice-over, een korte beeldtekst (kop) en een Engelse
// illustratie-briefing (zonder tekst). Het beeldmodel maakt per scene de platte
// illustratie; de typografie en cijfers komen er deterministisch in SVG overheen.
//
// Strict-mode (OpenAI json_schema): elk object heeft ALLE properties in `required`
// en `additionalProperties:false`; optionele velden zijn nullable.

const storySceneSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "voiceover", "headline", "emphasis", "bigNumber", "numberLabel", "illustration"],
  properties: {
    id: { type: "string" },
    // Gesproken narratie voor deze scene (1 tot 2 zinnen, de verhaallijn).
    voiceover: { type: "string" },
    // Korte tekst die IN beeld komt. Mag korter/puntiger zijn dan de voice-over.
    headline: { type: "string" },
    // Eén woord uit de headline dat de accentkleur krijgt (of null).
    emphasis: { type: ["string", "null"] },
    // Groot getal uit de brontekst (bijv. "5.500€", "170", "9,6 mln"). Nooit
    // verzinnen; null als er geen hard cijfer bij deze scene hoort.
    bigNumber: { type: ["string", "null"] },
    // Klein label bij het getal (bijv. "subsidie", "soorten"). null indien geen.
    numberLabel: { type: ["string", "null"] },
    // ENGELSE illustratie-briefing: beschrijf de platte vector-scene (objecten,
    // omgeving, karakters). GEEN tekst in het beeld.
    illustration: { type: "string" },
  },
} as const;

export const STORY_SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "title", "format", "mode", "scenes"],
  properties: {
    version: { type: "integer", enum: [1] },
    title: { type: "string" },
    format: { type: "string", enum: ["16:9", "9:16"] },
    mode: { type: "string", enum: ["story", "report"] },
    scenes: { type: "array", items: storySceneSchema },
  },
} as const;

export interface StoryScene {
  id: string;
  voiceover: string;
  headline: string;
  emphasis: string | null;
  bigNumber: string | null;
  numberLabel: string | null;
  illustration: string;
  // Wordt na generatie gevuld met de URL van de gegenereerde illustratie.
  imageUrl?: string | null;
  // Per-scene overlay-transform (Canva-stijl slepen/schalen). Undefined = de
  // automatisch berekende standaardpositie/-grootte. In viewBox-coordinaten.
  hx?: number; hy?: number; hSize?: number; // kop: top-left + fontgrootte
  nx?: number; ny?: number; nSize?: number; // groot getal: top-left + fontgrootte
  // Ingesproken voice-over (ElevenLabs). voiceDuration stuurt de scene-lengte.
  voiceUrl?: string | null;
  voiceDuration?: number | null;
  // Bewegende versie van de illustratie (image-to-video). Als gezet, gebruiken
  // preview en player deze clip i.p.v. het stilstaande beeld.
  videoUrl?: string | null;
}

export interface StorySpec {
  version: 1;
  title: string;
  format: "16:9" | "9:16";
  mode: "story" | "report";
  scenes: StoryScene[];
  // Eén doorlopende voice-over over het hele verhaal (consistente stem, één
  // generatie). De scene-lengtes worden naar rato van de tekst verdeeld.
  voiceUrl?: string | null;
  voiceDuration?: number | null;
  // Gekozen stem (ElevenLabs-naam, bijv. "Charlotte"). Bewaard zodat een
  // opnieuw gegenereerde voice-over dezelfde stem gebruikt.
  voice?: string | null;
  // Merkkleuren waarmee de typografie wordt gerenderd. Worden bij het opslaan in
  // de spec bewaard zodat een herladen verhaal er hetzelfde uitziet. (Niet door
  // de AI gevuld; puur client-/persistentie-kant.)
  navy?: string | null;
  accent?: string | null;
  // Instrumentaal achtergrond-muziekbed (CassetteAI), zacht onder de voice-over
  // gemixt in player en export. musicPrompt bewaart de gekozen stijl.
  musicUrl?: string | null;
  musicPrompt?: string | null;
}
