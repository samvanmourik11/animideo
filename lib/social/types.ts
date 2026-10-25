// De Social-studio: wat zowel het scherm als de server kent.

import { CREDIT_COSTS } from "@/lib/credit-costs";

export const PLATFORMS = [
  { id: "instagram", naam: "Instagram", icoon: "📸", video: false },
  { id: "tiktok", naam: "TikTok", icoon: "🎵", video: true },
  { id: "facebook", naam: "Facebook", icoon: "👍", video: false },
  { id: "youtube", naam: "YouTube", icoon: "▶️", video: true },
  { id: "twitter", naam: "X", icoon: "𝕏", video: false },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]["id"];

/** TikTok en YouTube nemen alleen video aan; een beeldpost gaat daar niet heen. */
export const ALLEEN_VIDEO = new Set<string>(PLATFORMS.filter((p) => p.video).map((p) => p.id));

export function platform(id: string) {
  return PLATFORMS.find((p) => p.id === id);
}

export interface Kanaal {
  platform: PlatformId;
  accountId: string;
  naam: string;
}

export type Modus = "controleren" | "plaatsen";
export type PostStatus = "idee" | "gepland" | "maken" | "te_keuren" | "ingepland" | "geplaatst" | "mislukt";

export const STATUS_LABEL: Record<PostStatus, string> = {
  idee: "Idee",
  gepland: "Wacht op maken",
  maken: "Wordt gemaakt",
  te_keuren: "Keur jij hem?",
  ingepland: "Ingepland",
  geplaatst: "Geplaatst",
  mislukt: "Mislukt",
};

export interface Kalender {
  id: string;
  titel: string;
  briefing: string;
  kanalen: Kanaal[];
  modus: Modus;
  start_datum: string;
  weken: number;
  per_week: number;
  status: "ideeen_maken" | "ideeen" | "actief" | "fout" | "gestopt";
  foutmelding: string | null;
  /** Eigen foto's van de klant (product, logo, winkel): voorbeelden voor de beelden. */
  fotos: { url: string; naam: string }[];
  /** Tekst op de eindkaart van video's, bv. de website. */
  eindkaart: string | null;
  created_at: string;
}

export interface Post {
  id: string;
  kalender_id: string;
  gepland_op: string;
  platforms: string[];
  soort: "beeld" | "video";
  idee: string;
  tekst: string;
  tekst_kort: string | null;
  titel: string | null;
  beeld_prompt: string;
  beweging: string | null;
  beeld_id: string | null;
  video_id: string | null;
  montage_id: string | null;
  referenties: string[];
  voiceover: string | null;
  muziek: string | null;
  status: PostStatus;
  zernio_post: string | null;
  links: Record<string, string>;
  foutmelding: string | null;
}

/** Credits van één post: een beeld (standaard); bij video ook de beweging (Seedance Lite) en de voice-over. */
export const POST_CREDITS = { beeld: CREDIT_COSTS.IMAGE_GENERATION, video: CREDIT_COSTS.IMAGE_GENERATION + CREDIT_COSTS.VIDEO_GENERATION + CREDIT_COSTS.VOICE } as const;
export const MAX_FOTOS = 6;
