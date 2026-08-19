import { describe, it, expect } from "vitest";
import { budgetAdvies } from "./render-server";

// Deze rekensom bepaalt of een export halverwege wordt afgekapt of dat de
// gebruiker vooraf een eerlijk antwoord krijgt. Gemeten waarden uit
// docs/editor-render-benchmark.md: lokaal ~53 ms per frame, op productie
// ~340 ms per frame.

describe("budgetAdvies", () => {
  it("laat een korte video gewoon door", () => {
    // 15s bij 30fps = 450 frames à 53ms = 24s, ruim binnen 240s.
    expect(budgetAdvies(53, 30, 450, 30, 238_000).past).toBe(true);
  });

  it("houdt een te lange video tegen en zegt wat er wél past", () => {
    // Het gemeten productiegeval: 29s video (870 frames) à 340ms ≈ 5 minuten.
    const advies = budgetAdvies(340, 180, 870, 30, 180_000);
    expect(advies.past).toBe(false);
    expect(advies.haalbareSeconden).toBe(23);
  });

  it("telt wat al gerenderd is mee in het advies", () => {
    // 300 frames staan al klaar en er past nog 150 frames bij → 15 seconden.
    expect(budgetAdvies(100, 300, 3000, 30, 15_000)).toEqual({
      past: false,
      haalbareSeconden: 15,
    });
  });

  it("zit precies op de grens niet mis", () => {
    // Nog 600 frames te gaan à 100ms = 60s.
    expect(budgetAdvies(100, 0, 600, 30, 60_000).past).toBe(true);
    expect(budgetAdvies(100, 0, 601, 30, 60_000).past).toBe(false);
  });

  it("houdt rekening met een hogere framerate", () => {
    // Bij 60fps zitten er twee keer zoveel frames in een seconde video.
    expect(budgetAdvies(100, 0, 3600, 60, 240_000).haalbareSeconden).toBe(40);
  });

  it("blokkeert niets als de meting nog nul is", () => {
    expect(budgetAdvies(0, 0, 900, 30, 1000).past).toBe(true);
  });
});
