import { describe, it, expect } from "vitest";
import { REGISTER, ASSET_SLEUTELS, assetMaat, assetKeuzelijst, kleurIn, PLAATSHOUDERS } from "./asset-register";
import { STANDAARD_KLEUREN } from "./overheid-scene";

// Het register is de enige plek waar staat wat er getekend kan worden. Gaat daar
// iets mis — een asset zonder maat, een tekening die niets teruggeeft — dan
// vertaalt zich dat direct in een leeg of verkeerd geschaald beeld.

describe("asset-register", () => {
  it("heeft assets, uit code én uit bestanden", () => {
    expect(ASSET_SLEUTELS.length).toBeGreaterThan(20);
    const bronnen = new Set([...REGISTER.values()].map((a) => a.bron));
    expect(bronnen.has("code")).toBe(true);
    expect(bronnen.has("bestand")).toBe(true);
  });

  it("geeft elk asset een omschrijving, een categorie en een maat", () => {
    for (const asset of REGISTER.values()) {
      expect(asset.omschrijving.length).toBeGreaterThan(3);
      expect(asset.categorie.length).toBeGreaterThan(2);
      expect(asset.maat).toBeGreaterThan(0);
    }
  });

  it("tekent elk asset zonder te breken", () => {
    for (const asset of REGISTER.values()) {
      const svg = asset.teken(STANDAARD_KLEUREN);
      expect(svg.length).toBeGreaterThan(10);
      expect(svg).not.toContain("undefined");
    }
  });

  it("houdt de verhoudingen kloppend: een mens is kleiner dan een huis", () => {
    expect(assetMaat("figuur")).toBeLessThan(assetMaat("rijtjeshuis"));
    expect(assetMaat("rijtjeshuis")).toBeLessThan(assetMaat("kerk"));
    expect(assetMaat("pasje")).toBeLessThan(assetMaat("figuur"));
  });

  it("laat geen plaatshouderkleuren in een bestand-asset achter", () => {
    // Een bestand-asset dat niet is ingekleurd valt meteen op: felroze of cyaan.
    // Alleen plaatshouders die écht van hun paletkleur verschillen tellen mee:
    // #ffffff is tegelijk plaatshouder én de gewone paneelkleur, dus een wit vlak
    // in een tekening is geen fout.
    const opvallend = Object.entries(PLAATSHOUDERS).filter(
      ([hex, rol]) => STANDAARD_KLEUREN[rol].toLowerCase() !== hex.toLowerCase()
    );
    for (const asset of REGISTER.values()) {
      if (asset.bron !== "bestand") continue;
      const svg = asset.teken(STANDAARD_KLEUREN).toLowerCase();
      for (const [plaatshouder] of opvallend) {
        expect(svg).not.toContain(plaatshouder);
      }
    }
  });

  it("vervangt plaatshouders door het palet", () => {
    const uit = kleurIn('<rect fill="#FF00FF"/><rect fill="#00ffff"/>', STANDAARD_KLEUREN);
    expect(uit).toContain(STANDAARD_KLEUREN.donker);
    expect(uit).toContain(STANDAARD_KLEUREN.blauw);
  });

  it("levert een keuzelijst met uitleg voor de AI", () => {
    const lijst = assetKeuzelijst();
    expect(lijst.length).toBe(ASSET_SLEUTELS.length);
    expect(lijst.every((r) => r.includes("(") && r.includes(")"))).toBe(true);
  });
});
