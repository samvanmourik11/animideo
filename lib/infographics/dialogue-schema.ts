// Dialoog-spec voor de "pratende personages"-modus.
//
// OPZET (herzien 2026-08-14 na de spikes). De video is een reeks TWEE-SHOTS: de
// personages staan tegenover elkáár in beeld en voeren het gesprek. Per gesproken
// zin maken we één clip waarin precies ÉÉN personage praat en de ander zichtbaar
// luistert. Dat is bewust anders dan de eerste opzet met losse pratende koppen:
// die knipte tussen zwevende hoofden die recht in de camera keken.
//
// Waarom één clip per zin: een clip die meerdere beurten moet dragen laat het
// videomodel zelf bepalen wanneer de wissel valt, en dan loopt de stem uit de pas
// met de mond. Met één spreker per clip valt er niets te wisselen — de clip duurt
// exact zolang als de ingesproken zin.
//
// De cast komt UIT DE KARAKTERBIBLIOTHEEK van de gebruiker (public.characters);
// de AI verzint geen personages meer, die schrijft alleen het gesprek voor de
// rollen die de gebruiker heeft gekozen.
//
// Strict-mode (OpenAI json_schema): elk object heeft ALLE properties in
// `required` en `additionalProperties:false`; optionele velden zijn nullable.

/**
 * Gereserveerd id voor de VERTELLER: een stem die bij geen enkel personage hoort.
 * Een verteller kan alleen over een actiebeeld praten — in een twee-shot zou je
 * een stem horen die uit niemand komt, en dat is precies de fout die we bij de
 * sprekercontrole net hebben uitgebannen.
 */
export const VERTELLER_ID = "verteller";

// Maximaal aantal personages in de cast. Twee is de norm (een twee-shot); drie kan,
// maar dan wordt het beeld druk en moet er iemand buiten kader vallen.
/**
 * Hoeveel personages er in één verhaal mogen.
 *
 * Stond op 3, want de tool maakte gesprekken tussen twee of drie mensen die
 * tegenover elkaar staan. Een sprookje heeft er meer nodig: het Lelijke Eendje
 * heeft het eendje, de moedereend, broertjes en zusjes, een haan, een vos en
 * wolven. Zes is de grens waarbinnen een castblad ze nog uit elkaar houdt —
 * daarboven gaan gezichten op elkaar lijken.
 *
 * Per SCÈNE staan er nog steeds hooguit drie in beeld (zie sceneCast); de cast
 * is de hele bezetting van het verhaal, niet van één shot.
 */
export const MAX_CAST = 6;

/** Hoeveel personages er tegelijk in één beeld passen zonder soep te worden. */
export const MAX_PER_SCENE = 3;

// Waar een personage staat in het twee-shot. Bepaalt de mondzone die we meten en
// hoe we spreker/luisteraar in de prompts benoemen.
export const CAST_POSITIONS = ["left", "right", "center"] as const;
export type CastPosition = (typeof CAST_POSITIONS)[number];

const dialogueLineSchema = {
  type: "object",
  additionalProperties: false,
  required: ["characterId", "text", "emotion"],
  properties: {
    // Verwijst naar een cast-lid (moet een bestaand cast.id zijn).
    characterId: { type: "string" },
    // De gesproken zin (in de gekozen taal). Getallen voluit geschreven.
    text: { type: "string" },
    // Eén kort woord voor de emotie (bijv. "neutraal", "blij", "verrast").
    // Stuurt de houding in het bronbeeld van deze regel.
    emotion: { type: "string" },
  },
} as const;

const dialogueSceneSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "setting", "lines"],
  properties: {
    id: { type: "string" },
    // ENGELSE beschrijving van de OMGEVING waarin dit deel van het gesprek zich
    // afspeelt (bijv. "a modern office with a desk and a laptop"). Beschrijf
    // alleen de plek — wie er staat en hoe, bepalen wij uit de cast.
    setting: { type: "string" },
    lines: { type: "array", items: dialogueLineSchema },
  },
} as const;

// Wat de AI oplevert: alleen het gesprek. Titel, scènes en regels — geen cast,
// geen formaat, want die kiest de gebruiker vooraf.
export const DIALOGUE_SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "title", "scenes"],
  properties: {
    version: { type: "integer", enum: [1] },
    title: { type: "string" },
    scenes: { type: "array", items: dialogueSceneSchema },
  },
} as const;

// ---------- TypeScript-vormen ----------

export interface DialogueCastMember {
  // Stabiele verwijzing binnen deze spec (bijv. "char-1"); dialoogregels wijzen hierheen.
  id: string;
  // Rij uit public.characters. De bron van portret en uiterlijk.
  characterId: string;
  // Naam zoals in het verhaal (overschrijfbaar t.o.v. de bibliotheek).
  name: string;
  // Wie dit personage is in dit gesprek ("de expert", "de klant").
  role: string;
  /**
   * Leeftijd in dit verhaal ("7 jaar", "ongeveer 70").
   *
   * Bepaalt hoe groot iemand op het castblad getekend wordt. Zonder leeftijd
   * kwam een meisje van zes eruit als een tiener die boven haar broertje uitstak.
   */
  leeftijd?: string | null;
  /**
   * Wat dit personage in dit verhaal WIL, en HOE het praat.
   *
   * Staan hier niet voor de sier: zonder botsende verlangens schreef het model
   * personages die het steeds met elkaar eens waren, en zonder eigen spraak
   * waren hun regels onderling verwisselbaar. Ze gaan mee naar elke stap die
   * later nog zinnen schrijft, anders vervlakt het verhaal alsnog halverwege.
   */
  wil?: string | null;
  spraak?: string | null;
  // Stem-id uit STORY_VOICES.
  voice: string;
  // Portret uit de bibliotheek: identiteits-anker voor elk twee-shot.
  portraitUrl: string;
  /**
   * Model sheet: ditzelfde personage van voren, schuin en opzij op één blad.
   *
   * Het portret is één close-up van voren. Zodra een shot van opzij of van
   * onderaf gevraagd wordt, moest het beeldmodel de andere kant van dat hoofd
   * zelf verzinnen — en dan verzon het meteen ander haar. Dit blad geeft die
   * andere hoeken, en gaat als identiteitsreferentie mee naar elk shot.
   * Wordt één keer per personage gemaakt (zie /api/infographics/dialogue-model-sheet).
   */
  modelSheetUrl?: string | null;
  // Plek in het kader. Bepaalt hoe we spreker/luisteraar benoemen in de prompts.
  position: CastPosition;
  // Kort ENGELS uiterlijk (haar, kleding, leeftijd). Bewust apart van het portret:
  // een prompt die alleen "the person on the left" zegt wijst de verkeerde aan
  // zodra het beeldmodel de personages net anders neerzet. Met kleding erbij
  // ("the person in the green sweater on the left") is het eenduidig.
  appearance?: string | null;
}

// Wat voor moment dit is. Een video die alleen uit "iemand zegt een zin" bestaat
// voelt als een gefilmd gesprek: dezelfde twee mensen, dezelfde opstelling, negen
// keer achter elkaar.
//
// Het onderscheid zit in WAT JE ZIET, niet in wat je hoort:
//   "dialoog" = het twee-shot, één personage praat en de ander luistert zichtbaar
//   "actie"   = een ander beeld: onderweg, aangekomen, iets ontdekt, of gewoon een
//               beeld dat uitvergroot waar het over gaat
//
// Een actiebeeld kan DRIE dingen doen met geluid, en dat is wat het levendig maakt:
//   - niets: alleen muziek, die vanzelf naar voren komt (ducking in de export)
//   - een voice-over: het beeld staat er, en iemand praat eroverheen
//   - het gesprek gaat door: dezelfde stem gaat verder terwijl je een versterkend
//     beeld ziet in plaats van de pratende koppen
// Die laatste twee zijn hetzelfde in de data: een actiebeeld MET gesproken tekst.
import type { Kader } from "./verhaal-kaders";
import type { Lichtsoort } from "./verhaal-licht";

export const SHOT_SOORTEN = ["dialoog", "actie"] as const;
export type ShotSoort = (typeof SHOT_SOORTEN)[number];

// Grenzen aan de videolengte. Vijf minuten moet kunnen; daarboven lopen kosten en
// wachttijd zo hard op dat het geen product meer is (300 seconden is al ~75 clips).
export const VIDEO_MIN_SEC = 20;
export const VIDEO_MAX_SEC = 300;
export const VIDEO_STANDAARD_SEC = 60;

// Een gesproken regel duurt ongeveer dit, en zoveel regels passen er in een scène.
// Hieruit volgt het aantal scènes bij een gegeven lengte.
// GEMETEN, niet geschat: dertig echte ingesproken dialoogregels gaven een
// gemiddelde en mediaan van 3,47 seconden. Met de oude aanname van 4 seconden
// plande de assistent structureel te weinig regels en kwam een video van een
// minuut op ruim vijftig seconden uit.
export const SECONDEN_PER_REGEL = 3.5;
export const REGELS_PER_SCENE = 3;

/** Hoeveel regels en scènes horen er bij een gewenste lengte? */
export function planVoorLengte(seconden: number): { regels: number; scenes: number } {
  const secs = Math.max(VIDEO_MIN_SEC, Math.min(VIDEO_MAX_SEC, Math.round(seconden)));
  const regels = Math.max(4, Math.round(secs / SECONDEN_PER_REGEL));
  const scenes = Math.max(2, Math.round(regels / REGELS_PER_SCENE));
  return { regels, scenes };
}

/** Lengte van een actiebeeld, in seconden. Kort houden: het is een beat, geen scène. */
export const ACTIE_MIN_SEC = 2;
export const ACTIE_MAX_SEC = 6;
export const ACTIE_STANDAARD_SEC = 4;

export interface DialogueLine {
  /** Afwezig = "dialoog"; zo blijven bestaande draaiboeken werken. */
  kind?: ShotSoort;
  /**
   * Hoe dit shot in beeld wordt gebracht: close-up, totaalbeeld, van achteren…
   * Zie verhaal-kaders.ts.
   *
   * Afwezig = het oude gedrag (twee personages naast elkaar, hele lichaam,
   * ooghoogte), zodat bestaande draaiboeken hun beelden houden. Voor nieuwe
   * verhalen kiest de regisseur per shot een kader — dat is het verschil tussen
   * twee poppetjes die praten en een verhaal dat je blijft kijken.
   */
  kader?: Kader | null;
  characterId: string;
  text: string;
  emotion: string;
  /**
   * Alleen bij kind "actie": ENGELSE beschrijving van wat je ZIET, bijvoorbeeld
   * "the two of them drive along a coastal road in a small car, seen from the side".
   * Blijft `text` leeg, dan draagt de muziek dit beeld; staat er wel tekst, dan
   * spreekt dat personage eroverheen terwijl je dit beeld ziet.
   */
  actie?: string | null;
  /**
   * Alleen bij kind "actie" ZONDER gesproken tekst: hoe lang dit beeld duurt.
   * Met een voice-over bepaalt de lengte van de ingesproken zin de duur.
   */
  seconden?: number | null;
  /**
   * Alleen bij kind "actie": één zin over waar dit beeld uit voortkomt en waar het
   * naartoe leidt. De assistent MOET dit invullen — wie moet opschrijven waarom een
   * shot er is, plakt er minder willekeurig een tussen. Staat ook in het draaiboek,
   * zodat jij die redenering kunt nalezen en afkeuren.
   */
  verband?: string | null;
  // Bronbeeld van DEZE regel: het twee-shot van de scène, bijgewerkt zodat dit
  // personage praat en de ander in luisterhouding staat.
  shotImageUrl?: string | null;
  // Ingesproken zin; de lengte bepaalt hoe lang de clip wordt.
  audioUrl?: string | null;
  audioDuration?: number | null;
  // Bewegende clip (Seedance) op basis van shotImageUrl.
  videoUrl?: string | null;
  // Gemeten moment waarop de mond van de spreker opengaat. De export knipt de
  // clip hier af zodat de stem precies op de mondbeweging begint.
  mouthStart?: number | null;
  // Uitkomst van de sprekercontrole: false = er is niet met zekerheid vast te
  // stellen dat de júiste persoon praat. Zichtbaar in het draaiboek, zodat je zo'n
  // regel gericht opnieuw kunt maken in plaats van hem stilzwijgend mee te nemen.
  sprekerZeker?: boolean | null;
  /**
   * Wat de beeldcontrole na alle herkansingen nog steeds zag: mensen ín een object,
   * zwevende voorwerpen, verzonnen tekst, of iets dat tussen de frames van vorm
   * verandert. Zichtbaar in het draaiboek, want zulke fouten mogen niet
   * stilzwijgend in de video belanden.
   */
  beeldWaarschuwingen?: string[] | null;
}

export interface DialogueScene {
  id: string;
  setting: string;
  /**
   * Het licht in deze scene: dag, nacht, kaarslicht, tegenlicht…
   * Zie verhaal-licht.ts.
   *
   * Hoort bij de scene en niet bij het shot, want binnen één plek en één moment
   * verandert het licht niet. Afwezig = daglicht, zoals het altijd was.
   */
  licht?: Lichtsoort | null;
  lines: DialogueLine[];
  // Basis-twee-shot van deze scène: de cast tegenover elkaar in deze omgeving.
  // Elke regel binnen de scène is een bewerking hiervan, zodat de personages
  // tussen regels niet verspringen.
  twoShotUrl?: string | null;
}

export interface DialogueSpec {
  version: 1;
  title: string;
  /** Waar het verhaal onderhuids over gaat, in één zin. Stuurt elke schrijfstap. */
  kern?: string | null;
  /** Wat er anders loopt dan verwacht, in één zin. Zonder wending geen verhaal. */
  wending?: string | null;
  format: "16:9" | "9:16";
  cast: DialogueCastMember[];
  scenes: DialogueScene[];
  // Client-/persistentie-kant (niet door de AI gevuld).
  mode?: "dialogue";
  language?: string | null;
  // Tekenstijl uit STORY_STYLE_PRESETS (flat-vector, marker-sketch, …).
  styleId?: string | null;
  // Vrije regieaanwijzing van de gebruiker voor ALLE beelden in deze video:
  // huisstijlkleuren, sfeer, kledingstijl, wat er wel of niet in beeld mag.
  // Gaat als extra context mee naar elke beeldgeneratie.
  illustrationBrief?: string | null;
  seed?: number | null;
  /**
   * Het castblad: één beeld met de hele cast ten voeten uit naast elkaar.
   *
   * De identiteits- én maatreferentie voor elk beeld in de video. De portretten
   * uit de bibliotheek zijn borstbeelden en zeggen niets over lichaamsbouw, dus
   * verzon het beeldmodel dat per scène opnieuw — vandaar personages die van
   * lengte wisselden. Hier staat het één keer vast.
   */
  castSheetUrl?: string | null;
  /**
   * Stem van de verteller. Bewust een andere stem dan die van de cast: een
   * verteller die klinkt als een van de personages verwart de kijker.
   */
  narratorVoice?: string | null;
  /**
   * Gewenste videolengte in seconden, door de gebruiker vooraf gekozen. Hieruit
   * leidt de assistent het aantal scènes en regels af. Blijft bij de spec staan
   * zodat een herziening dezelfde maat aanhoudt.
   */
  targetSeconds?: number | null;
  /**
   * Achtergrondmuziek uit de vaste bibliotheek (lib/music/library.ts). Bij het
   * exporteren gaat het nummer eerst op de videolengte (lib/music/bed.ts) en
   * duckt het onder de spraak.
   */
  musicUrl?: string | null;
  musicVolume?: number | null;
}

// ---------- Hulpfuncties ----------

/** Alle regels van alle scènes, met hun plek erbij. */
export function alleRegels(spec: DialogueSpec): { regel: DialogueLine; si: number; li: number }[] {
  return spec.scenes.flatMap((s, si) => s.lines.map((regel, li) => ({ regel, si, li })));
}

/** Is dit een actiebeeld (geen gesproken tekst)? */
export function isActie(l: DialogueLine): boolean {
  return l.kind === "actie";
}

/** Praat hier de verteller in plaats van een personage? */
export function isVerteller(l: DialogueLine): boolean {
  return l.characterId === VERTELLER_ID;
}

/** Heeft dit moment een ingesproken zin? Een actiebeeld mag die hebben (voice-over). */
export function heeftStem(l: DialogueLine): boolean {
  return !!(l.text ?? "").trim();
}

/**
 * Duur van een actiebeeld. Met een voice-over telt de lengte van de zin, want de
 * stem mag nooit afgekapt worden door een te kort beeld.
 */
export function actieDuur(l: DialogueLine): number {
  if (heeftStem(l) && typeof l.audioDuration === "number" && l.audioDuration > 0) return l.audioDuration;
  const s = typeof l.seconden === "number" && Number.isFinite(l.seconden) ? l.seconden : ACTIE_STANDAARD_SEC;
  return Math.max(ACTIE_MIN_SEC, Math.min(ACTIE_MAX_SEC, s));
}

/**
 * Is dit moment volledig gerenderd? Een actiebeeld heeft geen stem, dus daar
 * ontbreekt audioUrl per definitie — zonder dit onderscheid zou zo'n beeld eeuwig
 * "nog te doen" blijven en elke render opnieuw geld kosten.
 */
export function regelKlaar(l: DialogueLine): boolean {
  if (isActie(l)) {
    // Een actiebeeld zonder tekst heeft geen stem nodig; mét voice-over wel.
    return !!l.shotImageUrl && !!l.videoUrl && (!heeftStem(l) || !!l.audioUrl);
  }
  return !!l.shotImageUrl && !!l.audioUrl && !!l.videoUrl;
}

/**
 * De HELFT van het kader waar dit personage staat, bovenste tweederde, als
 * ffmpeg-crop "w:h:x:y".
 *
 * Hiervoor stond hier een klein kadertje dat de mond moest raken, met vaste
 * verhoudingen. Dat werkte niet: waar een gezicht staat verschilt per compositie,
 * en de kaders bleken in de praktijk op de OGEN en het HAAR te vallen. We maten dus
 * knipperen en haarbeweging en noemden dat mondbeweging.
 *
 * Deze zone is bewust grof. Hij dient nog maar één doel: bepalen wannéér er aan
 * deze kant beweging op gang komt, als schatting voor het moment waarop iemand
 * begint te praten. WIE er praat bepalen we niet meer met pixels maar met een
 * visie-model, dat daar aantoonbaar betrouwbaar in is.
 */
export function sprekerHelft(position: CastPosition, breedte: number, hoogte: number): string {
  const h = Math.round(hoogte * 0.66);
  if (position === "center") {
    const w = Math.round(breedte * 0.5);
    return `${w}:${h}:${Math.round(breedte * 0.25)}:0`;
  }
  const w = Math.round(breedte * 0.5);
  const x = position === "left" ? 0 : w;
  return `${w}:${h}:${x}:0`;
}

// ---------------------------------------------------------------------------
// HERHALING TEGENHOUDEN
//
// Een video van twee minuten kwam terug met het verhaal er TWEE KEER in: scène 13
// tot en met 21 waren woord voor woord scène 1 tot en met 9. De oorzaak zit in de
// aanvullus: die krijgt het draaiboek te zien met de opdracht "geef alleen de
// nieuwe scènes", en een taalmodel dat te weinig nieuws weet te bedenken schrijft
// dan gewoon over wat het net gelezen heeft.
//
// De prompt vraagt daar al uitdrukkelijk niet om. Dat bleek niet genoeg, en dit is
// ook geen fout waar je een gebruiker mee kunt opzadelen: hij betaalt per beeld,
// dus een gedupliceerd verhaal kost hem twee keer geld én levert een onbruikbare
// video. Daarom staat er nu een harde zeef achter, die niet van een model afhangt.
// ---------------------------------------------------------------------------

/**
 * Twee omgevingsbeschrijvingen die op hetzelfde neerkomen, herkenbaar maken.
 *
 * Komt dezelfde plek later in het verhaal terug, dan hoort daar hetzelfde beeld
 * bij. Het draaiboek beschrijft zo'n plek meestal woordelijk hetzelfde (daar
 * stuurt de prompt op), maar een lidwoord of een komma verschil mag geen nieuwe
 * kamer opleveren.
 */
export function kaleSetting(setting: string): string {
  return kaal(setting).replace(/\b(a|an|the|with|and|of|in|on)\b/g, "").replace(/\s+/g, " ").trim();
}

/** Tekst zonder leestekens, hoofdletters en dubbele spaties — om te vergelijken. */
function kaal(tekst: string): string {
  return tekst
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Waar we een regel op herkennen: de gesproken zin, of anders de handeling.
 *
 * Bij een actiebeeld telt ALLEEN de handeling, niet de voice-over eroverheen.
 * Eerst deden ze allebei mee, met het idee dat hetzelfde beeld met een nieuwe zin
 * best mag. In de praktijk leverde dat precies de fout op die dit moest tegenhouden:
 * het model plakte de hele reeks beelden er nog een keer achter, nu zonder tekst,
 * en die glipten er dus doorheen. Twee keer exact hetzelfde shot is altijd fout.
 */
function regelVingerafdruk(l: DialogueLine): string {
  if (isActie(l)) return `actie:${kaal(l.actie ?? "")}`;
  return `zeg:${kaal(l.text ?? "")}`;
}

/** Woorden van een regel, voor het vergelijken van bijna-gelijke zinnen. */
function woorden(vinger: string): string[] {
  return vinger.slice(vinger.indexOf(":") + 1).split(" ").filter(Boolean);
}

/**
 * Is dit in de kern dezelfde regel als een die er al staat?
 *
 * Letterlijk vergelijken was niet genoeg: het model schreef "Kom maar binnen, ik
 * heb iets bijzonders" over als "Kom maar binnen, ik heb iets bijzonders om te
 * laten zien" en ontliep de zeef met vier woorden. Daarom kijken we of de kortste
 * van de twee vrijwel helemaal in de andere zit.
 *
 * De drempel staat hoog (90%) en korte regels doen niet mee. Liever een echte
 * herhaling missen dan twee zinnen die toevallig op elkaar lijken weggooien —
 * "dank je wel oma voor de wonderwagen" en "dank je wel oma voor de mooiste reis"
 * moeten allebei mogen blijven staan.
 */
function lijktOp(vinger: string, eerder: Set<string>): boolean {
  if (eerder.has(vinger)) return true;
  const mijn = woorden(vinger);
  if (mijn.length < 5) return false;
  const soort = vinger.slice(0, vinger.indexOf(":"));

  for (const ander of eerder) {
    if (!ander.startsWith(`${soort}:`)) continue;
    const hun = woorden(ander);
    if (hun.length < 5) continue;
    const [kort, lang] = mijn.length <= hun.length ? [mijn, hun] : [hun, mijn];
    const langSet = new Set(lang);
    const overlap = kort.filter((w) => langSet.has(w)).length;
    if (overlap / kort.length >= 0.9) return true;
  }
  return false;
}

export function zonderHerhaling(bestaand: DialogueScene[], nieuw: DialogueScene[]): DialogueScene[] {
  const gezien = new Set<string>();
  for (const scene of bestaand) {
    for (const l of scene.lines) gezien.add(regelVingerafdruk(l));
  }

  const uit: DialogueScene[] = [];
  for (const scene of nieuw) {
    const lines = scene.lines.filter((l) => {
      const vinger = regelVingerafdruk(l);
      // Te kort om iets over te zeggen: laten staan, maar wel onthouden.
      const inhoud = `${kaal(l.text ?? "")} ${kaal(l.actie ?? "")}`.trim();
      if (inhoud.split(" ").filter(Boolean).length < 3) {
        gezien.add(vinger);
        return true;
      }
      if (lijktOp(vinger, gezien)) return false;
      gezien.add(vinger);
      return true;
    });
    if (lines.length > 0) uit.push({ ...scene, lines });
  }
  return uit;
}

/**
 * De personages die in DEZE scène voorkomen, in castvolgorde.
 *
 * Het twee-shot van een scène toonde altijd de hele cast. Met drie personages
 * ging dat nog; met zes staan er mensen in beeld die in die scène niets te
 * zoeken hebben — en het beeldmodel moet ze dan ook nog uit elkaar houden.
 * De verteller telt niet mee: die is een stem, geen figuur.
 */
export function sceneCast(scene: DialogueScene, cast: DialogueCastMember[]): DialogueCastMember[] {
  const ids = new Set(
    scene.lines.map((l) => l.characterId).filter((id) => id && id !== VERTELLER_ID),
  );
  const spelend = cast.filter((c) => ids.has(c.id));
  // Geen enkele match (bijvoorbeeld een scène met alleen verteller of muziek):
  // dan liever de eerste twee dan een leeg beeld zonder mensen.
  return (spelend.length ? spelend : cast).slice(0, MAX_PER_SCENE);
}
