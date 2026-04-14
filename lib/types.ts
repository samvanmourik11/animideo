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
  | "Flat Illustration"
  | "3D Render"
  | "Realistic"
  | "Whiteboard"
  | "Cinematic";

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
}

export interface Project {
  id: string;
  user_id: string;
  title: string;
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
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}
