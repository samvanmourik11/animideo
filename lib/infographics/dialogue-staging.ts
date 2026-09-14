// De drie prompts waar de dialoogmodus op draait: het twee-shot van een scène,
// het bronbeeld per gesproken regel, en de bewegingsinstructie voor Seedance.
//
// Deze teksten zijn uit spikes gekomen en elke formulering hier is een gevonden
// oplossing, geen willekeurige woordkeuze. Wat we onderweg hebben geleerd:
//
//  1. POSITIEF STUREN. "De luisteraar houdt zijn mond dicht" werkte niet; het
//     model animeerde toch beide monden. Beschrijven wat de luisteraar WEL doet
//     (knikken, glimlachen met gesloten lippen, armen laag) bracht de verhouding
//     spreker/luisteraar van 3,7x naar 7,1x. Dezelfde les staat in story-style.ts
//     al voor beeldprompts; hij geldt net zo goed voor beweging.
//
//  2. DE LUISTERHOUDING HOORT IN HET BRONBEELD. Als de luisteraar op het startbeeld
//     al ontspannen staat met zijn armen omlaag, hoeft Seedance die houding niet te
//     verzinnen maar alleen vast te houden. Dit was de grootste verbetering.
//
//  3. GEEN BEWAARREGELS UIT motion-prompt.ts. Die is geschreven voor stilstaande
//     infographic-scenes en verbiedt uitdrukkelijk elke arm- of handbeweging. Met
//     die regels erin lieten de personages hun gebaren binnen twee seconden zakken
//     en stonden ze de rest van de clip stil. Voor een gesprek moeten ze eruit.
//
//  4. EEN CLIP DRAAGT EEN BEURT. Geef je een clip twee sprekers, dan bepaalt het
//     model zelf waar de wissel valt en negeert het opgegeven tijdstippen volledig;
//     de stem loopt dan uit de pas met de mond. Eén spreker per clip lost dat op.

import { noemtVoorwerp, uiterlijkVan, type DialogueCastMember, type DialogueVoorwerp } from "./dialogue-schema";
import { STORY_STYLE_PRESETS } from "./story-style";
import { kaderRegie, bewegingRegie, type Kader, type Beweging } from "./verhaal-kaders";
import { beeldSfeer, diepteRegie, type Lichtsoort } from "./verhaal-licht";

/**
 * De gekozen tekenstijl, als zin voor een BEWERKINGS-prompt.
 *
 * Hier stond "Flat vector illustration, same art style as the source" hard in de
 * tekst van elke bewerking. Koos de gebruiker Papercut of Marker Sketch, dan
 * vochten die twee elkaar: het twee-shot werd wél in de gekozen stijl getekend
 * (dat loopt via buildIllustrationPrompt) en élke bewerking daarvan kreeg
 * vervolgens de opdracht er flat vector van te maken. Daardoor zag het ene beeld
 * er anders uit dan het andere, en vielen de actiebeelden — die het verst van het
 * twee-shot af staan — het hardst uit de toon.
 */
function stijlPreamble(styleId?: string | null): string {
  return (STORY_STYLE_PRESETS.find((s) => s.id === styleId) ?? STORY_STYLE_PRESETS[0]).preamble.trim();
}

/**
 * Iedereen houdt dezelfde lichaamsbouw en lengte als op het bronbeeld.
 *
 * Twee kinderen van ongeveer dezelfde leeftijd hebben geen vaste maat in de ogen
 * van een beeldmodel: in de ene scène stak Tyrell boven Lily uit en in de volgende
 * andersom. De personages zelf bleven herkenbaar, maar hun onderlinge verhouding
 * niet — en juist dat maakt dat het niet dezelfde twee lijken.
 */
const MAATVAST =
  " SIZE — everyone keeps exactly the same body height, build and proportions as in the source image. " +
  "Whoever is taller in the source stays taller by the same amount; nobody grows, shrinks or changes age. " +
  "Keep heads, bodies and limbs in the same proportion to each other as in the source.";

/**
 * Licht en sfeer komen uit het beeld van de plek, niet uit een beschrijving.
 *
 * Het beeld van de plek was zacht, met nevel tussen de bomen en zonnestralen; de
 * beelden per zin daarvan waren fel, hard en verzadigd, met exact dezelfde bomen
 * op exact dezelfde plek. Het was dus geen andere zon maar een bewerking die de
 * nevel wegpoetste en contrast en scherpte opvoerde. Twee teksten duwden daar
 * mee: de stijl Soft 3D vraagt "studio lighting", en de lichtregie beschrijft hoe
 * daglicht in het algemeen hoort te zijn — terwijl het beeld van de plek al laat
 * zien hoe het in DEZE scène is.
 */
export const LICHT_UIT_BRON =
  " LIGHT AND ATMOSPHERE — take them exactly from the reference image of this location, not from the style " +
  "description: the same direction, colour and softness of the light, the same haze or mist in the distance, the " +
  "same sun rays if there are any, and the same contrast, brightness and colour saturation. Do not make this image " +
  "sharper, crisper, more contrasty or more saturated than that image, and do not add or remove haze, mist or light rays.";

/** Stijlregel voor een beeldbewerking: houd exact de stijl van het bronbeeld aan. */
function stijlBewerking(styleId?: string | null): string {
  return (
    `ART STYLE — this is the same video as the source image, so the drawing style must be IDENTICAL: ` +
    `${stijlPreamble(styleId)} Match the source image's exact line quality, colour palette, texture and ` +
    `level of detail. Do not switch to a different illustration style. No text overlays, no watermarks, no logos.` +
    // Na de stijl, want die noemt bij Soft 3D zelf een soort licht.
    LICHT_UIT_BRON
  );
}

/** Stijlregel voor een bewegingsprompt. */
function stijlBeweging(styleId?: string | null): string {
  return `Animation style: keep the exact look of the source image — ${stijlPreamble(styleId)}`;
}

/**
 * Natuurwetten voor elk beeld.
 *
 * Een beeldmodel kent geen zwaartekracht en geen maatverhoudingen: het krijgt
 * "ze reinigen lamellen in een ultrasoon bad" en zet de mensen tot hun middel ÍN
 * de tank. Dat is geen animatiefout maar zat al in het stilstaande beeld, dus het
 * hoort hier tegengehouden te worden en niet pas bij een controle achteraf.
 *
 * Ook de brabbeltekst zit hier: vraag je om een beeldscherm of een website, dan
 * vult het model dat met onleesbare letterbrij die pontificaal in beeld staat.
 */
export const NATUURWETTEN =
  " PHYSICAL RULES — the scene must be physically possible. People stand ON THE FLOOR, " +
  "NEXT TO or BEHIND equipment, tanks, containers, water, machines and vehicles — NEVER inside " +
  "them, never submerged, never standing in liquid, never merged with an object. Everyone has two " +
  "arms and two hands, in natural, relaxed positions; no extra or missing limbs. " +
  // "Vijf vingers per hand" vocht met deze getekende stijl, waarin handen juist
  // vereenvoudigd zijn: het model maakte er een vormeloze klomp van. Vraag om
  // een hele, duidelijk leesbare hand in de stijl van de tekening in plaats van
  // om een anatomisch aantal vingers.
  "Draw hands the simple, rounded way this illustration style draws them: each hand whole, clearly readable " +
  "as a hand, with a clean silhouette against whatever is behind it. Never a shapeless blob, never fused " +
  "into an arm, a table, a mug or another person's hand. If a hand rests on a surface or holds an object, " +
  "keep the pose simple and the whole hand visible. " +
  "If the location contains water — a river, the sea, a pool, a tank — the people stand on the DRY BANK " +
  "or shore beside it, with the ground under their feet visible and their whole body above the waterline; " +
  "the water is behind or beside them, never around their legs. " +
  "Objects keep their real-world size relative to people, and rest on a surface that could actually " +
  "support them — nothing floats. Anything a person holds is held in a way a hand can actually hold it. " +
  "If a screen, sign, label or document is visible, leave it BLANK or show only simple shapes and " +
  "colours — never invented lettering, never fake words, never garbled text. " +
  // De synagoge en de moskee "naast elkaar" werden één kerk met een kruis op het
  // dak en een Davidster op de gevel. Het model kent de gebouwen niet bij naam en
  // plakt dan alle symbolen die het bij "gebedshuis" kent op één gevel.
  "A place of worship carries only the symbol of its own faith — a cross only on a church, a Star of David " +
  "only on a synagogue, a crescent only on a mosque — never two faiths' symbols on one building. When in " +
  "doubt, leave the symbol off. " +
  // Bij het paleis wapperde een rood-wit-blauwe vlag met een ster: geen enkel land.
  "Draw a flag only when its exact design is described in this prompt; otherwise leave the flagpole bare. " +
  // Lilly liep buiten op blote voeten en zat binnen bovenop de salontafel.
  "Every human character wears their complete outfit including shoes on both feet — no person is barefoot, " +
  "indoors or outdoors, unless this prompt says so. Animals, dragons and other creatures wear nothing unless described. People sit on chairs, benches, sofas, the floor or the ground — " +
  "never on top of a table.";

const MENSEN = "people|persons|crowds?|tourists|locals|visitors|pedestrians|passers-?by|vendors|shoppers|families|children|kids|residents|onlookers";
const MENSENZIN = new RegExp(
  `(?:\\s*,\\s*(?:and\\s+)?|\\s+(?:and|with|where|full of|filled with)\\s+)` +
    `(?:(?:many|some|a few|several|lots of|a lot of|groups of|other|local)\\s+)?` +
    `(?:${MENSEN})\\b(?!['’])[^,.;]*`,
  "gi",
);

/**
 * De plek zonder mensen erin.
 *
 * De schrijfstap zet er graag sfeer bij: "the Waterkant … and people enjoying the
 * scenery". Het beeldmodel tekent die mensen dan braaf, de controle keurt ze
 * daarna af als figuranten, en na drie betaalde pogingen staan ze er nog. De cast
 * is de cast; wie er verder in beeld komt, staat niet in het verhaal.
 */
export function plekZonderMensen(setting: string): string {
  const schoon = setting.replace(MENSENZIN, "").trim();
  return schoon || setting.trim();
}

/**
 * Geen klassenfoto.
 *
 * Drie personages in één beeld werden bijna altijd een rechte rij die de camera
 * in kijkt: scène na scène dezelfde opstelling, alsof ze voor een foto poseren.
 * Dat is geen losse fout maar het kost het verhaal meer dan welk foutje ook.
 */
export const OPSTELLING =
  " STAGING — compose this like a still from an animated film, not a group photo: the characters are at " +
  "slightly different distances from the camera, their bodies angled towards each other or towards what they " +
  "are looking at, some seen more from the side. Never line everyone up in one straight row facing the camera, " +
  "and nobody looks into the camera. If a left-to-right order is given, keep it.";

/** Iedereen precies één keer. Een scène kreeg twee Lilly's naast elkaar. */
export function iederEenKeer(namen: string[]): string {
  return `Each of them — ${namen.join(", ")} — appears exactly ONCE in the image; nobody is drawn twice.`;
}

/**
 * Kaders waarin iedereen die in het shot hoort ook echt zichtbaar is. Bij een
 * close-up of een detail valt de rest er vanzelf buiten.
 */
export function iedereenZichtbaar(kader: Kader | null | undefined): boolean {
  return kader !== "close" && kader !== "extreme-close" && kader !== "detail";
}

const ZIT = /\b(?:sit|sits|sitting|sat|seated)\b|\bat (?:the|a) (?:\w+ )?table\b|\bzit(?:ten)?\b|\bzaten\b|\baan (?:de )?tafel\b/gi;
const OPGESTAAN = /\b(?:stand|stands|standing|stood|get up|gets up|got up|walk|walks|walking|walked|run|runs|running|step|steps|stepping|stepped)\b|\bop(?:ge)?staan\b|\bstaat op\b|\bstond(?:en)? op\b|\bloopt\b|\blopen\b|\bliep(?:en)?\b/gi;

function laatstePlek(tekst: string, patroon: RegExp): number {
  let plek = -1;
  for (const m of tekst.matchAll(patroon)) plek = m.index ?? plek;
  return plek;
}

/**
 * Zitten ze nog? Kijkt naar het laatste actiebeeld vóór regel `tot` in deze
 * scène dat iets over zitten of staan zegt.
 *
 * Tyrell en Lilly zaten in het actiebeeld aan tafel bij oma, en in de gesproken
 * regel direct daarna stonden ze ineens midden in de kamer: elk shot wordt los
 * getekend en wist niet hoe het vorige eindigde.
 */
export function zitHouding(lines: { kind?: string | null; actie?: string | null }[], tot: number): boolean {
  for (let i = Math.min(tot, lines.length) - 1; i >= 0; i--) {
    const l = lines[i];
    if (l.kind !== "actie") continue;
    const actie = (l.actie ?? "").trim();
    const zit = laatstePlek(actie, ZIT);
    const staat = laatstePlek(actie, OPGESTAAN);
    // Een handeling die niets over de houding zegt ("ze kijken elkaar aan")
    // verandert er ook niets aan: dan kijken we verder terug.
    if (zit < 0 && staat < 0) continue;
    return zit > staat;
  }
  return false;
}

/**
 * Zegt deze handeling zelf iets over zitten of staan? Zo niet, dan hoort een
 * actiebeeld de houding van het vorige beeld aan te houden: "Tyrell en Lilly kijken
 * elkaar nieuwsgierig aan" stond ineens midden in de kamer, terwijl ze net nog aan
 * tafel zaten.
 */
export function zegtIetsOverHouding(actie: string | null | undefined): boolean {
  const tekst = (actie ?? "").trim();
  return laatstePlek(tekst, ZIT) >= 0 || laatstePlek(tekst, OPGESTAAN) >= 0;
}

/**
 * Een model sheet is één personage, drie keer getekend.
 *
 * Elk shot krijgt per personage zo'n blad mee (voren, schuin, opzij). Zonder uitleg
 * leest het beeldmodel daar drie mensen in, en tekent het er één dubbel: twee
 * Tyrells naast oma, een tweede Lilly aan de Waterkant.
 */
export const MODELBLAD_UITLEG =
  "Some reference images are MODEL SHEETS: each one shows a SINGLE character drawn three times — from the " +
  "front, at an angle and from the side. That is one person seen from three sides, not three people. Draw " +
  "every character only once.";

export const ZITTEN_REGEL =
  "POSE CONTINUITY — in the previous shot of this scene the characters were SITTING. They are still seated in " +
  "the same places now: nobody is standing up.";

/**
 * Voorwerpen die in het verhaal terugkomen, zoals ze er in élk beeld uitzien.
 *
 * De Wonderwagen was onder het kleed een fauteuil, van binnen een tram, aan het
 * water een paars busje en thuis een gele jeep met koffers. Zonder vaste
 * beschrijving verzint het beeldmodel hem per beeld opnieuw.
 */
export function voorwerpRegie(
  voorwerpen: DialogueVoorwerp[] | null | undefined,
  /** Wat er in dit shot gebeurt. Noemt het een voorwerp, dan moet dat duidelijk in beeld. */
  handeling?: string | null,
): string {
  const bekend = (voorwerpen ?? []).filter((v) => v.naam.trim() && v.uiterlijk.trim());
  if (!bekend.length) return "";
  const metBlad = bekend.some((v) => (v.bladUrl ?? "").trim());
  // "Oma haalt het doek eraf en onthult de Wonderwagen" — en in beeld zat Lilly op
  // een tafeltje vóór de wagen, die half achter haar en het doek verdween. Het
  // belangrijkste moment van het verhaal, en je zag het niet.
  const hoofdrol = handeling ? bekend.filter((v) => noemtVoorwerp(v.naam, handeling)) : [];
  return (
    `RECURRING OBJECTS — whenever one of these appears in this image, it looks exactly like this: ` +
    bekend.map((v) => `${v.naam.trim()}: ${v.uiterlijk.trim().replace(/\.?$/, ".")}`).join(" ") +
    (metBlad
      ? " A reference image shows this object on a plain background: copy its shape, colours and details " +
        "exactly, but draw it inside this scene at a believable size next to the people. Do not copy the plain " +
        "background and never show the reference sheet itself."
      : "") +
    // In de oude kamer stonden er twee Wonderwagens, elk zo groot als een speelgoedkar.
    ` There is never more than ONE of each of these objects in the image. Each keeps its real size next to the ` +
    `people: something people sit or ride in is bigger than they are — never a toy or a miniature.` +
    " If the scene takes place INSIDE the object, its walls, windows and seats match those colours and details." +
    (hoofdrol.length
      ? ` In this shot the ${hoofdrol.map((v) => v.naam.trim()).join(" and ")} is clearly and fully visible — it ` +
        `matters to what happens here, so nobody stands or sits in front of it and it is not cut off by the frame.`
      : "")
  );
}

/**
 * De vrije illustratie-briefing van de gebruiker, klaar om als extra context aan
 * een beeldprompt mee te geven. Expliciet aangekondigd als regieaanwijzing, want
 * losse zinnen achteraan een prompt worden anders als scènebeschrijving gelezen
 * en dan verschijnt de briefing zélf in beeld.
 *
 * Geldt voor ELK beeld in de video (twee-shots én de bronbeelden per regel), zodat
 * kleur, sfeer en kleding niet halverwege omslaan.
 */
export function illustratieContext(brief?: string | null): string | undefined {
  const tekst = (brief ?? "").trim();
  if (!tekst) return undefined;
  return (
    `ART DIRECTION for this illustration — follow these instructions from the client, ` +
    `they describe HOW the image should look, they are not something to draw or write in the image: ${tekst}`
  );
}

/**
 * Hoe we één personage in een prompt aanwijzen.
 *
 * Bewust ZOWEL de plek als het uiterlijk: "the person in the green sweater on the
 * left". Alleen de plek bleek te zwak — zodra het beeldmodel de personages net
 * anders neerzet, of het videomodel links/rechts anders leest, begon de verkeerde
 * te praten. Kleding is een tweede houvast dat niet verschuift.
 */
function aanduiding(lid: DialogueCastMember, hoofdletters = true): string {
  const plek = lid.position === "left" ? "on the left"
    : lid.position === "right" ? "on the right"
    : "in the middle";
  const uiterlijk = uiterlijkVan(lid);
  const wie = uiterlijk ? `the person ${plek} (${uiterlijk})` : `the person ${plek}`;
  // Alleen het "the person ... left/right"-deel in kapitalen; het uiterlijk tussen
  // haakjes blijft leesbaar, want SCHREEUWENDE beschrijvingen sturen slechter.
  if (!hoofdletters) return wie;
  return uiterlijk ? `THE PERSON ${plek.toUpperCase()} (${uiterlijk})` : `THE PERSON ${plek.toUpperCase()}`;
}

/**
 * Het basis-twee-shot van een scène: de cast tegenover elkaar in de omgeving.
 * Elke regel binnen de scène wordt een BEWERKING hiervan, zodat de personages
 * niet tussen regels verspringen.
 *
 * De portretten gaan als karakter-referentie mee (identiteit), de setting bepaalt
 * de plek. Cruciaal is dat ze naar ELKAAR gedraaid staan en niet naar de camera —
 * dat laatste was precies wat de oude pratende-koppen-opzet zo levenloos maakte.
 */
/**
 * Camerastandpunten die per scène wisselen.
 *
 * Elke scène kreeg exact hetzelfde kader ("medium-wide shot, whole body"), en
 * omdat elk regelbeeld een BEWERKING van dat kader is, was de halve video
 * hetzelfde plaatje: dezelfde twee mensen, dezelfde afstand, negen keer achter
 * elkaar. Deze rotatie wisselt alleen afstand en ooghoogte — links blijft links
 * en rechts blijft rechts, want daar hangt de sprekerherkenning aan, en beide
 * personages blijven altijd volledig in beeld.
 */
const KADERS: string[] = [
  "Medium-wide shot at eye level: their WHOLE BODY is visible, feet included, with space between them and " +
    "the room clearly visible around and behind them.",
  "Wider establishing shot: the two of them stand a little smaller in the frame, off to one side, with much " +
    "more of the location visible around them — you can see where this place is. Whole bodies still visible.",
  "Medium shot, a step closer at eye level: framed from the knees up, so their faces and hands read clearly " +
    "while the location stays recognisable behind them.",
  "Medium-wide shot from a slight three-quarter angle, as if the camera stepped to one side of the room: you " +
    "see the space opening up behind them. Whole bodies visible, feet included.",
  "Medium shot from a slightly lower camera, near a child's eye height: framed from the knees up, warm and " +
    "close, with the ceiling or upper part of the room just visible behind them.",
];

/** Het kader voor scène `index`. Loopt rond zodra de reeks op is. */
export function kaderVoorScene(index: number): string {
  return KADERS[((index % KADERS.length) + KADERS.length) % KADERS.length];
}

export function buildTwoShotBrief(
  setting: string,
  cast: DialogueCastMember[],
  sceneIndex = 0,
  /**
   * Is deze scène op een plek die al eerder getekend is, dan gaat dat beeld mee
   * als referentie. Zonder dat werd oma's woonkamer elke keer een andere kamer:
   * andere bank, andere boom, open haard aan de andere muur.
   */
  zelfdeLocatie = false,
  licht?: Lichtsoort | null,
  /** Zitten ze bij het begin van de scène (aan tafel, in de wagen)? Zie zitHouding. */
  zit = false,
): string {
  const plek = plekZonderMensen(setting);
  const links = cast.find((c) => c.position === "left");
  const rechts = cast.find((c) => c.position === "right");
  const midden = cast.filter((c) => c.position === "center");

  // Het uiterlijk staat er expliciet bij: dit twee-shot is het anker waar alle
  // latere bronbeelden van afgeleid worden, dus wat hier fout staat blijft de hele
  // video fout. Zonder kledingbeschrijving dobberden de personages weg.
  const beschrijf = (c: DialogueCastMember, plek: string) =>
    `${c.name} (${uiterlijkVan(c) || "as shown in the reference"}) stands ${plek}`;
  // Bij één personage is links/rechts betekenisloos: die staat gewoon in beeld.
  // "Stands on the LEFT" liet het model de rechterhelft opvullen — met een tweede
  // figuur die er niet hoort.
  const opstelling = cast.length === 1
    ? beschrijf(cast[0], "in the frame")
    : [
        links ? beschrijf(links, "on the LEFT") : null,
        rechts ? beschrijf(rechts, "on the RIGHT") : null,
        ...midden.map((c) => beschrijf(c, "in the MIDDLE")),
      ].filter(Boolean).join(", ");

  // Met één personage bestaat er geen "naar elkaar toe gedraaid". Zonder deze
  // splitsing kreeg een scene met één figuur de opdracht zich naar een tweede
  // persoon te draaien die er niet is — en dan tekent het model er alsnog een bij.
  const alleen = cast.length === 1;
  return (
    (alleen
      ? `${cast[0]?.name ?? "One character"} alone in ${plek}. ${opstelling}, absorbed in the moment and ` +
        `NOT looking at the viewer. There is nobody else in this shot. `
      : `${cast.length} characters together in ${plek}. ` +
        `${opstelling}, turned three-quarters TOWARDS EACH OTHER, facing one another and clearly talking together — ` +
        `NOT looking at the viewer. `) +
    `${kaderVoorScene(sceneIndex)} ` +
    (zit
      ? `They are SITTING in this location — on chairs, a bench or seats that fit the place — not standing. `
      : `They stand on the solid floor or dry ground of this location. `) +
    `Relaxed, natural conversational posture. ` +
    (alleen ? "" : `${OPSTELLING.trim()} `) +
    (zelfdeLocatie
      ? `This is the SAME room the characters were in earlier in this video, shown from a different camera ` +
        `position. Keep the location identical to the reference image of it: the same furniture in the same ` +
        `places, the same walls, floor, colours and decorations. Only the camera has moved. `
      : "") +
    // Dit twee-shot is het ANKER voor alle beelden van deze scène, dus de
    // onderlinge lengte die hier ontstaat geldt de rest van de video.
    `Give each person a body height that fits their age; people of the same age are about the same height.` +
    // Na de tekenstijl, want die schrijft bij Soft 3D "studio lighting" voor.
    beeldSfeer(licht, null) +
    NATUURWETTEN
  );
}

/**
 * Bronbeeld voor één gesproken regel: bewerking van het twee-shot waarin dit
 * personage praat en de anderen zichtbaar luisteren.
 *
 * Let op de asymmetrie in de formulering: de spreker krijgt een handeling, de
 * luisteraar krijgt een HOUDING (armen laag, lippen gesloten, aandachtig). Die
 * houding is wat Seedance daarna vasthoudt.
 */
export function buildTurnShotPrompt(
  spreker: DialogueCastMember,
  luisteraars: DialogueCastMember[],
  emotion?: string | null,
  styleId?: string | null,
  kader?: Kader | null,
  /** Wat je in dit shot ziet, uit de beeldregie. Zie DialogueLine.beeld. */
  beeld?: string | null,
): string {
  const emo = (emotion || "").trim();
  const emoZin = emo && emo !== "neutraal"
    ? ` Their facial expression reads as "${emo}".`
    : "";
  // Uit de beeldregie. De bloem waar Tyrell over praat hoort in dit beeld, niet
  // pas in de beweging: wat hier ontbreekt, verzint het videomodel.
  const beeldTekst = (beeld ?? "").trim();
  const watJeZiet = beeldTekst
    ? `In this shot we see: ${beeldTekst.replace(/\.?$/, ".")} Add or adjust only what that needs — the people ` +
      `stay exactly who they are. `
    : "";

  // Zonder luisteraar is er niemand om stil te houden. De regels hieronder gaan
  // allemaal over "de ander"; met een lege lijst zou de prompt over iemand praten
  // die er niet is, en dan tekent het model die er alsnog bij.
  const solo = luisteraars.length === 0;
  const luisterZinnen = luisteraars.map((l) =>
    `${aanduiding(l)} is LISTENING quietly: their lips are gently closed in a small attentive smile, ` +
    `their arms hang relaxed and low beside the body — not raised, not gesturing — head tilted very slightly, ` +
    `eyes looking attentively at the person who is speaking.`
  ).join(" ");

  // De naam van de luisteraar staat er expliciet bij. Alleen "de ander" bleek te
  // zwak: dan kwam de vrouwenstem uit de man omdat het model de rollen omdraaide.
  const luisteraarNamen = luisteraars.map((l) => l.name).join(" en ");

  return (
    (solo
      ? `EXACTLY ONE person is in this illustration: ${spreker.name}, and their mouth is open because they are ` +
        `speaking. There is NOBODY ELSE in the shot — do not add a listener, a bystander or a second figure.\n\n`
      : `EXACTLY ONE person in this illustration has an open mouth: ${aanduiding(spreker)}. ` +
        `Everyone else keeps their mouth CLOSED.\n\n`) +
    // Zonder kader blijft het oude gedrag: alleen houding en mond veranderen, kader
    // gelijk. Mét kader mag de camera wél verschuiven — dat is precies waar de
    // afwisseling vandaan moet komen. De plek en de mensen blijven hoe dan ook
    // hetzelfde; anders springt het verhaal alsnog van kamer naar kamer.
    (kader
      ? `Edit this illustration into a NEW SHOT of the same moment in the same place. Keep the same people — ` +
        `same faces, hair, clothing and colours — and the same location, furniture and lighting. ` +
        `The CAMERA MOVES to a new position: ${kaderRegie(kader)} ` +
        `Their poses and expressions change as follows. `
      : `Edit this illustration. Keep EVERYTHING identical — the same people, the same faces, hair, clothing, ` +
        `colours, the same background${beeldTekst ? "" : " and props"}, the same camera framing and the same positions in the frame. ` +
        `Change ONLY their poses and expressions${beeldTekst ? ", and what this shot needs to show" : ""}, as follows. `) +
    watJeZiet +
    `${aanduiding(spreker)} — this is ${spreker.name} — is the one SPEAKING: their mouth is clearly OPEN ` +
    `mid-sentence, one hand is raised in an open-palm explaining gesture, leaning very slightly forward, ` +
    `engaged and animated.${emoZin} ` +
    (solo
      // Zonder deze splitsing werd het "To be completely clear: X talks,  listens
      // in silence" — een halve zin over een luisteraar die er niet is.
      ? `${spreker.name} is alone in this shot. `
      : `${luisterZinnen} ` +
        `A calm, receptive listening posture for everyone who is not speaking. ` +
        `To be completely clear: ${spreker.name} talks, ${luisteraarNamen} listen${luisteraars.length === 1 ? "s" : ""} ` +
        `in silence with a closed mouth. Do not swap these roles. `) +
    stijlBewerking(styleId) + MAATVAST +
    NATUURWETTEN
  );
}

/**
 * Alles wat er in de clip te zien is, staat al in het eerste frame.
 *
 * Het beeld per shot ligt sinds het storyboard per zin vast en is door de
 * gebruiker bekeken. Wat de beweging daarna nog toevoegt — een bloem die ineens
 * opduikt, een stuk bos dat de camera onthult — heeft niemand gezien, en juist
 * daar kwamen de fouten vandaan.
 */
export const NIETS_NIEUWS =
  " NOTHING NEW — everything in this clip is already in the first frame. No object, animal, plant or person " +
  "appears, grows or enters the frame, and the camera never reveals anything the first frame does not already " +
  "show. Only what is already there moves.";

/**
 * Bewegingsinstructie voor Seedance: precies één spreker, de rest luistert.
 *
 * Bewust NIET buildMotionPrompt() uit motion-prompt.ts gebruiken — zie punt 3
 * bovenaan dit bestand.
 */
export function buildDialogueMotionPrompt(
  spreker: DialogueCastMember,
  luisteraars: DialogueCastMember[],
  styleId?: string | null,
  beweging?: Beweging | null,
): string {
  const sprekerT = aanduiding(spreker, false);
  // Zonder luisteraar is er niemand om stil te houden. De regels hieronder gaan
  // allemaal over "de ander"; met een lege lijst zou de prompt over iemand praten
  // die er niet is, en dan tekent het model die er alsnog bij.
  const solo = luisteraars.length === 0;
  const luisterZinnen = luisteraars.map((l) =>
    `${aanduiding(l, false).replace(/^the/, "The")} is the listener and stays in a calm listening pose for the whole clip: ` +
    `lips gently pressed together in a small closed-mouth smile, nodding slowly in agreement, blinking, ` +
    `head tilting slightly, arms staying relaxed and low. Their face stays quiet and still apart from nodding and blinking.`
  ).join(" ");

  // Het bronbeeld toont al wie er praat (mond open) en wie luistert (mond dicht).
  // Die aanwijzing herhalen we hier, want als het videomodel de rollen omdraait
  // komt de verkeerde stem uit de verkeerde persoon — de storendste fout die er is.
  return (
    `Animate this illustration as a conversation. ` +
    `IMPORTANT: in the source image exactly one person already has an open mouth — that is the speaker. ` +
    `Keep it that way for the entire clip; never swap who is talking. ` +
    `${sprekerT.replace(/^the/, "The")} is the speaker and does the talking for the whole clip: mouth opening and closing ` +
    `continuously and expressively, hands gesturing actively while explaining, head moving naturally with the speech. ` +
    `${luisterZinnen} ` +
    `Exactly one person is talking in this clip and it is ${sprekerT}. ` +
    `The other person's mouth NEVER opens, not even briefly. ` +
    `Everyone keeps facing each other and never turns towards the viewer. ` +
    // "Static locked camera" stond hier, en dat is precies wat je kreeg: bank,
    // kussens en lamp op exact dezelfde pixels, alleen wat geschuifel. In het
    // Lelijke Eendje beweegt de camera bijna altijd — daar is de beeldverandering
    // van frame op frame ongeveer drie keer zo groot als bij ons.
    `${stijlBeweging(styleId)} CAMERA: ${bewegingRegie(beweging)} ` +
    `The camera move is slow, smooth and continuous from the first frame to the last — never a jump, never a ` +
    `shake, and it never cuts to a different shot. ` +
    `Keep the same people, same faces, clothing, ` +
    `colours and background, and keep everyone exactly the same height and build as in the first frame. ` +
    `Do not add another person, new objects or text.` +
    NIETS_NIEUWS
  );
}

// ---------------------------------------------------------------------------
// ACTIEBEELDEN
//
// Een dialoogvideo die alleen uit pratende twee-shots bestaat staat stil: dezelfde
// mensen, dezelfde opstelling, alleen andere woorden. Actiebeelden brengen het
// verhaal vooruit — samen op weg, ergens aankomen, iets ontdekken — zonder dat er
// gesproken wordt.
//
// Daarom gelden hier bewust ANDERE regels dan bij een dialoogbeeld:
//  - monden DICHT (er wordt niet gepraat, dus pratende monden zijn juist fout),
//  - de opstelling mag los: naast elkaar, van opzij, van achteren, in beweging,
//  - de camera mag verder weg, want de handeling is het onderwerp en niet het gezicht.
// ---------------------------------------------------------------------------

/**
 * Bronbeeld voor een actiebeeld: een bewerking van het scène-twee-shot waarin de
 * personages de beschreven handeling uitvoeren.
 */
export function buildActionShotPrompt(
  cast: DialogueCastMember[],
  actie: string,
  styleId?: string | null,
  kader?: Kader | null,
  /** Wat je in dit shot ziet, uit de beeldregie. Zie DialogueLine.beeld. */
  beeld?: string | null,
): string {
  const wie = cast
    .map((c) => `${c.name}${uiterlijkVan(c) ? ` (${uiterlijkVan(c)})` : ""}`)
    .join(" and ");
  const beeldTekst = (beeld ?? "").trim();

  return (
    `Edit this illustration into a new shot showing an action. Keep the SAME PEOPLE — ${wie} — with the ` +
    `same faces, hair, clothing and colours, and keep the same drawing style. ` +
    `Everything else may change: the setting, the camera distance, their poses and where they stand. ` +
    `The new shot shows: ${actie.trim()}. ` +
    (beeldTekst
      ? `In detail, you see: ${beeldTekst.replace(/\.?$/, ".")} Everything named here is clearly visible. `
      : "") +
    // Een actiebeeld bij Fort Zeelandia kreeg "Zeelamdia Freelandd" op de muur: het
    // model schrijft de naam van een plek er graag op, en dan met fouten.
    `There is NO written text anywhere in the image: no letters, words, name plates, signs or labels, ` +
    `not on buildings, not on objects. A famous place is recognised by its shape, never by its name written on it. ` +
    `NOBODY IS TALKING in this shot: every mouth is closed. They are doing something together, not having ` +
    `a conversation, so do not put them face to face unless the action itself calls for it. ` +
    `${kader ? kaderRegie(kader) : "Show the action clearly — a wider shot is fine, the characters may be smaller in frame."} ` +
    stijlBewerking(styleId) + MAATVAST +
    NATUURWETTEN
  );
}

/** Bewegingsinstructie voor een actiebeeld: de handeling zelf, geen gesprek. */
export function buildActionMotionPrompt(actie: string, styleId?: string | null, beweging?: Beweging | null): string {
  return (
    // "The shot shows" las het videomodel als opdracht om te laten zien wat er nog
    // niet stond. Het eerste frame komt uit het storyboard en toont het al.
    `Animate this illustration. The first frame already shows: ${actie.trim()}. ` +
    `Bring that action to life with clear, natural movement — the people and objects involved actually move ` +
    `and carry out what is described, at a calm and readable pace. ` +
    `NOBODY SPEAKS in this shot: all mouths stay CLOSED throughout. This is an action beat with music, ` +
    `not a conversation. ` +
    `${stijlBeweging(styleId)} CAMERA: ${bewegingRegie(beweging)} ` +
    `The camera move is slow, smooth and continuous from the first frame to the last — never a jump, never a ` +
    `shake, and it never cuts to a different shot. ` +
    `Keep the same people, same faces, clothing and colours. Do not add another person, new text or logos. ` +
    `${NIETS_NIEUWS.trim()} ` +
    `PHYSICAL RULES: only the PEOPLE move. Vehicles, machines, furniture and equipment stay exactly where ` +
    `they are and keep their shape — nothing drives, folds, opens, collapses, transforms, grows or shrinks. ` +
    `Bodies stay whole and keep their proportions; limbs do not stretch, merge or disappear. ` +
    `Any text already in the image stays exactly as it is.`
  );
}

/**
 * EEN SHOT VANAF NUL — niet als bewerking van het scènebeeld.
 *
 * Tot nu toe was élk shot een BEWERKING van het ene scènebeeld: "zet die mond
 * open, die dicht". Zolang dat de enige wijziging was, bleef de rest staan. Maar
 * sinds we er "en verplaats de camera" bij vragen, moet het model bijna het hele
 * plaatje opnieuw tekenen — en bij elk nieuw plaatje verzint het het haar en de
 * kleding van een personage opnieuw. In één video van een minuut sprong Lily's
 * haar van middenbruin naar bijna zwart naar lichtbruin met blonde strepen, werd
 * de jongen een tweede Lily, en stond er ineens een volwassen vrouw in beeld.
 *
 * Deze briefing beschrijft het shot volledig, zodat het model niets hoeft te
 * "verbouwen". Identiteit komt uit de meegestuurde model sheets, de plek uit het
 * scènebeeld als referentie — maar het beeld zelf wordt nieuw getekend.
 */
export function buildShotPrompt(input: {
  setting: string;
  /** Wie er in dit shot staat. De eerste is de spreker als er gepraat wordt. */
  inBeeld: DialogueCastMember[];
  spreker?: DialogueCastMember | null;
  emotion?: string | null;
  /** Bij een actiebeeld: wat er gebeurt (Engels). */
  actie?: string | null;
  /** Wat je in dit shot ziet, uit de beeldregie (Engels). Zie DialogueLine.beeld. */
  beeld?: string | null;
  kader?: Kader | null;
  styleId?: string | null;
  licht?: Lichtsoort | null;
}): string {
  const { setting, inBeeld, spreker, emotion, actie, beeld, kader, styleId, licht } = input;

  const wie = inBeeld
    .map((c) => {
      const uiterlijk = uiterlijkVan(c);
      const leeftijd = (c.leeftijd ?? "").trim();
      return `${c.name}${leeftijd ? ` (${leeftijd})` : ""}${uiterlijk ? ` — ${uiterlijk}` : ""}`;
    })
    .join("; ");

  const emo = (emotion ?? "").trim();
  const emoZin = emo && emo !== "neutraal" ? ` Their expression reads as "${emo}".` : "";

  const meer = inBeeld.length > 1;
  const wieDoetWat = actie?.trim()
    ? `What happens in this shot: ${actie.trim()} Nobody is speaking — every mouth stays closed.` +
      // "Oma stond op en liep naar de oude kamer" noemt alleen oma, en dan tekende
      // het model alleen oma — terwijl de kinderen met haar meeliepen.
      (meer && iedereenZichtbaar(kader)
        ? ` All ${inBeeld.length} of them are visible in this shot, even if the description names only some of ` +
          `them: the others are right there with them.`
        : "")
    : spreker
      ? `${spreker.name} is SPEAKING: their mouth is clearly open mid-sentence, alive and engaged, looking at ` +
        `the person they talk to.${emoZin} ` +
        (meer
          ? `Everyone else listens in silence with a closed mouth and a calm, attentive posture, turned towards ` +
            `${spreker.name} and looking at them — not at the viewer.`
          : `There is nobody else in this shot — do not add a listener, a bystander or a second figure.`)
      : `Nobody is speaking in this shot — every mouth stays closed.`;

  // Een detail is een voorwerp, geen groepsportret. Hier stond ook bij een detail
  // "IN THIS SHOT: 2 characters", terwijl het kader "no faces" vraagt: het model
  // tekende dan een van de twee, en het voorwerp viel weg.
  const detail = kader === "detail";
  const namen = inBeeld.map((c) => c.name).join(" or ") || "a character";
  // Uit de beeldregie. Wat hier niet getekend wordt, moet de beweging later
  // verzinnen — en dat is precies wat het storyboard per zin moet voorkomen.
  const watJeZiet = (beeld ?? "").trim()
    ? `WHAT YOU SEE IN THIS SHOT: ${(beeld ?? "").trim().replace(/\.?$/, ".")} Everything named here is clearly ` +
      `visible and recognisable in this image. `
    : "";

  return (
    `A single illustration for an animated children's story. ` +
    `LOCATION: ${plekZonderMensen(setting)} ` +
    (detail
      ? `IN THIS SHOT: no faces and no full characters — this is a close insert of an object. At most a hand or ` +
        `arm of ${namen} may reach into the frame. There is nobody else in the frame. `
      : `IN THIS SHOT: ${inBeeld.length} character${inBeeld.length === 1 ? "" : "s"} — ${wie}. ` +
        `There is nobody else in the frame: no extra children, no extra adults, no bystanders, no background figures. ` +
        `${iederEenKeer(inBeeld.map((c) => c.name))} ` +
        // "Oma legt de kinderen iets uit" leverde een groepje extra kinderen op de
        // achtergrond op: het model las "de kinderen" als nieuwe mensen.
        `Words like "the children", "the kids", "the family" or "everyone" mean exactly these characters, never extra people. `) +
    `${kaderRegie(kader)} ` +
    `${wieDoetWat} ` +
    watJeZiet +
    (meer && iedereenZichtbaar(kader) ? `${OPSTELLING.trim()} ` : "") +
    // De plek moet hetzelfde blijven als de rest van de scene; die komt uit het
    // meegestuurde scenebeeld. Alleen het standpunt en de houdingen verschillen.
    // Het licht hoort daarbij: anders koos elk shot zijn eigen zon.
    `One reference image shows this same location earlier in the story: keep the room, furniture, colours and ` +
    `the light — where it comes from, its colour and brightness — the same as there. Only the camera position ` +
    `and the characters' poses differ. ` +
    stijlBewerking(styleId) + MAATVAST +
    // De sfeer komt NA de tekenstijl: die schrijft bij Soft 3D "gentle soft studio
    // lighting" voor, en dat wint als het als laatste in de prompt staat. Dan is
    // elke nachtscene alsnog een helder verlicht speelgoedtafereel.
    // Alleen de scherptediepte. Het licht zelf komt uit het beeld van de plek (zie
    // LICHT_UIT_BRON in stijlBewerking): een beschrijving van daglicht in het
    // algemeen poetste de nevel weg die het beeld van déze plek wel had.
    diepteRegie(kader) +
    NATUURWETTEN
  );
}
