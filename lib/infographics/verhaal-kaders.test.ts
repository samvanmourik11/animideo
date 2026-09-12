import { describe, it, expect } from "vitest";
import {
  KADERS,
  kaderPast,
  passendKader,
  zonderHerhaling,
  kaderRegie,
  isKader,
  type Kader,
} from "./verhaal-kaders";

// De kaders zijn de motor van de afwisseling. Valt deze logica om, dan krijgt
// elk shot stilzwijgend hetzelfde kader terug en zijn we weer waar we begonnen:
// twee poppetjes naast elkaar, twintig keer achter elkaar.

describe("kaderPast", () => {
  it("laat geen close-up van drie personages toe", () => {
    expect(kaderPast("close", 1, true)).toBe(true);
    expect(kaderPast("close", 2, true)).toBe(false);
    expect(kaderPast("extreme-close", 2, true)).toBe(false);
  });

  it("laat niemand zichtbaar praten in een totaalbeeld", () => {
    // In een totaalbeeld is een mond een paar pixels groot; dan ziet niemand wie
    // er praat en lijkt het of de stem uit de lucht komt.
    expect(kaderPast("totaal", 2, false)).toBe(true);
    expect(kaderPast("totaal", 2, true)).toBe(false);
  });

  it("laat een detail-shot niet praten en niet met twee man", () => {
    expect(kaderPast("detail", 1, false)).toBe(true);
    expect(kaderPast("detail", 1, true)).toBe(false);
    expect(kaderPast("detail", 2, false)).toBe(false);
  });
});

describe("passendKader", () => {
  it("houdt de wens als die kan", () => {
    expect(passendKader("laag", 1, true)).toBe("laag");
  });

  it("wijkt uit naar iets dat erop lijkt", () => {
    // Een close-up met twee mensen kan niet; medium is het dichtstbijzijnde.
    expect(passendKader("close", 2, true)).toBe("medium");
    // Een totaalbeeld waarin iemand praat kan niet.
    expect(passendKader("totaal", 1, true)).toBe("medium");
  });

  it("geeft altijd een geldig kader terug, ook bij onzin", () => {
    expect(KADERS).toContain(passendKader("bestaat-niet" as Kader, 2, true));
    expect(KADERS).toContain(passendKader(null, 1, false));
    expect(KADERS).toContain(passendKader(undefined, 8, true));
  });
});

describe("zonderHerhaling", () => {
  it("kiest iets anders als het vorige shot hetzelfde kader had", () => {
    expect(zonderHerhaling("medium", "medium", 2, true)).not.toBe("medium");
  });

  it("laat de wens staan als die niet herhaalt", () => {
    expect(zonderHerhaling("close", "medium", 1, true)).toBe("close");
  });

  it("houdt zich ook bij het uitwijken aan wat kan", () => {
    // Twee personages die praten: nooit een close-up of een totaalbeeld.
    for (let i = 0; i < 8; i++) {
      const k = zonderHerhaling(KADERS[i], "medium", 2, true);
      expect(kaderPast(k, 2, true)).toBe(true);
    }
  });

  it("levert over een reeks shots echte afwisseling op", () => {
    // Twintig keer hetzelfde vragen mag geen twintig keer hetzelfde geven.
    let vorige: Kader | null = null;
    const rij: Kader[] = [];
    for (let i = 0; i < 20; i++) {
      const k = zonderHerhaling("medium", vorige, 1, i % 3 !== 0);
      rij.push(k);
      vorige = k;
    }
    expect(new Set(rij).size).toBeGreaterThan(2);
    for (let i = 1; i < rij.length; i++) expect(rij[i]).not.toBe(rij[i - 1]);
  });
});

describe("kaderRegie", () => {
  it("geeft voor elk kader Engelse cameraregie", () => {
    for (const k of KADERS) {
      expect(kaderRegie(k).length).toBeGreaterThan(40);
    }
  });

  it("valt terug op medium bij een onbekend kader", () => {
    expect(kaderRegie(null)).toBe(kaderRegie("medium"));
    expect(kaderRegie("onzin" as Kader)).toBe(kaderRegie("medium"));
  });
});

describe("isKader", () => {
  it("herkent alleen echte kaders", () => {
    expect(isKader("close")).toBe(true);
    expect(isKader("closeup")).toBe(false);
    expect(isKader(null)).toBe(false);
  });
});
