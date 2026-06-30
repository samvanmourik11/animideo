import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

type FalAudio = { audio?: { url: string } };

// Zet narration om in spraak via fal.ai's ElevenLabs (zelfde endpoint als de
// studio voice-over). Geeft de mp3-bytes terug zodat de export ze per scene kan
// timen en muxen.
export async function synthesizeNarration(
  text: string,
  opts?: { voice?: string; languageCode?: string; speed?: number }
): Promise<ArrayBuffer> {
  const result = await fal.subscribe("fal-ai/elevenlabs/tts/eleven-v3", {
    input: {
      text,
      voice: opts?.voice ?? "Charlotte",
      language_code: opts?.languageCode ?? "nl",
      stability: 0.5,
      similarity_boost: 0.75,
      speed: opts?.speed ?? 1,
    },
  });
  const url = (result.data as FalAudio).audio?.url;
  if (!url) throw new Error("Geen audio ontvangen van TTS");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Audio download mislukt (HTTP ${res.status})`);
  return res.arrayBuffer();
}
