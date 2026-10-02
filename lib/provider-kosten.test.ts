import { describe, expect, it } from "vitest";
import { schatKosten } from "./provider-kosten";

describe("schatKosten", () => {
  it("rekent een beeld per stuk", () => {
    expect(schatKosten("fal-ai/nano-banana", {})).toEqual({ usd: 0.039, geschat: false });
    expect(schatKosten("fal-ai/nano-banana-pro/edit", { num_images: 2 }).usd).toBeCloseTo(0.3);
  });

  it("rekent video per seconde, met 5 s als de duur ontbreekt", () => {
    const slug = "fal-ai/bytedance/seedance/v1/lite/image-to-video";
    expect(schatKosten(slug, { duration: "10" }).usd).toBeCloseTo(0.36);
    expect(schatKosten(slug, {})).toEqual({ usd: expect.closeTo(0.18), geschat: true });
  });

  it("rekent een stem per 1.000 tekens", () => {
    expect(schatKosten("fal-ai/elevenlabs/tts/eleven-v3", { text: "x".repeat(2000) }).usd).toBeCloseTo(0.2);
  });

  it("markeert een onbekend model als schatting in plaats van het gratis te tellen", () => {
    const k = schatKosten("fal-ai/iets-nieuws", {});
    expect(k.usd).toBeGreaterThan(0);
    expect(k.geschat).toBe(true);
  });
});
