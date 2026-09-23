import { fal } from "@fal-ai/client";
import { stijlOmschrijving } from "@/lib/infographics/story-style";
import {
  styleRefUrls,
  stylePromptHint,
  STYLE_REF_GUIDANCE,
} from "@/lib/style-packs";
import type { VisualStyle } from "@/lib/types";

fal.config({ credentials: process.env.FAL_KEY });

// Centrale image-generatie via Google's Nano Banana Pro (via fal.ai). Alle
// statische beeldgeneratie in de app gaat hier doorheen: dezelfde stijl-refs,
// dezelfde refund-discipline, dezelfde compose-logica. Roeit Flux/DALL-E/
// Recraft/Seedream uit het hot path; die zijn na deze refactor niet meer in
// gebruik en kunnen later opgeruimd worden.

// Nano Banana (niet-Pro, Gemini 2.5 Flash Image, ~$0,039/beeld). Bewust de
// goedkopere variant voor toegankelijkheid; ~4x goedkoper dan Pro. Minder sterke
// karakterconsistentie over scenes dan Pro, maar veel meer beelden per credit.
const BASE_MODEL = "fal-ai/nano-banana";
const EDIT_MODEL = "fal-ai/nano-banana/edit";
// Pro-varianten (Gemini Nano Banana Pro, ~$0,15/2K): scherper, betere karakter-
// én merk-object-consistentie en compositie. Achter een kwaliteitskeuze.
const BASE_MODEL_PRO = "fal-ai/nano-banana-pro";
const EDIT_MODEL_PRO = "fal-ai/nano-banana-pro/edit";
// Flux Kontext: instructie-bewerking die de rest van het beeld exact behoudt —
// ideaal voor gericht bijsturen ("maak de vaten kunststof") én objecten/personen
// verwijderen ("haal de man op de achtergrond weg").
const FLUX_KONTEXT = "fal-ai/flux-pro/kontext";

// De edit-variant accepteert tot 8 image_urls. We reserveren bewust ruimte
// voor character + ingredients zodat ze samen kunnen werken met de stijl.
const MAX_TOTAL_REFS = 8;
const MAX_STYLE_REFS = 3;
const MAX_CHARACTER_REFS = 3; // tot 2 karakter-ankers + 1 vorige-scène (chaining)
const MAX_BRAND_REFS = 3;     // échte merk-objecten (boot, kleding, locatie, …)
// Ruim onder de 50.000 die Nano Banana accepteert. Zie de uitleg bij fullPrompt.
const MAX_PROMPT_TEKENS = 12000;

export interface NanoBananaInput {
  // Plain-language wat er in het beeld moet komen (script-zin, scene-prompt).
  prompt: string;
  // Vorm: 16:9 of 9:16. Default 16:9.
  format?: string;
  // Welk stijl-pack. null = geen stijl-refs (vrije generatie).
  visualStyle?: VisualStyle | null;
  // Een vrije tekst-context (brand kit, mood, omgeving). Wordt achter de
  // user-prompt geplakt zodat de stijl-instructie er bovenop staat.
  extraContext?: string;
  // Hoofdpersoon-referentie(s). Bewaren de identiteit van de figuur over
  // meerdere scenes heen.
  characterUrls?: (string | null | undefined)[] | null;
  // Ingredient-/scène-referenties die de gebruiker handmatig heeft toegevoegd
  // (variatie-bron, prop, omgeving). Komen achter character maar voor
  // overige slots — die zijn altijd schaars.
  ingredientUrls?: (string | null | undefined)[] | null;
  // Échte merk-objecten die EXACT nagebootst moeten worden (de specifieke boot,
  // werkkleding, locatie, product). Hoogste prioriteit + vooraan geplaatst zodat
  // Nano Banana ze het zwaarst weegt, en consistent over alle scènes heen.
  brandUrls?: (string | null | undefined)[] | null;
  // "pro" = Nano Banana Pro (scherper/consistenter, duurder). Default standaard.
  quality?: "standard" | "pro" | null;
  // Vaste seed → reproduceerbaar/consistente look bij "Opnieuw" en tussen scènes.
  seed?: number | null;
}

export interface NanoBananaResult {
  imageUrl: string;
  usedModel: string;
  promptUsed: string;
  refsUsed: string[];
}

function aspectFor(format: string | undefined): "16:9" | "9:16" {
  return format === "9:16" ? "9:16" : "16:9";
}

function cleanList(urls: (string | null | undefined)[] | null | undefined): string[] {
  if (!urls) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (typeof u !== "string") continue;
    const trimmed = u.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export async function generateImageWithStyle(input: NanoBananaInput): Promise<NanoBananaResult> {
  const aspect = aspectFor(input.format);
  const brandRefs = cleanList(input.brandUrls).slice(0, MAX_BRAND_REFS);
  const hasBrand = brandRefs.length > 0;
  // Met merk-objecten herbalanceren we het 8-slot budget: merk-refs krijgen 3
  // gereserveerde plekken (en staan vooraan = zwaarst gewogen), stijl zakt naar 2
  // (de stijl wordt ook via de tekst-hint geankerd). Zonder merk-objecten blijft
  // alles bij het oude (3 stijl / 3 character / ingredients).
  const styleRefs = styleRefUrls(input.visualStyle).slice(0, hasBrand ? 2 : MAX_STYLE_REFS);
  const characterRefs = cleanList(input.characterUrls).slice(0, MAX_CHARACTER_REFS);
  const ingredientRefs = cleanList(input.ingredientUrls);

  // Volgorde van prioriteit bij dedup en cap. Met merk-objecten: merk → stijl →
  // character → ingredients (merk-fidelity is hier het hoofddoel). Zonder:
  // stijl → character → ingredients (ongewijzigd).
  const priority = hasBrand
    ? [...brandRefs, ...styleRefs, ...characterRefs, ...ingredientRefs]
    : [...styleRefs, ...characterRefs, ...ingredientRefs];
  const allRefs: string[] = [];
  const seen = new Set<string>();
  for (const url of priority) {
    if (allRefs.length >= MAX_TOTAL_REFS) break;
    if (seen.has(url)) continue;
    seen.add(url);
    allRefs.push(url);
  }

  // Prompt: stijl-richtlijn vooraan zodat het model snapt waarom de refs er
  // zijn. Hint van het pack erbij om het taalkundig te ankeren.
  const styleHint = stylePromptHint(input.visualStyle);
  const promptParts: string[] = [];
  if (styleRefs.length > 0) {
    promptParts.push(STYLE_REF_GUIDANCE);
  }
  if (styleHint) {
    promptParts.push(styleHint);
  }
  if (characterRefs.length > 0) {
    // Belangrijk: character ref alleen voor identiteit (gezicht, bouw,
    // kapsel, leeftijd). De rendering-stijl komt uitsluitend uit de
    // style refs — anders trekt de character ref de generatie weg van
    // de gekozen stijl naar zijn eigen look.
    // Waar de stijl vandaan komt hangt af van wat er meegaat. Zonder stijl-refs
    // (de dialoog- en storytelling-tools sturen de stijl via de prompt) wees deze
    // zin naar referenties die er niet waren, en trok het portret — vaak een
    // fotoachtig plaatje — de generatie naar zijn eigen look. Dat is een van de
    // redenen dat personages er per beeld nét anders uitzagen.
    const stijlBron = styleRefs.length > 0
      ? "the visual style of the style references"
      : "the art style described in this prompt";
    promptParts.push(
      `Use the character reference image(s) ONLY for the person's identity — their face, hair, build, age, and signature features. Do NOT copy the rendering style, line weight, color treatment, or technique of the character reference. Re-render the character entirely in ${stijlBron}. ` +
      "The reference is a neutral portrait: do NOT reproduce its centered, head-on, looking-at-camera pose or close-up framing. Place the person inside THIS scene exactly as the scene describes — their position, size in the frame, pose, action, gaze and camera distance. They may be in a wide shot, seen from the side or behind, small in the background, or not present at all if the scene has no person. Composition and context come from the scene; only the identity comes from the reference."
    );
  }
  if (hasBrand) {
    // Disambigueer de merk-refs van de stijl-/character-refs: ze tonen ECHTE
    // objecten die exact (en identiek over scènes) overgenomen moeten worden.
    promptParts.push(
      "Some reference images show REAL brand objects (a specific vehicle/boat, product, uniform or location). Replicate those objects exactly — same shape, colours and branding — and keep them identical to how they appear in the other scenes. They define real-world objects to reproduce, NOT the rendering style."
    );
  }
  promptParts.push(input.prompt.trim());
  if (input.extraContext && input.extraContext.trim().length > 0) {
    promptParts.push(input.extraContext.trim());
  }
  // Let op het woordgebruik: fal weigert een aanroep met "watermark" of
  // "signature" erin met een content_policy_violation. Dat gebeurde in stilte bij
  // élke opschoonronde en tekstcorrectie (gemeten 23-09-2026), waardoor verzonnen
  // logo's en letterbrij gewoon in de video belandden. "brand mark" mag wel.
  promptParts.push("No text overlays, no brand marks, no logos.");

  // Hier stond een afkapgrens van 4000 tekens, nog uit de tijd van Flux en DALL-E.
  // Nano Banana neemt er 50.000. In de dialoogmodus is een beeldopdracht 6000 tot 7500
  // tekens, dus viel alles wat achteraan kwam stilzwijgend weg: het verbod op extra of
  // dubbele personen, de uitleg bij het castblad, de briefing van de klant en de reden
  // waarom de vorige poging was afgekeurd.
  const heel = promptParts.join(" ");
  if (heel.length > MAX_PROMPT_TEKENS) {
    console.warn(`[image-gen] prompt van ${heel.length} tekens afgekapt op ${MAX_PROMPT_TEKENS}`);
  }
  const fullPrompt = heel.slice(0, MAX_PROMPT_TEKENS);

  const pro = input.quality === "pro";
  const usedModel = allRefs.length > 0
    ? (pro ? EDIT_MODEL_PRO : EDIT_MODEL)
    : (pro ? BASE_MODEL_PRO : BASE_MODEL);
  const fal_input: Record<string, unknown> = {
    prompt: fullPrompt,
    aspect_ratio: aspect,
    resolution: "2K",
    num_images: 1,
    output_format: "jpeg",
  };
  if (allRefs.length > 0) {
    fal_input.image_urls = allRefs;
  }
  if (typeof input.seed === "number" && Number.isFinite(input.seed)) {
    fal_input.seed = input.seed;
  }

  // fal-client typt input per modelnaam streng, en wij wisselen tussen base
  // en edit op runtime; daarom een cast i.p.v. duplicaat-calls per branch.
  const result = await fal.subscribe(usedModel, { input: fal_input as never });
  const tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
  if (!tempUrl) {
    throw new Error("Geen afbeelding ontvangen van Nano Banana");
  }

  return {
    imageUrl: tempUrl,
    usedModel,
    promptUsed: fullPrompt,
    refsUsed: allRefs,
  };
}

// "Google Flow"-stijl bewerking van één bestaand beeld: gebruiker geeft een
// korte instructie ("maak het polo blauw", "verwijder de laptop"), en het
// beeld wordt aangepast met behoud van compositie, karakter, sfeer, stijl.
// Géén style refs nodig — het bronbeeld is leidend voor de look. Character
// refs gaan wel mee, voor het geval de wijziging het personage raakt.
export interface EditImageInput {
  sourceImageUrl: string;
  instruction: string;
  format?: string;
  characterUrls?: (string | null | undefined)[] | null;
}

// Tweede pass voor story-illustraties: Nano Banana (Gemini) verzint bij flat-
// illustraties hardnekkig sfeer-decoratie (rook, wolken, hoekplanten, bubbels),
// ook als de prompt het verbiedt. Op het al gegenereerde beeld een gerichte
// "schoonveeg"-edit doen werkt veel betrouwbaarder dan het in één keer schoon
// proberen te genereren: het model behoudt het onderwerp en haalt alleen de
// rommel weg. Anders dan editImage zeggen we hier NIET "houd de achtergrond
// gelijk", want juist die moet egaal worden.
export async function cleanupIllustration(sourceImageUrl: string, format?: string): Promise<NanoBananaResult> {
  const aspect = aspectFor(format);
  const fullPrompt = [
    "Edit the reference image.",
    "Keep the main subject, people, objects, their poses, the composition, the colors and the flat vector illustration style exactly the same.",
    "Change ONLY the background and remove clutter: make the background one single flat, solid off-white color, completely plain and empty.",
    "Remove every decorative element that is not part of the main subject: remove all smoke, steam, vapor, mist, fog, clouds, sky, plants, leaves, branches, foliage, flowers, bubbles, sparkles, dots and floating shapes.",
    "The corners and all empty areas must be completely bare and empty.",
    "Any text, label or word that remains in the image MUST be in correct, natural Dutch: translate every English or other-language word into Dutch, and fix any garbled or misspelled text. Remove meaningless decorative text, brand marks and logos.",
  ].join(" ").slice(0, 4000);

  const result = await fal.subscribe(EDIT_MODEL, {
    input: {
      prompt: fullPrompt,
      image_urls: [sourceImageUrl],
      aspect_ratio: aspect,
      resolution: "2K",
      num_images: 1,
      output_format: "jpeg",
    } as never,
  });
  const tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
  if (!tempUrl) throw new Error("Geen afbeelding ontvangen van Nano Banana (cleanup)");

  return { imageUrl: tempUrl, usedModel: EDIT_MODEL, promptUsed: fullPrompt, refsUsed: [sourceImageUrl] };
}

// Schoonveeg-pass voor beelden die hun OMGEVING juist moeten houden (de
// storytelling-infographic tekent de plek van rand tot rand). cleanupIllustration
// hierboven schildert de achtergrond egaal off-white en sloopt daarmee precies wat
// hier het verhaal draagt. Deze variant laat de plek staan en haalt alleen de
// zwevende rommel en de verzonnen/verkeerdtalige tekst weg.
export async function cleanupSceneIllustration(sourceImageUrl: string, format?: string, keepLabels?: string[] | null, styleId?: string | null): Promise<NanoBananaResult> {
  const aspect = aspectFor(format);
  const labels = (keepLabels ?? []).map((l) => l.trim()).filter(Boolean).slice(0, 3);
  // De stijl van het verhaal, niet "vlak vector": deze pass draait over élk beeld,
  // dus een vaste stijlnaam trok papercut- en 3D-verhalen scheef (en maakte van
  // een realistisch beeld een tekening).
  const stijl = stijlOmschrijving(styleId);
  const fullPrompt = [
    "Edit the reference image.",
    `Keep the main subject, people, objects, their poses, the composition, the colors, the background environment and ${stijl} exactly the same.`,
    "The location and its background MUST stay fully intact and keep filling the whole frame — never replace it with a white, off-white or plain flat background, and never cut the subject out of its surroundings.",
    "Remove ONLY the floating clutter that does not belong to the place itself: sparkles, glitter, bubbles, floating icons, symbols, speech bubbles, stray dots and decorative shapes hanging in the air.",
    labels.length
      ? `Keep these words exactly as they are and spelled exactly like this: ${labels.map((l) => `"${l}"`).join(", ")}. Any OTHER text must be removed.`
      : "Any text, label or word that remains in the image MUST be in correct, natural Dutch: translate every English or other-language word into Dutch, and fix any garbled or misspelled text. Remove meaningless decorative text.",
    // Altijd, ook als er labels blijven staan: het échte logo komt er als aparte
    // laag overheen, dus elk merkteken dat het model zelf tekent is er één te veel.
    "Remove every logo, brand mark, badge and emblem, in every corner and on every object.",
  ].filter(Boolean).join(" ").slice(0, 4000);

  const result = await fal.subscribe(EDIT_MODEL, {
    input: {
      prompt: fullPrompt,
      image_urls: [sourceImageUrl],
      aspect_ratio: aspect,
      resolution: "2K",
      num_images: 1,
      output_format: "jpeg",
    } as never,
  });
  const tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
  if (!tempUrl) throw new Error("Geen afbeelding ontvangen van Nano Banana (cleanup)");

  return { imageUrl: tempUrl, usedModel: EDIT_MODEL, promptUsed: fullPrompt, refsUsed: [sourceImageUrl] };
}

// Schoonveeg-pass voor de overheidsmodus. Daar is de achtergrond juist een leeg
// vlak en zijn losse iconen géén rommel maar de inhoud — precies andersom dan bij
// de twee passes hierboven. Blijft over: verzonnen tekst en letterbrij weghalen,
// en de vlakke stijl bewaken.
export async function cleanupFlatGraphic(sourceImageUrl: string, format?: string, keepLabels?: string[] | null): Promise<NanoBananaResult> {
  const aspect = aspectFor(format);
  // Bedoelde labels horen bij deze stijl en moeten blijven staan; alleen alles
  // wat het model er zelf bij verzint gaat eruit.
  const labels = (keepLabels ?? []).map((l) => l.trim()).filter(Boolean).slice(0, 3);
  const fullPrompt = [
    "Edit the reference image (a flat vector motion-graphics diagram).",
    "Keep the composition, every object, icon, panel and figure, their positions, sizes and colours, the plain light grey background and the completely flat vector style exactly the same.",
    labels.length
      ? `Keep these words exactly as they are, in the same place and spelled exactly like this: ${labels.map((l) => `"${l}"`).join(", ")}. Remove every OTHER piece of text: any other word, letter, number, caption, brand mark or logo, including garbled or meaningless lettering on documents, screens, signs and packaging.`
      : "Remove ONLY text: every letter, word, number, label, caption, brand mark and logo, including garbled or meaningless lettering on documents, screens, signs and packaging.",
    "Where text is removed, fill the area with the surrounding flat colour so the shape stays clean.",
    "Do not add anything, do not add outlines, shadows, gradients or texture, and do not turn any part of it into a realistic scene or a location.",
  ].filter(Boolean).join(" ").slice(0, 4000);

  const result = await fal.subscribe(EDIT_MODEL, {
    input: {
      prompt: fullPrompt,
      image_urls: [sourceImageUrl],
      aspect_ratio: aspect,
      resolution: "2K",
      num_images: 1,
      output_format: "jpeg",
    } as never,
  });
  const tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
  if (!tempUrl) throw new Error("Geen afbeelding ontvangen van Nano Banana (cleanup)");

  return { imageUrl: tempUrl, usedModel: EDIT_MODEL, promptUsed: fullPrompt, refsUsed: [sourceImageUrl] };
}

// Gerichte bewerking van een STORY-illustratie ("selecteer alleen Frankrijk",
// "maak het dak blauw", "verwijder het prijskaartje"). Gebruikt nano-banana/edit
// (Gemini) i.p.v. Flux Kontext: de illustraties zijn óók met nano-banana gemaakt,
// en Gemini volgt instructies op deze platte vector-stijl veel beter én houdt de
// stijl consistent. Flux Kontext (editImage) blijft voor de fotorealistische
// studio-flow.
export async function editIllustration(
  sourceImageUrl: string,
  instruction: string,
  format?: string,
  /**
   * Extra referentiefoto's: het échte product, logo of object dat in het beeld
   * moet kloppen ("ik heb het juiste logo voor op de auto geüpload"). Gaan als
   * volgende ingredienten mee naar het model, ná het bronbeeld.
   */
  refUrls?: (string | null | undefined)[] | null,
  /** De gekozen tekenstijl; zonder dit dwong deze prompt altijd vlakke vector af. */
  styleId?: string | null,
  /** Taal van de video; tekst in beeld hoort in die taal te staan. */
  language?: string | null
): Promise<NanoBananaResult> {
  const aspect = aspectFor(format);
  const refs = (refUrls ?? []).filter((u): u is string => !!u && u.trim().length > 0);
  const stijl = stijlOmschrijving(styleId);
  const taal = (language ?? "Nederlands").trim() || "Nederlands";
  const prompt = [
    `Edit the reference image (${stijl}).`,
    `Apply exactly this change: ${instruction.trim()}.`,
    `Keep everything else identical: ${stijl}, the overall composition, all other objects, people and their identity, the colour palette, line weight and the background environment. Change ONLY what is asked.`,
    refs.length
      ? `The image(s) after the first one are reference photos of a real product, logo or object: match that item accurately — its real shape, proportions, colours and distinctive details — but render it in ${stijl} of the scene (never paste the photo flat on top) and keep it at the size and position the scene requires.`
      : "",
    `Any text in the image MUST be in correct, natural ${taal} — translate any word in another language into ${taal} and fix garbled text. Add no new decorative clutter and no brand marks.`,
  ].filter(Boolean).join(" ").slice(0, 4000);

  const imageUrls = [sourceImageUrl, ...refs];
  const result = await fal.subscribe(EDIT_MODEL, {
    input: {
      prompt,
      image_urls: imageUrls,
      aspect_ratio: aspect,
      resolution: "2K",
      num_images: 1,
      output_format: "jpeg",
    } as never,
  });
  const tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
  if (!tempUrl) throw new Error("Geen afbeelding ontvangen van Nano Banana (edit)");

  return { imageUrl: tempUrl, usedModel: EDIT_MODEL, promptUsed: prompt, refsUsed: imageUrls };
}

/**
 * Eén bestaand beeld bewerken met Nano Banana: alleen de gevraagde verandering.
 *
 * Voor een correctie in het storyboard van de dialoogmodus ("Lilly's afro zoals in de
 * andere beelden"). In een proef bleef de rest van het beeld gelijk, ook de zachte
 * look; Flux Kontext (editImage) veranderde bij dezelfde opdracht de gezichten en de
 * tekenstijl. Een NIEUW beeld met een eerder beeld als voorbeeld gaf juist een harde
 * kopie; dit is hetzelfde beeld met één wijziging.
 */
export async function bewerkBeeld(input: {
  bronUrl: string;
  instructie: string;
  /** Hooguit twee extra beelden, bijvoorbeeld het castblad voor hoe iemand eruitziet. */
  referentieUrls?: (string | null | undefined)[] | null;
  referentieUitleg?: string;
  format?: string;
}): Promise<NanoBananaResult> {
  const refs = cleanList(input.referentieUrls).filter((u) => u !== input.bronUrl).slice(0, 2);
  const prompt = [
    "Edit the first image.",
    input.instructie.trim().replace(/\.?$/, "."),
    "Change ONLY that. Keep everything else exactly as it is: the composition and framing, the poses and faces, the " +
      "other characters, the background, and the lighting, colours, softness and level of detail of the image. Do not " +
      "sharpen it, do not add contrast or saturation. No text and no brand marks.",
    refs.length
      ? input.referentieUitleg ?? "The other images are references for appearance only; do not copy their layout, background or poses."
      : "",
  ].filter(Boolean).join(" ").slice(0, MAX_PROMPT_TEKENS);

  const result = await fal.subscribe(EDIT_MODEL, {
    input: {
      prompt,
      image_urls: [input.bronUrl, ...refs],
      aspect_ratio: aspectFor(input.format),
      resolution: "2K",
      num_images: 1,
      output_format: "jpeg",
    } as never,
  });
  const tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
  if (!tempUrl) throw new Error("Geen afbeelding ontvangen van Nano Banana (bewerken)");
  return { imageUrl: tempUrl, usedModel: EDIT_MODEL, promptUsed: prompt, refsUsed: [input.bronUrl, ...refs] };
}

/**
 * Een beeld afmaken waarin een voorwerp als egale bruine vorm is ingeschilderd.
 *
 * Voor wat een bewerking in woorden niet doet: een voorwerp doortrekken tot de grond.
 * "De deur moet tot de grond reiken" gaf acht keer bijna hetzelfde beeld terug; met de
 * deur als vorm tot op het pad tekende hetzelfde model een deur die op de grond staat.
 * Alleen de schets gaat mee: met het origineel als tweede beeld erbij gaf het model
 * gewoon het origineel terug. Zie schets-bewerking.ts.
 */
export async function maakSchetsAf(input: {
  schetsUrl: string;
  /** Engels, kort: "the wooden door". */
  voorwerp: string;
  /** De begrepen aanwijzing, voor details als het houtsnijwerk. */
  instructie?: string;
  format?: string;
}): Promise<NanoBananaResult> {
  const wat = input.voorwerp.trim();
  const prompt = [
    "Edit this image. A flat brown shape has been painted onto it as a rough guide.",
    `Turn that brown shape into ${wat}, standing on the ground and filling the whole brown shape, drawn with the same ` +
      "materials, colours and level of detail as the rest of the picture.",
    input.instructie?.trim() ? `What was asked: ${input.instructie.trim()}` : "",
    "Nothing brown may remain. Everything that is not brown stays exactly as it is: the people in front, their poses, " +
      "faces and clothes, the surroundings, the lighting and the rendering style. No text and no brand marks.",
  ].filter(Boolean).join(" ").slice(0, MAX_PROMPT_TEKENS);

  const result = await fal.subscribe(EDIT_MODEL, {
    input: {
      prompt,
      image_urls: [input.schetsUrl],
      aspect_ratio: aspectFor(input.format),
      resolution: "2K",
      num_images: 1,
      output_format: "jpeg",
    } as never,
  });
  const tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
  if (!tempUrl) throw new Error("Geen afbeelding ontvangen van Nano Banana (schets afmaken)");
  return { imageUrl: tempUrl, usedModel: EDIT_MODEL, promptUsed: prompt, refsUsed: [input.schetsUrl] };
}

export async function editImage(input: EditImageInput): Promise<NanoBananaResult> {
  const aspect = aspectFor(input.format);

  // Flux Kontext bewerkt het bronbeeld in-place: het houdt compositie, personages,
  // achtergrond, belichting en stijl exact gelijk en past ALLEEN de instructie toe
  // (ook objecten/personen verwijderen). Daardoor zijn character-refs niet nodig —
  // het bronbeeld bevat het personage al.
  const prompt = [
    input.instruction.trim() + ".",
    "Change ONLY what is asked. Keep the composition, framing, all people and their identity, the background, lighting, colour palette and the visual/illustration style identical to the source.",
    "Any text in the image MUST be in correct, natural Dutch — translate any English or other-language words into Dutch and fix garbled text. No brand marks or logos.",
  ].join(" ").slice(0, 4000);

  const result = await fal.subscribe(FLUX_KONTEXT, {
    input: {
      prompt,
      image_url: input.sourceImageUrl,
      aspect_ratio: aspect,
      guidance_scale: 3.5,
      num_images: 1,
      output_format: "jpeg",
      safety_tolerance: "5",
    } as never,
  });
  const tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
  if (!tempUrl) {
    throw new Error("Geen afbeelding ontvangen van Flux Kontext");
  }

  return {
    imageUrl: tempUrl,
    usedModel: FLUX_KONTEXT,
    promptUsed: prompt,
    refsUsed: [input.sourceImageUrl],
  };
}
