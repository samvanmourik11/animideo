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

import type { DialogueCastMember } from "./dialogue-schema";
import { STORY_STYLE_PRESETS } from "./story-style";
import { kaderRegie, type Kader } from "./verhaal-kaders";

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

/** Stijlregel voor een beeldbewerking: houd exact de stijl van het bronbeeld aan. */
function stijlBewerking(styleId?: string | null): string {
  return (
    `ART STYLE — this is the same video as the source image, so the drawing style must be IDENTICAL: ` +
    `${stijlPreamble(styleId)} Match the source image's exact line quality, colour palette, texture and ` +
    `level of detail. Do not switch to a different illustration style. No text overlays, no watermarks, no logos.`
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
  "colours — never invented lettering, never fake words, never garbled text.";

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
  const uiterlijk = (lid.appearance ?? "").trim();
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
): string {
  const links = cast.find((c) => c.position === "left");
  const rechts = cast.find((c) => c.position === "right");
  const midden = cast.filter((c) => c.position === "center");

  // Het uiterlijk staat er expliciet bij: dit twee-shot is het anker waar alle
  // latere bronbeelden van afgeleid worden, dus wat hier fout staat blijft de hele
  // video fout. Zonder kledingbeschrijving dobberden de personages weg.
  const beschrijf = (c: DialogueCastMember, plek: string) =>
    `${c.name} (${(c.appearance ?? "").trim() || "as shown in the reference"}) stands ${plek}`;
  const opstelling = [
    links ? beschrijf(links, "on the LEFT") : null,
    rechts ? beschrijf(rechts, "on the RIGHT") : null,
    ...midden.map((c) => beschrijf(c, "in the MIDDLE")),
  ].filter(Boolean).join(", ");

  return (
    `${cast.length} colleagues having a conversation with each other in ${setting.trim()}. ` +
    `${opstelling}, turned three-quarters TOWARDS EACH OTHER, facing one another and clearly talking together — ` +
    `NOT looking at the viewer. ${kaderVoorScene(sceneIndex)} ` +
    `They stand on the solid floor or dry ground of this location. Relaxed, natural conversational posture. ` +
    (zelfdeLocatie
      ? `This is the SAME room the characters were in earlier in this video, shown from a different camera ` +
        `position. Keep the location identical to the reference image of it: the same furniture in the same ` +
        `places, the same walls, floor, colours and decorations. Only the camera has moved. `
      : "") +
    // Dit twee-shot is het ANKER voor alle beelden van deze scène, dus de
    // onderlinge lengte die hier ontstaat geldt de rest van de video.
    `Give each person a body height that fits their age; people of the same age are about the same height.` +
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
): string {
  const emo = (emotion || "").trim();
  const emoZin = emo && emo !== "neutraal"
    ? ` Their facial expression reads as "${emo}".`
    : "";

  const luisterZinnen = luisteraars.map((l) =>
    `${aanduiding(l)} is LISTENING quietly: their lips are gently closed in a small attentive smile, ` +
    `their arms hang relaxed and low beside the body — not raised, not gesturing — head tilted very slightly, ` +
    `eyes looking attentively at the person who is speaking.`
  ).join(" ");

  // De naam van de luisteraar staat er expliciet bij. Alleen "de ander" bleek te
  // zwak: dan kwam de vrouwenstem uit de man omdat het model de rollen omdraaide.
  const luisteraarNamen = luisteraars.map((l) => l.name).join(" en ");

  return (
    `EXACTLY ONE person in this illustration has an open mouth: ${aanduiding(spreker)}. ` +
    `Everyone else keeps their mouth CLOSED.\n\n` +
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
        `colours, the same background and props, the same camera framing and the same positions in the frame. ` +
        `Change ONLY their poses and expressions, as follows. `) +
    `${aanduiding(spreker)} — this is ${spreker.name} — is the one SPEAKING: their mouth is clearly OPEN ` +
    `mid-sentence, one hand is raised in an open-palm explaining gesture, leaning very slightly forward, ` +
    `engaged and animated.${emoZin} ` +
    `${luisterZinnen} ` +
    `A calm, receptive listening posture for everyone who is not speaking. ` +
    `To be completely clear: ${spreker.name} talks, ${luisteraarNamen} listen${luisteraars.length === 1 ? "s" : ""} ` +
    `in silence with a closed mouth. Do not swap these roles. ` +
    stijlBewerking(styleId) + MAATVAST +
    NATUURWETTEN
  );
}

/**
 * Bewegingsinstructie voor Seedance: precies één spreker, de rest luistert.
 *
 * Bewust NIET buildMotionPrompt() uit motion-prompt.ts gebruiken — zie punt 3
 * bovenaan dit bestand.
 */
export function buildDialogueMotionPrompt(
  spreker: DialogueCastMember,
  luisteraars: DialogueCastMember[],
  styleId?: string | null
): string {
  const sprekerT = aanduiding(spreker, false);
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
    `${stijlBeweging(styleId)} Static locked camera. Keep the same people, same faces, clothing, ` +
    `colours and background, and keep everyone exactly the same height and build as in the first frame. ` +
    `Do not add another person, new objects or text.`
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
): string {
  const wie = cast
    .map((c) => `${c.name}${(c.appearance ?? "").trim() ? ` (${(c.appearance ?? "").trim()})` : ""}`)
    .join(" and ");

  return (
    `Edit this illustration into a new shot showing an action. Keep the SAME PEOPLE — ${wie} — with the ` +
    `same faces, hair, clothing and colours, and keep the same drawing style. ` +
    `Everything else may change: the setting, the camera distance, their poses and where they stand. ` +
    `The new shot shows: ${actie.trim()}. ` +
    `NOBODY IS TALKING in this shot: every mouth is closed. They are doing something together, not having ` +
    `a conversation, so do not put them face to face unless the action itself calls for it. ` +
    `${kader ? kaderRegie(kader) : "Show the action clearly — a wider shot is fine, the characters may be smaller in frame."} ` +
    stijlBewerking(styleId) + MAATVAST +
    NATUURWETTEN
  );
}

/** Bewegingsinstructie voor een actiebeeld: de handeling zelf, geen gesprek. */
export function buildActionMotionPrompt(actie: string, styleId?: string | null): string {
  return (
    `Animate this illustration. The shot shows: ${actie.trim()}. ` +
    `Bring that action to life with clear, natural movement — the people and objects involved actually move ` +
    `and carry out what is described, at a calm and readable pace. ` +
    `NOBODY SPEAKS in this shot: all mouths stay CLOSED throughout. This is an action beat with music, ` +
    `not a conversation. ` +
    `${stijlBeweging(styleId)} A slow, gentle camera move is allowed if it supports the action. ` +
    `Keep the same people, same faces, clothing and colours. Do not add another person, new text or logos. ` +
    `PHYSICAL RULES: only the PEOPLE move. Vehicles, machines, furniture and equipment stay exactly where ` +
    `they are and keep their shape — nothing drives, folds, opens, collapses, transforms, grows or shrinks. ` +
    `Bodies stay whole and keep their proportions; limbs do not stretch, merge or disappear. ` +
    `Any text already in the image stays exactly as it is.`
  );
}
