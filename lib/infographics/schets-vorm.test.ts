import { describe, it, expect } from "vitest";
import { grondOnder, mensenVoorVorm, schetsSvg, schetsVak, vakInPixels, SCHETS_KLEUR } from "./schets-vorm";

// De houten deur zweefde halverwege de muur. De vorm moet van de deur tot op het pad
// lopen, en het meisje dat ervoor staat moet ervoor blijven.

const W = 1344, H = 768;
const deur = { x: 984, y: 130, w: 146, h: 240 };

describe("vakInPixels", () => {
  it("rekent een kader (midden, fracties) om naar pixels vanaf linksboven", () => {
    expect(vakInPixels({ x: 0.5, y: 0.5, breedte: 0.25, hoogte: 0.5 }, 1000, 800)).toEqual({ x: 375, y: 200, w: 250, h: 400 });
  });
});

describe("grondOnder", () => {
  it("neemt de bovenrand van de grond onder het voorwerp, een klein stukje erin", () => {
    const pad = { x: 0, y: 600, w: W, h: 168 };
    expect(grondOnder(deur, [pad], H)).toBe(Math.round(600 + 0.04 * H));
  });

  it("negeert grond die er niet onder ligt", () => {
    const opzij = { x: 0, y: 500, w: 400, h: 268 };
    expect(grondOnder(deur, [opzij], H)).toBe(Math.round(0.85 * H));
  });

  it("komt nooit boven de onderkant van het voorwerp uit", () => {
    const hoog = { x: 900, y: 200, w: 400, h: 568 };
    expect(grondOnder(deur, [hoog], H)).toBe(deur.y + deur.h);
  });
});

describe("schetsVak", () => {
  it("trekt het voorwerp door tot de grond, even breed", () => {
    expect(schetsVak(deur, 700)).toEqual({ x: 984, y: 130, w: 146, h: 570 });
  });

  it("maakt het voorwerp nooit kleiner", () => {
    expect(schetsVak(deur, 200).h).toBe(240);
  });
});

describe("schetsSvg", () => {
  it("tekent één afgeronde vorm in de schetskleur over het hele beeld", () => {
    const svg = schetsSvg({ x: 984.4, y: 130.2, w: 146.5, h: 570 }, W, H);
    expect(svg).toContain(`width="${W}" height="${H}"`);
    expect(svg).toContain('<rect x="984" y="130" width="147" height="570" rx="73"');
    expect(svg).toContain(SCHETS_KLEUR);
  });
});

describe("mensenVoorVorm", () => {
  const vorm = schetsVak(deur, 700);

  it("geeft wie deels voor de vorm staat, en niet wie ernaast staat", () => {
    const meisjeVoor = { x: 860, y: 250, w: 250, h: 470 };
    const meisjeLinks = { x: 200, y: 250, w: 250, h: 470 };
    expect(mensenVoorVorm(vorm, [meisjeVoor, meisjeLinks], W, H)).toEqual([meisjeVoor]);
  });

  it("houdt het uitknippen binnen het beeld", () => {
    const [m] = mensenVoorVorm(vorm, [{ x: 1000, y: 400, w: 500, h: 500 }], W, H);
    expect(m.x + m.w).toBeLessThanOrEqual(W);
    expect(m.y + m.h).toBeLessThanOrEqual(H);
  });
});
