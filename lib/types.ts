export type ProjectMode = "wizard" | "free" | "photo";
export type ImageModel = "flux-schnell" | "flux-pro" | "dall-e-3" | "controlnet" | "recraft";

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

export type VisualStyle =
  | "Cinematic"
  | "Realistic"
  | "Whiteboard"
  | "2D Cartoon"
  | "2D SaaS"
  | "Motion Graphic"
  | "3D Pixar"
  | "3D Animatie";

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
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}
