import type { OverheidLayout } from "@/lib/infographics/overheid-scene";

// Story-spec voor de storytelling-infographic (animatiemarkt-stijl).
// De AI levert UITSLUITEND deze gestructureerde data: een verhaalboog van scenes,
// elk met een gesproken voice-over en een Engelse illustratie-briefing (zonder
// tekst). Het beeldmodel maakt per scene de illustratie, die het hele frame vult.
//
// Er komt GEEN tekst-overlay meer overheen: koppen, accentwoorden en grote
// getallen zijn eruit gehaald. Ze vielen weg in de nu volledig ingetekende
// beelden, en dubbelden bovendien met wat de voice-over al vertelt. Alleen het
// merklogo ligt nog over het beeld.
//
// Strict-mode (OpenAI json_schema): elk object heeft ALLE properties in `required`
// en `additionalProperties:false`; optionele velden zijn nullable.

const storySceneSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "voiceover", "illustration"],
  properties: {
    id: { type: "string" },
    // Gesproken narratie voor deze scene (1 tot 2 zinnen, de verhaallijn).
    voiceover: { type: "string" },
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
    mode: { type: "string", enum: ["story", "report", "overheid"] },
    scenes: { type: "array", items: storySceneSchema },
  },
} as const;

/**
 * Eén bericht in de beeld-chat van een scene. De gebruiker typt wat er anders
 * moet ("het logo op de auto klopt niet") en stuurt daar eventueel een foto bij;
 * de assistent antwoordt kort en levert meestal een nieuw beeld.
 *
 * `previousImageUrl` is het beeld zoals het vóór deze beurt was. Daarmee is elke
 * beurt terug te draaien zonder aparte undo-stack: het herstelpunt hangt aan het
 * bericht dat de wijziging veroorzaakte.
 */
export interface SceneChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Meegestuurde referentiefoto (publieke URL), alleen bij role "user". */
  photoUrl?: string | null;
  /** Het beeld dat uit deze beurt kwam, alleen bij role "assistant". */
  imageUrl?: string | null;
  /** Het beeld van vóór deze beurt, zodat "terug" het kan herstellen. */
  previousImageUrl?: string | null;
  /** Idem voor een zelfgetekende scene: de opbouw van vóór deze beurt. */
  previousLayout?: OverheidLayout | null;
  /** Tijdstip (ms) — voor de datumscheiding in het chatverloop. */
  at?: number;
}

/**
 * Eén terugkerend personage in het verhaal, met een uiterlijk dat in élke scene
 * gelijk hoort te blijven.
 *
 * De cast wordt bij het genereren door de art-director vastgelegd en daarna
 * woordelijk in elke beeld-prompt herhaald. Daarvóór stond hij als losse zin in
 * een "visual bible" die de route weggooide, en verzon het beeldmodel per scene
 * nieuwe mensen — de taxateur was in scene 1 een ander dan in scene 4.
 */
export interface StoryCastMember {
  name: string;
  role: string;
  appearance: string;
}

export interface StoryScene {
  id: string;
  voiceover: string;
  illustration: string;
  /**
   * Opbouw van de scene in de overheidsmodus: welk sjabloon, welke iconen en
   * labels. Is dit gevuld, dan tekent de app de scene zelf als SVG en is er geen
   * gegenereerd beeld — vandaar dat imageUrl dan leeg blijft.
   */
  layout?: OverheidLayout | null;
  /** Namen uit spec.cast die in deze scene voorkomen. */
  castNames?: string[];
  /**
   * De exacte woorden die IN het beeld mogen staan (meestal leeg).
   *
   * Beeldmodellen verzinnen uit zichzelf letterbrij, dus tekst is standaard
   * verboden. Korte labels maken een uitleganimatie juist duidelijker — mits het
   * precies deze woorden zijn en de spelling na afloop gecontroleerd wordt
   * (zie lib/infographics/tekst-controle.ts).
   */
  labels?: string[];
  // Wordt na generatie gevuld met de URL van de gegenereerde illustratie.
  imageUrl?: string | null;
  // Beeld-chat van deze scene: het gesprek waarmee de gebruiker het beeld
  // bijstuurt. Wordt met het project meebewaard, zodat je bij het heropenen nog
  // ziet wat je gevraagd hebt en naar eerdere beeldversies terug kunt.
  chat?: SceneChatMessage[];
  // Laatst meegestuurde referentiefoto (echt product/logo/object). Blijft aan de
  // scene hangen zodat een volgende regeneratie datzelfde object weer klopt.
  referencePhotoUrl?: string | null;
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
  /**
   * "story" en "report" bepalen de toon van het script; "overheid" is een andere
   * soort animatie (diagrammen op een leeg vlak, zie OVERHEID_FRAMING) met een
   * zakelijk script. De modus stuurt dus zowel de tekst als de beeldregie.
   */
  mode: "story" | "report" | "overheid";
  scenes: StoryScene[];
  // Eén doorlopende voice-over over het hele verhaal (consistente stem, één
  // generatie). De scene-lengtes worden naar rato van de tekst verdeeld.
  voiceUrl?: string | null;
  voiceDuration?: number | null;
  // Gekozen stem (ElevenLabs-naam, bijv. "Charlotte"). Bewaard zodat een
  // opnieuw gegenereerde voice-over dezelfde stem gebruikt.
  voice?: string | null;
  // Eigen geüploade voice-over i.p.v. een gegenereerde stem. De bestandsnaam
  // tonen we in de interface zodat zichtbaar is welke opname eronder zit.
  voiceIsCustom?: boolean | null;
  voiceFileName?: string | null;
  // Merkkleuren waarmee de typografie wordt gerenderd. Worden bij het opslaan in
  // de spec bewaard zodat een herladen verhaal er hetzelfde uitziet. (Niet door
  // de AI gevuld; puur client-/persistentie-kant.)
  navy?: string | null;
  accent?: string | null;
  // Huisstijl-typografie en -logo (client-/persistentie-kant, niet AI-gevuld).
  // fontFamily is een van de gebundelde keuzes (zie story-fonts.ts); logoUrl is
  // een gehost merklogo dat als overlay op elke scene komt wanneer logoEnabled.
  fontFamily?: string | null;
  logoUrl?: string | null;
  logoEnabled?: boolean | null;
  // Achtergrondmuziek uit de vaste bibliotheek (lib/music/library.ts), zacht
  // onder de voice-over gemixt in player en export. Bij het exporteren wordt
  // het nummer op de videolengte gezet (lib/music/bed.ts).
  musicUrl?: string | null;
  // Legacy: de stijlprompt van het oude AI-muziekbed. Blijft staan zodat
  // bestaande projecten niet stukgaan; nieuwe projecten vullen dit niet meer.
  musicPrompt?: string | null;
  // Volume van het muziekbed (0..1), instelbaar via de slider. Default 0.18.
  musicVolume?: number | null;
  // Consistentie tussen scenes: vaste seed + een "anker"-beeld (scene 0) dat als
  // stijl-/character-referentie geldt voor de andere scenes en hun regeneraties.
  seed?: number | null;
  anchorImageUrl?: string | null;
  // Spreeksnelheid van de voice-over (ElevenLabs speed, ~0,8–1,2). Default 1.
  voiceSpeed?: number | null;
  // Gekozen tekenstijl (zie STORY_STYLE_PRESETS). Leeg/afwezig = flat-vector.
  // Bewaard in de spec zodat regeneraties en herladen dezelfde stijl gebruiken.
  styleId?: string | null;
  // Taal van script + voice-over (mensleesbaar NL, bijv. "Engels"). Leeg = Nederlands.
  language?: string | null;
  // De vaste cast van dit verhaal en het castblad: één beeld waarop iedereen
  // naast elkaar staat. Dat blad gaat als zwaarst wegende referentie mee naar
  // elke scene en naar elke latere regeneratie, zodat dezelfde persoon overal
  // hetzelfde gezicht, dezelfde kleding en dezelfde lengte houdt.
  cast?: StoryCastMember[] | null;
  castSheetUrl?: string | null;
  // Vast personage/mascotte (publieke URL) dat consistent in elke scène terugkomt.
  characterUrl?: string | null;
  /**
   * Wie dat vaste personage IS ("de monteur", "de klant"). Gaat mee in elke
   * scène-prompt: zonder rol wisselde dezelfde mascotte per scène van beroep.
   */
  characterRole?: string | null;
}
