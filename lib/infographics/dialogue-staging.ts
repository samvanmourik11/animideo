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
  "arms, two hands and five fingers per hand, in natural positions; no extra or missing limbs. " +
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
export function buildTwoShotBrief(setting: string, cast: DialogueCastMember[]): string {
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
    `NOT looking at the viewer. Medium-wide shot: everyone fully visible from the knees up, with space between them. ` +
    `Relaxed, natural conversational posture.` +
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
  emotion?: string | null
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
    `Edit this illustration. Keep EVERYTHING identical — the same people, the same faces, hair, clothing, ` +
    `colours, the same background and props, the same camera framing and the same positions in the frame. ` +
    `Change ONLY their poses and expressions, as follows. ` +
    `${aanduiding(spreker)} — this is ${spreker.name} — is the one SPEAKING: their mouth is clearly OPEN ` +
    `mid-sentence, one hand is raised in an open-palm explaining gesture, leaning very slightly forward, ` +
    `engaged and animated.${emoZin} ` +
    `${luisterZinnen} ` +
    `A calm, receptive listening posture for everyone who is not speaking. ` +
    `To be completely clear: ${spreker.name} talks, ${luisteraarNamen} listen${luisteraars.length === 1 ? "s" : ""} ` +
    `in silence with a closed mouth. Do not swap these roles. ` +
    `Flat vector illustration, same art style as the source. No text overlays, no watermarks, no logos.` +
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
  luisteraars: DialogueCastMember[]
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
    `Animate this flat 2D explainer illustration as a conversation. ` +
    `IMPORTANT: in the source image exactly one person already has an open mouth — that is the speaker. ` +
    `Keep it that way for the entire clip; never swap who is talking. ` +
    `${sprekerT.replace(/^the/, "The")} is the speaker and does the talking for the whole clip: mouth opening and closing ` +
    `continuously and expressively, hands gesturing actively while explaining, head moving naturally with the speech. ` +
    `${luisterZinnen} ` +
    `Exactly one person is talking in this clip and it is ${sprekerT}. ` +
    `The other person's mouth NEVER opens, not even briefly. ` +
    `Everyone keeps facing each other and never turns towards the viewer. ` +
    `Flat 2D vector animation style, static locked camera. Keep the same people, same faces, clothing, ` +
    `colours and background. Do not add another person, new objects or text.`
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
export function buildActionShotPrompt(cast: DialogueCastMember[], actie: string): string {
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
    `Show the action clearly — a wider shot is fine, the characters may be smaller in frame. ` +
    `Flat vector illustration, same art style as the source. No text overlays, no watermarks, no logos.` +
    NATUURWETTEN
  );
}

/** Bewegingsinstructie voor een actiebeeld: de handeling zelf, geen gesprek. */
export function buildActionMotionPrompt(actie: string): string {
  return (
    `Animate this flat 2D explainer illustration. The shot shows: ${actie.trim()}. ` +
    `Bring that action to life with clear, natural movement — the people and objects involved actually move ` +
    `and carry out what is described, at a calm and readable pace. ` +
    `NOBODY SPEAKS in this shot: all mouths stay CLOSED throughout. This is an action beat with music, ` +
    `not a conversation. ` +
    `Flat 2D vector animation style. A slow, gentle camera move is allowed if it supports the action. ` +
    `Keep the same people, same faces, clothing and colours. Do not add another person, new text or logos. ` +
    `PHYSICAL RULES: only the PEOPLE move. Vehicles, machines, furniture and equipment stay exactly where ` +
    `they are and keep their shape — nothing drives, folds, opens, collapses, transforms, grows or shrinks. ` +
    `Bodies stay whole and keep their proportions; limbs do not stretch, merge or disappear. ` +
    `Any text already in the image stays exactly as it is.`
  );
}
