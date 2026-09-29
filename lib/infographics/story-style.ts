// Gedeelde stijl-instructie voor scene-illustraties, zodat de eerste generatie
// (generate-story) en latere regeneraties/aanpassingen (scene-image) exact
// dezelfde "animatiemarkt flat infographic" look gebruiken.

import type { VisualStyle } from "@/lib/types";
import { isZin } from "@/lib/infographics/tekst-vergelijk";

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
// En daar bovenop styleVerhaalCompositie() voor de storytelling-infographic,
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
// Bij 9:16 (Sam, 28-09-2026) leverde de vaste tekst "wide establishing shot"
// geregeld een beeld op dat er inderdaad breed/liggend uitzag maar dan
// uitgeknepen op een staand canvas — een horizontale strook in het midden met
// een groot leeg grijs vlak erboven en eronder. Het beeldmodel volgt kennelijk
// het woord "wide" letterlijker dan de opdracht om het hele frame te vullen.
// Vandaar een eigen, staande versie van deze tekst voor 9:16 (nooit meer
// "wide" noemen), met een expliciet verbod op precies dat lege-balken-patroon.
//
// Twee stagiairs meldden op 29-09-2026 nog steeds een verzonnen logo
// rechtsboven, ook na de LET OP hierboven. De oude zin ("calm, open and light
// in tone, with no busy detail or dark masses") beschrijft alleen de TOON van
// de hoek — een klein rond insigne kan daar makkelijk aan voldoen, dat is ook
// "licht" en niet "druk". TOP_RIGHT_CORNER beschrijft daarom concreet de
// INHOUD (een doorlopende achtergrond, niets erbovenop), met een opsomming van
// vormen i.p.v. het woord dat we juist vermijden.
const TOP_RIGHT_CORNER =
  "The top-right corner is a plain, uninterrupted continuation of the background — the same sky, wall or " +
  "surface as the rest of the image, carried all the way into that corner, with nothing else drawn on top of " +
  "it: no separate marks, seals, circular badges, insignia, stickers or small graphic shapes placed there, " +
  "however faint or small. ";

function styleVerhaalCompositie(format?: string | null): string {
  if (format === "9:16") {
    return (
      " Compose this as a TALL, VERTICAL shot of that place: stack the depth top to bottom instead of side to " +
      "side — a close foreground low in the frame, a middle ground above it, and a background that reaches all " +
      "the way up to the very top edge (sky, ceiling, upper walls or far scenery). The illustration must fill " +
      "this entire tall portrait frame from the top edge to the bottom edge, with no plain, empty, grey or " +
      "blank band above or below the scene — never a wide, landscape-shaped or horizontally arranged picture " +
      "with empty space padded in above and below it to make it fit a tall canvas. Pay extra attention to the " +
      "BOTTOM edge specifically: extend the floor, ground or nearest surface all the way down to the very " +
      "bottom of the frame — a common mistake is stopping the floor short and leaving a plain strip underneath " +
      "it, which is exactly what must NOT happen. If the scene compares two " +
      "things side by side (a split screen, before/after, then/now), stack the two halves ONE ABOVE THE OTHER " +
      "instead — an upper half and a lower half, each spanning the FULL WIDTH of the frame, divided by a single " +
      "horizontal line — never place them left and right, because a left-right split only fills a thin strip of " +
      "a tall canvas and leaves the rest empty. Keep the main subject in the centre or the lower half. " +
      TOP_RIGHT_CORNER +
      "Use a muted, natural, harmonious colour palette with soft flat shapes. "
    );
  }
  return (
    " Compose this as a wide establishing shot of that place, with clear depth: a foreground, a middle ground " +
    "and a background that runs all the way to the top edge of the frame (sky, horizon, wall or far scenery). " +
    "This image fills a whole video frame, so let it read from edge to edge and keep the main subject in the " +
    "centre or the lower half. " +
    TOP_RIGHT_CORNER +
    "Use a muted, natural, harmonious colour palette with soft flat shapes. "
  );
}

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
  /**
   * Alleen zichtbaar voor accounts die er toestemming voor hebben (zie
   * magRealistischeStijl in lib/studio/access.ts). Zo kan een stijl eerst bij
   * één klant draaien zonder in ieders menu te verschijnen.
   */
  beperkt?: boolean;
  /**
   * Stijl-referentiepack dat meegaat naar het beeldmodel (lib/style-packs.ts).
   * De andere stijlen doen het met alleen de preamble; een levensechte look
   * krijg je met tekst alleen niet betrouwbaar, dus die leunt op voorbeelden.
   */
  visualStyle?: VisualStyle;
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
  {
    // Levensechte beelden in plaats van een tekening. De stijl bestond al als
    // referentiepack voor de Creator Studio ("Realistic Animation", mei 2026);
    // hier komt hij als keuze in de storytelling-tool. Bewust `beperkt`: dit
    // lijkt op echt gefilmd materiaal, dus eerst bij één klant.
    id: "realistisch",
    name: "Realistisch",
    tagline: "Levensecht, geen tekening",
    emoji: "📷",
    beperkt: true,
    visualStyle: "Realistic",
    // De bewoordingen komen uit de oorspronkelijke stijlen "Realistic" en
    // "Cinematic" die tot 26-05-2026 in de wizard zaten (commit 71822a5 haalde
    // ze weg toen stijl op referentiebeelden overging).
    preamble:
      "Photorealistic photograph, shot on a full-frame DSLR, natural daylight, documentary photography. " +
      "Real people in real locations: natural skin texture, real fabrics and materials, true-to-life " +
      "proportions and anatomy, shallow depth of field with a softly blurred background, subtle film grain, " +
      "ultra-sharp focus, true-to-life colors. " +
      "No CGI, no illustration, no digital art, NOT a cartoon, NOT flat vector, no outlines. Real photograph only. ",
  },
];

/**
 * Korte Engelse naam van de stijl, voor prompts die een bestaand beeld bewerken
 * ("houd de stijl hetzelfde").
 *
 * Waarom dit bestaat: de opschoonronde en de bewerker schreven allebei letterlijk
 * "the flat vector illustration style" voor, ongeacht wat de klant koos. Een
 * papercut-verhaal kreeg daardoor bij elke opschoonronde een zetje richting
 * vlakke vector, en binnen één video stonden zo meerdere stijlen door elkaar.
 * Voor de realistische stijl is het nog schadelijker: die wordt dan een tekening.
 */
const STIJL_OMSCHRIJVING: Record<string, string> = {
  "flat-vector": "the flat vector illustration style",
  "marker-sketch": "the loose hand-drawn ink-and-marker illustration style",
  papercut: "the layered paper-cut collage style",
  "soft-3d": "the soft rounded 3D illustration style",
  realistisch: "the photorealistic live-action photographic look",
  "geschiedenis-cartoon": "the humorous cel-shaded history-cartoon style",
};

export function stijlOmschrijving(styleId: string | null | undefined): string {
  return STIJL_OMSCHRIJVING[styleId ?? ""] ?? STIJL_OMSCHRIJVING["flat-vector"];
}

/** De stijlen die dit account mag kiezen: de vrije stijlen plus waar het recht op heeft. */
export function stijlenVoor(magRealistisch: boolean): StoryStylePreset[] {
  return STORY_STYLE_PRESETS.filter((s) => !s.beperkt || magRealistisch);
}

/** Het referentiepack bij een stijl, als die er een heeft. */
export function visualStyleVan(styleId: string | null | undefined): VisualStyle | null {
  return STORY_STYLE_PRESETS.find((s) => s.id === styleId)?.visualStyle ?? null;
}

/** Is dit een stijl die niet elk account mag gebruiken? */
export function isBeperkteStijl(styleId: string | null | undefined): boolean {
  return STORY_STYLE_PRESETS.some((s) => s.id === styleId && s.beperkt === true);
}

// ---------------------------------------------------------------------------
// INTERNE TEKENSTIJLEN — alleen voor ons eigen team.
//
// Bewust een aparte lijst en niet een vlag op STORY_STYLE_PRESETS: die lijst
// voedt ook de dialoogtool, waar de AI zelf een stijl uit kiest en de chat er
// een enum van maakt. Een interne stijl daarin zou dus bij klanten kunnen
// opduiken zonder dat iemand hem aanklikt. Wie hier een stijl zoekt voor een
// prompt gebruikt vindStijl(); wie een kiezer voor klanten bouwt, blijft bij
// STORY_STYLE_PRESETS.
//
// Geschiedenis-cartoon is gemaakt voor onze eigen history-shorts
// (@jouwanimatievideo.history): een mix van een cel-shaded comedy-cartoon
// (ronde witte koppen, overdreven reacties, één visuele grap per beeld) en een
// geschiedenis-kaartvideo (geschilderde reliëfkaarten, gekleurde gebieden,
// legers als groepjes koppen).
// ---------------------------------------------------------------------------
export const INTERNE_STIJLEN: StoryStylePreset[] = [
  {
    id: "geschiedenis-cartoon",
    name: "Geschiedenis-cartoon",
    tagline: "Intern · history shorts",
    emoji: "🏺",
    preamble:
      "Humorous animated history cartoon, mixing a cel-shaded comedy cartoon with a hand-painted history-map explainer. " +
      "Characters are short, chunky cartoon figures with round, plain white heads that are large but in proportion — about " +
      "one third of their total height, sitting on a real neck and body — with tiny black dot eyes, simple " +
      "expressive eyebrows and at most a small mouth or moustache. They wear historically accurate period clothing " +
      "(uniforms, robes, armour, hats, lab coats) drawn with bold dark outlines and simple two-tone cel shading. Poses and " +
      "reactions are exaggerated for comedy: shocked stares, smug grins, panic, deadpan disbelief. Backgrounds are richly " +
      "painted and atmospheric with visible brush texture, in an earthy, slightly muted period palette (olive, ochre, " +
      "rust, stone grey, dusty sky blue) with one warm accent colour. When the scene is about geography, a journey or a " +
      "war, show it as a textured relief map of the real region (painted terrain, blue seas) with flat coloured " +
      "territories, bold hand-drawn arrows and routes, and armies shown as clusters of small cartoon heads. Add one small " +
      "visual gag that fits the story: an absurd detail, an over-the-top reaction or an ironic object. " +
      "Not photorealistic, not 3D, not anime. ",
  },
];

/** Alle stijlen, klant én intern: alleen om een bekende id op te zoeken. */
export const ALLE_STIJLEN: StoryStylePreset[] = [...STORY_STYLE_PRESETS, ...INTERNE_STIJLEN];

export function isInterneStijl(styleId?: string | null): boolean {
  return INTERNE_STIJLEN.some((s) => s.id === styleId);
}

/**
 * De stijl die de server echt gebruikt.
 *
 * Een verborgen kaartje in de kiezer is geen grendel: wie de aanroep naspeelt,
 * kan elke id meesturen. Daarom valt een interne stijl voor een klantaccount
 * hier terug op de standaard — hetzelfde patroon als de overheidsmodus.
 */
export function toegestaneStijl(styleId: string | null | undefined, magIntern: boolean): string {
  const id = styleId ?? DEFAULT_STORY_STYLE;
  return isInterneStijl(id) && !magIntern ? DEFAULT_STORY_STYLE : id;
}

export const DEFAULT_STORY_STYLE = "flat-vector";

export function storyStylePreamble(styleId?: string | null): string {
  return ALLE_STIJLEN.find((s) => s.id === styleId)?.preamble ?? STYLE_PREAMBLE;
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

  // EEN GEVRAAGDE ZIN IS GEEN LABEL.
  //
  // De regels hieronder zijn geschreven voor losse labels bij een balk of een
  // icoon: klein houden, nooit het hoofdelement, nooit in een leeg vlak. Precies
  // die drie regels verbieden een tekstballon of een zin op een beeldscherm —
  // en dat is wel wat klanten vragen (twee meldingen, 24 en 25-09-2026).
  if (woorden.some(isZin)) {
    return (
      ` TEXT — this image must contain this exact text, clearly readable: ${lijst}. ` +
      `Spell it exactly as written here, character for character, including accents, capitals and punctuation. ` +
      `Place it where the scene says it belongs — inside a speech bubble, on a screen, on a sign or on a note — ` +
      `drawn as part of the illustration, in a clean plain sans-serif, large enough to read comfortably and with ` +
      `clear contrast against its background. The text may take up real space in the image; give it room rather ` +
      `than shrinking it until it is unreadable. Do not translate it, do not shorten it, and add no other word, ` +
      `letter, number, caption or heading anywhere in the image. ` +
      MERK_NEGATIEF
    );
  }

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
  labels?: string[] | null,
  /** "16:9" of "9:16" — bepaalt of de compositie-instructie breed of staand is. */
  format?: string | null
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
    kaderKeuze === "verhaal" ? `${STYLE_OMGEVING}${styleVerhaalCompositie(format)}`
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

// Bijfiguren die te veel op de vaste personages lijken (Sam, 27-09-2026): een
// scène met Thomas en drie collega's leverde drie collega's op die er bijna
// hetzelfde uitzagen als Thomas zelf, en een klas met Milan erin tekende de
// klasgenootjes als kopieën van Milan. "Mag afwijken" / "moet anders zijn" bleek
// te vaag om tegen een sterk referentiebeeld (castblad, anker, mascotte-foto) op
// te boksen — het beeldmodel pakt zonder concreet alternatief gewoon het gezicht
// dat het al ziet. Vandaar deze tekst met CONCRETE, tegenstrijdige kenmerken
// (haarkleur, bouw, huidskleur, kleding) i.p.v. het woord "anders".
const EXTRAS_MOETEN_VERSCHILLEN =
  "Any other, unnamed people in the scene are ordinary background extras — they are not related to this character " +
  "and must not resemble them. Give every extra a hair colour, hairstyle, build, age and skin tone that is visibly " +
  "different from this character, and different clothing colours too. If there is more than one extra in the same " +
  "image, also make them clearly different from each other: vary hair colour, build and outfit so no two people in " +
  "the picture look like siblings or copies of one another. Extras are never smaller or younger copies of this " +
  "character.";

export const CHARACTER_GUIDANCE =
  " A reference image of a RECURRING CHARACTER / mascot is provided. Wherever the scene has a main character, " +
  "draw THIS SAME character — match its design, face, hair, outfit, colours and proportions — redrawn in the " +
  "illustration style described above (not a photo). Keep this character visually identical and recognisable " +
  "across every scene. " +
  EXTRAS_MOETEN_VERSCHILLEN;

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
  "Other, unnamed background people must NOT be copied from the reference image: give each of them a different hair " +
  "colour, build, age and skin tone than the cast and than each other, in that same art style.";

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
    `outfit or hair colour, and never swap their roles. Any other people in the scene are unrelated background extras: ` +
    `give each of them a hair colour, hairstyle, build, age and skin tone that is visibly different from every cast ` +
    `member listed above and from each other — no two people in the image may share the same hair colour, build and ` +
    `outfit — so the viewer can always tell who is who.`
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
  "line-up pose or its plain background — this scene has its own location and action. Only the people on that sheet may " +
  "look like the people on that sheet: any other, unnamed person in the scene must have a different hair colour, build, " +
  "age and skin tone than everyone on the sheet — never copy the sheet's faces onto background extras.";

/**
 * De regel voor een scene waar de vaste cast NIET in hoort.
 *
 * Het castblad ging naar élke scene mee, ook naar scenes waar de regie niemand
 * had ingedeeld. In een verhaal over Pompeii stonden de Romeinse personages
 * daardoor ook in de scenes over het heden. Nu krijgt zo'n scene het blad niet
 * meer, en deze zin erbij — anders vult het model de leegte alsnog met de mensen
 * die het uit de andere beelden kent.
 */
export const GEEN_CAST_IN_SCENE =
  " The recurring characters of this video do NOT appear in this scene. Draw only the people that this scene's own " +
  "description asks for — different people, in clothing that fits this moment and this era — or no people at all if the " +
  "description mentions none. Never bring back a character from another scene here.";

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

/**
 * Welke naam op welke positie van het castblad staat — voor scenes waar de
 * cast alleen een tekstbeschrijving heeft, geen eigen portret.
 *
 * Zonder deze regel kreeg het beeldmodel per scene alleen de namen die er
 * horen te staan (via castGuidance) én het volledige castblad met alle vier
 * gezichten, maar nooit de koppeling "positie 3 op het blad = Professor
 * Dunning". Bij een scene waarin de handlanger "als een leraar" iets uitlegt,
 * pakte het model dan het gezicht van de professor — die associeert het met
 * "lesgeven" — in plaats van de handlanger. Dit herhaalt de volgorde die ook
 * op het blad zelf staat (zie buildCastSheetBrief, zelfde array-volgorde), zodat
 * het model een naam aan een positie koppelt in plaats van aan de inhoud van
 * de scene.
 */
export function castSheetOrderLine(cast: StoryCastMemberLike[]): string {
  const leden = (cast ?? []).filter((c) => c?.name?.trim() && c?.appearance?.trim());
  if (leden.length < 2) return "";
  const namen = leden.map((c, i) => `${i + 1}. ${c.name.trim().toUpperCase()}`).join(", ");
  return (
    ` The line-up sheet shows these people in exactly this left-to-right order: ${namen}. ` +
    `Match each name in this scene to that exact position on the sheet — never pick a face because it ` +
    `fits the scene's action or mood better; identity always comes from the name, not from what the person is doing.`
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
