import { describe, it, expect } from "vitest";
import { EDITOR_TOOLS, LEES_TOOLS, toolCallNaarOp } from "./tools";
import { applyOp } from "../core/ops";
import { mainVideoTrack } from "../core/invariants";
import { createEmptyTimeline, type TimelineDoc, type VideoClip } from "../timeline";

// Het model levert tool-calls; hier wordt daar een op van. Alles wat er
// doorheen komt moet door EditorCore heen kunnen — en alles wat rammelt moet
// hier stranden, want gokken op een half ingevulde call is precies hoe een
// AI-editor iemands montage sloopt.

function doc(): TimelineDoc {
  const d = createEmptyTimeline("16:9");
  mainVideoTrack(d)!.clips = [
    { id: "clp_1", type: "video", src: "x", start: 0, duration: 4 } as VideoClip,
    { id: "clp_2", type: "video", src: "x", start: 4, duration: 5 } as VideoClip,
  ];
  return d;
}

describe("de gereedschapskist", () => {
  it("noemt elke tool één keer en gebruikt de opnaam als toolnaam", () => {
    const namen = EDITOR_TOOLS.map((t) => t.function.name);
    expect(new Set(namen).size).toBe(namen.length);
    expect(namen).toContain("trim_clip");
    expect(namen).toContain("get_timeline_summary");
  });

  it("markeert de kijk-tools apart, want die veranderen niets", () => {
    for (const naam of LEES_TOOLS) {
      expect(EDITOR_TOOLS.map((t) => t.function.name)).toContain(naam);
      expect(toolCallNaarOp(naam, {})).toBeNull();
    }
  });

  it("legt elke tool uit in het Nederlands, met verplichte velden", () => {
    for (const t of EDITOR_TOOLS) {
      expect(t.function.description!.length).toBeGreaterThan(30);
      expect(t.function.parameters).toBeTruthy();
    }
  });
});

describe("toolCallNaarOp", () => {
  it("maakt van een trim-call een op die EditorCore accepteert", () => {
    const op = toolCallNaarOp("trim_clip", { clipId: "clp_1", edge: "out", deltaSeconds: 1.5 });
    expect(op).toEqual({ op: "trim_clip", clipId: "clp_1", edge: "out", deltaSeconds: 1.5 });
    expect(applyOp(doc(), op!).ok).toBe(true);
  });

  it("vertaalt 'geen' naar het weghalen van een overgang", () => {
    expect(toolCallNaarOp("set_transition", { clipId: "clp_1", edge: "out", kind: "geen" })).toMatchObject({
      kind: null,
    });
  });

  it("laat beforeClipId weg als hij ontbreekt (= achteraan zetten)", () => {
    expect(toolCallNaarOp("reorder_clip", { clipId: "clp_1" })).toEqual({
      op: "reorder_clip",
      clipId: "clp_1",
      beforeClipId: null,
    });
  });

  it("weigert een call met een ontbrekend of leeg clip-id", () => {
    expect(toolCallNaarOp("delete_clip", {})).toBeNull();
    expect(toolCallNaarOp("delete_clip", { clipId: "   " })).toBeNull();
  });

  it("weigert onzinwaarden in plaats van ze te raden", () => {
    expect(toolCallNaarOp("trim_clip", { clipId: "clp_1", edge: "links", deltaSeconds: 1 })).toBeNull();
    expect(toolCallNaarOp("trim_clip", { clipId: "clp_1", edge: "out", deltaSeconds: "veel" })).toBeNull();
    expect(toolCallNaarOp("set_duration", { clipId: "clp_1", duration: null })).toBeNull();
    expect(toolCallNaarOp("set_transition", { clipId: "clp_1", edge: "out", kind: "sterretjes" })).toBeNull();
  });

  it("weigert een tool die niet bestaat", () => {
    expect(toolCallNaarOp("maak_het_mooier", { clipId: "clp_1" })).toBeNull();
  });

  it("levert voor elke bewerk-tool een op die het document geldig houdt", () => {
    const calls: [string, Record<string, unknown>][] = [
      ["trim_clip", { clipId: "clp_1", edge: "in", deltaSeconds: 1 }],
      ["set_duration", { clipId: "clp_2", duration: 3 }],
      ["split_clip", { clipId: "clp_2", at: 6 }],
      ["delete_clip", { clipId: "clp_1" }],
      ["reorder_clip", { clipId: "clp_2", beforeClipId: "clp_1" }],
      ["set_transition", { clipId: "clp_1", edge: "out", kind: "fade" }],
    ];
    for (const [naam, args] of calls) {
      const op = toolCallNaarOp(naam, args);
      expect(op, `${naam} moet een op opleveren`).not.toBeNull();
      const res = applyOp(doc(), op!);
      expect(res.ok, `${naam} moet toepasbaar zijn`).toBe(true);
    }
  });
});
