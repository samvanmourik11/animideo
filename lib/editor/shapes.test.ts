import { describe, it, expect } from "vitest";
import { bouwVormSvg, tekenVorm } from "./shapes";

// Vormen zijn wiskunde: dezelfde invoer hoort elke keer exact hetzelfde beeld te
// geven. Dat is precies waarom ze hier thuishoren en niet bij een model.

describe("vormen tekenen", () => {
  const basis = { breedtePx: 400, hoogtePx: 200, kleur: "#e53935" };

  it("levert geldige SVG met de gevraagde maten", () => {
    for (const soort of ["cirkel", "kader", "pijl", "onderstreping"] as const) {
      const svg = bouwVormSvg(soort, basis);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('width="400"');
      expect(svg).toContain('height="200"');
      expect(svg).toContain("#e53935");
    }
  });

  it("laat de cirkel bewust net open, zodat hij aangewezen aanvoelt", () => {
    const svg = bouwVormSvg("cirkel", basis);
    // Een dichte ellips zou <ellipse> zijn; wij tekenen een pad dat ophoudt.
    expect(svg).toContain("polyline");
    expect(svg).not.toContain("<ellipse");
  });

  it("tekent het kader als omlijning, niet als vlak", () => {
    expect(bouwVormSvg("kader", basis)).toContain('fill="none"');
  });

  it("rastert naar een PNG met transparantie", () => {
    const png = tekenVorm("cirkel", basis);
    expect(png.length).toBeGreaterThan(100);
    // PNG-signatuur en afmetingen uit de IHDR.
    expect(png.toString("ascii", 1, 4)).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(400);
    expect(png.readUInt32BE(20)).toBe(200);
  });

  it("geeft bij dezelfde invoer exact hetzelfde beeld", () => {
    const a = tekenVorm("pijl", basis);
    const b = tekenVorm("pijl", basis);
    expect(a.equals(b)).toBe(true);
  });

  it("houdt de lijn zichtbaar bij een heel klein vlak", () => {
    const svg = bouwVormSvg("cirkel", { breedtePx: 20, hoogtePx: 20, kleur: "#000000" });
    const dikte = Number(/stroke-width="([\d.]+)"/.exec(svg)![1]);
    expect(dikte).toBeGreaterThanOrEqual(3);
  });
});
