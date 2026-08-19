import { describe, it, expect } from "vitest";
import { budgetAdvies } from "./render-server";

// Deze rekensom bepaalt of een export halverwege wordt afgekapt of dat de
// gebruiker vooraf een eerlijk antwoord krijgt. Gemeten waarden uit
// docs/editor-render-benchmark.md: lokaal ~0,10s per frame, op Vercel ruim
// het drievoudige.

describe("budgetAdvies", () => {
  it("laat een korte video gewoon door", () => {
    // 15s bij 30fps = 450 frames à 100ms = 45s, ruim binnen 240s.
    expect(budgetAdvies(100, 450, 30, 240_000)).toEqual({ past: true, haalbareSeconden: 80 });
  });

  it("houdt een te lange video tegen en zegt wat er wél past", () => {
    // Het gemeten Vercel-geval: 60s video (1800 frames) à 330ms = ~10 minuten.
    const advies = budgetAdvies(330, 1800, 30, 240_000);
    expect(advies.past).toBe(false);
    expect(advies.haalbareSeconden).toBe(24);
  });

  it("zit precies op de grens niet mis", () => {
    expect(budgetAdvies(100, 2400, 30, 240_000).past).toBe(true);
    expect(budgetAdvies(100, 2401, 30, 240_000).past).toBe(false);
  });

  it("houdt rekening met een hogere framerate", () => {
    // Bij 60fps zitten er twee keer zoveel frames in een seconde video, dus
    // past er half zoveel video in dezelfde tijd.
    expect(budgetAdvies(100, 3600, 60, 240_000).haalbareSeconden).toBe(40);
  });

  it("blokkeert niets als de meting nog nul is", () => {
    expect(budgetAdvies(0, 900, 30, 1000).past).toBe(true);
  });
});
