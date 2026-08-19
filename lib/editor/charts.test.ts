import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { DIAGRAM_SOORTEN, diagramDataUri, diagramSvg, type DiagramSoort } from "./charts";

// De cijfers komen uit een invoerveld, dus alles kan erin staan: nul punten,
// alleen nullen, negatieve waarden, of een label met een <-teken. Geen daarvan
// mag een kapotte SVG opleveren — dat zie je namelijk pas als een leeg vlak op
// de tijdlijn, zonder foutmelding.

const soorten = DIAGRAM_SOORTEN.map((s) => s.id);

describe("diagrammen", () => {
  it("tekent elke soort", () => {
    for (const soort of soorten) {
      const svg = diagramSvg({ soort, data: [{ label: "A", waarde: 3 }, { label: "B", waarde: 7 }] });
      expect(svg, soort).toContain("<svg");
      expect(svg, soort).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it("blijft heel bij rare cijfers", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...soorten),
        fc.array(
          fc.record({
            label: fc.string({ maxLength: 12 }),
            waarde: fc.double({ min: -1000, max: 1000, noNaN: true }),
          }),
          { maxLength: 14 }
        ),
        (soort: DiagramSoort, data) => {
          const svg = diagramSvg({ soort, data });
          expect(svg).not.toMatch(/NaN|Infinity/);
          expect(svg.startsWith("<svg")).toBe(true);
        }
      ),
      { numRuns: 250 }
    );
  });

  it("laat een tekenachtig label de SVG niet breken", () => {
    const svg = diagramSvg({ soort: "staaf", data: [{ label: "R&D <2024>", waarde: 5 }] });
    expect(svg).toContain("R&amp;D &lt;2024&gt;");
    expect(svg).not.toContain("<2024>");
  });

  it("tekent een hele cirkel als één punt alles is", () => {
    const svg = diagramSvg({ soort: "cirkel", data: [{ label: "Alles", waarde: 10 }, { label: "Niets", waarde: 0 }] });
    expect(svg).toContain("<circle");
  });

  it("zegt het als er niets te tekenen valt", () => {
    const svg = diagramSvg({ soort: "ring", data: [{ label: "A", waarde: 0 }] });
    expect(svg).toContain("Geen cijfers");
  });

  it("zet de titel erboven", () => {
    expect(diagramSvg({ soort: "lijn", data: [{ label: "A", waarde: 1 }], titel: "Omzet" })).toContain("Omzet");
  });

  it("levert een data-URL die als SVG herkend wordt", () => {
    expect(diagramDataUri({ soort: "ring", data: [{ label: "A", waarde: 1 }] }).startsWith("data:image/svg+xml")).toBe(true);
  });
});
