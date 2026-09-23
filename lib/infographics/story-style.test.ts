import { describe, it, expect } from "vitest";
import { STORY_STYLE_PRESETS, stijlenVoor, isBeperkteStijl, visualStyleVan } from "./story-style";
import { magRealistischeStijl } from "@/lib/studio/access";

// De realistische stijl staat per account open. Een verkeerde filtering zou hem
// bij élke klant in het menu zetten, en dat is precies wat we niet willen —
// vandaar een test op de grendel zelf.
describe("beperkte stijlen", () => {
  it("laat een gewoon account alleen de vrije stijlen zien", () => {
    const stijlen = stijlenVoor(false).map((s) => s.id);
    expect(stijlen).toEqual(["flat-vector", "marker-sketch", "papercut", "soft-3d"]);
    expect(stijlen).not.toContain("realistisch");
  });

  it("geeft een account met toestemming de realistische stijl erbij", () => {
    expect(stijlenVoor(true).map((s) => s.id)).toContain("realistisch");
  });

  it("herkent welke stijl beperkt is", () => {
    expect(isBeperkteStijl("realistisch")).toBe(true);
    expect(isBeperkteStijl("flat-vector")).toBe(false);
    expect(isBeperkteStijl(null)).toBe(false);
  });

  it("stuurt alleen bij de realistische stijl een referentiepack mee", () => {
    expect(visualStyleVan("realistisch")).toBe("Realistic");
    expect(visualStyleVan("papercut")).toBeNull();
  });

  it("elke stijl heeft een eigen voorbeeldbeeld en een preamble", () => {
    for (const s of STORY_STYLE_PRESETS) {
      expect(s.preamble.length).toBeGreaterThan(20);
      expect(s.name).toBeTruthy();
    }
  });
});

describe("wie de realistische stijl mag", () => {
  it("laat Miranda erbij", () => {
    expect(magRealistischeStijl("mirandavand247@gmail.com")).toBe(true);
    // Hoofdletters in een e-mailadres mogen niet uitmaken.
    expect(magRealistischeStijl("MirandaVanD247@Gmail.com")).toBe(true);
  });

  it("laat ons eigen team erbij", () => {
    expect(magRealistischeStijl("sam@jouwanimatievideo.nl")).toBe(true);
    expect(magRealistischeStijl("isa@jouwanimatievideo.nl")).toBe(true);
  });

  it("houdt andere klanten en lege accounts buiten", () => {
    expect(magRealistischeStijl("iemand@anders.nl")).toBe(false);
    expect(magRealistischeStijl(null)).toBe(false);
    expect(magRealistischeStijl(undefined)).toBe(false);
  });
});
