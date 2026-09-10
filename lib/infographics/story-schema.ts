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

// Variant mét tekst in beeld. Strict-mode eist dat élke property in `required`
// staat, dus is dit een apart schema in plaats van een paar optionele velden.
const storySceneSchemaMetTekst = {
  type: "object",
  additionalProperties: false,
  required: ["id", "voiceover", "illustration", "headline", "emphasis", "bigNumber", "numberLabel"],
  properties: {
    ...storySceneSchema.properties,
    // Korte tekst die IN beeld komt — alleen als hij echt iets toevoegt.
    headline: { type: ["string", "null"] },
    // Eén woord uit de kop dat de accentkleur krijgt (of null).
    emphasis: { type: ["string", "null"] },
    // Hard getal uit de brontekst. Nooit verzinnen; null als er geen cijfer is.
    bigNumber: { type: ["string", "null"] },
    // Klein label bij dat getal.
    numberLabel: { type: ["string", "null"] },
  },
} as const;

function specSchema(sceneSchema: unknown) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["version", "title", "format", "mode", "scenes"],
    properties: {
      version: { type: "integer", enum: [1] },
      title: { type: "string" },
      format: { type: "string", enum: ["16:9", "9:16"] },
      mode: { type: "string", enum: ["story", "report", "overheid"] },
      scenes: { type: "array", items: sceneSchema },
    },
  } as const;
}

export const STORY_SPEC_SCHEMA = specSchema(storySceneSchema);

/** Het schema dat bij deze video hoort: met of zonder tekst in beeld. */
export function storySpecSchema(tekstInBeeld: boolean) {
  return tekstInBeeld ? specSchema(storySceneSchemaMetTekst) : STORY_SPEC_SCHEMA;
}

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

/**
 * Eén personage dat de GEBRUIKER zelf voor dit verhaal heeft gekozen: een
 * portret uit de bibliotheek of een eigen upload, met de rol die diegene speelt.
 *
 * Hiervoor kon je maar één personage meegeven (`characterUrl` + `characterRole`).
 * Wie een monteur én een klant in zijn video wilde, kon dus maar de helft van de
 * cast vastleggen en moest de rest aan het beeldmodel overlaten — dat elke scene
 * een ander gezicht verzon. Deze lijst is het castblad: iedereen die je zelf
 * vastlegt staat erin, met zijn eigen rol.
 */
export interface StoryCastRef {
  /** Publieke URL van het portret (bibliotheek of upload). */
  url: string;
  /** Hoe deze persoon in de briefings heet ("Lisa"). Leeg = de AI kiest er een. */
  name: string;
  /** Wat diegene in dit verhaal doet ("de monteur"). Leeg = de AI vult aan. */
  role: string;
  /**
   * Uiterlijk in woorden. Komt uit de bibliotheek (`characters.description`) of
   * uit de beschrijving bij een upload. Het beeldmodel krijgt het portret zelf
   * óók mee, maar de tekst houdt kleding en kleur vast in de scenes waar het
   * portret niet in de referentie-slots past.
   */
  appearance?: string | null;
}

export interface StoryScene {
  id: string;
  voiceover: string;
  illustration: string;
  // ── Tekst in beeld ──
  //
  // Deze velden zijn een tijd lang niet meer getoond: donkerblauwe koppen vielen
  // weg in de nu volledig ingetekende illustraties. Ze zijn nooit uit de opgeslagen
  // projecten verdwenen, en dat bleek maar goed ook — er zijn klanten die de tekst
  // juist als ondersteuning in hun e-learnings gebruiken. Nu weer in gebruik, maar
  // als KEUZE per verhaal (zie StorySpec.tekstInBeeld).
  /** Korte tekst die in beeld verschijnt. Leeg/null = geen kop bij deze scene. */
  headline?: string | null;
  /** Eén woord uit de kop dat de accentkleur krijgt. */
  emphasis?: string | null;
  /** Groot getal uit de brontekst ("5.500€", "170"). */
  bigNumber?: string | null;
  /** Klein label bij dat getal ("subsidie", "soorten"). */
  numberLabel?: string | null;
  // Per-scene positie en grootte van kop en getal (Canva-stijl slepen/schalen),
  // in viewBox-coordinaten. Undefined = de automatisch berekende plek.
  hx?: number; hy?: number; hSize?: number;
  nx?: number; ny?: number; nSize?: number;
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

/**
 * Toont dit verhaal tekst in beeld?
 *
 * Bewust één functie, gebruikt door de editor, de player en de export. Stond die
 * regel op drie plekken, dan zou een bestaand project in de preview wel tekst
 * tonen en in de export niet.
 */
export function tekstInBeeldAan(spec: Pick<StorySpec, "tekstInBeeld" | "scenes">): boolean {
  if (typeof spec.tekstInBeeld === "boolean") return spec.tekstInBeeld;
  return (spec.scenes ?? []).some(
    (s) => (s.headline ?? "").trim().length > 0 || (s.bigNumber ?? "").trim().length > 0
  );
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
  /**
   * Staat er tekst in beeld (koppen, accentwoorden, grote getallen)?
   *
   * Niet gezet = afleiden uit de inhoud: heeft een scene een kop of een getal,
   * dan stond die tekst er en hoort hij er te blijven. Zo blijven bestaande
   * projecten precies zoals de klant ze achterliet, terwijl nieuwe verhalen
   * standaard zonder tekst beginnen.
   */
  tekstInBeeld?: boolean | null;
  // De vaste cast van dit verhaal en het castblad: één beeld waarop iedereen
  // naast elkaar staat. Dat blad gaat als zwaarst wegende referentie mee naar
  // elke scene en naar elke latere regeneratie, zodat dezelfde persoon overal
  // hetzelfde gezicht, dezelfde kleding en dezelfde lengte houdt.
  cast?: StoryCastMember[] | null;
  castSheetUrl?: string | null;
  /**
   * De personages die de gebruiker zélf heeft vastgelegd (portret + rol). Deze
   * mensen staan gegarandeerd in de cast en op het castblad; de art-director mag
   * er hooguit nog wat rollen bij verzinnen tot het maximum van vier.
   */
  castRefs?: StoryCastRef[] | null;
  // Verouderd — één vast personage. Blijft staan zodat verhalen van vóór het
  // castblad hun personage houden; `castRefsVanSpec()` leest het als cast van één.
  characterUrl?: string | null;
  /**
   * Wie dat vaste personage IS ("de monteur", "de klant"). Gaat mee in elke
   * scène-prompt: zonder rol wisselde dezelfde mascotte per scène van beroep.
   */
  characterRole?: string | null;
}

/**
 * De door de gebruiker vastgelegde cast van een verhaal, inclusief de oude
 * enkel-personage-velden.
 *
 * Bestaande projecten hebben `characterUrl`/`characterRole` en geen `castRefs`.
 * Die moeten blijven werken zoals ze werkten, dus lezen we ze hier als een cast
 * van één persoon. Alles wat de cast nodig heeft, gaat via deze functie.
 */
export function castRefsVanSpec(
  spec: Pick<StorySpec, "castRefs" | "characterUrl" | "characterRole"> | null | undefined,
): StoryCastRef[] {
  const refs = (spec?.castRefs ?? []).filter((r) => r?.url?.trim());
  if (refs.length > 0) return refs;
  const url = spec?.characterUrl?.trim();
  if (!url) return [];
  const rol = (spec?.characterRole ?? "").trim();
  return [{ url, name: "", role: rol }];
}

/** Hoeveel personages je zelf kunt vastleggen. Gelijk aan de castlimiet van de
 *  art-director (lib/infographics/art-direct.ts) — meer mensen dan dat houdt
 *  geen enkel beeldmodel nog uit elkaar. */
export const MAX_CAST_REFS = 4;

/**
 * De zelf gekozen personages samenvoegen met de cast die de art-director bedacht.
 *
 * De regie krijgt de vastgelegde cast in de prompt mee, maar een taalmodel laat
 * er weleens iemand uit vallen of noemt hem net anders. Zonder deze stap heeft
 * dat portret geen naam in de cast, komt het in geen enkele scene-briefing voor,
 * en tekent het beeldmodel er alsnog een vreemde bij.
 *
 * Geeft ook de refs terug mét een definitieve naam. Die naam is de koppeling
 * tussen portret en scene (`StoryScene.castNames`), dus zonder resolven zou een
 * naamloos portret in geen enkele scene meegaan.
 */
export function mergeVasteCast(
  gegenereerd: StoryCastMember[],
  refs: StoryCastRef[],
): { cast: StoryCastMember[]; refs: StoryCastRef[] } {
  if (refs.length === 0) return { cast: gegenereerd, refs };
  const cast = [...gegenereerd];
  const uitRefs: StoryCastRef[] = [];

  refs.forEach((ref, i) => {
    const naam = (ref.name ?? "").trim();
    const rol = (ref.role ?? "").trim();
    const uiterlijk = (ref.appearance ?? "").trim();

    const bestaand = naam
      ? cast.findIndex((c) => c.name.trim().toLowerCase() === naam.toLowerCase())
      // Geen naam opgegeven? Dan hoort dit portret bij het castlid op dezelfde
      // plek in de rij — dat is ook de volgorde waarin de portretten meegaan.
      : (cast[i] ? i : -1);

    if (bestaand >= 0) {
      // De regie mag het uiterlijk uitwerken, maar naam en rol van de klant winnen.
      cast[bestaand] = {
        ...cast[bestaand],
        name: naam || cast[bestaand].name,
        role: rol || cast[bestaand].role,
        appearance: cast[bestaand].appearance?.trim() || uiterlijk,
      };
      uitRefs.push({ ...ref, name: cast[bestaand].name });
      return;
    }

    const nieuweNaam = naam || `Personage ${i + 1}`;
    cast.push({ name: nieuweNaam, role: rol, appearance: uiterlijk });
    uitRefs.push({ ...ref, name: nieuweNaam });
  });

  // Afkappen op de castlimiet, maar nooit ten koste van de klant: die heeft er
  // een portret bij gekozen. Er vallen dus alleen door de regie verzonnen rollen
  // af, van achteren naar voren.
  const vanKlant = new Set(uitRefs.map((r) => r.name.trim().toLowerCase()));
  const uitCast = [...cast];
  for (let i = uitCast.length - 1; i >= 0 && uitCast.length > MAX_CAST_REFS; i--) {
    if (!vanKlant.has(uitCast[i].name.trim().toLowerCase())) uitCast.splice(i, 1);
  }
  return { cast: uitCast.slice(0, MAX_CAST_REFS), refs: uitRefs };
}

/**
 * Welke portretten gaan er mee naar één scene: die van de castleden die de regie
 * in deze scene heeft gezet.
 *
 * Zonder opgave (geen castNames, bijvoorbeeld omdat de art-direction mislukte)
 * gaan ze allemaal mee: een scene zonder portret krijgt gegarandeerd een nieuw
 * verzonnen gezicht, en dat is erger dan een portret te veel — de beeld-prompt
 * staat uitdrukkelijk toe dat iemand niet in beeld is.
 */
export function castRefsVoorScene(
  refs: StoryCastRef[],
  castNames: string[] | null | undefined,
): StoryCastRef[] {
  if (refs.length === 0) return [];
  const namen = (castNames ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean);
  if (namen.length === 0) return refs;
  return refs.filter((r) => namen.includes((r.name ?? "").trim().toLowerCase()));
}
