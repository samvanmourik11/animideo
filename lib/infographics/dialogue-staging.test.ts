import { describe, it, expect } from "vitest";
import { kaderVoorScene, buildTwoShotBrief } from "./dialogue-staging";
import type { DialogueCastMember } from "./dialogue-schema";

// Elke scene kreeg exact hetzelfde kader, en omdat elk regelbeeld een bewerking
// van dat kader is, was de halve video hetzelfde plaatje. Deze rotatie is de
// enige bron van visuele afwisseling tussen scenes, dus dat hij echt wisselt
// hoort vast te liggen.

const lid = (extra: Partial<DialogueCastMember> = {}): DialogueCastMember => ({
  id: "char-1",
  characterId: "uuid-1",
  name: "Tyrel",
  role: "de neef",
  voice: "stem-a",
  portraitUrl: "https://x/t.png",
  position: "left",
  appearance: "oranje trui",
  ...extra,
});
const cast = [lid(), lid({ id: "char-2", characterId: "uuid-2", name: "Lily", position: "right" })];

describe("kaderVoorScene", () => {
  it("geeft opeenvolgende scenes een ander camerastandpunt", () => {
    for (let i = 0; i < 8; i++) {
      expect(kaderVoorScene(i)).not.toBe(kaderVoorScene(i + 1));
    }
  });

  it("loopt rond in plaats van leeg te lopen", () => {
    expect(kaderVoorScene(0)).toBe(kaderVoorScene(5));
    expect(kaderVoorScene(12)).toBeTruthy();
  });

  it("blijft geldig bij een rare index", () => {
    // Een negatieve of ontbrekende index mag nooit undefined opleveren: dat zou
    // "undefined" letterlijk in de beeld-prompt zetten.
    expect(kaderVoorScene(-1)).toBeTruthy();
    expect(kaderVoorScene(-7)).toBeTruthy();
  });
});

describe("buildTwoShotBrief", () => {
  it("houdt links links en rechts rechts, ongeacht het kader", () => {
    // De sprekerherkenning hangt aan die plekken; wisselen ze mee met de camera,
    // dan wijst de mondcontrole straks de verkeerde persoon aan.
    for (const i of [0, 1, 2, 3, 4]) {
      const brief = buildTwoShotBrief("a living room", cast, i);
      expect(brief).toContain("Tyrel");
      expect(brief).toContain("on the LEFT");
      expect(brief).toContain("Lily");
      expect(brief).toContain("on the RIGHT");
    }
  });

  it("zegt niets over een eerdere kamer als de plek nieuw is", () => {
    expect(buildTwoShotBrief("a kitchen", cast, 0, false)).not.toContain("SAME room");
  });

  it("vraagt om dezelfde kamer zodra de plek al eerder getekend is", () => {
    const brief = buildTwoShotBrief("a living room", cast, 3, true);
    expect(brief).toContain("SAME room");
    expect(brief).toContain("Only the camera has moved");
  });

  it("verbiedt verzonnen tekst in beeld", () => {
    expect(buildTwoShotBrief("a living room", cast, 0)).toContain("never garbled text");
  });
});
