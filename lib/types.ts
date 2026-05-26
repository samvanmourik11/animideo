export type ProjectMode = "wizard" | "free" | "photo" | "t2v" | "studio" | "playground";
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
  created_at: string;
  updated_at: string;
}
