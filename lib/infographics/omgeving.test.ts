import { describe, it, expect } from "vitest";
import { omgevingBrief, omgevingRegie, variantVoorKader, hoofdbeeld, omgevingKlaar, type Omgeving } from "./omgeving";
import { leesBibliotheekOmgeving, omgevingVoorStijl, variantenVoorStijl, heeftStijl, beeldUitAndereStijl } from "./omgeving-bibliotheek";

// De plek was het enige dat geen plaatje had: elk beeld werd vanaf een zin opnieuw
// bedacht. Deze tests bewaken wat daarvoor in de plaats komt.

const veld: Omgeving = {
  id: "o1",
  naam: "Het voetbalveld",
  beschrijving: "a sunny soccer field with a small white goal",
  kenmerken: ["a small white goal", "tall oak trees along the left side"],
  varianten: [
    { soort: "totaal", url: "https://x/totaal.jpg" },
    { soort: "medium", url: "https://x/medium.jpg" },
    { soort: "detail", url: "https://x/detail.jpg" },
  ],
};

describe("variantVoorKader", () => {
  it("geeft het wijde beeld bij een totaalshot en het middenbeeld bij een gewoon shot", () => {
    expect(variantVoorKader(veld, "totaal")?.soort).toBe("totaal");
    expect(variantVoorKader(veld, "medium")?.soort).toBe("medium");
    expect(variantVoorKader(veld, null)?.soort).toBe("medium");
  });

  // Gemeten 20-09-2026: een close-up met het DETAILbeeld als referentie leverde een shot
  // op dat bijna helemaal uit leeg gras bestond, met een personage minder in beeld.
  it("geeft bij een close-up het middenbeeld, en alleen bij heel dichtbij het detailbeeld", () => {
    expect(variantVoorKader(veld, "close")?.soort).toBe("medium");
    expect(variantVoorKader(veld, "extreme-close")?.soort).toBe("detail");
    expect(variantVoorKader(veld, "detail")?.soort).toBe("detail");
  });

  it("valt terug op wat er wél getekend is", () => {
    const half = { varianten: [{ soort: "totaal" as const, url: "https://x/t.jpg" }] };
    expect(variantVoorKader(half, "close")?.soort).toBe("totaal");
    expect(variantVoorKader({ varianten: [] }, "medium")).toBeNull();
    expect(hoofdbeeld(half)).toBe("https://x/t.jpg");
  });
});

describe("de tekenopdracht van een plek", () => {
  it("verbiedt personages op het plekbeeld", () => {
    // Staat er iemand op, dan duikt die figuur in elk shot van de scène op.
    expect(omgevingBrief(veld, "totaal")).toContain("no people");
    expect(omgevingBrief(veld, "totaal")).toContain("a small white goal");
  });

  it("zegt bij een shot dat de achtergrond die plek is, zonder de indeling over te nemen", () => {
    const regie = omgevingRegie(veld);
    expect(regie).toContain("THE PLACE");
    expect(regie).toContain("tall oak trees along the left side");
    expect(regie).toContain("Do not copy the framing");
  });
});

describe("de bibliotheek", () => {
  const rij = {
    id: "o1",
    naam: "Het voetbalveld",
    beschrijving: "a sunny soccer field",
    kenmerken: ["a small white goal"],
    varianten: {
      "soft-3d": { totaal: "https://x/3d-totaal.jpg", medium: "https://x/3d-medium.jpg", detail: "niet-veilig" },
      "flat-vector": { totaal: "https://x/flat.jpg" },
    },
  };

  it("leest een rij en gooit onbruikbare adressen weg", () => {
    const b = leesBibliotheekOmgeving(rij)!;
    expect(b.naam).toBe("Het voetbalveld");
    expect(variantenVoorStijl(b, "soft-3d").map((v) => v.soort)).toEqual(["totaal", "medium"]);
  });

  it("weigert een rij die geen omgeving is", () => {
    expect(leesBibliotheekOmgeving(null)).toBeNull();
    expect(leesBibliotheekOmgeving({ id: 1 })).toBeNull();
  });

  // Een plat getekend veld tussen zachte 3D-personages valt uit de toon; zo'n beeld is
  // alleen een voorbeeld voor de vorm. Zelfde afspraak als bij de voorwerpen.
  it("houdt de tekenstijlen uit elkaar", () => {
    const b = leesBibliotheekOmgeving(rij)!;
    expect(heeftStijl(b, "soft-3d")).toBe(true);
    expect(heeftStijl(b, "storybook")).toBe(false);
    expect(beeldUitAndereStijl(b, "soft-3d")).toBe("https://x/flat.jpg");
    const voorVideo = omgevingVoorStijl(b, "storybook");
    expect(voorVideo.varianten).toEqual([]);
    expect(omgevingKlaar(voorVideo)).toBe(false);
    expect(omgevingKlaar(omgevingVoorStijl(b, "soft-3d"))).toBe(true);
  });
});
