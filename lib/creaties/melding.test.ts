import { describe, expect, it } from "vitest";
import { kortMetEinde } from "./melding";

describe("kortMetEinde", () => {
  it("laat een korte melding staan", () => {
    expect(kortMetEinde("Kon niet")).toBe("Kon niet");
  });

  it("houdt bij een lange ffmpeg-fout het eind, waar de echte reden staat", () => {
    const reden = `Montage mislukt: Command failed: ffmpeg ${"-i clip.mp4 ".repeat(200)}\nError: geheugen vol`;
    const kort = kortMetEinde(reden);
    expect(kort.length).toBeLessThanOrEqual(500);
    expect(kort.startsWith("Montage mislukt")).toBe(true);
    expect(kort.endsWith("Error: geheugen vol")).toBe(true);
  });
});

import { klantReden } from "./melding";

describe("klantReden", () => {
  it("maakt van een ffmpeg-fout een gewone zin", () => {
    expect(klantReden("Montage mislukt: Command failed: /var/task/ffmpeg -i …")).toMatch(/samenvoegen/);
  });
  it("vertaalt een Engelse modelfout", () => {
    expect(klantReden("Could not generate images with the given prompts and images. Please try again with different inputs.")).toMatch(/andere foto/);
  });
  it("laat onze eigen Nederlandse melding staan", () => {
    expect(klantReden("Het duurde te lang.")).toBe("Het duurde te lang.");
    expect(klantReden("Het model weigerde deze opdracht (inhoudsfilter). Probeer het anders te omschrijven.")).toMatch(/inhoudsfilter/);
  });
  it("heeft een standaardzin zonder melding", () => {
    expect(klantReden(null)).toBe("Er ging iets mis bij het maken.");
  });
});
