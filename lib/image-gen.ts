import { fal } from "@fal-ai/client";
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

const BASE_MODEL = "fal-ai/nano-banana-pro";
const EDIT_MODEL = "fal-ai/nano-banana-pro/edit";

// De edit-variant accepteert tot 8 image_urls. We reserveren bewust ruimte
// voor character + ingredients zodat ze samen kunnen werken met de stijl.
const MAX_TOTAL_REFS = 8;
const MAX_STYLE_REFS = 3;
const MAX_CHARACTER_REFS = 2;

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
  const styleRefs = styleRefUrls(input.visualStyle).slice(0, MAX_STYLE_REFS);
  const characterRefs = cleanList(input.characterUrls).slice(0, MAX_CHARACTER_REFS);
  const ingredientRefs = cleanList(input.ingredientUrls);

  // Volgorde van prioriteit bij dedup en cap:
  // 1. stijl (essentieel om de look juist te krijgen)
  // 2. character (consistentie)
  // 3. ingredients (specifieke beelden door de gebruiker gekozen)
  const allRefs: string[] = [];
  const seen = new Set<string>();
  for (const url of [...styleRefs, ...characterRefs, ...ingredientRefs]) {
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
    promptParts.push(
      "Use the character reference image(s) ONLY for the person's identity — their face, hair, build, age, and signature features. Do NOT copy the rendering style, line weight, color treatment, or technique of the character reference. Re-render the character entirely in the visual style of the style references."
    );
  }
  promptParts.push(input.prompt.trim());
  if (input.extraContext && input.extraContext.trim().length > 0) {
    promptParts.push(input.extraContext.trim());
  }
  promptParts.push("No text overlays, no watermarks, no logos.");

  const fullPrompt = promptParts.join(" ").slice(0, 4000);

  const usedModel = allRefs.length > 0 ? EDIT_MODEL : BASE_MODEL;
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

  // fal-client typt input per modelnaam streng, en wij wisselen tussen base
  // en edit op runtime; daarom een cast i.p.v. duplicaat-calls per branch.
  const result = await fal.subscribe(usedModel, { input: fal_input as never });
  const tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
  if (!tempUrl) {
    throw new Error("Geen afbeelding ontvangen van Nano Banana Pro");
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

export async function editImage(input: EditImageInput): Promise<NanoBananaResult> {
  const aspect = aspectFor(input.format);
  const characterRefs = cleanList(input.characterUrls).slice(0, MAX_CHARACTER_REFS);

  // Source vooraan zodat Nano Banana hem als hoofd-referentie behandelt.
  const allRefs: string[] = [input.sourceImageUrl, ...characterRefs].slice(0, MAX_TOTAL_REFS);

  const instructionParts: string[] = [
    "Edit the first reference image with the following change:",
    input.instruction.trim(),
    "Keep every other element identical to the source: composition, camera angle, framing, all characters, background, lighting, color palette, and visual style. Change ONLY what the instruction explicitly asks for. No text overlays, no watermarks, no logos.",
  ];
  if (characterRefs.length > 0) {
    instructionParts.splice(2, 0,
      "Additional reference images show the main character — use them to keep the person's identity consistent."
    );
  }
  const fullPrompt = instructionParts.join(" ").slice(0, 4000);

  const result = await fal.subscribe(EDIT_MODEL, {
    input: {
      prompt: fullPrompt,
      image_urls: allRefs,
      aspect_ratio: aspect,
      resolution: "2K",
      num_images: 1,
      output_format: "jpeg",
    } as never,
  });
  const tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
  if (!tempUrl) {
    throw new Error("Geen afbeelding ontvangen van Nano Banana Pro");
  }

  return {
    imageUrl: tempUrl,
    usedModel: EDIT_MODEL,
    promptUsed: fullPrompt,
    refsUsed: allRefs,
  };
}
