import { describe, it, expect } from "vitest";
import { toetsNaarActie, inInvoerveld, type Aanslag, type Actie } from "./sneltoetsen";

// Sneltoetsen gaan stil mis: twee handelingen op dezelfde combinatie merk je pas
// als een gebruiker iets anders krijgt dan hij verwacht. Daarom staat de hele
// lijst hier één keer uitgeschreven.

function t(code: string, over: Partial<Aanslag> = {}): Aanslag {
  return { code, key: "", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...over };
}
const cmd = { metaKey: true };
const ctrl = { ctrlKey: true };

function actie(a: Aanslag): Actie | null {
  return toetsNaarActie(a)?.actie ?? null;
}

describe("elementen toevoegen", () => {
  it("zet losse letters om in een element", () => {
    expect(actie(t("KeyT"))).toBe("tekst");
    expect(actie(t("KeyR"))).toBe("rechthoek");
    expect(actie(t("KeyC"))).toBe("cirkel");
    expect(actie(t("KeyL"))).toBe("lijn");
    expect(actie(t("Slash"))).toBe("zoeken");
  });

  it("laat de bedieningstoets voorgaan op de losse letter", () => {
    expect(actie(t("KeyC", cmd))).toBe("kopieer");
    expect(actie(t("KeyT", cmd))).toBe(null);
  });
});

describe("tekst bewerken", () => {
  it("kent vet, cursief en onderstrepen", () => {
    expect(actie(t("KeyB", cmd))).toBe("vet");
    expect(actie(t("KeyI", ctrl))).toBe("cursief");
    expect(actie(t("KeyU", cmd))).toBe("onderstrepen");
  });

  it("zet hoofdletters alleen met Shift erbij", () => {
    expect(actie(t("KeyK", { ...cmd, shiftKey: true }))).toBe("hoofdletters");
    expect(actie(t("KeyK", cmd))).toBe(null);
  });

  it("maakt tekst groter en kleiner", () => {
    expect(actie(t("Period", { ...cmd, shiftKey: true }))).toBe("groter");
    expect(actie(t("Comma", { ...cmd, shiftKey: true }))).toBe("kleiner");
  });

  it("past de regelafstand aan met Alt en een pijltje", () => {
    expect(actie(t("ArrowUp", { altKey: true }))).toBe("regelafstand-op");
    expect(actie(t("ArrowDown", { altKey: true }))).toBe("regelafstand-neer");
  });
});

describe("algemeen bewerken", () => {
  it("kent de gebruikelijke combinaties", () => {
    expect(actie(t("KeyV", cmd))).toBe("plak");
    expect(actie(t("KeyX", cmd))).toBe("knip");
    expect(actie(t("KeyD", cmd))).toBe("dupliceer");
    expect(actie(t("KeyA", cmd))).toBe("selecteer-alles");
    expect(actie(t("Delete"))).toBe("verwijder");
    expect(actie(t("Backspace"))).toBe("verwijder");
  });

  it("onderscheidt ongedaan maken en opnieuw", () => {
    expect(actie(t("KeyZ", cmd))).toBe("ongedaan");
    expect(actie(t("KeyZ", { ...cmd, shiftKey: true }))).toBe("opnieuw");
    expect(actie(t("KeyY", ctrl))).toBe("opnieuw");
  });

  it("kopieert alleen de opmaak met Alt erbij", () => {
    expect(actie(t("KeyC", { ...cmd, altKey: true }))).toBe("kopieer-stijl");
  });
});

describe("rangschikken", () => {
  it("schuift een laag op met de blokhaken", () => {
    expect(actie(t("BracketRight", cmd))).toBe("laag-voor");
    expect(actie(t("BracketLeft", cmd))).toBe("laag-achter");
  });

  it("gaat met Alt erbij in één keer helemaal door", () => {
    expect(actie(t("BracketRight", { ...cmd, altKey: true }))).toBe("laag-vooraan");
    expect(actie(t("BracketLeft", { ...cmd, altKey: true }))).toBe("laag-achteraan");
  });

  it("verplaatst met de pijltjes, met Shift in grotere stappen", () => {
    expect(toetsNaarActie(t("ArrowLeft"))).toEqual({ actie: "links", groot: false });
    expect(toetsNaarActie(t("ArrowRight", { shiftKey: true }))).toEqual({ actie: "rechts", groot: true });
    expect(actie(t("ArrowUp"))).toBe("omhoog");
    expect(actie(t("ArrowDown"))).toBe("omlaag");
  });
});

describe("weergave", () => {
  it("zoomt in en uit", () => {
    expect(actie(t("Equal", cmd))).toBe("zoom-in");
    expect(actie(t("Minus", cmd))).toBe("zoom-uit");
    expect(actie(t("NumpadAdd", ctrl))).toBe("zoom-in");
  });

  it("zet de zoom terug, en met Shift passend in beeld", () => {
    expect(actie(t("Digit0", cmd))).toBe("zoom-100");
    expect(actie(t("Digit0", { ...cmd, shiftKey: true }))).toBe("zoom-passend");
  });

  it("kent een nieuwe scène en de presentatiemodus", () => {
    expect(actie(t("Enter", cmd))).toBe("nieuwe-scene");
    expect(actie(t("KeyP", { ...cmd, altKey: true }))).toBe("presentatie");
    expect(actie(t("Escape"))).toBe("escape");
  });
});

describe("geen dubbele bezetting", () => {
  // Elke combinatie mag maar één ding doen. Deze test loopt de hele lijst na en
  // klapt om zodra twee handelingen op dezelfde toets belanden.
  it("levert per combinatie hooguit één handeling", () => {
    const codes = [
      "KeyA","KeyB","KeyC","KeyD","KeyG","KeyI","KeyK","KeyL","KeyP","KeyR","KeyT",
      "KeyU","KeyV","KeyX","KeyY","KeyZ","Slash","Equal","Minus","Digit0","Enter",
      "BracketLeft","BracketRight","Period","Comma","ArrowUp","ArrowDown","ArrowLeft",
      "ArrowRight","Escape","Space","Delete","Backspace",
    ];
    const gezien = new Map<string, Actie>();
    for (const code of codes) {
      for (const ctrlKey of [false, true]) {
        for (const shiftKey of [false, true]) {
          for (const altKey of [false, true]) {
            const a = t(code, { ctrlKey, shiftKey, altKey });
            const u = toetsNaarActie(a);
            if (!u) continue;
            const sleutel = `${code}|${ctrlKey}|${shiftKey}|${altKey}`;
            expect(gezien.has(sleutel), `${sleutel} is dubbel bezet`).toBe(false);
            gezien.set(sleutel, u.actie);
          }
        }
      }
    }
    expect(gezien.size).toBeGreaterThan(30);
  });
});

describe("invoervelden", () => {
  it("herkent waar je aan het typen bent", () => {
    expect(inInvoerveld("INPUT")).toBe(true);
    expect(inInvoerveld("TEXTAREA")).toBe(true);
    expect(inInvoerveld("DIV")).toBe(false);
    expect(inInvoerveld(undefined)).toBe(false);
  });
});
