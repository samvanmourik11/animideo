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
  "No text, no numbers, no letters, no words, no labels, no captions anywhere, not on signs, screens, phones, price tags, bills, buttons, charts or packaging.";

export function buildIllustrationPrompt(brief: string): string {
  return `${STYLE_PREAMBLE}Scene: ${brief.trim()}.${STYLE_FRAMING}${STYLE_NEGATIVE}`;
}
