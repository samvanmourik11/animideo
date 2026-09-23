import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  knipScriptInScenes,
  splitsInZinnen,
  isLetterlijk,
  geschatteDuur,
  MAX_SCENES,
  WOORDEN_PER_SCENE,
} from "./story-script";

const VOC = `In 1602 werd de VOC opgericht. Het was het eerste bedrijf ter wereld met aandelen.

De schepen voeren naar Azië. De reis duurde acht maanden en niet iedereen kwam terug.`;

describe("splitsInZinnen", () => {
  it("knipt op zinseindes", () => {
    expect(splitsInZinnen("Eerst dit. Dan dat! En toen? Klaar.")).toEqual([
      "Eerst dit.",
      "Dan dat!",
      "En toen?",
      "Klaar.",
    ]);
  });

  it("knipt niet op een afkorting of een initiaal", () => {
    expect(splitsInZinnen("Denk aan bijv. kaas en wijn.")).toEqual(["Denk aan bijv. kaas en wijn."]);
    expect(splitsInZinnen("Daar stond J. Cruijff te kijken.")).toEqual(["Daar stond J. Cruijff te kijken."]);
  });

  it("ziet een jaartal aan het eind van een zin wél als einde", () => {
    expect(splitsInZinnen("Dat was in 1602. Daarna ging het hard.")).toEqual([
      "Dat was in 1602.",
      "Daarna ging het hard.",
    ]);
  });
});

describe("knipScriptInScenes", () => {
  it("maakt van elke alinea een scene", () => {
    expect(knipScriptInScenes(VOC)).toEqual([
      "In 1602 werd de VOC opgericht. Het was het eerste bedrijf ter wereld met aandelen.",
      "De schepen voeren naar Azië. De reis duurde acht maanden en niet iedereen kwam terug.",
    ]);
  });

  it("houdt de tekst letterlijk", () => {
    const scenes = knipScriptInScenes(VOC);
    expect(isLetterlijk(VOC, scenes)).toBe(true);
  });

  it("splitst een te lange alinea op een zinseinde", () => {
    const lang = Array.from({ length: 8 }, (_, i) => `Dit is zin nummer ${i} met wat extra woorden erbij.`).join(" ");
    const scenes = knipScriptInScenes(lang);
    expect(scenes.length).toBeGreaterThan(1);
    expect(isLetterlijk(lang, scenes)).toBe(true);
    // Elke scene begint bij een nieuwe zin, dus nooit middenin.
    for (const s of scenes) expect(s).toMatch(/^Dit is zin/);
  });

  it("zet een losse korte regel bij de buurscene", () => {
    const scenes = knipScriptInScenes("Een lange eerste alinea met genoeg woorden erin om te blijven staan.\n\nEinde.");
    expect(scenes).toHaveLength(1);
    expect(scenes[0]).toContain("Einde.");
  });

  it("begint niet met een flintertje", () => {
    const scenes = knipScriptInScenes("Hoi.\n\nDaarna volgt een alinea met ruim voldoende woorden om zelfstandig te bestaan.");
    expect(scenes).toHaveLength(1);
    expect(scenes[0]).toMatch(/^Hoi\./);
  });

  it("blijft binnen het maximum aantal scenes", () => {
    const veel = Array.from({ length: 60 }, (_, i) => `Alinea nummer ${i} met een paar woorden.`).join("\n\n");
    const scenes = knipScriptInScenes(veel);
    expect(scenes.length).toBeLessThanOrEqual(MAX_SCENES);
    expect(isLetterlijk(veel, scenes)).toBe(true);
  });

  it("geeft niets terug bij een leeg script", () => {
    expect(knipScriptInScenes("   \n\n  ")).toEqual([]);
  });

  it("gaat om met Windows-regeleindes", () => {
    const scenes = knipScriptInScenes("Eerste alinea met genoeg woorden erin.\r\n\r\nTweede alinea met ook genoeg woorden erin.");
    expect(scenes).toHaveLength(2);
  });

  it("houdt bij elk denkbaar script exact dezelfde woorden over", () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.stringMatching(/^[A-Za-zéëïö0-9.,!?'-]{1,12}$/), { minLength: 1, maxLength: 40 }), {
          minLength: 1,
          maxLength: 30,
        }),
        (alineas) => {
          const script = alineas.map((a) => a.join(" ")).join("\n\n");
          const scenes = knipScriptInScenes(script);
          expect(isLetterlijk(script, scenes)).toBe(true);
          expect(scenes.length).toBeLessThanOrEqual(MAX_SCENES);
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe("geschatteDuur", () => {
  it("rekent met spreektempo", () => {
    const script = Array.from({ length: 26 }, () => "woord").join(" ");
    expect(geschatteDuur(script)).toBe(10);
  });

  it("schat een scene op ongeveer zes seconden", () => {
    const scene = Array.from({ length: WOORDEN_PER_SCENE }, () => "woord").join(" ");
    expect(geschatteDuur(scene)).toBe(6);
  });
});
