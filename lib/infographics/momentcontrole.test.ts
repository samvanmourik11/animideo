import { describe, it, expect } from "vitest";
import { lijktEngels, momentProblemen, zonderVerkeerdeTaal } from "./momentcontrole";
import { uiterlijkVan } from "./dialogue-schema";
import { zegtIetsOverHouding } from "./dialogue-staging";

// Uit de derde Wonderwagen-video: oma en de verteller spraken twee Engelse zinnen
// uit, bij de basiliek zei geen enkel personage iets, en Lilly werd door de
// beeldcontrole als jongen gezien omdat haar beschrijving "Hij draagt" zei.

describe("lijktEngels", () => {
  it("herkent de Engelse zinnen die in de video terechtkwamen", () => {
    expect(lijktEngels("Grandma reveals the Wonderwagen, pulling off the cloth.")).toBe(true);
    expect(lijktEngels("Tyrell and Lilly exchange excited glances as they realize the possibilities.")).toBe(true);
  });

  it("laat Nederlandse zinnen met een Engelse plaatsnaam met rust", () => {
    expect(lijktEngels("Weten jullie dat ik vroeger een geheim heb ontdekt?")).toBe(false);
    expect(lijktEngels("Bij The Waterkant zagen ze de rivier en de historische gebouwen.")).toBe(false);
    expect(lijktEngels("Wauw, kijk eens hoeveel verschillende dieren en planten hier zijn!")).toBe(false);
  });

  it("zegt niets over korte uitroepen", () => {
    expect(lijktEngels("Oké, let's go!")).toBe(false);
  });
});

describe("momentProblemen", () => {
  const goed = [
    { kind: "actie", characterId: "verteller", text: "Daarna bezochten ze de basiliek." },
    { kind: "dialoog", characterId: "char-1", text: "Wauw, wat is het hier hoog!" },
  ];

  it("vindt niets aan een gewoon moment", () => {
    expect(momentProblemen(goed, "Nederlands")).toEqual([]);
  });

  it("ziet een moment waarin alleen de verteller praat", () => {
    const stil = [
      { kind: "actie", characterId: "verteller", text: "Daarna bezochten ze de basiliek." },
      { kind: "actie", characterId: "char-1", text: "" },
      { kind: "actie", characterId: "char-1", text: "" },
    ];
    expect(momentProblemen(stil, "Nederlands").join(" ")).toContain("Geen enkel personage");
  });

  it("noemt de Engelse zin bij naam", () => {
    const fout = [...goed, { kind: "actie", characterId: "char-3", text: "Grandma reveals the Wonderwagen, pulling off the cloth." }];
    expect(momentProblemen(fout, "Nederlands").join(" ")).toContain("Grandma reveals");
  });

  it("vindt Engels niet fout in een Engelse video", () => {
    const engels = [{ kind: "dialoog", characterId: "char-1", text: "Look at the size of this place, it is amazing!" }];
    expect(momentProblemen(engels, "Engels")).toEqual([]);
  });
});

describe("zonderVerkeerdeTaal", () => {
  it("houdt het beeld maar laat de Engelse zin weg", () => {
    const uit = zonderVerkeerdeTaal([
      { kind: "actie", characterId: "char-3", text: "Grandma reveals the Wonderwagen, pulling off the cloth." },
      { kind: "actie", characterId: "verteller", text: "Tyrell and Lilly exchange excited glances as they realize the possibilities." },
      { kind: "dialoog", characterId: "char-2", text: "Kunnen we echt overal naartoe?" },
    ], "Nederlands");
    expect(uit).toEqual([
      { kind: "actie", characterId: "char-3", text: "" },
      { kind: "dialoog", characterId: "char-2", text: "Kunnen we echt overal naartoe?" },
    ]);
  });
});

describe("castbeschrijving als zin", () => {
  const castTeksten = ["Rustig en geheimzinnig, vertelt graag verhalen", "Enthousiast en nieuwsgierig, stelt veel vragen", "de klant"];

  it("ziet de beschrijving die oma hardop zei", () => {
    const lines = [
      { kind: "actie", characterId: "verteller", text: "Ze besloten hun eerste bestemming te kiezen." },
      { kind: "actie", characterId: "char-3", text: "Rustig en geheimzinnig, vertelt graag verhalen." },
      { kind: "dialoog", characterId: "char-1", text: "Waar gaan we als eerste naartoe, oma?" },
    ];
    expect(momentProblemen(lines, "Nederlands", castTeksten).join(" ")).toContain("beschrijvingen van een personage");
    expect(zonderVerkeerdeTaal(lines, "Nederlands", castTeksten)).toEqual([
      lines[0],
      { kind: "actie", characterId: "char-3", text: "" },
      lines[2],
    ]);
  });

  it("laat een gewone zin met een kort rolwoord staan", () => {
    const lines = [{ kind: "dialoog", characterId: "char-1", text: "Ik ben vandaag de klant in deze winkel." }];
    expect(momentProblemen(lines, "Nederlands", castTeksten)).toEqual([]);
  });
});

describe("uiterlijkVan", () => {
  it("zet de kleding van top tot teen erachter", () => {
    expect(uiterlijkVan({ name: "Lilly", appearance: "Lilly heeft een afro.", kleding: "yellow T-shirt, blue shorts, white sneakers" }))
      .toBe("Lilly heeft een afro. Outfit: yellow T-shirt, blue shorts, white sneakers.");
  });

  it("maakt van 'hij' en 'het personage' de naam", () => {
    expect(uiterlijkVan({
      name: "Lilly",
      appearance: "Het personage heeft een volle, krullende afro en grote, ronde ogen. Hij draagt een eenvoudig, felgeel T-shirt.",
    })).toBe("Lilly heeft een volle, krullende afro en grote, ronde ogen. Lilly draagt een eenvoudig, felgeel T-shirt.");
  });

  it("laat 'zij' midden in een zin staan", () => {
    expect(uiterlijkVan({ name: "Oma", appearance: "Oma heeft grijze vlechten die zij opsteekt." }))
      .toBe("Oma heeft grijze vlechten die zij opsteekt.");
  });

  it("werkt zonder beschrijving", () => {
    expect(uiterlijkVan({ name: "Tyrell", appearance: null })).toBe("");
  });
});

describe("zegtIetsOverHouding", () => {
  it("ziet zitten en opstaan, en verder niets", () => {
    expect(zegtIetsOverHouding("They sit at the table")).toBe(true);
    expect(zegtIetsOverHouding("Grandma stands up")).toBe(true);
    expect(zegtIetsOverHouding("Tyrell and Lilly exchange curious looks")).toBe(false);
    expect(zegtIetsOverHouding(null)).toBe(false);
  });
});
