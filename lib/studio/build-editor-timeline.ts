// Zet een Studio-project om naar een Timeline Document voor de nieuwe editor.
//
// De Studio heeft op het einde van de wizard al alles wat we nodig hebben:
//   - per scène een gerenderde motion-clip (scene.video_url), met het stilstaande
//     beeld (scene.image_url) als fallback wanneer er nog geen motion is;
//   - één doorlopende voice-over (project.voice_audio_url);
//   - optionele achtergrondmuziek (project.bg_music_url).
//
// We hoeven dus NIETS opnieuw te renderen: we verwijzen rechtstreeks naar de
// bestaande asset-URL's en plaatsen ze op de juiste tracks/tijden. Zo opent de
// editor met exact de video die de gebruiker in de wizard heeft opgebouwd.

import {
  createEmptyTimeline,
  type AudioClip,
  type ImageClip,
  type Ratio,
  type Track,
  type TimelineDoc,
  type VideoClip,
} from "@/lib/editor/timeline";
import type { Project } from "@/lib/types";

const DEFAULT_SCENE_DURATION = 5; // seconden, als een scène (nog) geen duur heeft

const uid = () => crypto.randomUUID();

export function buildEditorTimeline(project: Project): TimelineDoc {
  const ratio: Ratio = project.format === "9:16" ? "9:16" : "16:9";
  const doc = createEmptyTimeline(ratio);

  const videoTrack = doc.tracks.find((t) => t.kind === "video");
  const audioTrack = doc.tracks.find((t) => t.kind === "audio");

  // 1) Scènes sequentieel op de videotrack.
  let cursor = 0;
  for (const scene of project.scenes ?? []) {
    const duration = scene.duration && scene.duration > 0 ? scene.duration : DEFAULT_SCENE_DURATION;

    if (scene.video_url) {
      const clip: VideoClip = {
        id: uid(),
        type: "video",
        src: scene.video_url,
        start: cursor,
        duration,
        volume: 1,
      };
      videoTrack?.clips.push(clip);
    } else if (scene.image_url) {
      // Nog geen beweging: toon het stilstaande beeld voor dezelfde duur.
      const clip: ImageClip = {
        id: uid(),
        type: "image",
        src: scene.image_url,
        start: cursor,
        duration,
      };
      videoTrack?.clips.push(clip);
    }

    cursor += duration;
  }

  const total = cursor || DEFAULT_SCENE_DURATION;

  // 2) Voice-over als één doorlopende audioclip.
  if (project.voice_audio_url && audioTrack) {
    const vo: AudioClip = {
      id: uid(),
      type: "audio",
      src: project.voice_audio_url,
      start: 0,
      duration: total,
      volume: 1,
    };
    audioTrack.clips.push(vo);
  }

  // 3) Achtergrondmuziek op een aparte, zachtere audiotrack.
  if (project.bg_music_url) {
    const musicTrack: Track = {
      id: uid(),
      kind: "audio",
      name: "Muziek",
      clips: [
        {
          id: uid(),
          type: "audio",
          src: project.bg_music_url,
          start: 0,
          duration: total,
          volume: 0.18,
        } satisfies AudioClip,
      ],
    };
    doc.tracks.push(musicTrack);
  }

  return doc;
}
