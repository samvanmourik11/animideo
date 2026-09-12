import { describe, it, expect } from "vitest";
import {
  LICHTSOORTEN,
  lichtRegie,
  isLichtsoort,
  diepteRegie,
  beeldSfeer,
  type Lichtsoort,
} from "./verhaal-licht";

// De tekenstijl "Soft 3D" schrijft "gentle soft studio lighting" voor, en
// studiolicht is per definitie vlak. Elke scene zag er daardoor uit als een
// speelgoedfoto op een productpagina. Deze laag zet daar het licht van de scene
// overheen — en de volgorde in de prompt is daarbij het hele punt.

describe("lichtRegie", () => {
  it("geeft voor elke lichtsoort Engelse regie", () => {
    for (const l of LICHTSOORTEN) expect(lichtRegie(l).length).toBeGreaterThan(40);
  });

  it("laat een nachtscene ook echt donker zijn", () => {
    const nacht = lichtRegie("nacht").toLowerCase();
    expect(nacht).toContain("dark");
    // Zonder dit verbod maakt het beeldmodel er alsnog daglicht van.
    expect(nacht).toContain("do not brighten");
  });

  it("valt terug op daglicht bij niets of onzin", () => {
    expect(lichtRegie(null)).toBe(lichtRegie("dag"));
    expect(lichtRegie("onzin" as Lichtsoort)).toBe(lichtRegie("dag"));
  });
});

describe("diepteRegie", () => {
  it("maakt de achtergrond wazig bij een close-up", () => {
    expect(diepteRegie("close").toLowerCase()).toContain("shallow");
    expect(diepteRegie("extreme-close").toLowerCase()).toContain("shallow");
  });

  it("houdt een totaalbeeld van voor tot achter leesbaar", () => {
    expect(diepteRegie("totaal").toLowerCase()).toContain("deep");
  });

  it("geeft altijd iets terug, ook zonder kader", () => {
    expect(diepteRegie(null).length).toBeGreaterThan(20);
  });
});

describe("beeldSfeer", () => {
  it("zegt uitdrukkelijk dat dit boven de studioverlichting van de stijl gaat", () => {
    // Zonder deze zin wint "gentle soft studio lighting" uit de tekenstijl en is
    // elke nachtscene alsnog een helder verlicht tafereel.
    expect(beeldSfeer("nacht", "close")).toContain("overrides");
  });

  it("combineert het licht met de scherptediepte van het kader", () => {
    const uit = beeldSfeer("haardvuur", "close");
    expect(uit).toContain("candle");
    expect(uit.toLowerCase()).toContain("shallow");
  });
});

describe("isLichtsoort", () => {
  it("herkent alleen echte lichtsoorten", () => {
    expect(isLichtsoort("nacht")).toBe(true);
    expect(isLichtsoort("donker")).toBe(false);
    expect(isLichtsoort(null)).toBe(false);
  });
});
