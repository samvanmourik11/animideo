export type ProjectMode = "wizard" | "free" | "photo" | "t2v" | "studio" | "playground" | "infographics" | "explainer" | "story";
export type ImageModel = "flux-schnell" | "flux-pro" | "dall-e-3" | "controlnet" | "recraft" | "seedream";
export type VideoModel = "kling-pro" | "kling-standard" | "seedance-pro" | "seedance-lite";

export interface BrandColors {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
}

export interface BrandFonts {
  primary?: string;
  secondary?: string;
}

export interface BrandReferenceImage {
  url: string;
  description: string;
}

export interface BrandKit {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  tone_of_voice: string | null;
  brand_values: string[];
  colors: BrandColors;
  fonts: BrandFonts;
  environment: string | null;
  do_nots: string | null;
  default_language: string;
  default_format: string;
  logo_url: string | null;
  reference_images: BrandReferenceImage[];
  created_at: string;
  updated_at: string;
}

export type ProjectStatus =
  | "Draft"
  | "ScriptReady"
  | "ImagesReady"
  | "MotionReady"
  | "VoiceReady"
  | "Rendering"
  | "Done"
  | "Error";

// Stijl wordt nu bepaald door referentiebeelden, niet door promptmodifiers.
// Zie lib/style-packs.ts voor de URLs en metadata van elk pack. Oude waarden
// (Cinematic, 2D SaaS, etc.) worden via remapLegacyStyle() opgevangen bij het
// laden van bestaande projecten.
export type VisualStyle =
  | "Kurzgezagt"
  | "Realistic"
  | "Cartoon"
  | "3D Animatie"
  | "3D Pixar";

export type TransitionType =
  | "cut"
  | "fade"
  | "dissolve"
  | "slide-left"
  | "slide-right"
  | "zoom-in";

export interface Scene {
  id: string;
  number: number;
  duration: number;       // seconds
  voiceover_text: string;
  image_prompt: string;
  motion_prompt: string;
  image_url: string | null;
  video_url: string | null;
  canvas_json: string | null;
  transition_out?: TransitionType; // transition applied after this scene
  source_image_url?: string | null; // original uploaded photo (photo mode only)
}

export interface Character {
  id:           string;
  user_id:      string;
  name:         string;
  description:  string | null;
  image_url:    string | null;
  source_type:  "uploaded" | "generated";
  gender:       string | null;
  age_range:    string | null;
  style:        string | null;
  created_at:   string;
  updated_at:   string;
}

/**
 * Een node op het vrije Playground-canvas. Elke node is een gegenereerd of
 * bewerkt beeld (of clip). parent_id wijst naar de node waaruit deze ontstond,
 * waardoor varianten een vertakkende geschiedenis vormen.
 */
export interface PlaygroundNode {
  id: string;
  project_id: string;
  user_id: string;
  parent_id: string | null;
  kind: "image" | "video";
  prompt: string | null;        // generatie-prompt of bewerk-instructie
  image_url: string | null;
  video_url: string | null;
  in_video: boolean;            // zit deze node in de eindmontage
  sort_order: number | null;
  voiceover_text: string | null;
  duration_sec: number | null;
  transition_out: TransitionType | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface OutroContact {
  company_name?: string;
  website?: string;
  email?: string;
  phone?: string;
  socials?: string;
  tagline?: string;
}

export interface Project {
  id: string;
  user_id: string;
  title: string;
  image_model?: ImageModel | null;
  goal: string | null;
  target_audience: string | null;
  language: string;
  format: "16:9" | "9:16";
  visual_style: VisualStyle | null;
  notes: string | null;
  script_text: string | null;
  storyboard_text: string | null;
  scenes: Scene[];
  selected_voice: string | null;
  voice_audio_url: string | null;
  bg_music_url: string | null;
  video_url: string | null;
  mode: ProjectMode;
  brand_kit_id: string | null;
  video_model: string | null;
  style_reference_url: string | null;
  character_reference_urls: string[];
  outro_logo_url: string | null;
  outro_contact: OutroContact;
  main_character_id: string | null;
  supporting_character_id: string | null;
  status: ProjectStatus;
  infographic_spec: InfographicSpec | null;
  explainer_spec: import("./explainer/spec").ExplainerSpec | null;
  story_spec: import("./infographics/story-schema").StorySpec | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Infographics: gestructureerde spec die deterministisch wordt gerenderd.
// De AI levert de inhoud als JSON (geen pixels); wij tekenen het zelf in SVG,
// zodat tekst, getallen en uitlijning altijd scherp en correct zijn.
// ─────────────────────────────────────────────────────────────────────────

export type InfographicFormat = "9:16" | "16:9";

export interface InfographicTheme {
  primary: string;     // hex — hoofdkleur (titels, accenten, balken)
  secondary: string;   // hex — secundaire datakleur
  accent: string;      // hex — opvallend accent / highlight
  background: string;  // hex — canvasachtergrond
  textColor: string;   // hex — lichaamstekst
  fontFamily?: string; // optioneel; default Inter/sans-serif
}

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;      // optionele override per punt
}

export interface StatBlock {
  type: "stat";
  id: string;
  // 1–6 kerngetallen. icon = keyword voor de icoon-badge, sub = korte context
  // (bijv. "was 8.500"). Beide optioneel; dragen de flat explainer-journey.
  items: { value: string; label: string; prefix?: string; suffix?: string; icon?: string; sub?: string }[];
}

export interface BarChartBlock {
  type: "barChart";
  id: string;
  title?: string;
  orientation?: "vertical" | "horizontal";
  unit?: string;
  data: ChartDataPoint[]; // 2–8 punten
}

export interface PieChartBlock {
  type: "pieChart";
  id: string;
  title?: string;
  variant?: "pie" | "donut";
  data: ChartDataPoint[]; // 2–6 segmenten (waarden zijn relatieve gewichten)
}

export interface LineChartBlock {
  type: "lineChart";
  id: string;
  title?: string;
  unit?: string;
  data: ChartDataPoint[]; // geordende x-as punten
}

export interface ProcessBlock {
  type: "process";
  id: string;
  title?: string;
  variant?: "steps" | "timeline"; // steps = proces, timeline = gedateerde mijlpalen
  steps: { label: string; description?: string; date?: string }[]; // 2–6
}

export interface ComparisonBlock {
  type: "comparison";
  id: string;
  title?: string;
  columns: [string, string];                              // precies twee kolomkoppen
  rows: { label: string; left: string; right: string }[]; // 2–6
}

export interface ListBlock {
  type: "list";
  id: string;
  title?: string;
  variant?: "bullets" | "numbered" | "iconGrid";
  items: { text: string; icon?: string }[]; // icon = keyword uit de ingebouwde iconenset
}

export type InfographicBlock =
  | StatBlock
  | BarChartBlock
  | PieChartBlock
  | LineChartBlock
  | ProcessBlock
  | ComparisonBlock
  | ListBlock;

export type InfographicBlockType = InfographicBlock["type"];

export interface InfographicSpec {
  version: 1;
  title: string;
  subtitle?: string;
  source?: string;             // databron / attributie in de footer
  format: InfographicFormat;
  theme: InfographicTheme;
  blocks: InfographicBlock[];  // geordend van boven naar onder (3–7 typisch)
  logoUrl?: string | null;     // uit de brandkit
}
