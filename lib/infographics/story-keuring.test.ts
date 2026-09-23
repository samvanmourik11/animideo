import { describe, it, expect } from "vitest";
import { schoonFouten, ernst, minstFout, herkansingRegels, STORY_FOUTEN } from "./story-keuring-regels";

describe("schoonFouten", () => {
  it("houdt alleen bekende fouten over, zonder dubbelen", () => {
    expect(schoonFouten(["dubbel", "dubbel", "onzin", "tekst"])).toEqual(["dubbel", "tekst"]);
  });

  it("zet de fouten op volgorde van ernst", () => {
    expect(schoonFouten(["zwevend", "dubbel"])).toEqual(["dubbel", "zwevend"]);
  });

  it("gaat om met rommel uit het model", () => {
    expect(schoonFouten(null)).toEqual([]);
    expect(schoonFouten("dubbel")).toEqual([]);
    expect(schoonFouten([])).toEqual([]);
  });
});

describe("ernst", () => {
  it("weegt een dubbel personage zwaarder dan zwevende rommel", () => {
    expect(ernst(["dubbel"])).toBeGreaterThan(ernst(["zwevend"]));
  });

  it("telt fouten op", () => {
    expect(ernst(["tekst", "zwevend"])).toBe(ernst(["tekst"]) + ernst(["zwevend"]));
  });

  it("is nul zonder fouten", () => {
    expect(ernst([])).toBe(0);
  });
});

describe("minstFout", () => {
  it("kiest het beeld met de minste fouten", () => {
    expect(minstFout([
      { beeld: "eerste", fouten: ["dubbel"] },
      { beeld: "tweede", fouten: ["zwevend"] },
    ])).toBe("tweede");
  });

  it("houdt bij gelijke stand de eerste poging aan", () => {
    expect(minstFout([
      { beeld: "eerste", fouten: ["tekst"] },
      { beeld: "tweede", fouten: ["tekst"] },
    ])).toBe("eerste");
  });

  it("kiest een schoon beeld boven een beeld met fouten", () => {
    expect(minstFout([
      { beeld: "eerste", fouten: ["dubbel", "tekst"] },
      { beeld: "tweede", fouten: [] },
    ])).toBe("tweede");
  });
});

describe("herkansingRegels", () => {
  it("geeft niets terug als er niets mis was", () => {
    expect(herkansingRegels({ fouten: [], uitleg: "" }, ["Anna"])).toBe("");
  });

  it("noemt de personages bij een dubbel personage", () => {
    const regels = herkansingRegels({ fouten: ["dubbel"], uitleg: "two identical women" }, ["Anna", "Ben"]);
    expect(regels).toContain("Anna, Ben");
    expect(regels).toContain("exactly ONCE");
    expect(regels).toContain("two identical women");
  });

  it("heeft voor elke fout een regel", () => {
    for (const fout of STORY_FOUTEN) {
      expect(herkansingRegels({ fouten: [fout], uitleg: "" }, []).length).toBeGreaterThan(20);
    }
  });
});
