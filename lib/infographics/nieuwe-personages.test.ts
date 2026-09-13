import { describe, it, expect } from "vitest";
import { hernoemIds, mergeCast } from "./dialogue-setup";
import type { DialogueCastMember } from "./dialogue-schema";

// Een verhaal zonder passende personages in de bibliotheek (prinses Isabella en de
// draken): de opzet tekent ze zelf. Het model noemt ze eerst "nieuw-1", "nieuw-2";
// daarna krijgen ze een vast id dat overal in het verhaal hetzelfde moet zijn.

describe("hernoemIds", () => {
  it("zet de tijdelijke ids om in wie en in de citaten", () => {
    const vertaling = new Map([["nieuw-1", "ai-isabella"], ["nieuw-2", "ai-draak"]]);
    const uit = hernoemIds(
      [
        { titel: "Het boek", wie: ["nieuw-1"], citaten: [{ wie: "nieuw-1", tekst: "Kijk, een kaart!" }] },
        { titel: "De grot", wie: ["nieuw-1", "nieuw-2", "uuid-bestaand"], citaten: [] },
      ],
      vertaling,
    );
    expect(uit).toEqual([
      { titel: "Het boek", wie: ["ai-isabella"], citaten: [{ wie: "ai-isabella", tekst: "Kijk, een kaart!" }] },
      { titel: "De grot", wie: ["ai-isabella", "ai-draak", "uuid-bestaand"], citaten: [] },
    ]);
  });

  it("laat een verhaallijn zonder nieuwe personages ongemoeid", () => {
    const lijn = [{ wie: ["uuid-1"] }];
    expect(hernoemIds(lijn, new Map())).toBe(lijn);
    expect(hernoemIds("geen lijst", new Map([["a", "b"]]))).toBe("geen lijst");
  });
});

describe("mergeCast met getekende personages", () => {
  const isabella: DialogueCastMember = {
    id: "char-1", characterId: "ai-isabella", name: "Isabella", role: "de prinses", voice: "",
    portraitUrl: "https://x/isabella.jpg", position: "left", appearance: "a young princess", nieuw: true, soort: "mens",
  };
  const draak: DialogueCastMember = {
    id: "char-2", characterId: "ai-draak", name: "Groen", role: "de draak", voice: "",
    portraitUrl: "https://x/draak.jpg", position: "left", appearance: "a friendly dragon", nieuw: true, soort: "fantasiewezen",
  };

  it("neemt nieuwe personages met portret mee uit het voorstel", () => {
    const cast = mergeCast([], [isabella, draak]);
    expect(cast.map((c) => [c.name, c.nieuw, c.soort])).toEqual([["Isabella", true, "mens"], ["Groen", true, "fantasiewezen"]]);
  });

  it("houdt bij een nieuw voorstel vast wat al getekend en bewaard was", () => {
    const cast = mergeCast(
      [{ characterId: "ai-isabella", name: "Isabella", portraitUrl: "https://x/isabella.jpg", nieuw: true, bibliotheekId: "uuid-bewaard", soort: "mens" }],
      [draak],
    );
    expect(cast[0]).toMatchObject({ characterId: "ai-isabella", nieuw: true, bibliotheekId: "uuid-bewaard", soort: "mens" });
    expect(cast[1].name).toBe("Groen");
  });
});
