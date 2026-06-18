// De stemmen die in de storytelling-tool gekozen kunnen worden. De id moet
// exact overeenkomen met een naam uit ALLOWED_VOICES in de scene-voice route
// (fal-ai/elevenlabs). De preview is een vooraf gegenereerde mp3 in
// public/voice-previews/<id>.mp3, zodat luisteren naar een stem niets kost
// (er wordt niets gegenereerd, alleen een statisch bestand afgespeeld).

export interface StoryVoice {
  id: string;
  label: string;
  description: string;
}

export const STORY_VOICES: StoryVoice[] = [
  { id: "Charlotte", label: "Charlotte", description: "warme vrouwenstem" },
  { id: "Sarah", label: "Sarah", description: "heldere vrouwenstem" },
  { id: "Daniel", label: "Daniel", description: "rustige mannenstem" },
  { id: "George", label: "George", description: "warme mannenstem" },
];

export const DEFAULT_VOICE = "Charlotte";

// Pad naar de ingebakken preview-mp3 voor een stem.
export function voicePreviewUrl(voiceId: string): string {
  return `/voice-previews/${voiceId}.mp3`;
}
