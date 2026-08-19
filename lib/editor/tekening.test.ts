import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { alsDataUri, dunUit, omhullende, plakbriefjeSvg, tabelSvg, tekeningSvg, type Punt } from "./tekening";

const COMP = { width: 1920, height: 1080 };
const pen = { kleur: "#ef4444", dikte: 0.006 };

describe("tekenen", () => {
  it("maakt geen tekening van één punt", () => {
    expect(tekeningSvg([{ x: 0.5, y: 0.5 }], pen, COMP)).toBeNull();
  });

  it("houdt een klik-zonder-slepen bruikbaar", () => {
    // Twee punten op exact dezelfde plek: de omhullende zou nul breed worden en
    // dan deelt de omrekening door nul.
    const r = tekeningSvg([{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }], pen, COMP);
    if (r) {
      expect(r.svg).not.toMatch(/NaN|Infinity/);
      expect(r.formaat.breedte).toBeGreaterThan(0);
    }
  });

  it("maakt het element net zo groot als wat je tekende, niet het hele beeld", () => {
    const punten: Punt[] = [
      { x: 0.2, y: 0.3 }, { x: 0.3, y: 0.35 }, { x: 0.4, y: 0.3 },
    ];
    const r = tekeningSvg(punten, pen, COMP)!;
    expect(r.breedteFractie).toBeLessThan(0.3);
    expect(r.midden.x).toBeCloseTo(0.3, 1);
  });

  it("blijft heel bij willekeurig gekras", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ x: fc.double({ min: 0, max: 1, noNaN: true }), y: fc.double({ min: 0, max: 1, noNaN: true }) }),
          { minLength: 2, maxLength: 200 }
        ),
        (punten) => {
          const r = tekeningSvg(punten, pen, COMP);
          if (r) expect(r.svg).not.toMatch(/NaN|Infinity/);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("dunt punten uit die op elkaar liggen", () => {
    const dicht: Punt[] = Array.from({ length: 50 }, (_, i) => ({ x: 0.5 + i * 0.0001, y: 0.5 }));
    expect(dunUit(dicht).length).toBeLessThan(dicht.length);
  });

  it("geeft een omhullende die niet inklapt", () => {
    const v = omhullende([{ x: 0.5, y: 0.5 }], 0.01);
    expect(v.breedte).toBeGreaterThan(0);
    expect(v.hoogte).toBeGreaterThan(0);
  });
});

describe("plakbriefje en tabel", () => {
  it("tekent een briefje", () => {
    expect(plakbriefjeSvg()).toContain("<svg");
    expect(plakbriefjeSvg("#bbf7d0")).toContain("#bbf7d0");
  });

  it("tekent een tabel met het gevraagde aantal lijnen", () => {
    const svg = tabelSvg({ rijen: 3, kolommen: 4 });
    // 2 tussenlijnen horizontaal + 3 verticaal
    expect((svg.match(/<line/g) ?? []).length).toBe(5);
  });

  it("houdt onmogelijke maten binnen de perken", () => {
    for (const [rijen, kolommen] of [[0, 0], [-3, 2], [999, 999], [1.7, 2.4]]) {
      const svg = tabelSvg({ rijen, kolommen });
      expect(svg).not.toMatch(/NaN|Infinity/);
      expect(svg).toContain("<svg");
    }
  });

  it("levert een data-URL die als SVG herkend wordt", () => {
    expect(alsDataUri(plakbriefjeSvg()).startsWith("data:image/svg+xml")).toBe(true);
  });
});
