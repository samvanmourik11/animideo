import { describe, it, expect } from "vitest";
import { sceneCast, VERTELLER_ID, type DialogueCastMember, type DialogueScene } from "./dialogue-schema";
import type { VerhaalDeel } from "./verhaallijn";

// Aanleiding: "Tyrell, Lilly en de Wonderwagen" (13-09-2026). In acht van de twaalf
// scènes ontbrak iemand die erbij hoorde, omdat alleen wie praatte in beeld kwam,
// en oma wisselde van kant omdat ze vast "midden" had.

const lid = (id: string, name: string, position: DialogueCastMember["position"]): DialogueCastMember => ({
  id, characterId: `uuid-${name.toLowerCase()}`, name, role: "", voice: "x", portraitUrl: "p", position,
});
const CAST = [lid("char-1", "Tyrell", "left"), lid("char-2", "Lilly", "right"), lid("char-3", "Oma", "center")];

const scene = (lines: DialogueScene["lines"], deel?: number): DialogueScene => ({ id: "s", setting: "a garden", deel, lines });
const zegt = (id: string, text: string) => ({ characterId: id, text, emotion: "neutraal" });

const lijn = (wie: string[]): VerhaalDeel[] => [{ fase: null, titel: "Palmentuin", wat: "x", plek: "x", wie, verteller: "" }];

describe("sceneCast", () => {
  it("zet wie volgens de verhaallijn bij het moment is in beeld, ook als die niets zegt", () => {
    const s = scene([zegt("char-2", "Wat een mooie vogel!"), zegt("char-3", "Prachtig, hè?")], 1);
    const namen = sceneCast(s, CAST, lijn(["uuid-tyrell", "uuid-lilly", "uuid-oma"])).map((c) => c.name);
    expect(namen).toContain("Tyrell");
  });

  it("zet wie bij naam genoemd wordt in beeld", () => {
    const s = scene([zegt("char-2", "Kijk Tyrell, dat is de mooiste vogel!"), zegt("char-3", "Wat een kleuren.")]);
    expect(sceneCast(s, CAST).map((c) => c.name)).toEqual(["Tyrell", "Oma", "Lilly"]);
  });

  it("zet wie in de beeldbeschrijving staat in beeld", () => {
    const s = scene([{ kind: "actie", characterId: VERTELLER_ID, text: "Ze kozen Suriname.", emotion: "", actie: "Tyrell, Lilly and Oma sit inside the wagon." }]);
    expect(sceneCast(s, CAST)).toHaveLength(3);
  });

  it("geeft de plek in dit beeld, zonder dat iemand van kant wisselt", () => {
    const tweetal = sceneCast(scene([zegt("char-1", "Ik ruik koekjes!"), zegt("char-3", "Kom binnen.")]), CAST);
    expect(tweetal.map((c) => [c.name, c.position])).toEqual([["Tyrell", "left"], ["Oma", "right"]]);

    const lillyEnOma = sceneCast(scene([zegt("char-2", "Hoi!"), zegt("char-3", "Dag lieverd.")]), CAST);
    expect(lillyEnOma.map((c) => [c.name, c.position])).toEqual([["Oma", "left"], ["Lilly", "right"]]);

    const alleDrie = sceneCast(scene([zegt("char-1", "a"), zegt("char-2", "b"), zegt("char-3", "c")]), CAST);
    expect(alleDrie.map((c) => [c.name, c.position])).toEqual([["Tyrell", "left"], ["Oma", "center"], ["Lilly", "right"]]);
  });

  it("zet iemand alleen in het midden als hij alleen in beeld is", () => {
    expect(sceneCast(scene([zegt("char-1", "Wauw!")]), CAST)).toEqual([{ ...CAST[0], position: "center" }]);
  });

  it("laat sprekers voorgaan als er meer dan drie in beeld zouden komen", () => {
    const vier = [...CAST, lid("char-4", "Papa", "right")];
    const s = scene([zegt("char-4", "Tyrell, Lilly, oma, kom!")], 1);
    const namen = sceneCast(s, vier, lijn(["uuid-tyrell", "uuid-lilly", "uuid-oma"])).map((c) => c.name);
    expect(namen).toHaveLength(3);
    expect(namen).toContain("Papa");
  });

  it("valt terug op de eerste personages als er niemand te vinden is", () => {
    const s = scene([{ kind: "actie", characterId: VERTELLER_ID, text: "", emotion: "", actie: "A quiet garden." }]);
    expect(sceneCast(s, CAST)).toHaveLength(3);
  });
});
