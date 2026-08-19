import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { applyOp, applyOps, type Op } from "./ops";
import { checkInvariants, mainVideoTrack } from "./invariants";
import { createEmptyTimeline, type Clip, type TimelineDoc, type VideoClip } from "../timeline";

function v(id: string, start: number, duration: number, over: Partial<VideoClip> = {}): VideoClip {
  return { id, type: "video", src: `https://example.test/${id}.mp4`, start, duration, ...over };
}

/** Drie scènes achter elkaar op het videospoor, zoals de Studio ze aanlevert. */
function driesporen(): TimelineDoc {
  const doc = createEmptyTimeline("16:9");
  mainVideoTrack(doc)!.clips = [v("a", 0, 4), v("b", 4, 5), v("c", 9, 3)];
  return doc;
}

function videoClips(doc: TimelineDoc): Clip[] {
  return mainVideoTrack(doc)!.clips;
}

describe("delete_clip", () => {
  it("schuift de rest door, zodat er geen zwart gat valt", () => {
    const res = applyOp(driesporen(), { op: "delete_clip", clipId: "b" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(videoClips(res.doc).map((c) => [c.id, c.start])).toEqual([
      ["a", 0],
      ["c", 4],
    ]);
    expect(checkInvariants(res.doc)).toEqual([]);
  });

  it("laat een gat op een audiospoor juist wél staan", () => {
    const doc = createEmptyTimeline("16:9");
    const audio = doc.tracks.find((t) => t.kind === "audio")!;
    audio.clips = [
      { id: "m1", type: "audio", src: "x", start: 0, duration: 3 },
      { id: "m2", type: "audio", src: "x", start: 10, duration: 3 },
    ];
    const res = applyOp(doc, { op: "delete_clip", clipId: "m1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.doc.tracks.find((t) => t.kind === "audio")!.clips[0].start).toBe(10);
  });

  it("weigert een clip die niet bestaat", () => {
    const res = applyOp(driesporen(), { op: "delete_clip", clipId: "bestaat-niet" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("not_found");
  });
});

describe("trim_clip", () => {
  it("schuift bij de voorkant ook de bronpositie mee", () => {
    const res = applyOp(driesporen(), { op: "trim_clip", clipId: "b", edge: "in", deltaSeconds: 1 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const b = videoClips(res.doc).find((c) => c.id === "b")!;
    expect(b.duration).toBe(4);
    expect(b.trimIn).toBe(1);
    // En de tijdlijn blijft dicht: c schuift een seconde naar voren.
    expect(videoClips(res.doc).map((c) => c.start)).toEqual([0, 4, 8]);
  });

  it("kort in aan de achterkant en dicht het gat", () => {
    const res = applyOp(driesporen(), { op: "trim_clip", clipId: "a", edge: "out", deltaSeconds: 2 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(videoClips(res.doc).map((c) => [c.id, c.start, c.duration])).toEqual([
      ["a", 0, 2],
      ["b", 2, 5],
      ["c", 7, 3],
    ]);
  });

  it("weigert een trim die niets van de clip overlaat", () => {
    const res = applyOp(driesporen(), { op: "trim_clip", clipId: "a", edge: "out", deltaSeconds: 4 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("invalid");
  });

  it("weigert verlengen voorbij het bronmateriaal", () => {
    const doc = createEmptyTimeline("16:9");
    mainVideoTrack(doc)!.clips = [v("a", 0, 4, { naturalDuration: 5, trimIn: 1 })];
    const res = applyOp(doc, { op: "trim_clip", clipId: "a", edge: "out", deltaSeconds: -2 });
    expect(res.ok).toBe(false);
  });
});

describe("split_clip", () => {
  it("maakt twee clips waarvan de tweede verderop in de bron begint", () => {
    const res = applyOp(driesporen(), { op: "split_clip", clipId: "b", at: 6, newClipId: "b2" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const clips = videoClips(res.doc);
    expect(clips.map((c) => c.id)).toEqual(["a", "b", "b2", "c"]);
    expect(clips[1].duration).toBe(2);
    expect(clips[2].duration).toBe(3);
    expect(clips[2].trimIn).toBe(2);
    expect(checkInvariants(res.doc)).toEqual([]);
  });

  it("weigert een knip vlak bij de rand", () => {
    const res = applyOp(driesporen(), { op: "split_clip", clipId: "b", at: 4.01 });
    expect(res.ok).toBe(false);
  });
});

describe("reorder_clip", () => {
  it("zet een clip vóór een andere en pakt de tijdlijn opnieuw dicht", () => {
    const res = applyOp(driesporen(), { op: "reorder_clip", clipId: "c", beforeClipId: "a" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(videoClips(res.doc).map((c) => [c.id, c.start])).toEqual([
      ["c", 0],
      ["a", 3],
      ["b", 7],
    ]);
    expect(checkInvariants(res.doc)).toEqual([]);
  });

  it("zet hem achteraan zonder doelclip", () => {
    const res = applyOp(driesporen(), { op: "reorder_clip", clipId: "a" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(videoClips(res.doc).map((c) => c.id)).toEqual(["b", "c", "a"]);
  });
});

describe("move_clip", () => {
  it("wijst het videospoor door naar reorder_clip", () => {
    const res = applyOp(driesporen(), { op: "move_clip", clipId: "a", start: 20 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain("reorder_clip");
  });
});

describe("set_transition", () => {
  it("begrenst de overgang op de helft van de clip", () => {
    const doc = createEmptyTimeline("16:9");
    mainVideoTrack(doc)!.clips = [v("a", 0, 1)];
    const res = applyOp(doc, { op: "set_transition", clipId: "a", edge: "out", kind: "fade", duration: 5 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(videoClips(res.doc)[0].transitionOut?.duration).toBeLessThanOrEqual(0.5);
  });
});

describe("applyOps", () => {
  it("stopt bij de eerste fout en laat het document ongemoeid", () => {
    const doc = driesporen();
    const res = applyOps(doc, [
      { op: "delete_clip", clipId: "b" },
      { op: "delete_clip", clipId: "bestaat-niet" },
    ]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.appliedBefore).toBe(1);
    // Het origineel is niet aangeraakt: de aanroeper houdt zijn eigen document.
    expect(videoClips(doc).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("voert een reeks uit en vertelt per stap wat er gebeurde", () => {
    const res = applyOps(driesporen(), [
      { op: "trim_clip", clipId: "a", edge: "out", deltaSeconds: 1 },
      { op: "reorder_clip", clipId: "c", beforeClipId: "a" },
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.summaries).toHaveLength(2);
    expect(checkInvariants(res.doc)).toEqual([]);
  });
});

// ── Eigenschappen die voor élke op moeten gelden ─────────────────────────────

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ op: fc.constant("delete_clip" as const), clipId: fc.constantFrom("a", "b", "c") }),
  fc.record({
    op: fc.constant("trim_clip" as const),
    clipId: fc.constantFrom("a", "b", "c"),
    edge: fc.constantFrom("in" as const, "out" as const),
    deltaSeconds: fc.double({ min: -6, max: 6, noNaN: true }),
  }),
  fc.record({
    op: fc.constant("set_duration" as const),
    clipId: fc.constantFrom("a", "b", "c"),
    duration: fc.double({ min: 0, max: 20, noNaN: true }),
  }),
  fc.record({
    op: fc.constant("split_clip" as const),
    clipId: fc.constantFrom("a", "b", "c"),
    at: fc.double({ min: 0, max: 12, noNaN: true }),
  }),
  fc.record({
    op: fc.constant("reorder_clip" as const),
    clipId: fc.constantFrom("a", "b", "c"),
    beforeClipId: fc.constantFrom("a", "b", "c", null),
  })
);

describe("eigenschappen van alle ops", () => {
  it("laat de tijdlijn nooit kapot achter", () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 8 }), (ops) => {
        let doc = driesporen();
        for (const op of ops) {
          const res = applyOp(doc, op);
          if (res.ok) doc = res.doc;
        }
        // Geen overlap, geen gat, alles op het raster — na willekeurig welke reeks.
        expect(checkInvariants(doc)).toEqual([]);
      }),
      { numRuns: 400 }
    );
  });

  it("muteert het meegegeven document nooit", () => {
    fc.assert(
      fc.property(opArb, (op) => {
        const doc = driesporen();
        const kopie = structuredClone(doc);
        applyOp(doc, op);
        expect(doc).toEqual(kopie);
      }),
      { numRuns: 200 }
    );
  });
});
