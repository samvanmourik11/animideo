import { describe, it, expect } from "vitest";
import { buildEditorTimeline } from "./build-editor-timeline";
import { computeDuration } from "@/lib/editor/timeline";
import type { Project, Scene } from "@/lib/types";

// Deze brug bepaalt met hoeveel kennis de editor opent. Alles wat hier
// wegvalt, kan de AI-editor later niet meer weten — de video zelf vertelt niet
// wat de bedoeling was.

function scene(over: Partial<Scene>): Scene {
  return {
    id: over.id ?? "sc1",
    number: over.number ?? 1,
    duration: over.duration ?? 5,
    voiceover_text: over.voiceover_text ?? "",
    image_prompt: over.image_prompt ?? "",
    motion_prompt: "",
    image_url: over.image_url ?? null,
    video_url: over.video_url ?? null,
    canvas_json: null,
    ...over,
  } as Scene;
}

function project(over: Partial<Project>): Project {
  return {
    id: "p1",
    format: "16:9",
    scenes: [],
    voice_audio_url: null,
    bg_music_url: null,
    ...over,
  } as unknown as Project;
}

describe("buildEditorTimeline", () => {
  it("neemt scène-context mee op elke clip", () => {
    const doc = buildEditorTimeline(
      project({
        scenes: [
          scene({
            id: "a",
            number: 1,
            video_url: "https://example.test/a.mp4",
            voiceover_text: "Elke ondernemer kent dit probleem maar al te goed",
            image_prompt: "kantoor, vrouw achter laptop",
          }),
        ],
      })
    );

    const clip = doc.tracks.find((t) => t.kind === "video")!.clips[0];
    expect(clip.meta?.sceneIndex).toBe(1);
    expect(clip.meta?.transcript).toBe("Elke ondernemer kent dit probleem maar al te goed");
    expect(clip.meta?.genPrompt).toBe("kantoor, vrouw achter laptop");
    expect(clip.meta?.source).toBe("studio");
  });

  it("kort het label af op een woordgrens en valt terug op het scènenummer", () => {
    const doc = buildEditorTimeline(
      project({
        scenes: [
          scene({ id: "a", number: 1, image_url: "https://example.test/a.png", voiceover_text: "Elke ondernemer kent dit probleem maar al te goed" }),
          scene({ id: "b", number: 2, image_url: "https://example.test/b.png" }),
        ],
      })
    );

    const [eerste, tweede] = doc.tracks.find((t) => t.kind === "video")!.clips;
    expect(eerste.meta?.label).toBe("Elke ondernemer kent dit probleem maar…");
    expect(eerste.meta?.label!.length).toBeLessThanOrEqual(41);
    expect(tweede.meta?.label).toBe("Scène 2");
  });

  it("labelt voice-over en muziek, zodat de AI ze kan aanwijzen", () => {
    const doc = buildEditorTimeline(
      project({
        scenes: [scene({ video_url: "https://example.test/a.mp4", duration: 4 })],
        voice_audio_url: "https://example.test/vo.mp3",
        bg_music_url: "https://example.test/muziek.mp3",
      })
    );

    const labels = doc.tracks
      .filter((t) => t.kind === "audio")
      .flatMap((t) => t.clips.map((c) => c.meta?.label));
    expect(labels).toContain("Voice-over");
    expect(labels).toContain("Achtergrondmuziek");
  });

  it("zet scènes achter elkaar zonder gaten", () => {
    const doc = buildEditorTimeline(
      project({
        scenes: [
          scene({ id: "a", video_url: "https://example.test/a.mp4", duration: 3 }),
          scene({ id: "b", video_url: "https://example.test/b.mp4", duration: 4 }),
        ],
      })
    );

    const clips = doc.tracks.find((t) => t.kind === "video")!.clips;
    expect(clips.map((c) => c.start)).toEqual([0, 3]);
    expect(computeDuration(doc)).toBe(7);
  });
});
