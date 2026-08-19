import { describe, it, expect } from "vitest";
import { VORMEN, VORM_GROEPEN, vindVorm, vormDataUri, vormSvg } from "./shapes-svg";

// Een vorm die "NaN" in zijn pad zet tekent niets en faalt stil: je krijgt een
// leeg vlak op de tijdlijn en geen enkele foutmelding. Daarom controleren we de
// hele catalogus in één keer op bruikbare uitvoer.

describe("vormenbibliotheek", () => {
  it("heeft unieke id's", () => {
    const ids = VORMEN.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("zet elke vorm in een groep die bestaat", () => {
    const groepen = new Set(VORM_GROEPEN.map((g) => g.id));
    for (const v of VORMEN) expect(groepen.has(v.groep)).toBe(true);
  });

  it("laat geen enkele groep leeg", () => {
    for (const g of VORM_GROEPEN) {
      expect(VORMEN.some((v) => v.groep === g.id), `groep ${g.id} is leeg`).toBe(true);
    }
  });

  it("tekent elke vorm zonder NaN of Infinity", () => {
    for (const v of VORMEN) {
      const svg = vormSvg(v.id);
      expect(svg, v.id).toContain("<svg");
      expect(svg, v.id).not.toMatch(/NaN|Infinity|undefined|null/);
    }
  });

  it("geeft bij elke lijndikte nog steeds een geldige vorm", () => {
    for (const v of VORMEN) {
      for (const dikte of [0, 0.001, 0.06, 0.25, 2]) {
        const svg = vormSvg(v.id, { dikte });
        expect(svg, `${v.id} @ ${dikte}`).not.toMatch(/NaN|Infinity|-?\d+e[+-]\d+/);
      }
    }
  });

  it("gebruikt de kleuren die je meegeeft", () => {
    for (const v of VORMEN) {
      const svg = vormSvg(v.id, { vulling: "#abcdef", lijn: "#123456" });
      if (v.heeftVulling) expect(svg, v.id).toContain("#abcdef");
      if (v.heeftLijn) expect(svg, v.id).toContain("#123456");
    }
  });

  it("levert dezelfde vorm bij dezelfde invoer", () => {
    expect(vormSvg("ster-5", { vulling: "#fff" })).toBe(vormSvg("ster-5", { vulling: "#fff" }));
  });

  it("maakt een data-URL die Pixi als SVG herkent", () => {
    const uri = vormDataUri("cirkel");
    expect(uri.startsWith("data:image/svg+xml")).toBe(true);
    expect(decodeURIComponent(uri.split(",")[1])).toContain("<ellipse");
  });

  it("weigert een vorm die niet bestaat", () => {
    expect(() => vormSvg("bestaat-niet")).toThrow();
    expect(vindVorm("bestaat-niet")).toBeUndefined();
  });
});
