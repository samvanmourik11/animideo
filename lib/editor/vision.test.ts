import { describe, it, expect } from "vitest";
import { besteTreffer, type Kader } from "./vision";

// OCR leest een spelfout letterlijk ("TE KOOOP") terwijl de klant iets typt wat
// er dichtbij ligt. Deze koppeling bepaalt of we het juiste kader te pakken
// hebben — pakken we het verkeerde, dan leggen we het verkeerde stuk dicht.

const kader = (label: string, x = 0.5, y = 0.5): Kader => ({ x, y, breedte: 0.3, hoogte: 0.05, label });

describe("besteTreffer", () => {
  it("koppelt een spelfout aan wat de klant bedoelt", () => {
    // Labels zijn hier al opgeschoond (dat gebeurt bij het inlezen van de
    // OCR-uitkomst); hier gaat het puur om de koppeling.
    const treffer = besteTreffer([kader("TE KOOOP"), kader("Huis", 0.2, 0.2)], "TE KOOP");
    expect(treffer?.label).toBe("TE KOOOP");
  });

  it("kiest de exacte treffer als die er is", () => {
    const treffer = besteTreffer([kader("Openingstijden"), kader("TE KOOP")], "te koop");
    expect(treffer?.label).toBe("TE KOOP");
  });

  it("trekt zich niets aan van hoofdletters en leestekens", () => {
    expect(besteTreffer([kader("NU 50% KORTING!")], "nu 50 korting")?.label).toBe("NU 50% KORTING!");
  });

  it("geeft niets terug als er niets op lijkt", () => {
    expect(besteTreffer([kader("Openingstijden")], "kortingsbon")).toBeNull();
  });

  it("geeft niets terug zonder kaders of zonder zoekterm", () => {
    expect(besteTreffer([], "iets")).toBeNull();
    expect(besteTreffer([kader("iets")], "")).toBeNull();
  });
});
