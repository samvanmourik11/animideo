import { describe, expect, it } from "vitest";
import { buildDesignedTheme, resolveBrandColor } from "./designed-scene";

describe("resolveBrandColor", () => {
  it("laat hexcodes en rgb() intact", () => {
    expect(resolveBrandColor("#7C3AED")).toBe("#7c3aed");
    expect(resolveBrandColor("Primair: #abc")).toBe("#aabbcc");
    expect(resolveBrandColor("rgb(10, 20, 30)")).toBe("#0a141e");
  });

  it("begrijpt kleurnamen, ook aaneengeschreven met een toon ervoor", () => {
    expect(resolveBrandColor("paars")).toBe("#7c3aed");
    const diep = resolveBrandColor("dieppaars")!;
    expect(diep).toMatch(/^#[0-9a-f]{6}$/);
    expect(diep).not.toBe("#7c3aed");
    expect(resolveBrandColor("donker blauw")).toMatch(/^#[0-9a-f]{6}$/);
    expect(resolveBrandColor("navy blue")).toBe("#1e3a8a");
    expect(resolveBrandColor("diepgeel")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("geeft null bij onbekende tekst, zodat er geen zwart uitkomt", () => {
    expect(resolveBrandColor("hemelsbreed")).toBeNull();
    expect(resolveBrandColor("")).toBeNull();
    expect(resolveBrandColor(undefined)).toBeNull();
  });
});

describe("buildDesignedTheme", () => {
  it("maakt van kleurnamen een gekleurde, niet-zwarte eindscène", () => {
    const t = buildDesignedTheme({ primary: "dieppaars", secondary: "diepgeel", accent: "paars", background: "wit" });
    expect(t.primary).not.toBe("#000000");
    expect(t.accent).toBe("#7c3aed");
    expect(t.gradientFrom).not.toBe("#000000");
  });
});
