import { describe, expect, it } from "vitest";
import { exactErin, gevraagdeZin, hoortErbij, isZin, staatErin, woordDekking } from "./tekst-vergelijk";

const ZIN = "De afspraak is vrijdag om 14.00 uur in vergaderruimte B.";

describe("isZin", () => {
  it("noemt korte labels geen zin", () => {
    expect(isZin("Zorg")).toBe(false);
    expect(isZin("Meer omzet")).toBe(false);
    expect(isZin("")).toBe(false);
  });
  it("noemt een gevraagde zin wel een zin", () => {
    expect(isZin(ZIN)).toBe(true);
    expect(isZin("Stand-up om 9 uur")).toBe(true);
  });
});

describe("staatErin bij korte labels", () => {
  it("laat een spelfout niet door", () => {
    expect(staatErin("Onderwijs", ["Onderwjis"])).toBe(false);
  });
  it("herkent het label binnen een groter blok", () => {
    expect(staatErin("Zorg", ["Zorg en welzijn"])).toBe(true);
  });
  it("is blij met een leeg label", () => {
    expect(staatErin("  ", [])).toBe(true);
  });
});

describe("staatErin bij een gevraagde zin", () => {
  it("accepteert een zin die over twee blokken verdeeld staat", () => {
    expect(staatErin(ZIN, ["De afspraak is vrijdag", "om 14.00 uur in vergaderruimte B"])).toBe(true);
  });
  it("accepteert een kleine leesafwijking", () => {
    expect(staatErin(ZIN, ["De afspraak is vrijdag om 14:00 uur in vergaderruimte B"])).toBe(true);
  });
  it("wijst een half weggevallen zin af", () => {
    expect(staatErin(ZIN, ["De afspraak"])).toBe(false);
  });
  it("wijst een leeg beeld af", () => {
    expect(staatErin(ZIN, [])).toBe(false);
  });
});

describe("woordDekking", () => {
  it("telt alleen de woorden die er staan", () => {
    expect(woordDekking("een twee drie vier", "een twee")).toBe(0.5);
    expect(woordDekking("een twee", "twee een")).toBe(1);
  });
  it("trekt zich niets aan van hoofdletters en leestekens", () => {
    expect(woordDekking("Stand-up om 9 uur", "stand up om 9 uur!")).toBe(1);
  });
});

describe("hoortErbij", () => {
  it("laat een stuk van de gevraagde zin staan", () => {
    expect(hoortErbij("om 14.00 uur in vergaderruimte B", [ZIN])).toBe(true);
  });
  it("herkent brabbeltekst die er niet hoort", () => {
    expect(hoortErbij("Lorem Ipsun Dolro", [ZIN])).toBe(false);
  });
  it("laat een exact label staan", () => {
    expect(hoortErbij("Zorg", ["Zorg"])).toBe(true);
  });
  it("wijst alles af als er niets bedoeld was", () => {
    expect(hoortErbij("Verkoop", [])).toBe(false);
  });
});

describe("gevraagdeZin", () => {
  it("haalt de zin tussen aanhalingstekens eruit", () => {
    expect(
      gevraagdeZin("Add a speech bubble next to EMPLOYEE 1 containing the text: 'De afspraak is vrijdag om 14.00 uur in vergaderruimte B.'")
    ).toBe("De afspraak is vrijdag om 14.00 uur in vergaderruimte B.");
  });
  it("neemt de langste zin als er meerdere staan", () => {
    expect(gevraagdeZin(`Replace "Meer omzet" with "De afspraak is vrijdag om 14 uur"`)).toBe(
      "De afspraak is vrijdag om 14 uur"
    );
  });
  it("laat losse woorden met rust", () => {
    expect(gevraagdeZin(`Put the word "Zorg" on the sign`)).toBe(null);
  });
  it("geeft niets terug zonder aanhalingstekens", () => {
    expect(gevraagdeZin("Make the wall blue")).toBe(null);
  });
});

describe("exactErin", () => {
  it("accepteert alleen de letterlijke zin", () => {
    expect(exactErin(ZIN, [ZIN])).toBe(true);
    expect(exactErin(ZIN, ["De afspreak is vrijdag om 14.00 uur in vergaderruimte B."])).toBe(false);
  });
  it("is niet gevoelig voor leestekens", () => {
    expect(exactErin("Stand-up om 9 uur", ["stand up om 9 uur"])).toBe(true);
  });
});
