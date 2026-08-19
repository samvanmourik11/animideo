import { describe, it, expect } from "vitest";
import { breedteNaarSchaal, pngFormaat } from "./element-geometry";

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
