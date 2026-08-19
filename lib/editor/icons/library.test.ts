import { describe, it, expect } from "vitest";
import { besteIcoon, ICONEN, ICON_CATEGORIEEN, iconUrl, zoekIconen } from "./library";

// De zoekfunctie bepaalt of "zet er een vrachtwagen bij" een bestaand icoon
// oplevert (gratis, meteen) of een nieuwe generatie (1 credit, halve minuut).
// Daarom is dit meer dan een zoekbalkje.

describe("de bibliotheek", () => {
  it("heeft unieke slugs", () => {
    const slugs = ICONEN.map((i) => i.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("plaatst elk icoon in een bestaande categorie", () => {
    const geldig = new Set(ICON_CATEGORIEEN.map((c) => c.id));
    for (const icoon of ICONEN) expect(geldig.has(icoon.categorie)).toBe(true);
  });

  it("geeft elk icoon trefwoorden mee om op te zoeken", () => {
    for (const icoon of ICONEN) expect(icoon.trefwoorden.length).toBeGreaterThan(1);
  });

  it("vult elke categorie", () => {
    for (const c of ICON_CATEGORIEEN) {
      expect(ICONEN.filter((i) => i.categorie === c.id).length, `${c.label} is leeg`).toBeGreaterThan(0);
    }
  });

  it("bouwt een publieke URL per icoon", () => {
    expect(iconUrl("vrachtwagen")).toMatch(/\/storage\/v1\/object\/public\/icons\/vrachtwagen\.png$/);
  });
});

describe("zoeken", () => {
  it("vindt het voor de hand liggende icoon", () => {
    expect(besteIcoon("vrachtwagen")?.slug).toBe("vrachtwagen");
    expect(besteIcoon("gloeilamp")?.slug).toBe("gloeilamp");
    expect(besteIcoon("huis")?.slug).toBe("huis");
  });

  it("verstaat Nederlandse omschrijvingen die niet de slug zijn", () => {
    expect(besteIcoon("idee")?.slug).toBe("gloeilamp");
    expect(besteIcoon("bezorging")).not.toBeNull();
    expect(besteIcoon("beveiliging")).not.toBeNull();
  });

  it("verstaat ook Engels, want daar denkt het model vaak in", () => {
    expect(besteIcoon("money")).not.toBeNull();
    expect(besteIcoon("growth")?.slug).toBe("grafiek-omhoog");
  });

  it("geeft niets terug als er echt niets op lijkt", () => {
    expect(besteIcoon("zeppelin met kerstverlichting")).toBeNull();
    expect(besteIcoon("")).toBeNull();
  });

  it("zet de beste treffer bovenaan bij meerdere woorden", () => {
    const treffers = zoekIconen("groen vinkje");
    expect(treffers[0].slug).toBe("vinkje");
  });
});
