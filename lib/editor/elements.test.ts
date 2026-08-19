import { describe, it, expect } from "vitest";
import { breedteNaarCompositie, breedteNaarSchaal, frameNaarCompositie, leesbareLetterkleur, pngFormaat, vaakstVoorkomend } from "./element-geometry";

// De eerste echte test zette een appel als speldenknop van 30 pixels onder een
// bureau. De plek kwam van het vision-model, maar de grootte was een rekenfout:
// de compositor schaalt een element eerst passend in het kader (contain) en
// vermenigvuldigt dát met `scale`. Deze omrekening zit daartussen.

describe("breedteNaarSchaal", () => {
  const compositie = { width: 1920, height: 1080 };

  it("rekent een gewenste breedte om naar de factor van de compositor", () => {
    // Vierkant element van 1024: passend gemaakt wordt hij 1080 breed.
    // 15% van 1920 = 288 px → 288/1080 = 0,267.
    const schaal = breedteNaarSchaal(0.15, { breedte: 1024, hoogte: 1024 }, compositie);
    expect(schaal).toBeCloseTo(0.267, 2);
  });

  it("levert bij een breed element een kleinere factor", () => {
    const breed = breedteNaarSchaal(0.5, { breedte: 1920, hoogte: 1080 }, compositie);
    // Een element dat het kader al vult, hoeft maar half zo groot.
    expect(breed).toBeCloseTo(0.5, 2);
  });

  it("de uitkomst klopt: element × factor × passend = gewenste pixels", () => {
    const element = { breedte: 800, hoogte: 600 };
    const f = 0.2;
    const schaal = breedteNaarSchaal(f, element, compositie);
    const passend = Math.min(compositie.width / element.breedte, compositie.height / element.hoogte);
    expect(element.breedte * passend * schaal).toBeCloseTo(f * compositie.width, 1);
  });

  it("werkt ook staand (9:16)", () => {
    const staand = { width: 1080, height: 1920 };
    const element = { breedte: 1024, hoogte: 1024 };
    const schaal = breedteNaarSchaal(0.25, element, staand);
    const passend = Math.min(staand.width / element.breedte, staand.height / element.hoogte);
    expect(element.breedte * passend * schaal).toBeCloseTo(0.25 * staand.width, 1);
  });
});

describe("pngFormaat", () => {
  it("leest breedte en hoogte uit de PNG-header", () => {
    // Minimale PNG-kop: 8 bytes signature, lengte, "IHDR", breedte, hoogte.
    const png = Buffer.alloc(24);
    png.write("\x89PNG\r\n\x1a\n", 0, "binary");
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(1024, 16);
    png.writeUInt32BE(768, 20);
    expect(pngFormaat(png)).toEqual({ breedte: 1024, hoogte: 768 });
  });

  it("geeft null bij iets wat geen PNG is", () => {
    expect(pngFormaat(Buffer.from("dit is geen plaatje"))).toBeNull();
    expect(pngFormaat(Buffer.alloc(4))).toBeNull();
  });
});

describe("frameNaarCompositie", () => {
  const comp = { width: 1920, height: 1080 };

  it("laat het midden het midden", () => {
    expect(frameNaarCompositie({ x: 0.5, y: 0.5 }, { breedte: 1024, hoogte: 1024 }, comp)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("krimpt de breedte als een vierkant beeld in een 16:9-video staat", () => {
    // Vierkant beeld vult maar 56,25% van de breedte; rechts op het frame ligt
    // dus veel dichter bij het midden dan rechts in beeld.
    const p = frameNaarCompositie({ x: 1, y: 0.5 }, { breedte: 1024, hoogte: 1024 }, comp);
    expect(p.x).toBeCloseTo(0.781, 3);
    expect(p.y).toBe(0.5);
  });

  it("verandert niets als bron en compositie dezelfde verhouding hebben", () => {
    const p = frameNaarCompositie({ x: 0.8, y: 0.2 }, { breedte: 1920, hoogte: 1080 }, comp);
    expect(p.x).toBeCloseTo(0.8, 5);
    expect(p.y).toBeCloseTo(0.2, 5);
  });

  it("rekent ook breedtes om", () => {
    expect(breedteNaarCompositie(0.5, { breedte: 1024, hoogte: 1024 }, comp)).toBeCloseTo(0.281, 3);
    expect(breedteNaarCompositie(0.5, { breedte: 1920, hoogte: 1080 }, comp)).toBeCloseTo(0.5, 5);
  });
});

describe("kleurregels", () => {
  it("kiest donkere letters op een licht vlak en omgekeerd", () => {
    expect(leesbareLetterkleur("#ffffff")).toBe("#111111");
    expect(leesbareLetterkleur("#f2f2f2")).toBe("#111111");
    expect(leesbareLetterkleur("#2e7d32")).toBe("#ffffff"); // het groen van een bordje
    expect(leesbareLetterkleur("#000000")).toBe("#ffffff");
  });

  it("kiest de kleur die het vaakst voorkomt, niet de uitschieter", () => {
    // Drie monsters op het groene bordje, één op de witte muur ernaast.
    expect(vaakstVoorkomend(["#2e7d32", "#2f7d33", "#ffffff", "#2e7d31"])).toMatch(/^#2/);
  });

  it("negeert mislukte monsters", () => {
    expect(vaakstVoorkomend([null, null, "#123456"])).toBe("#123456");
    expect(vaakstVoorkomend([null, null])).toBeNull();
  });
});
