import { describe, it, expect } from "vitest";
import { elementTijden, verschijning, nadruk, bouwOverheidSvg, type OverheidLayout } from "./overheid-scene";
import { ASSET_SLEUTELS } from "./asset-register";

// De timing is het hart van deze modus: een element hoort te verschijnen op het
// moment dat de stem het noemt. Dat is pure rekenkunde en dus precies het soort
// logica dat je vast wilt leggen — zie de werkafspraken in CLAUDE.md.

describe("elementTijden", () => {
  const zin = "Dat geld gaat naar zorg, onderwijs en sociale zekerheid in Nederland.";

  it("legt elk element op het moment dat zijn woord klinkt", () => {
    const t = elementTijden(["Zorg", "Onderwijs", "Sociale zekerheid"], zin, 6);
    // "zorg" is woord 5 van 11 → rond 45% van 6s, min de voorsprong.
    expect(t[0]).toBeGreaterThan(1.5);
    expect(t[0]).toBeLessThan(3.2);
    // De volgorde volgt de zin.
    expect(t[0]).toBeLessThan(t[1]);
    expect(t[1]).toBeLessThan(t[2]);
  });

  it("houdt minimaal ruimte tussen twee elementen", () => {
    const t = elementTijden(["Zorg", "Onderwijs"], "Zorg onderwijs.", 6);
    expect(t[1] - t[0]).toBeGreaterThanOrEqual(0.4);
  });

  it("valt terug op een gelijkmatige verdeling als het woord niet voorkomt", () => {
    const t = elementTijden(["Koffer", "Munt"], "Hier staat iets heel anders.", 6);
    expect(t).toHaveLength(2);
    expect(t[0]).toBeGreaterThanOrEqual(0);
    expect(t[1]).toBeGreaterThan(t[0]);
  });

  it("houdt alles binnen de scene", () => {
    const t = elementTijden(["een", "twee", "drie", "vier"], "kort", 2);
    for (const tijd of t) expect(tijd).toBeLessThanOrEqual(2);
  });

  it("geeft een lege lijst zonder elementen", () => {
    expect(elementTijden([], "wat dan ook", 5)).toEqual([]);
  });
});

describe("verschijning en nadruk", () => {
  it("is nog niets vóór de eigen tijd en volledig erna", () => {
    expect(verschijning(0.5, 2)).toBeLessThanOrEqual(0);
    expect(verschijning(3, 2)).toBe(1);
  });

  it("geeft alleen vlak na het verschijnen nadruk", () => {
    expect(nadruk(2, 2)).toBe(0);
    expect(nadruk(2.8, 2)).toBeGreaterThan(0);
    expect(nadruk(5, 2)).toBe(0);
  });
});

describe("bouwOverheidSvg", () => {
  const layout: OverheidLayout = {
    template: "rij",
    titel: "Waar gaat het geld heen",
    elementen: [
      { icoon: "hart", label: "Zorg" },
      { icoon: "boek", label: "Onderwijs" },
      { icoon: "schild", label: "Sociale zekerheid" },
    ],
  };

  it("schaalt mee met de container als daarom gevraagd wordt", () => {
    // Zonder deze optie rendert de browser de scene op ware grootte en zie je
    // alleen de linkerbovenhoek — dat ging in de editor mis.
    const vast = bouwOverheidSvg(layout, { format: "16:9", t: 6, duur: 6 });
    expect(vast).toContain('width="1920"');
    const mee = bouwOverheidSvg(layout, { format: "16:9", t: 6, duur: 6, schaalbaar: true });
    expect(mee).toContain('width="100%"');
    expect(mee).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(mee).toContain('viewBox="0 0 1920 1080"');
  });

  it("levert een compleet svg-document op de canvasmaat", () => {
    const svg = bouwOverheidSvg(layout, { format: "16:9", t: 6, duur: 6, voiceover: "Zorg onderwijs zekerheid." });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 1920 1080"');
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("toont aan het eind alle labels, en aan het begin nog niets", () => {
    const eind = bouwOverheidSvg(layout, { format: "16:9", t: 6, duur: 6, voiceover: "Zorg onderwijs zekerheid." });
    expect(eind).toContain("Zorg");
    expect(eind).toContain("Onderwijs");

    const begin = bouwOverheidSvg(layout, { format: "16:9", t: 0, duur: 6, voiceover: "Zorg onderwijs zekerheid." });
    expect(begin).not.toContain("Onderwijs");
  });

  it("ontsnapt tekens die het svg zouden breken", () => {
    const svg = bouwOverheidSvg(
      { template: "centraal", titel: 'Groei & "meer" <nu>', elementen: [{ icoon: "munt", label: "R&D" }] },
      { format: "16:9", t: 6, duur: 6 }
    );
    expect(svg).toContain("&amp;");
    expect(svg).not.toContain('<nu>');
  });

  it("valt terug op een neutraal icoon bij een onbekende sleutel", () => {
    const svg = bouwOverheidSvg(
      { template: "centraal", elementen: [{ icoon: "bestaat-niet", label: "Test" }] },
      { format: "16:9", t: 6, duur: 6 }
    );
    expect(svg).toContain("<circle");
    expect(svg).toContain("Test");
  });

  it("rendert elk sjabloon zonder te breken", () => {
    for (const template of ["centraal", "rij", "stroom", "vergelijking", "groei"] as const) {
      const svg = bouwOverheidSvg(
        {
          template,
          titel: "Test",
          elementen: [
            { icoon: "munt", label: "Een", waarde: 40 },
            { icoon: "huis", label: "Twee", waarde: 80 },
          ],
        },
        { format: "9:16", t: 3, duur: 6, voiceover: "Een en twee." }
      );
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.length).toBeGreaterThan(200);
    }
  });

  it("heeft voor elk asset in het register een tekening die iets oplevert", () => {
    for (const sleutel of ASSET_SLEUTELS) {
      const svg = bouwOverheidSvg(
        { template: "centraal", elementen: [{ icoon: sleutel, label: sleutel }] },
        { format: "16:9", t: 6, duur: 6 }
      );
      expect(svg).toContain("<g transform=");
    }
  });
});
