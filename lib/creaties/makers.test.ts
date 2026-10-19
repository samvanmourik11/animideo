import { describe, expect, it } from "vitest";
import { maakOpdracht, resultaatUrl, modelNaam } from "./makers";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { VIDEO_MODELLEN } from "@/lib/video-modellen";

describe("maakOpdracht: beeld", () => {
  it("kiest standaard Nano Banana en rekent het gewone beeldtarief", () => {
    const o = maakOpdracht("beeld", { prompt: "  een molen  ", formaat: "9:16" });
    expect(o.soort).toBe("beeld");
    expect(o.endpoint).toBe("fal-ai/nano-banana");
    expect(o.credits).toBe(CREDIT_COSTS.IMAGE_GENERATION);
    expect(o.falInvoer).toMatchObject({ prompt: "een molen", aspect_ratio: "9:16", num_images: 1 });
    expect(o.invoer).toEqual({ prompt: "een molen", formaat: "9:16", kwaliteit: "standaard" });
  });

  it("pro gaat naar Nano Banana Pro tegen het pro-tarief", () => {
    const o = maakOpdracht("beeld", { prompt: "x", kwaliteit: "pro" });
    expect(o.endpoint).toBe("fal-ai/nano-banana-pro");
    expect(o.credits).toBe(CREDIT_COSTS.IMAGE_GENERATION_PRO);
  });

  it("onbekend formaat valt terug op vierkant", () => {
    expect(maakOpdracht("beeld", { prompt: "x", formaat: "21:9" }).falInvoer.aspect_ratio).toBe("1:1");
  });

  it("weigert een lege opdracht", () => {
    expect(() => maakOpdracht("beeld", { prompt: "   " })).toThrow(/Schrijf eerst/);
  });

  it("de opgeslagen invoer start precies dezelfde opdracht opnieuw (Nog eens)", () => {
    const eerste = maakOpdracht("beeld", { prompt: "kaas", formaat: "16:9", kwaliteit: "pro", rommel: 1 });
    const tweede = maakOpdracht("beeld", eerste.invoer);
    expect(tweede).toEqual(eerste);
  });
});

describe("maakOpdracht: beeld-naar-video", () => {
  it("gebruikt het gekozen videomodel met zijn eigen tarief", () => {
    const kling = VIDEO_MODELLEN.find((m) => m.id === "kling-2-5")!;
    const o = maakOpdracht("beeld-naar-video", { bronUrl: "https://x/y.jpg", model: "kling-2-5", prompt: "zwaaien" });
    expect(o.soort).toBe("video");
    expect(o.endpoint).toBe(kling.slug);
    expect(o.credits).toBe(kling.credits);
    expect(o.falInvoer).toMatchObject({ image_url: "https://x/y.jpg", prompt: "zwaaien" });
  });

  it("onbekend model valt terug op het standaardmodel, lege beweging krijgt een rustige standaard", () => {
    const o = maakOpdracht("beeld-naar-video", { bronUrl: "https://x/y.jpg", model: "duur-model" });
    expect(o.invoer.model).toBe("seedance-lite");
    expect(String(o.falInvoer.prompt)).toMatch(/natural motion/i);
  });

  it("weigert een bron die geen https-link is", () => {
    expect(() => maakOpdracht("beeld-naar-video", { bronUrl: "javascript:alert(1)" })).toThrow(/Kies eerst een beeld/);
  });
});

describe("overig", () => {
  it("onbekende maker wordt geweigerd", () => {
    expect(() => maakOpdracht("hack", {})).toThrow(/Onbekende maker/);
  });

  it("resultaatUrl vindt beeld en video in het fal-antwoord", () => {
    expect(resultaatUrl("beeld", { images: [{ url: "a" }] })).toBe("a");
    expect(resultaatUrl("video", { video: { url: "b" } })).toBe("b");
    expect(resultaatUrl("beeld", {})).toBeNull();
  });

  it("modelNaam geeft leesbare namen", () => {
    expect(modelNaam("fal-ai/nano-banana-pro")).toBe("Nano Banana Pro");
    expect(modelNaam(VIDEO_MODELLEN[0].slug)).toBe(VIDEO_MODELLEN[0].naam);
  });
});
