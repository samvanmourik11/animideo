import { describe, it, expect } from "vitest";
import {
  computeDuration,
  createEmptyTimeline,
  keyframeValueAt,
  migrateTimeline,
  TIMELINE_VERSION,
  validateTimeline,
  type TimelineDoc,
  type VideoClip,
} from "./timeline";

// Het Timeline Document is de bron van waarheid voor zowel de preview als de
// server-render. Er staan al klantprojecten in `editor_projects`, dus een
// schemawijziging mag nooit een bestaand document breken — vandaar dat de
// migratie hier het zwaarst getest wordt.

function videoClip(over: Partial<VideoClip> = {}): VideoClip {
  return {
    id: over.id ?? "clp_test",
    type: "video",
    src: "https://example.test/clip.mp4",
    start: over.start ?? 0,
    duration: over.duration ?? 5,
    ...over,
  };
}

describe("computeDuration", () => {
  it("geeft het verste eindpunt over alle tracks, niet de som", () => {
    const doc = createEmptyTimeline("16:9");
    doc.tracks[0].clips.push(videoClip({ id: "a", start: 0, duration: 4 }));
    doc.tracks[3].clips.push(videoClip({ id: "b", start: 2, duration: 7 }));
    expect(computeDuration(doc)).toBe(9);
  });

  it("is 0 op een leeg document", () => {
    expect(computeDuration(createEmptyTimeline())).toBe(0);
  });
});

describe("migrateTimeline", () => {
  it("houdt bestaande clips heel en hoogt de versie op", () => {
    const oud = createEmptyTimeline("9:16");
    oud.version = 1;
    oud.tracks[0].clips.push(videoClip({ id: "behouden", start: 1, duration: 3 }));

    const nieuw = migrateTimeline(oud);
    expect(nieuw.version).toBe(TIMELINE_VERSION);
    const ids = nieuw.tracks.flatMap((t) => t.clips.map((c) => c.id));
    expect(ids).toContain("behouden");
    expect(computeDuration(nieuw)).toBe(4);
  });

  it("voegt een ontbrekende overlay-track toe, direct boven video", () => {
    const zonderOverlay = {
      ...createEmptyTimeline(),
      tracks: createEmptyTimeline().tracks.filter((t) => t.kind !== "overlay"),
    };
    const nieuw = migrateTimeline(zonderOverlay);
    const kinds = nieuw.tracks.map((t) => t.kind);
    expect(kinds).toContain("overlay");
    expect(kinds.indexOf("overlay")).toBe(kinds.indexOf("video") + 1);
  });

  it("levert een bruikbaar document op bij rommel uit de database", () => {
    const doc = migrateTimeline(null as unknown as TimelineDoc);
    expect(validateTimeline(doc)).toEqual([]);
  });

  // v1 → v2: `meta` is additief. Een bestaand project heeft het niet en moet
  // gewoon blijven werken; een project dat het wél heeft mag het niet verliezen.
  it("laat een v1-document zonder clip-meta ongemoeid werken", () => {
    const v1 = createEmptyTimeline();
    v1.version = 1;
    v1.tracks[0].clips.push(videoClip({ id: "oud" }));

    const nieuw = migrateTimeline(v1);
    expect(nieuw.version).toBe(2);
    expect(nieuw.tracks[0].clips[0].meta).toBeUndefined();
    expect(validateTimeline(nieuw)).toEqual([]);
  });

  it("behoudt clip-meta bij een migratie", () => {
    const doc = createEmptyTimeline();
    doc.tracks[0].clips.push(
      videoClip({ id: "met-meta", meta: { sceneIndex: 3, transcript: "Probeer het gratis" } })
    );
    expect(migrateTimeline(doc).tracks[0].clips[0].meta).toEqual({
      sceneIndex: 3,
      transcript: "Probeer het gratis",
    });
  });
});

describe("keyframeValueAt", () => {
  const clip = videoClip({
    duration: 10,
    keyframes: [
      { property: "scale", time: 0, value: 1 },
      { property: "scale", time: 10, value: 2 },
    ],
  });

  it("interpoleert lineair tussen twee keyframes", () => {
    expect(keyframeValueAt(clip, "scale", 5, 1)).toBeCloseTo(1.5);
  });

  it("klemt buiten het bereik op het eerste/laatste keyframe", () => {
    expect(keyframeValueAt(clip, "scale", -3, 1)).toBe(1);
    expect(keyframeValueAt(clip, "scale", 99, 1)).toBe(2);
  });

  it("valt terug op de statische waarde als de eigenschap geen keyframes heeft", () => {
    expect(keyframeValueAt(clip, "rotation", 5, 42)).toBe(42);
  });
});
