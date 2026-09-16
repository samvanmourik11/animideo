import { describe, it, expect } from "vitest";
import { creditTekst, schatCredits, schatStoryboardCredits, DIALOOG_CREDITS } from "./dialoog-credits";
import type { DialogueScene } from "./dialogue-schema";

// De video van Tyrell en Lilly: 81 seconden, 7 scènes, 21 zinnen. Die kostte 96 credits;
// Sam wilde eerst een kwart (28), sinds 16-09-2026 ongeveer een derde. Wat hier vastligt:
// dezelfde video kost nu 35 credits.

const zin = (klaar: boolean) => ({
  characterId: "c1", text: "Kijk eens!", emotion: "blij",
  shotImageUrl: klaar ? "https://x/beeld.png" : null,
  audioUrl: klaar ? "https://x/stem.mp3" : null,
  videoUrl: klaar ? "https://x/clip.mp4" : null,
});
const scene = (i: number, klaar: boolean): DialogueScene => ({
  id: `s${i}`, setting: "a forest", twoShotUrl: klaar ? "https://x/plek.png" : null,
  lines: [zin(klaar), zin(klaar), zin(klaar)],
});
const video = (klaar: boolean) => ({ scenes: Array.from({ length: 7 }, (_, i) => scene(i, klaar)) });

describe("dialoog-credits", () => {
  it("rekent voor de video van 81 seconden 35 credits: 7 scènes van 2 en 21 clips", () => {
    expect(schatStoryboardCredits(video(false))).toBe(14);
    expect(schatCredits(video(false))).toBe(35);
  });

  it("rekent na het storyboard alleen nog de clips", () => {
    const metStoryboard = { scenes: video(false).scenes.map((s) => ({ ...s, twoShotUrl: "https://x/plek.png" })) };
    expect(schatStoryboardCredits(metStoryboard)).toBe(0);
    expect(schatCredits(metStoryboard)).toBe(21);
  });

  it("rekent niets meer als alles klaar is", () => {
    expect(schatCredits(video(true))).toBe(0);
  });

  it("maakt stemmen, voorbereiding en herkansingen gratis", () => {
    expect(DIALOOG_CREDITS.STEM).toBe(0);
    expect(DIALOOG_CREDITS.VOORBEREIDING).toBe(0);
    expect(DIALOOG_CREDITS.HERKANSING).toBe(0);
  });

  it("zegt gratis bij nul en telt enkelvoud en meervoud goed", () => {
    expect(creditTekst(0)).toBe("gratis");
    expect(creditTekst(1)).toBe("1 credit");
    expect(creditTekst(28)).toBe("28 credits");
  });
});
