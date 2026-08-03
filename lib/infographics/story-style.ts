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

// Kiesbare tekenstijlen voor de storytelling-infographic. Bewust PROMPT-gebaseerd
// (geen aparte referentiebeeld-bucket): elke stijl levert een "preamble" die de
// tekenstijl bepaalt. Flat-vector = de bestaande, vertrouwde look en blijft default,
// zodat bestaande verhalen en "geen keuze" ongewijzigd blijven.
export interface StoryStylePreset {
  id: string;
  name: string;    // label in de kiezer
  tagline: string; // korte omschrijving
  emoji: string;   // simpele thumbnail zonder assets
  preamble: string;
}

export const STORY_STYLE_PRESETS: StoryStylePreset[] = [
  {
    id: "flat-vector",
    name: "Flat vector",
    tagline: "Strak & zakelijk (standaard)",
    emoji: "🟦",
    preamble: STYLE_PREAMBLE,
  },
  {
    id: "marker-sketch",
    name: "Marker Sketch",
    tagline: "Losse handgetekende energie",
    emoji: "✏️",
    preamble:
      "Loose, energetic hand-drawn illustration in an expressive editorial ink-and-marker style. " +
      "Spontaneous sketchy ink linework with visible strokes, lively caricatured characters with " +
      "exaggerated, dynamic poses and expressions. Loose watercolour/marker shading with painterly " +
      "brush marks, mostly muted greys with a few bold colour pops (red, blue, yellow). " +
      "Hand-made, illustrative, full-of-life feel — not a clean vector, not a photo. ",
  },
  {
    id: "papercut",
    name: "Papercut",
    tagline: "Uitgeknipt papier-collage",
    emoji: "📄",
    preamble:
      "Layered paper-cut collage illustration. Every shape looks like a piece of cut coloured paper " +
      "stacked in layers with soft drop shadows between them, subtle matte paper texture, rounded " +
      "friendly shapes, warm flat colours. Tactile handcrafted cut-out look. ",
  },
  {
    id: "soft-3d",
    name: "Soft 3D",
    tagline: "Zacht & speels 3D",
    emoji: "🧸",
    preamble:
      "Soft, rounded 3D illustration with cute clay-like characters and objects, smooth matte " +
      "materials, gentle soft studio lighting and subtle depth of field. Friendly, playful, tactile " +
      "toy-like look with rounded edges and soft shadows. ",
  },
];

export const DEFAULT_STORY_STYLE = "flat-vector";

export function storyStylePreamble(styleId?: string | null): string {
  return STORY_STYLE_PRESETS.find((s) => s.id === styleId)?.preamble ?? STYLE_PREAMBLE;
}

// Taal (mensleesbaar NL) → Engelse naam voor de tekst-in-beeld-regel.
const LANG_EN: Record<string, string> = {
  Nederlands: "Dutch", Engels: "English", Duits: "German", Frans: "French", Spaans: "Spanish", Italiaans: "Italian",
};
function langTextRule(language?: string | null): string {
  if (!language || language === "Nederlands") return STYLE_TEXT_DUTCH;
  const l = LANG_EN[language] ?? "Dutch";
  return `If a short label is truly essential to understand the scene, write it in correct, natural ${l}. ` +
    `Any and all text in the image MUST be in ${l} — never another language, and never garbled, made-up or misspelled words.`;
}

export function buildIllustrationPrompt(brief: string, styleId?: string | null, language?: string | null): string {
  return `${storyStylePreamble(styleId)}Scene: ${brief.trim()}.${STYLE_FRAMING}${STYLE_NEGATIVE}${langTextRule(language)}`;
}

// Referentiefoto per scène (verbeterplan-feature): het échte product/logo/object dat
// de gebruiker meegeeft moet kloppen. De foto gaat als ingredient naar het beeldmodel;
// deze tekst stuurt het gebruik ervan.
export const REFERENCE_PHOTO_GUIDANCE =
  " A reference photo of a specific real product, object or logo is provided. Recreate THAT specific " +
  "item accurately in the scene — match its real shape, proportions, colours and distinctive details — " +
  "but redraw it in the illustration style described above (never paste the photo, never make it photo-realistic). " +
  "Keep the rest of the scene as described.";

// Vast personage/mascotte (verbeterplan F5): een terugkerend figuur dat in elke scène
// consistent moet terugkomen. De referentie gaat als ingredient mee.
export const CHARACTER_GUIDANCE =
  " A reference image of a RECURRING CHARACTER / mascot is provided. Wherever the scene has a main character, " +
  "draw THIS SAME character — match its design, face, hair, outfit, colours and proportions — redrawn in the " +
  "illustration style described above (not a photo). Keep this character visually identical and recognisable " +
  "across every scene. Other background people may vary, but the recurring character stays the same.";

// Zachte huisstijl-palet-instructie voor de illustraties: de merkkleuren leiden,
// aangevuld met natuurlijke steunkleuren (niet strak/eentonig geforceerd). Wordt
// als extra context aan de beeld-prompt meegegeven zodat de illustraties bij de
// huisstijl aansluiten. ALTIJD in kleur — ook zonder merkkleuren — zodat scenes
// nooit onbedoeld grijs/zwart-wit worden (huisstijl-kleurbug uit het verbeterplan).
const ALWAYS_COLOUR =
  " Render the whole scene in full, clear colour. NEVER grayscale, black-and-white, sepia, desaturated or monochrome; every scene in a set must be equally colourful.";

export function brandPaletteHint(primary?: string | null, accent?: string | null): string {
  const cols = [primary, accent].filter((c): c is string => !!c && /^#[0-9a-fA-F]{6}$/.test(c.trim()));
  if (cols.length === 0) {
    // Geen merkkleuren: geen palet forceren, maar wél kleur garanderen.
    return " Use a clear, friendly full-colour flat palette." + ALWAYS_COLOUR;
  }
  const list = cols.join(" and ");
  return ` Use a flat colour palette led by the brand colours ${list}: let these brand colours dominate the main shapes, fills and accents. Complement them with a few natural, harmonious supporting tones so the illustration stays clean and pleasant — do not force everything into one colour and do not make it monotone.` + ALWAYS_COLOUR;
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
