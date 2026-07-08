// Gedeelde stijl-instructie voor scene-illustraties, zodat de eerste generatie
// (generate-story) en latere regeneraties/aanpassingen (scene-image) exact
// dezelfde "animatiemarkt flat infographic" look gebruiken.

export const STYLE_PREAMBLE =
  "Flat vector illustration in a professional, modern corporate animated-explainer / infographic style. " +
  "Clean geometric shapes, flat colors with a subtle paper-grain texture, crisp edges, no realistic shading, no gradients. " +
  "Simple, uncluttered composition with the subject centered. ";

// Positief sturen werkt bij Nano Banana (Gemini) veel beter dan "geen X": we
// beschrijven de achtergrond expliciet als een egaal, leeg vlak met lege hoeken.
// Daarna pas een korte, concrete verbodenlijst voor de artefacten die het model
// anders steevast toevoegt (rook/stoom, wolken/lucht, hoekplanten).
export const STYLE_FRAMING =
  " The background is one single flat, solid off-white color, completely plain and empty. " +
  "The corners and all empty areas are clean and bare, containing nothing at all. The air is empty and clear. " +
  "Show ONLY the objects and people described in the scene, on this plain background, and nothing else.";

export const STYLE_NEGATIVE =
  " No smoke, no steam, no vapor, no mist, no fog, no rising wisps, no clouds, no sky. " +
  "No plants, no leaves, no branches, no foliage, no flowers in the corners or background. " +
  "No sparkles, no floating shapes, no decorative background props or clutter. " +
  "Avoid text, letters, words, numbers and labels wherever possible — no captions or decorative writing on signs, screens, phones, price tags, bills, buttons, charts or packaging. ";

// Taalregel voor eventuele tekst in het beeld. Beeldmodellen negeren "geen tekst"
// vaak en vullen dan Engelse labels in. Daarom: als er tóch tekst nodig/aanwezig
// is, MOET die in correct Nederlands — nooit Engels of een andere taal.
export const STYLE_TEXT_DUTCH =
  "If a short label is truly essential to understand the scene, write it in correct, natural Dutch (Nederlands). " +
  "Any and all text in the image MUST be in Dutch — never English or any other language, and never garbled, made-up or misspelled words.";

export function buildIllustrationPrompt(brief: string): string {
  return `${STYLE_PREAMBLE}Scene: ${brief.trim()}.${STYLE_FRAMING}${STYLE_NEGATIVE}${STYLE_TEXT_DUTCH}`;
}

// Zachte huisstijl-palet-instructie voor de illustraties: de merkkleuren leiden,
// aangevuld met natuurlijke steunkleuren (niet strak/eentonig geforceerd). Wordt
// als extra context aan de beeld-prompt meegegeven zodat de illustraties bij de
// huisstijl aansluiten. Lege string als er geen geldige hex-kleuren zijn.
export function brandPaletteHint(primary?: string | null, accent?: string | null): string {
  const cols = [primary, accent].filter((c): c is string => !!c && /^#[0-9a-fA-F]{6}$/.test(c.trim()));
  if (cols.length === 0) return "";
  const list = cols.join(" and ");
  return ` Use a flat colour palette led by the brand colours ${list}: let these brand colours dominate the main shapes, fills and accents. Complement them with a few natural, harmonious supporting tones so the illustration stays clean and pleasant — do not force everything into one colour and do not make it monotone.`;
}

// Extra instructie wanneer er een "anker"-beeld als STIJL-referentie wordt
// meegegeven (scene 0). Belangrijk: het anker bepaalt alleen de TEKENSTIJL — niet
// de personen of de compositie. Anders kloont het model dezelfde figuur in elke
// scene (alle poppetjes identiek). Elke scene houdt dus zijn eigen, verschillende
// mensen/onderwerp; alleen de stijl blijft gelijk.
export const STYLE_MATCH_ANCHOR =
  " A style-reference image from the same video is provided. Copy ONLY its visual STYLE: the flat vector art style, colour palette, " +
  "line weight, shapes, level of detail and the general way characters are drawn (proportions, simplicity, shading). " +
  "Do NOT copy or reproduce the specific people, faces, hair, clothing, poses, objects or composition from the reference — " +
  "THIS scene has its own, DIFFERENT subjects, people and layout exactly as described above. Where the scene needs people, " +
  "draw new and distinct individuals (varied faces, ages, clothing) in that same art style; never clone the same person across scenes.";
