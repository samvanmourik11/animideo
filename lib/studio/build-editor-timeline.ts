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
  type ClipMeta,
  type ImageClip,
  type Ratio,
  type Track,
  type TimelineDoc,
  type VideoClip,
} from "@/lib/editor/timeline";
import type { Project, Scene } from "@/lib/types";

const DEFAULT_SCENE_DURATION = 5; // seconden, als een scène (nog) geen duur heeft

const uid = () => crypto.randomUUID();


/**
 * Scène-context voor in `clip.meta`. `label` is wat de gebruiker in de tijdlijn
 * en de chat ziet: de eerste woorden van de voice-over zeggen meer dan
 * "Scène 4", maar zonder voice-over valt hij terug op het scènenummer.
 */
function sceneMeta(scene: Scene, index: number): ClipMeta {
  const gesproken = (scene.voiceover_text ?? "").trim();
  const nummer = scene.number || index + 1;
  return {
    sceneIndex: nummer,
    genPrompt: scene.image_prompt || undefined,
    transcript: gesproken || undefined,
    label: gesproken ? kort(gesproken) : `Scène ${nummer}`,
    source: "studio",
  };
}

/** Eerste ~40 tekens, niet middenin een woord afgekapt. */
function kort(tekst: string): string {
  if (tekst.length <= 40) return tekst;
  const stuk = tekst.slice(0, 40);
  const spatie = stuk.lastIndexOf(" ");
  return `${(spatie > 20 ? stuk.slice(0, spatie) : stuk).trim()}…`;
}

export function buildEditorTimeline(project: Project): TimelineDoc {
  const ratio: Ratio = project.format === "9:16" ? "9:16" : "16:9";
  const doc = createEmptyTimeline(ratio);

  const videoTrack = doc.tracks.find((t) => t.kind === "video");
  const audioTrack = doc.tracks.find((t) => t.kind === "audio");

  // 1) Scènes sequentieel op de videotrack.
  let cursor = 0;
  project.scenes?.forEach((scene, i) => {
    const duration = scene.duration && scene.duration > 0 ? scene.duration : DEFAULT_SCENE_DURATION;
    // Wat de Studio van deze scène weet, reist mee de editor in: de AI-editor
    // kan daardoor over de inhoud praten ("de scène waarin ze de prijs noemt")
    // zonder de video te hoeven analyseren. Zonder dit is een clip in de editor
    // niet meer dan een URL.
    const meta = sceneMeta(scene, i);

    if (scene.video_url) {
      const clip: VideoClip = {
        id: uid(),
        type: "video",
        src: scene.video_url,
        start: cursor,
        duration,
        volume: 1,
        meta,
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
        meta,
      };
      videoTrack?.clips.push(clip);
    }

    cursor += duration;
  });

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
      meta: { label: "Voice-over", source: "studio" },
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
          loop: true,
          meta: { label: "Achtergrondmuziek", source: "studio" },
        } satisfies AudioClip,
      ],
    };
    doc.tracks.push(musicTrack);
  }

  return doc;
}
