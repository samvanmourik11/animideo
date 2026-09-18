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
  /**
   * Wat dit personage draagt, van top tot teen, in het Engels ("orange T-shirt,
   * blue denim shorts, white sneakers").
   *
   * De beschrijving uit de bibliotheek noemt vaak alleen een shirt. De rest
   * verzon het beeldmodel per beeld: Lilly liep buiten op blote voeten en droeg
   * de ene keer een korte broek en de andere keer een spijkerbroek.
   */
  kleding?: string | null;
  /**
   * Door de opzet zelf getekend, niet uit de bibliotheek. Het verhaal van prinses
   * Isabella had niemand in de bibliotheek die paste: geen prinses, geen draak.
   * Het characterId begint dan met "ai-" en verwijst naar geen bibliotheekrij.
   */
  nieuw?: boolean | null;
  /** Id in de personagebibliotheek, zodra een getekend personage daar bewaard is. */
  bibliotheekId?: string | null;
  /**
   * Mens of iets anders. Een draak telt mee als er geteld wordt wie er in beeld is;
   * een vogeltje op de achtergrond bij een gewone scène niet.
   */
  soort?: "mens" | "dier" | "fantasiewezen" | null;
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
  /**
   * Van welke tekening `appearance` en `kleding` beschreven zijn (zie personage-blad.ts).
   * Anders dan de tekening die naar de beelden gaat: de beschrijving is verlopen.
   */
  beschrevenVan?: string | null;
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
import type { VerhaalDeel, VerhaalModus } from "./verhaallijn";

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
  /**
   * Wat je in dit shot ZIET, in het Engels: houding, waar ze naar kijken, en elk
   * ding waar de zin over gaat ("Tyrell crouches next to a white wood anemone,
   * pointing at it").
   *
   * Het beeld per regel kreeg alleen de emotie mee, niet de zin. Zei Tyrell "deze
   * bloem heet een bosanemoon", dan stond er nergens een bloem en moest het
   * videomodel die zelf verzinnen. Dit wordt vóór het storyboard vastgelegd (zie
   * beeldregie.ts), zodat het storyboard toont wat er in de video komt.
   */
  beeld?: string | null;
  /** Wat de gebruiker in het storyboard over dít shot zei. Zie DialogueScene.beeldAanwijzing. */
  beeldAanwijzing?: string | null;
  /**
   * Wat de app van die aanwijzing begreep, in één zin ("Lilly krijgt weer haar volle
   * afro"). Staat bij het beeld, zodat je ziet of "het rechter poppetje" goed begrepen is.
   */
  beeldAanwijzingUitleg?: string | null;
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
  /**
   * Bij welk deel van de verhaallijn deze scène hoort (1 = begin, 5 = slot).
   * Zie verhaallijn.ts. Afwezig bij draaiboeken van vóór de verhaallijn.
   */
  deel?: number | null;
  lines: DialogueLine[];
  // Basis-twee-shot van deze scène: de cast tegenover elkaar in deze omgeving.
  // Elke regel binnen de scène is een bewerking hiervan, zodat de personages
  // tussen regels niet verspringen.
  twoShotUrl?: string | null;
  /**
   * Wat de gebruiker in het storyboard over dit beeld zei ("de boom links, het is
   * al donker"). Blijft bij de scène staan en gaat mee bij elke nieuwe versie van
   * het basisbeeld — anders was de aanwijzing bij de volgende ronde weer vergeten.
   */
  beeldAanwijzing?: string | null;
  /**
   * Het grotere gebied waar deze plek bij hoort ("forest", "grandma's house").
   *
   * Zeven scènes op een wandeling door het bos hadden dezelfde omschrijving en
   * werden zeven keer hetzelfde bospad. Nu krijgt elke scène een eigen plekje,
   * maar scènes in hetzelfde gebied horen er als één bos uit te zien. De beeldregie
   * vult dit in (zie beeldregie.ts).
   */
  gebied?: string | null;
  /**
   * Hoe dat gebied er in élk beeld uitziet (Engels): soort bomen, bodem, planten,
   * seizoen, kleuren. Voor alle scènes in hetzelfde gebied dezelfde tekst.
   *
   * Elk beeld wordt los getekend, en "a lush green forest" liet het model per beeld
   * kiezen: herfstbladeren, een zonnig park, reuzenbloemen, een kleibos. Met één
   * vaste beschrijving per gebied toonden vijf proefbeelden hetzelfde bos.
   * Null = de beeldregie heeft dit nog niet ingevuld; leeg = hij gaf er geen.
   */
  wereld?: string | null;
  /** Is de beeldregie over deze scène gegaan (eigen plek, beeld per regel)? */
  geregisseerd?: boolean | null;
}

/**
 * Een voorwerp dat in het verhaal terugkomt: een wagen, een kaart, een knuffel.
 * `uiterlijk` is Engels, want het gaat rechtstreeks naar het beeldmodel.
 */
export interface DialogueVoorwerp {
  naam: string;
  uiterlijk: string;
  /**
   * Het voorwerpblad: dit voorwerp één keer getekend op een egale achtergrond.
   * Gaat als referentie mee naar elk beeld waarin het voorkomt, net als het
   * castblad voor de personages.
   */
  bladUrl?: string | null;
  /**
   * De tekenstijl (styleId) waarin het blad getekend is. De grote boom werd getekend
   * toen de video nog Flat vector was; na de wissel naar Soft 3D ging het platte
   * boomplaatje mee naar elk shot. Zie voorwerpenVoorStijl.
   */
  bladStijl?: string | null;
  /**
   * Id in de voorwerpenbibliotheek. Zo'n voorwerp ziet er in elke video hetzelfde uit:
   * naam, beschrijving en blad komen uit de bibliotheek. Zie voorwerp-bibliotheek.ts.
   */
  bibliotheekId?: string | null;
  /**
   * Een blad van dit voorwerp uit de bibliotheek in een ándere tekenstijl. Bij het
   * tekenen in deze stijl alleen een voorbeeld voor vorm en kleuren.
   */
  voorbeeldUrl?: string | null;
  /**
   * Andere woorden waarmee het draaiboek dit voorwerp noemt, in beide talen ("boom",
   * "tree", "oak"). Het voorwerp heette "grote boom" en de beschrijvingen van de shots
   * zeiden "a massive oak tree": zonder deze woorden ging het boomplaatje niet mee.
   */
  zoekwoorden?: string[] | null;
}

export interface DialogueSpec {
  version: 1;
  title: string;
  /** Waar het verhaal onderhuids over gaat, in één zin. Stuurt elke schrijfstap. */
  kern?: string | null;
  /** Wat er anders loopt dan verwacht, in één zin. Zonder wending geen verhaal. */
  wending?: string | null;
  /**
   * De verhaallijn uit de opzet: vijf delen van begin tot slot. Blijft bij de spec
   * zodat een latere aanpassing binnen hetzelfde verhaal blijft.
   */
  verhaallijn?: VerhaalDeel[] | null;
  /** Of het verhaal van de gebruiker gevolgd of door ons verzonnen is. Zie verhaallijn.ts. */
  verhaalModus?: VerhaalModus | null;
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
   * Waarvan het castblad getekend is: "blad" = van de houdingenbladen, "portret" = van de
   * karakters uit de bibliotheek. Een castblad uit een andere ronde gaat niet naar de
   * beelden: dan zie je twee verschillende versies van hetzelfde personage door elkaar.
   */
  castSheetVan?: "blad" | "portret" | null;
  /** Voorwerpen die in het verhaal terugkomen en er in elk beeld hetzelfde uit moeten zien. */
  voorwerpen?: DialogueVoorwerp[] | null;
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

/**
 * Het uiterlijk van een personage, klaar voor een beeldprompt of de beeldcontrole.
 *
 * De beschrijvingen uit de bibliotheek zijn automatisch gemaakt en beginnen vaak
 * met "Het personage heeft … Hij draagt …", ook bij een meisje. De beeldcontrole las
 * dat letterlijk, zag Lilly als jongen en keurde goede beelden af — en een beeld met
 * twee Lilly's werd juist doorgelaten, omdat ze "ontbrak". Met de naam op de plek
 * van het voornaamwoord zegt de beschrijving alleen nog wat je ziet.
 */
export function uiterlijkVan(lid: { name: string; appearance?: string | null; kleding?: string | null }): string {
  const naam = lid.name.trim();
  const tekst = (lid.appearance ?? "").trim();
  const basis = naam
    ? tekst
        .replace(/(^|[.!?]\s+)het personage\b/gi, (_m, voor: string) => `${voor}${naam}`)
        .replace(/(^|[.!?]\s+)(?:hij|zij|ze|he|she)\b/gi, (_m, voor: string) => `${voor}${naam}`)
    : tekst;
  // De kleding van top tot teen hoort bij het uiterlijk, anders verzint het
  // beeldmodel per beeld schoenen, broeken en blote voeten.
  const kleding = (lid.kleding ?? "").trim();
  if (!kleding) return basis;
  return `${basis}${basis ? " " : ""}Outfit: ${kleding.replace(/\.?$/, ".")}`;
}

/**
 * De tekening van dit personage die naar ELK beeld gaat.
 *
 * Het houdingenblad (van voren, schuin, opzij) als het er is, anders het karakter uit de
 * bibliotheek. Gemeten op 19-09-2026 met zes shots uit het voetbalverhaal: met het blad
 * had Coco in 5 van de 5 beelden zijn pet, hesje én fluit; met het bibliotheekkarakter
 * klopte 3 van de 15 kenmerken niet. Sam: consistent is belangrijker dan perfect gelijk
 * aan de bibliotheek. Nooit allebei door elkaar — dan kiest het beeldmodel per shot (zie
 * het draakje dat in de ene scène een trui droeg en in de volgende niet).
 */
export function referentieVan(lid: Pick<DialogueCastMember, "modelSheetUrl" | "portraitUrl">): string {
  return (lid.modelSheetUrl ?? "").trim() || lid.portraitUrl;
}
/**
 * Waarvan een castblad getekend hoort te zijn bij deze cast: van de houdingenbladen zodra
 * iedereen er een heeft, anders van de karakters uit de bibliotheek.
 */
export function castbladSoort(cast: Pick<DialogueCastMember, "modelSheetUrl">[]): "blad" | "portret" {
  return cast.length > 0 && cast.every((c) => (c.modelSheetUrl ?? "").trim()) ? "blad" : "portret";
}

/** Meer voorwerpbladen per beeld verdringen het castblad uit de referenties. */
const MAX_VOORWERPEN_PER_BEELD = 2;

/**
 * De vaste voorwerpen die in deze scène voorkomen: bij naam genoemd in de plek,
 * een handeling of een gesproken zin.
 *
 * Alleen die gaan mee naar het beeld. Met de hele lijst erbij zou de Wonderwagen
 * ook bij het fort komen te staan, waar hij in het verhaal niet is.
 */
export function voorwerpenInScene(
  voorwerpen: DialogueVoorwerp[] | null | undefined,
  scene: Pick<DialogueScene, "setting" | "lines">,
  /**
   * Alleen kijken tot en met deze regel. In de oude kamer stond de Wonderwagen al
   * onbedekt náást het kleed waar oma hem nog onder vandaan moest halen: het
   * scènebeeld kreeg de wagen mee omdat hij later in de scène genoemd werd. Wat pas
   * straks onthuld wordt, hoort nog niet in beeld.
   */
  totRegel?: number,
): DialogueVoorwerp[] {
  const regels = typeof totRegel === "number" ? scene.lines.slice(0, totRegel + 1) : scene.lines;
  // Ook wat je in het shot ziet (de beeldregie): de bloem die Lilly aanwijst staat
  // daar bij naam, terwijl haar zin alleen "kijk eens" zegt.
  const tekst = [scene.setting, ...regels.flatMap((l) => [l.actie ?? "", l.text ?? "", l.beeld ?? ""])]
    .join("\n")
    .toLowerCase();
  return (voorwerpen ?? [])
    .filter((v) => v.uiterlijk.trim())
    // Ook de zoekwoorden: het voorwerp heette "grote boom", de beschrijvingen van de
    // shots zeiden "a massive oak tree", en dan ging het boomplaatje niet mee.
    .filter((v) => [v.naam, ...(v.zoekwoorden ?? [])].some((w) => noemtVoorwerp(w, tekst)))
    .slice(0, MAX_VOORWERPEN_PER_BEELD);
}

/** Wordt dit voorwerp in deze tekst genoemd? */
export function noemtVoorwerp(naam: string, tekst: string): boolean {
  const kern = naam.trim().toLowerCase().replace(/^(?:de|het|een|the|an?)\s+/, "");
  const inTekst = tekst.toLowerCase();
  if (kern.length < 2) return false;
  if (inTekst.includes(kern)) return true;
  // "Oma's Wonderwagen" heet in de scène gewoon "de Wonderwagen".
  const laatste = kern.split(/\s+/).pop() ?? "";
  return laatste.length >= 4 && laatste !== kern && inTekst.includes(laatste);
}

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
 * Heeft deze regel iets om te tekenen? Een dialoogregel zonder zin of een
 * actiebeeld zonder handeling slaan we over, in het storyboard én bij de clips.
 */
export function bruikbareRegel(l: DialogueLine): boolean {
  return isActie(l) ? !!(l.actie ?? "").trim() : !!(l.text ?? "").trim();
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

const RANG: Record<CastPosition, number> = { left: 0, center: 1, right: 2 };
const PLEKKEN: CastPosition[][] = [[], ["center"], ["left", "right"], ["left", "center", "right"]];
const zoekNaam = (naam: string) => naam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * De personages die in DEZE scène in beeld horen, met hun plek in dít beeld.
 *
 * Het twee-shot toonde eerst de hele cast; met zes personages stonden er mensen
 * in beeld die er niets te zoeken hadden. Daarna waren het alleen wie er PRAAT —
 * en dan viel wie erbij is maar zwijgt weg. In "Tyrell, Lilly en de Wonderwagen"
 * zei Lilly "Kijk Tyrell" in een Palmentuin zonder Tyrell, en in de wagen stond in
 * de beschrijving "Tyrell, Lilly en oma" terwijl oma niet in de lijst zat: het
 * beeldmodel tekende toen een andere vrouw als oma. Nu tellen ook mee wie volgens
 * de verhaallijn bij dit moment is, en wie in een zin of beeldbeschrijving bij naam
 * genoemd wordt. Sprekers gaan voor als er meer dan drie zijn.
 *
 * De plek (links, midden, rechts) volgt uit hoeveel mensen er in DIT beeld staan.
 * Oma had vast "midden", ook in een scène met alleen Tyrell: dan stond ze het ene
 * shot links en het volgende rechts, en wist de sprekercontrole niet welke mond
 * hij moest volgen. De volgorde van links naar rechts blijft wel gelijk, zodat
 * niemand van kant wisselt. De verteller telt niet mee: die is een stem, geen figuur.
 */
export function sceneCast(
  scene: DialogueScene,
  cast: DialogueCastMember[],
  verhaallijn?: VerhaalDeel[] | null,
): DialogueCastMember[] {
  const sprekers = new Set(scene.lines.map((l) => l.characterId).filter((id) => id && id !== VERTELLER_ID));
  const volgensVerhaal = new Set(scene.deel ? verhaallijn?.[scene.deel - 1]?.wie ?? [] : []);
  const tekst = scene.lines.map((l) => `${l.text ?? ""} ${l.actie ?? ""}`).join(" ");
  const genoemd = (c: DialogueCastMember) =>
    c.name.trim().length >= 2 &&
    new RegExp(`(^|[^\\p{L}])${zoekNaam(c.name.trim())}([^\\p{L}]|$)`, "iu").test(tekst);

  const gewicht = (c: DialogueCastMember) =>
    sprekers.has(c.id) ? 0 : volgensVerhaal.has(c.characterId) ? 1 : genoemd(c) ? 2 : null;
  const inBeeld = cast
    .map((c) => ({ c, g: gewicht(c) }))
    .filter((x): x is { c: DialogueCastMember; g: number } => x.g !== null)
    .sort((a, b) => a.g - b.g)
    .slice(0, MAX_PER_SCENE)
    .map((x) => x.c);

  // Niemand gevonden (bijvoorbeeld alleen muziek zonder namen): dan liever de
  // eerste personages dan een leeg beeld zonder mensen.
  const gekozen = inBeeld.length ? inBeeld : cast.slice(0, MAX_PER_SCENE);
  const opVolgorde = [...gekozen].sort(
    (a, b) => RANG[a.position] - RANG[b.position] || cast.indexOf(a) - cast.indexOf(b),
  );
  return opVolgorde.map((c, i) => ({ ...c, position: PLEKKEN[opVolgorde.length][i] }));
}
