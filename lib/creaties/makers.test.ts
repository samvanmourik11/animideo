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

describe("fase 2: bewerkingen en tekst-naar-video", () => {
  const bron = { bronUrl: "https://x/y.jpg", formaat: "9:16" };

  it("elke bewerking houdt het formaat van het bronbeeld vast en kost het afgesproken tarief", () => {
    for (const [maker, credits] of [
      ["upscale", CREDIT_COSTS.UPSCALE],
      ["achtergrond-weg", CREDIT_COSTS.ENHANCE],
      ["gezicht", CREDIT_COSTS.ENHANCE],
      ["belichting", CREDIT_COSTS.ENHANCE],
    ] as const) {
      const o = maakOpdracht(maker, bron);
      expect(o.soort).toBe("beeld");
      expect(o.credits).toBe(credits);
      expect(o.invoer.formaat).toBe("9:16");
      expect(o.falInvoer.image_url).toBe("https://x/y.jpg");
    }
  });

  it("bewerkingen weigeren zonder geldig bronbeeld", () => {
    expect(() => maakOpdracht("upscale", { bronUrl: "file:///etc/passwd" })).toThrow(/Kies eerst een beeld/);
  });

  it("belichting: staand beeld blijft staand, onbekende richting wordt links", () => {
    const o = maakOpdracht("belichting", { ...bron, richting: "Achter" });
    expect(o.falInvoer.image_size).toBe("portrait_16_9");
    expect(o.falInvoer.initial_latent).toBe("Left");
  });

  it("aanpassen met tekst gaat naar de bewerk-variant met het bronbeeld", () => {
    const o = maakOpdracht("bewerk", { ...bron, prompt: "maak de jas rood" });
    expect(o.endpoint).toBe("fal-ai/nano-banana/edit");
    expect(o.falInvoer.image_urls).toEqual(["https://x/y.jpg"]);
    expect(() => maakOpdracht("bewerk", { ...bron, prompt: "" })).toThrow(/Schrijf eerst/);
  });

  it("beeld met eigen voorbeeldfoto gaat via de bewerk-variant", () => {
    const o = maakOpdracht("beeld", { prompt: "x", referentieUrl: "https://r/f.jpg" });
    expect(o.endpoint).toBe("fal-ai/nano-banana/edit");
    expect(o.falInvoer.image_urls).toEqual(["https://r/f.jpg"]);
    expect(maakOpdracht("beeld", o.invoer)).toEqual(o);
  });

  it("tekst-naar-video: standaard liggend, gewone videoprijs", () => {
    const o = maakOpdracht("tekst-naar-video", { prompt: "zeilboot" });
    expect(o.soort).toBe("video");
    expect(o.credits).toBe(CREDIT_COSTS.VIDEO_GENERATION);
    expect(o.falInvoer.aspect_ratio).toBe("16:9");
  });

  it("resultaatUrl vindt ook het losse beeld van de bewerkmodellen", () => {
    expect(resultaatUrl("beeld", { image: { url: "c" } })).toBe("c");
  });
});

import { RECEPTEN, BRANCHES, sjablonen } from "./recepten";
import { receptOpdracht, heeftOpdracht } from "./recepten-opdrachten";

describe("fase 3: het receptenboek", () => {
  it("elk recept heeft een verborgen opdracht en een unieke id", () => {
    const ids = new Set<string>();
    for (const r of RECEPTEN) {
      expect(heeftOpdracht(r.id, r.soort), r.id).toBe(true);
      expect(ids.has(r.id), r.id).toBe(false);
      ids.add(r.id);
    }
  });

  it("bouwt voor elk recept een opdracht die rekent wat het recept belooft", () => {
    for (const r of RECEPTEN) {
      const o = receptOpdracht({
        receptId: r.id,
        fotoUrl: "https://x/f.jpg",
        tekst: "een rood pak",
        toestemming: true,
      });
      expect(o.soort, r.id).toBe(r.soort);
      expect(o.credits, r.id).toBe(r.credits);
      if (r.zonderFoto) expect(JSON.stringify(o.falInvoer), r.id).toContain("een rood pak");
      else expect(JSON.stringify(o.falInvoer), r.id).toContain("https://x/f.jpg");
    }
  });

  it("fase 4: elke branche heeft sjablonen, en sjablonen zonder foto vragen tekst", () => {
    for (const b of BRANCHES) expect(sjablonen(b.id).length, b.id).toBeGreaterThanOrEqual(3);
    for (const r of RECEPTEN.filter((x) => x.zonderFoto)) expect(r.tekst?.verplicht, r.id).toBe(true);
    expect(() => receptOpdracht({ receptId: "zorg-vacature" })).toThrow(/Vul eerst in/);
    const o = receptOpdracht({ receptId: "zorg-vacature", tekst: 'Verzorgende "IG"', formaat: "9:16" });
    expect(o.endpoint).toBe("fal-ai/nano-banana-pro");
    expect(o.falInvoer.aspect_ratio).toBe("9:16");
    expect(String(o.falInvoer.prompt)).toContain("Verzorgende 'IG'");
    expect(receptOpdracht(o.invoer)).toEqual(o);
  });

  it("gezichtsrecepten vragen eerst toestemming", () => {
    expect(() => receptOpdracht({ receptId: "vermeer", fotoUrl: "https://x/f.jpg" })).toThrow(/toestemming/);
    expect(() => receptOpdracht({ receptId: "delfts-blauw", fotoUrl: "https://x/f.jpg" })).not.toThrow();
  });

  it("verplicht tekstveld en een foto zijn nodig", () => {
    expect(() => receptOpdracht({ receptId: "outfit", fotoUrl: "https://x/f.jpg", toestemming: true })).toThrow(/Vul eerst in/);
    expect(() => receptOpdracht({ receptId: "billboard" })).toThrow(/Kies eerst een foto/);
    expect(() => receptOpdracht({ receptId: "bestaat-niet", fotoUrl: "https://x/f.jpg" })).toThrow(/bestaat niet/);
  });

  it("Nog eens: de opgeslagen invoer geeft dezelfde opdracht", () => {
    const o = receptOpdracht({ receptId: "productfoto", fotoUrl: "https://x/f.jpg", tekst: "marmer" });
    expect(receptOpdracht(o.invoer)).toEqual(o);
  });
});
