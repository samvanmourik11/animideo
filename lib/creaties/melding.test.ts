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
