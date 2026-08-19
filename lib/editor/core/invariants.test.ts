import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  checkInvariants,
  mainVideoTrack,
  minDuration,
  normalize,
  snapToFrame,
} from "./invariants";
import { createEmptyTimeline, type Clip, type TimelineDoc, type VideoClip } from "../timeline";

// De ops-laag mag ervan uitgaan dat een genormaliseerd document klopt. Daarom
// staan hier property-based tests: niet één voorbeeld, maar honderden
// willekeurige documenten — inclusief de rare die een sleep-actie of een
// AI-fout kan opleveren.

function clip(over: Partial<VideoClip> = {}): VideoClip {
  return {
    id: over.id ?? "c1",
    type: "video",
    src: "https://example.test/a.mp4",
    start: over.start ?? 0,
    duration: over.duration ?? 5,
    ...over,
  };
}

function docMet(clips: Clip[], fps = 30): TimelineDoc {
  const doc = createEmptyTimeline("16:9");
  doc.fps = fps;
  mainVideoTrack(doc)!.clips = clips;
  return doc;
}

const clipArb = fc.record({
  start: fc.double({ min: -5, max: 120, noNaN: true }),
  duration: fc.double({ min: 0, max: 30, noNaN: true }),
  trimIn: fc.double({ min: -2, max: 20, noNaN: true }),
});

const docArb = fc
  .tuple(fc.constantFrom(24, 25, 30, 60), fc.array(clipArb, { maxLength: 12 }))
  .map(([fps, ruwe]) =>
    docMet(
      ruwe.map((c, i) => clip({ id: `c${i}`, start: c.start, duration: c.duration, trimIn: c.trimIn })),
      fps
    )
  );

describe("normalize", () => {
  it("levert altijd een document zonder raster-, start- of lengtefouten", () => {
    fc.assert(
      fc.property(docArb, (doc) => {
        const { doc: schoon } = normalize(doc);
        const codes = checkInvariants(schoon).map((v) => v.code);
        expect(codes).not.toContain("off_grid");
        expect(codes).not.toContain("negative_start");
        expect(codes).not.toContain("too_short");
      }),
      { numRuns: 300 }
    );
  });

  it("verandert niets meer als je het nog een keer draait", () => {
    fc.assert(
      fc.property(docArb, (doc) => {
        const een = normalize(doc).doc;
        const twee = normalize(een);
        expect(twee.doc).toEqual(een);
        expect(twee.repaired).toEqual([]);
      }),
      { numRuns: 200 }
    );
  });

  it("gooit nooit een clip weg", () => {
    fc.assert(
      fc.property(docArb, (doc) => {
        const voor = doc.tracks.flatMap((t) => t.clips).length;
        const na = normalize(doc).doc.tracks.flatMap((t) => t.clips).length;
        expect(na).toBe(voor);
      }),
      { numRuns: 200 }
    );
  });

  it("zet clips per spoor op volgorde", () => {
    const doc = docMet([clip({ id: "b", start: 10 }), clip({ id: "a", start: 0 })]);
    const starts = normalize(doc).doc.tracks.flatMap((t) => t.clips).map((c) => c.start);
    expect(starts).toEqual([...starts].sort((x, y) => x - y));
  });

  it("laat de montage staan: overlappen worden gemeld, niet verschoven", () => {
    const doc = docMet([clip({ id: "a", start: 0, duration: 5 }), clip({ id: "b", start: 3, duration: 5 })]);
    const { doc: schoon } = normalize(doc);
    expect(schoon.tracks.flatMap((t) => t.clips).map((c) => c.start)).toEqual([0, 3]);
    expect(checkInvariants(schoon).map((v) => v.code)).toContain("overlap");
  });
});

describe("checkInvariants", () => {
  it("is stil bij een net document", () => {
    const doc = docMet([clip({ id: "a", start: 0, duration: 4 }), clip({ id: "b", start: 4, duration: 4 })]);
    expect(checkInvariants(doc)).toEqual([]);
  });

  it("meldt een gat op het videospoor, maar niet op tekst of audio", () => {
    const metGat = docMet([clip({ id: "a", start: 0, duration: 4 }), clip({ id: "b", start: 9, duration: 4 })]);
    expect(checkInvariants(metGat).map((v) => v.code)).toContain("gap");

    const audioMetGat = createEmptyTimeline("16:9");
    audioMetGat.tracks.find((t) => t.kind === "audio")!.clips = [
      { id: "m1", type: "audio", src: "x", start: 0, duration: 2 },
      { id: "m2", type: "audio", src: "x", start: 30, duration: 2 },
    ];
    expect(checkInvariants(audioMetGat).map((v) => v.code)).not.toContain("gap");
  });

  it("meldt een clip die voorbij zijn bronmateriaal wijst", () => {
    const doc = docMet([clip({ id: "a", start: 0, duration: 10, trimIn: 5, naturalDuration: 12 })]);
    expect(checkInvariants(doc).map((v) => v.code)).toContain("trim_out_of_bounds");
  });

  it("meldt dubbele clip-id's", () => {
    const doc = docMet([clip({ id: "zelfde", start: 0, duration: 2 }), clip({ id: "zelfde", start: 2, duration: 2 })]);
    expect(checkInvariants(doc).map((v) => v.code)).toContain("duplicate_id");
  });
});

describe("snapToFrame", () => {
  it("rondt af op het dichtstbijzijnde frame", () => {
    expect(snapToFrame(1.017, 30)).toBeCloseTo(1.0333, 4); // 31 frames
    expect(snapToFrame(0.99, 25)).toBeCloseTo(1.0, 4);
  });

  it("houdt de minimale clipduur mee met de fps", () => {
    expect(minDuration(30)).toBeCloseTo(0.1, 5);
    expect(minDuration(60)).toBeCloseTo(0.05, 5);
  });
});
