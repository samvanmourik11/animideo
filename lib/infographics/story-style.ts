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

// De tekstregel apart, want die geldt ALTIJD — ook in een beeld dat juist een
// volle omgeving moet hebben. Verzonnen letterbrij op een bord of scherm is in
// elk soort beeld fout.
/**
 * Geen verzonnen merktekens.
 *
 * Beeldmodellen zetten uit zichzelf een logo-achtig vlekje in een hoek — een
 * badge, een watermerk, een handtekening. Dat is altijd fout: het échte logo van
 * de klant komt er als aparte laag overheen, en twee logo's naast elkaar zorgt
 * ervoor dat de kijker het verkeerde ziet. Bij een demo bleek dat pijnlijk.
 */
export const MERK_NEGATIEF =
  "There is no logo, brand mark, badge, emblem, watermark, signature, stamp or app icon anywhere in the image, " +
  "in no corner and on no object — not even a small or blurred one. ";

export const TEKST_NEGATIEF =
  "Avoid text, letters, words, numbers and labels wherever possible — no captions or decorative writing on signs, screens, phones, price tags, bills, buttons, charts or packaging. " +
  MERK_NEGATIEF;

export const STYLE_NEGATIVE =
  " No smoke, no steam, no vapor, no mist, no fog, no rising wisps, no clouds, no sky. " +
  "No plants, no leaves, no branches, no foliage, no flowers in the corners or background. " +
  "No sparkles, no floating shapes, no decorative background props or clutter. " +
  TEKST_NEGATIEF;

// ---------------------------------------------------------------------------
// DRIE SOORTEN BEELD
//
// STYLE_FRAMING hierboven was het kader van de infographic-tool: een egaal wit
// vlak met alleen het onderwerp erop. Dat bleek in de praktijk overal fout —
// zowel in de storytelling-infographic (uitgeknipte poppetjes zonder plek) als in
// de DIALOOGmodus. Daar staan twee mensen een gesprek te voeren op een
// plek die het draaiboek beschrijft — oma's woonkamer, een markt in Suriname —
// en die plek werd stelselmatig weggepoetst tot een wit vlak, inclusief het
// verbod op lucht, wolken en planten. Je zag mensen zweven in het niets.
//
// Vandaar STYLE_OMGEVING: de plek wordt volledig getekend, van rand tot rand.
// En daar bovenop STYLE_VERHAAL_COMPOSITIE voor de storytelling-infographic,
// waar de omgeving ook nog eens de drager is van de typografie eroverheen.
// STYLE_FRAMING blijft alleen over voor het castblad (één personage, geen plek).
// ---------------------------------------------------------------------------

export const STYLE_OMGEVING =
  " The described location is fully drawn as a real, believable environment that fills the entire frame " +
  "from edge to edge: floor or ground, walls or horizon, background depth, and the furniture, objects and " +
  "surroundings that belong in such a place. NEVER an empty white, off-white or plain flat background — " +
  "the people are standing INSIDE this place, not floating in front of a blank backdrop. Light and colours " +
  "match the location and the time of day. Keep the environment tidy and readable: enough to recognise the " +
  "place instantly, without cluttering it. " +
  "No sparkles, no glitter, no floating icons or symbols hanging in the air, no decorative props that do not " +
  "belong in this place. " +
  TEKST_NEGATIEF;

// Extra compositieregels voor de storytelling-infographic. Daar is het beeld geen
// losse illustratie maar een compleet videoframe dat het scherm vult.
//
// LET OP bij het aanpassen: hier stond eerst dat er "a small brand logo" in de
// rechterbovenhoek komt. Bedoeld als uitleg waarom die hoek rustig moest blijven,
// maar een beeldmodel tekent wat je noemt — en dus verscheen er precies daar een
// VERZONNEN logo, dat over het echte logo van de klant heen viel. Noem nooit een
// logo, merk of watermerk in een beeldprompt, ook niet als toelichting. Zeg wat je
// wilt zien, niet wat er later overheen komt.
export const STYLE_VERHAAL_COMPOSITIE =
  " Compose this as a wide establishing shot of that place, with clear depth: a foreground, a middle ground " +
  "and a background that runs all the way to the top edge of the frame (sky, horizon, wall or far scenery). " +
  "This image fills a whole video frame, so let it read from edge to edge and keep the main subject in the " +
  "centre or the lower half. Keep the top-right corner calm, open and light in tone, with no busy detail or dark " +
  "masses there. Use a muted, natural, harmonious colour palette with soft flat shapes. ";

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
  Nederlands: "Dutch", Vlaams: "Dutch (Flemish, as written in Belgium)",
  Engels: "English", Duits: "German", Frans: "French", Spaans: "Spanish", Italiaans: "Italian",
};
function langTextRule(language?: string | null): string {
  if (!language || language === "Nederlands") return STYLE_TEXT_DUTCH;
  const l = LANG_EN[language] ?? "Dutch";
  return `If a short label is truly essential to understand the scene, write it in correct, natural ${l}. ` +
    `Any and all text in the image MUST be in ${l} — never another language, and never garbled, made-up or misspelled words.`;
}

// ---------------------------------------------------------------------------
// OVERHEIDSSTIJL — de derde modus.
//
// Dit is geen vijfde tekenstijl maar een andere soort animatie. De vier presets
// hierboven bepalen HOE er getekend wordt (vector, marker, papier, 3D); deze
// modus bepaalt WAT er in beeld staat. Naar het voorbeeld van de Rijksoverheid-
// explainers: geen scènes en geen omgevingen, maar diagrammen — objecten,
// iconen en vlakke uitgeknipte mensen op een egaal lichtgrijs vlak, vaak binnen
// witte panelen. Vandaar dat hij de kaderkeuze "overheid" krijgt in plaats van
// "verhaal": die twee spreken elkaar tegen (rand-tot-rand omgeving vs. leeg vlak).
// ---------------------------------------------------------------------------

/** Tekenstijl van de overheidsmodus. Vervangt de gekozen preset volledig. */
export const OVERHEID_PREAMBLE =
  "Flat vector motion-graphics illustration in the style of a modern Dutch government explainer video. " +
  "Completely flat geometric shapes with no outlines, no gradients, no shading and no texture: every element is a " +
  "solid colour shape. Clean, calm and diagrammatic. ";

/** Kader van de overheidsmodus: een diagram op een leeg vlak, geen plek. */
export const OVERHEID_FRAMING =
  " COMPOSITION — this is a diagram, not a scene. The background is one single flat, very light grey surface, " +
  "completely plain and empty: no room, no street, no landscape, no horizon and no floor. Arrange the elements as a " +
  "clear graphic composition on that surface, using simple white geometric panels where it helps: rounded rectangles " +
  "as cards, a row or grid of equal panels, or one large white arch/dome shape behind the subject. Keep the layout " +
  "symmetrical and generously spaced, with plenty of empty light grey around it. " +
  "PEOPLE — any people are flat cut-out figures standing directly on the empty background with nothing underneath " +
  "them; simple faces, no outlines. Often only hands and forearms reach into the frame from the edge to hold or point " +
  "at something. Never place people inside a drawn location. " +
  "OBJECTS — draw concrete objects and icons at a large size (a briefcase, a stack of coins, a building, a document), " +
  "and show relationships graphically: a chain of coins as a flowing ribbon, a stack splitting in two, arrows and " +
  "flows between panels. " +
  "COLOUR — a small flat palette: a deep navy blue, a bright blue, a warm amber yellow, with soft mint green and pink " +
  "as accents, on the light grey background. No other colours. ";

/**
 * Welk kader het beeld krijgt:
 * - "vlak": alleen het onderwerp op een egaal off-white vlak (castblad/model sheet).
 * - "omgeving": de plek is volledig getekend en vult het frame (dialoogmodus).
 * - "verhaal": als "omgeving", plus de compositieregels voor een videoframe waar
 *   later typografie overheen komt (storytelling-infographic).
 * - "overheid": diagram op een leeg lichtgrijs vlak, zonder omgeving — de
 *   overheidsmodus. Dit kader bepaalt óók de tekenstijl en negeert de preset.
 */
export type BeeldKader = "vlak" | "omgeving" | "verhaal" | "overheid";

/**
 * Tekstregel voor een beeld dat WEL tekst mag bevatten.
 *
 * Beeldmodellen verzinnen uit zichzelf letterbrij, dus we verbieden tekst
 * standaard. Maar korte labels maken een uitleganimatie juist duidelijker (de
 * categorie bij een stapel, de naam bij een gebouw). De oplossing is niet
 * "tekst mag", maar: precies deze woorden, letterlijk zo gespeld, en verder niets.
 * Wat er daarna echt op het beeld staat, wordt nog een keer gecontroleerd —
 * zie lib/infographics/tekst-controle.ts.
 */
export function labelGuidance(labels?: string[] | null): string {
  const woorden = (labels ?? []).map((l) => l.trim()).filter(Boolean).slice(0, 3);
  if (woorden.length === 0) return "";
  const lijst = woorden.map((w) => `"${w}"`).join(", ");
  return (
    ` TEXT — this image contains text, and these are the ONLY words allowed in it: ${lijst}. ` +
    `Spell each one exactly as written here, character for character, including any accents or capitals. ` +
    `Set them in a clean, plain sans-serif at a size that is comfortably readable, placed beside or under the DRAWN ` +
    `element they belong to, with enough contrast against the background. Each label accompanies a picture and never ` +
    `replaces one: never put a word in an otherwise empty box or panel, and never let text be the main element of the ` +
    `image. Do not translate them, do not abbreviate them, do not ` +
    `pluralise them and do not add a single other word, letter, number, caption or heading anywhere in the image. ` +
    MERK_NEGATIEF
  );
}

export function buildIllustrationPrompt(
  brief: string,
  styleId?: string | null,
  language?: string | null,
  kaderKeuze: BeeldKader = "vlak",
  /** Exacte woorden die in beeld mogen staan. Leeg = beeld blijft tekstvrij. */
  labels?: string[] | null
): string {
  const tekstRegel = (labels ?? []).filter((l) => l?.trim()).length > 0
    ? labelGuidance(labels)
    : null;
  // De overheidsmodus is een andere soort animatie, geen variant op de presets:
  // die worden hier dus bewust genegeerd, anders vecht "papercut" of "soft 3D"
  // met de vlakke diagramstijl.
  if (kaderKeuze === "overheid") {
    return `${OVERHEID_PREAMBLE}Subject: ${brief.trim()}.${OVERHEID_FRAMING}${tekstRegel ?? `${TEKST_NEGATIEF}${langTextRule(language)}`}`;
  }
  const kader =
    kaderKeuze === "verhaal" ? `${STYLE_OMGEVING}${STYLE_VERHAAL_COMPOSITIE}`
    : kaderKeuze === "omgeving" ? STYLE_OMGEVING
    : `${STYLE_FRAMING}${STYLE_NEGATIVE}`;
  return `${storyStylePreamble(styleId)}Scene: ${brief.trim()}.${kader}${tekstRegel ?? langTextRule(language)}`;
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
/**
 * Richtlijn voor het vaste personage, met zijn ROL erin.
 *
 * De vaste tekst hieronder houdt het uiterlijk consistent, maar zei niets over
 * WIE die persoon is. Daardoor werd dezelfde mascotte in de ene scène een klant
 * en in de volgende een monteur. De rol hoort in elke scène-prompt terug te komen,
 * want een personage dat van beroep wisselt leest als een ander personage.
 */
export function characterGuidance(role?: string | null): string {
  const rol = (role ?? "").trim();
  if (!rol) return CHARACTER_GUIDANCE;
  return (
    CHARACTER_GUIDANCE +
    ` This recurring character is ALWAYS the same person in the same role: ${rol}. ` +
    `Keep that role consistent in every scene — same job, same function, same relationship to the ` +
    `others — and dress them accordingly. Never turn them into someone else.`
  );
}

/**
 * Richtlijn bij MEERDERE meegestuurde portretten: welk portret hoort bij wie.
 *
 * Met één personage volstond CHARACTER_GUIDANCE ("teken deze persoon"). Zodra er
 * een monteur én een klant meegaan, moet het model weten welk gezicht bij welke
 * rol hoort — anders plakt het het verkeerde hoofd op de verkeerde rol, of maakt
 * het van twee mensen één. De volgorde is de koppeling: portret 1 = de eerste
 * naam in deze lijst. Daarom staat de nummering er expliciet bij.
 */
export function castRefGuidance(refs: CastRefLike[]): string {
  const leden = refs.filter((r) => r?.url?.trim());
  if (leden.length === 0) return "";
  if (leden.length === 1) {
    const enkel = leden[0];
    return characterGuidance(enkel.role?.trim() || enkel.name?.trim() || null);
  }
  const lijst = leden
    .map((r, i) => {
      const naam = (r.name ?? "").trim() || `character ${i + 1}`;
      const rol = (r.role ?? "").trim();
      const uiterlijk = (r.appearance ?? "").trim();
      return `reference portrait ${i + 1} = ${naam.toUpperCase()}${rol ? ` (${rol})` : ""}${uiterlijk ? ` — ${uiterlijk}` : ""}`;
    })
    .join("; ");
  return (
    ` CHARACTER REFERENCE PORTRAITS — ${leden.length} portraits of specific, named people are provided, in this exact order: ` +
    `${lijst}. Each portrait defines ONE person: their face, hair, build, clothing and colours. ` +
    `Whenever one of these people appears in a scene, draw THAT person from THEIR OWN portrait — never mix two of them ` +
    `together, never give one person's face or outfit to another, and never swap their roles. Redraw them in the ` +
    `illustration style described above (not as photos), and keep each of them identical across every scene. ` +
    `Other people in the scene are extras and must look clearly different from these ${leden.length}.`
  );
}

/** Minimale vorm van een door de gebruiker gekozen personage (zie StoryCastRef). */
export interface CastRefLike {
  url: string;
  name?: string | null;
  role?: string | null;
  appearance?: string | null;
}

export const CHARACTER_GUIDANCE =
  " A reference image of a RECURRING CHARACTER / mascot is provided. Wherever the scene has a main character, " +
  "draw THIS SAME character — match its design, face, hair, outfit, colours and proportions — redrawn in the " +
  "illustration style described above (not a photo). Keep this character visually identical and recognisable " +
  "across every scene. Other background people may vary, but the recurring character stays the same.";

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
/**
 * Het stijlanker (scene 1) als referentie voor de overige scenes.
 *
 * Deze tekst verbood eerst uitdrukkelijk om personen over te nemen: "draw new and
 * distinct individuals ... never clone the same person across scenes". Dat was
 * bedoeld tegen beelden waarin élk poppetje dezelfde man was, maar het maakte de
 * hoofdpersoon óók onherkenbaar: de taxateur uit scene 1 was in scene 4 een
 * andere man, en de kijker kon niet meer volgen wie wie was.
 *
 * Het onderscheid dat wél klopt is niet "wel/niet dezelfde persoon", maar of
 * iemand tot de CAST hoort. Castleden blijven exact gelijk; figuranten variëren.
 */
export const STYLE_MATCH_ANCHOR =
  " A style-reference image from an earlier scene of this same video is provided. Copy its visual STYLE exactly: the art style, colour palette, " +
  "line weight, shapes, level of detail and the general way characters are drawn (proportions, simplicity, shading). " +
  "Do NOT copy its composition, location, poses or objects — THIS scene has its own layout and subject as described above. " +
  "People: anyone belonging to the recurring cast described in this prompt must look EXACTLY the same as in the reference " +
  "(same face, hair, build, clothing and colours) — they are literally the same person in a later moment of the same story. " +
  "Other, unnamed background people are new and distinct individuals (varied faces, ages and clothing) in that same art style.";

/**
 * De vaste cast, woordelijk in elke beeld-prompt.
 *
 * `namesInScene` bepaalt wie er in DEZE scene voorkomt. De rest van de cast
 * noemen we niet: dan tekent het model ze er prompt bij.
 */
export function castGuidance(cast?: StoryCastMemberLike[] | null, namesInScene?: string[] | null): string {
  const leden = (cast ?? []).filter((c) => c?.name?.trim() && c?.appearance?.trim());
  if (leden.length === 0) return "";
  const namen = (namesInScene ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean);
  // Geen opgave van wie er in beeld is? Dan de hele cast meegeven: te veel
  // beschrijving is minder erg dan een hoofdpersoon die van gezicht wisselt.
  const inBeeld = namen.length ? leden.filter((c) => namen.includes(c.name.trim().toLowerCase())) : leden;
  if (inBeeld.length === 0) return "";
  const lijst = inBeeld
    .map((c) => `${c.name.trim().toUpperCase()} — ${c.role.trim() ? `${c.role.trim()}; ` : ""}${c.appearance.trim()}`)
    .join(" | ");
  return (
    ` RECURRING CAST — these people appear in several scenes of this video and MUST be drawn identically every time, ` +
    `as the same person in a different moment: ${lijst}. ` +
    `Match each one's face, hair, build, clothing and colours exactly as described; never re-age them, never change their ` +
    `outfit or hair colour, and never swap their roles. Any other people in the scene are extras and must look clearly ` +
    `different from the cast, so the viewer can always tell who is who.`
  );
}

/** Minimale vorm van een castlid (zie StoryCastMember in story-schema). */
export interface StoryCastMemberLike {
  name: string;
  role: string;
  appearance: string;
}

/**
 * Het castblad als referentiebeeld bij een scene.
 *
 * Dezelfde ingreep als in de dialoogmodus: een tekstbeschrijving houdt kleding en
 * kleur wel vast, maar een gezicht en de onderlinge lengte niet. Één blad waarop
 * iedereen naast elkaar staat, doet dat wel.
 */
export const CAST_SHEET_GUIDANCE =
  " One of the reference images is a CHARACTER LINE-UP SHEET showing every recurring character of this video standing " +
  "side by side, full body, against a plain background. That sheet defines what these people look like and how tall they " +
  "are relative to each other. Draw the cast members in this scene exactly as they appear on that sheet: same faces, hair, " +
  "clothing, colours, body build and the same height differences. Do not restyle or re-age anyone, and do not copy the " +
  "line-up pose or its plain background — this scene has its own location and action.";

/**
 * Briefing voor het castblad zelf: iedereen ten voeten uit, naast elkaar.
 * Bewust op een egaal vlak (kader "vlak"), want dit blad is een referentie en
 * geen scène uit de video.
 */
/**
 * Extra regel bij het castblad wanneer de gebruiker eigen portretten meestuurt:
 * de rij op het blad moet DIE mensen tonen, in dezelfde volgorde als de
 * portretten. Het castblad is daarna de enige referentie die elke scene meekrijgt,
 * dus wat hier misgaat, gaat in de hele video mis.
 */
export function castSheetRefLine(refs: CastRefLike[]): string {
  const leden = refs.filter((r) => r?.url?.trim());
  if (leden.length === 0) return "";
  const namen = leden
    .map((r, i) => `${i + 1}. ${(r.name ?? "").trim() || `character ${i + 1}`}${(r.role ?? "").trim() ? ` (${(r.role ?? "").trim()})` : ""}`)
    .join(", ");
  return (
    ` The ${leden.length} reference portrait${leden.length === 1 ? " is" : "s are"} the actual ${leden.length === 1 ? "person" : "people"} to draw in this line-up, ` +
    `in this same left-to-right order: ${namen}. Take each one's face, hair, build, clothing and colours from their own ` +
    `portrait and keep them recognisable; only redraw them in the illustration style and full body.`
  );
}

export function buildCastSheetBrief(cast: StoryCastMemberLike[]): string {
  const wie = cast
    .map((c, i) => `${i + 1}. ${c.name.trim()}${c.role.trim() ? ` (${c.role.trim()})` : ""} — ${c.appearance.trim()}`)
    .join(" ");
  return (
    `A character line-up sheet for an animated explainer video: ${cast.length} character${cast.length === 1 ? "" : "s"} ` +
    `standing side by side in a row, facing the viewer. From left to right: ${wie} ` +
    `Each character is shown FULL BODY from head to feet, standing upright on the same ground line, arms relaxed at their ` +
    `sides, with a neutral friendly expression. Draw them at the same scale as if photographed together, so their relative ` +
    `heights match their described age and build. Even spacing, nobody overlapping, everyone fully visible. ` +
    `No text, no names, no labels anywhere in the image.`
  );
}

// Pad naar het ingebakken voorbeeldbeeld van een tekenstijl. Vooraf gegenereerd
// in public/style-previews/<id>.jpg — net als de voice-previews kost bekijken dus
// niets. Alle vier tonen dezelfde scène met dezelfde seed, zodat de gebruiker
// alleen het STIJLVERSCHIL ziet en niet een ander plaatje.
export function stylePreviewUrl(styleId: string): string {
  return `/style-previews/${styleId}.jpg`;
}
