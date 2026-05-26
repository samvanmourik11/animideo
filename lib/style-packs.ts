// Centrale stijl-definitie. Vanaf nu wordt stijl bepaald door referentie-
// beelden die we vooraf hebben geüpload naar de `style-refs` bucket, en die
// per generatie als image_urls meegaan naar Nano Banana Pro. De oude
// tekst-prompt-stijl ("Cinematic", "Whiteboard", etc.) is vervangen door
// deze packs.
//
// Belangrijk: het aantal refs dat we meesturen is bewust laag (3) zodat er
// nog ruimte over is in de 8-slots-limiet van Nano Banana Pro voor het
// character (hoofdpersoon) en ingredients. Drie zorgvuldig gekozen voorbeelden
// is in de praktijk genoeg om de stijl-taal over te brengen.

import type { VisualStyle } from "@/lib/types";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://suuskaaobsbttahqcoct.supabase.co";

function refUrl(slug: string, n: number): string {
  const padded = String(n).padStart(2, "0");
  return `${SUPABASE_URL}/storage/v1/object/public/style-refs/${slug}/${padded}.png`;
}

export interface StylePack {
  id: VisualStyle;
  // URL-safe slug, gebruikt als pad in de style-refs bucket. Bewust apart
  // gehouden van `id` (die kan spaties/hoofdletters bevatten zoals "3D Pixar").
  slug: string;
  name: string;
  description: string;
  // Drie best-of refs die meegaan in elke Nano Banana Pro call. Indexen
  // verwijzen naar de bestandsnummering van het upload-script.
  refIndices: number[];
  // Cover voor de visuele picker; standaard de eerste ref.
  coverIndex: number;
  // Korte prompt-fragment dat naast de refs wordt meegestuurd om de stijl
  // te benoemen. Houdt het kort — de refs doen het zware werk.
  promptHint: string;
}

export const STYLE_PACKS: StylePack[] = [
  {
    id: "Kurzgezagt",
    slug: "kurzgezagt",
    name: "Kurzgezagt",
    description:
      "Vlakke 2D animatie met zachte ronde vormen, vrolijke pastelkleuren, simpele schattige karakters.",
    refIndices: [1, 2, 3],
    coverIndex: 1,
    promptHint:
      "Flat 2D animation style: round soft shapes, friendly characters, gentle pastel palette.",
  },
  {
    id: "Realistic",
    slug: "realistic",
    name: "Realistic Animation",
    description:
      "Fotorealistische CGI/animatie met levensechte belichting, materialen en proporties.",
    refIndices: [1, 2, 3],
    coverIndex: 1,
    promptHint:
      "Realistic CGI animation style: photographic lighting, true materials, lifelike proportions.",
  },
  {
    id: "Cartoon",
    slug: "cartoon",
    name: "Cartoon",
    description:
      "Klassieke 2D cartoon met expressieve karakters, levendige kleuren en duidelijke outlines.",
    refIndices: [1, 2, 3],
    coverIndex: 1,
    promptHint:
      "Classic 2D cartoon style: expressive characters, vivid colors, bold outlines.",
  },
  {
    id: "3D Animatie",
    slug: "3d-animatie",
    name: "3D Animatie",
    description:
      "Hoogwaardige 3D animatiestijl met diepte, schaduw en filmische compositie.",
    refIndices: [1, 2, 3],
    coverIndex: 1,
    promptHint:
      "High-end 3D animation style: depth, soft shadows, cinematic composition.",
  },
  {
    id: "3D Pixar",
    slug: "3d-pixar",
    name: "3D Pixar",
    description:
      "Pixar-achtige 3D look: warme belichting, vriendelijke karakter-design, zachte sub-surface scattering.",
    // Begint met 1 ref; zodra je meer Pixar-beelden uploadt naar de folder
    // groeit het pack automatisch (script telt PNG's en pakt de eerste 3).
    refIndices: [1],
    coverIndex: 1,
    promptHint:
      "Pixar 3D animation movie style: cartoon 3D render, warm studio lighting, smooth subsurface scattering.",
  },
];

export const STYLE_PACKS_BY_ID: Record<VisualStyle, StylePack> = STYLE_PACKS.reduce(
  (acc, p) => {
    acc[p.id] = p;
    return acc;
  },
  {} as Record<VisualStyle, StylePack>
);

export function styleRefUrls(packId: VisualStyle | null | undefined): string[] {
  if (!packId) return [];
  const pack = STYLE_PACKS_BY_ID[packId];
  if (!pack) return [];
  return pack.refIndices.map((n) => refUrl(pack.slug, n));
}

export function styleCoverUrl(packId: VisualStyle): string {
  const pack = STYLE_PACKS_BY_ID[packId];
  if (!pack) return "";
  return refUrl(pack.slug, pack.coverIndex);
}

export function stylePromptHint(packId: VisualStyle | null | undefined): string {
  if (!packId) return "";
  return STYLE_PACKS_BY_ID[packId]?.promptHint ?? "";
}

// Instructie voor Nano Banana Pro: de refs zijn stijl-anker, géén template
// om karakters of kleuren letterlijk over te nemen.
export const STYLE_REF_GUIDANCE =
  "The reference images define the visual style language only (technique, line work, lighting approach, overall feel). Do NOT copy specific characters, colors, or compositions from them. Generate a new scene that matches the style aesthetic.";

// Oude stijlen die nu zijn vervangen. We mappen ze automatisch naar de
// dichtstbijzijnde nieuwe pack zodat bestaande projecten blijven werken.
const LEGACY_STYLE_MAP: Record<string, VisualStyle> = {
  Cinematic: "Realistic",
  Realistic: "Realistic",
  Whiteboard: "Cartoon",
  "2D Cartoon": "Cartoon",
  "2D SaaS": "Kurzgezagt",
  "Motion Graphic": "Kurzgezagt",
  "3D Animatie": "3D Animatie",
  "3D Pixar": "3D Pixar",
  Kurzgezagt: "Kurzgezagt",
  Cartoon: "Cartoon",
};

export function remapLegacyStyle(value: string | null | undefined): VisualStyle | null {
  if (!value) return null;
  return LEGACY_STYLE_MAP[value] ?? null;
}
