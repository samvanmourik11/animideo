import { describe, it, expect } from "vitest";
import {
  plekZonderMensen, zitHouding, voorwerpRegie, iedereenZichtbaar,
  buildShotPrompt, buildTwoShotBrief, NATUURWETTEN,
} from "./dialogue-staging";
import { voorwerpenInScene, type DialogueCastMember, type DialogueScene } from "./dialogue-schema";

// Regels die uit één gerenderde video kwamen (Tyrell, Lilly en de Wonderwagen):
// een dubbele Lilly, figuranten langs de Waterkant, kinderen die aan tafel zaten
// en in het volgende shot stonden, een kerk met een kruis én een Davidster, en
// een Wonderwagen die er in elke scène anders uitzag.

const lid = (extra: Partial<DialogueCastMember> = {}): DialogueCastMember => ({
  id: "char-1",
  characterId: "uuid-1",
  name: "Tyrell",
  role: "kleinzoon",
  voice: "stem-a",
  portraitUrl: "https://x/t.png",
  position: "left",
  appearance: "orange T-shirt",
  ...extra,
});
const tyrell = lid();
const lilly = lid({ id: "char-2", characterId: "uuid-2", name: "Lilly", position: "right", appearance: "curly afro, yellow T-shirt" });
const oma = lid({ id: "char-3", characterId: "uuid-3", name: "Oma", position: "center", appearance: "grey braids, lilac cardigan" });

describe("plekZonderMensen", () => {
  it("haalt de wandelaars uit de Waterkant", () => {
    expect(plekZonderMensen(
      "The Waterkant in Paramaribo, with a view of the river and historic buildings along the waterfront, lush greenery, and people enjoying the scenery."
    )).toBe("The Waterkant in Paramaribo, with a view of the river and historic buildings along the waterfront, lush greenery.");
  });

  it("haalt verkopers en spelende kinderen weg", () => {
    expect(plekZonderMensen("a busy market with vendors selling fruit")).toBe("a busy market");
    expect(plekZonderMensen("a playground where children play on the swings")).toBe("a playground");
  });

  it("laat een kinderkamer een kinderkamer", () => {
    expect(plekZonderMensen("a kids' room with toys")).toBe("a kids' room with toys");
    expect(plekZonderMensen("a children's museum with big windows")).toBe("a children's museum with big windows");
  });

  it("laat een plek zonder mensen ongemoeid", () => {
    expect(plekZonderMensen("Fort Zeelandia with old stone walls and cannons")).toBe("Fort Zeelandia with old stone walls and cannons");
  });
});

describe("zitHouding", () => {
  const aanTafel = [
    { kind: "actie", actie: "Oma zit met Tyrell en Lilly aan de tafel in de woonkamer" },
    { kind: "dialoog" },
    { kind: "actie", actie: "Tyrell en Lilly kijken elkaar nieuwsgierig aan" },
    { kind: "dialoog" },
  ];

  it("onthoudt dat ze aan tafel zitten, ook na een handeling die er niets over zegt", () => {
    expect(zitHouding(aanTafel, 1)).toBe(true);
    expect(zitHouding(aanTafel, 3)).toBe(true);
  });

  it("staat bij het begin van een scène zonder handeling gewoon", () => {
    expect(zitHouding(aanTafel, 0)).toBe(false);
    expect(zitHouding([{ kind: "dialoog" }], 1)).toBe(false);
  });

  it("laat ze opstaan als de handeling dat zegt", () => {
    expect(zitHouding([{ kind: "actie", actie: "Grandma stands up and walks towards the old room" }], 1)).toBe(false);
    expect(zitHouding([
      { kind: "actie", actie: "Tyrell, Lilly and Oma sit inside the Wonderwagen, looking out the window" },
      { kind: "actie", actie: "The Wonderwagen arrives, with Tyrell, Lilly and Oma stepping out" },
    ], 2)).toBe(false);
  });

  it("ziet zitten in de wagen", () => {
    expect(zitHouding([{ kind: "actie", actie: "Tyrell, Lilly and Oma sit inside the Wonderwagen, looking out the window" }], 1)).toBe(true);
  });
});

describe("buildShotPrompt: geen klassenfoto, niemand dubbel", () => {
  it("zet drie pratende personages niet in een rij naar de camera", () => {
    const p = buildShotPrompt({ setting: "Fort Zeelandia", inBeeld: [oma, tyrell, lilly], spreker: oma, kader: "medium" });
    expect(p).toContain("Never line everyone up");
    expect(p).toContain("turned towards Oma");
  });

  it("laat een close-up van één persoon met rust", () => {
    const p = buildShotPrompt({ setting: "a room", inBeeld: [lilly], spreker: lilly, kader: "close" });
    expect(p).not.toContain("STAGING");
  });

  it("laat iedereen maar één keer voorkomen", () => {
    const p = buildShotPrompt({ setting: "a living room", inBeeld: [tyrell, lilly], kader: "totaal", actie: "they walk in" });
    expect(p).toContain("appears exactly ONCE");
  });

  it("zet bij een wijd actiebeeld iedereen in beeld, ook wie de handeling niet noemt", () => {
    const wijd = buildShotPrompt({ setting: "an old room", inBeeld: [oma, tyrell, lilly], kader: "totaal", actie: "Grandma walks to the old room" });
    expect(wijd).toContain("All 3 of them are visible");
    const dichtbij = buildShotPrompt({ setting: "a street", inBeeld: [oma, lilly], kader: "close", actie: "Lilly points at a carving" });
    expect(dichtbij).not.toContain("are visible in this shot");
  });

  it("leest 'de kinderen' niet als nieuwe mensen", () => {
    const p = buildShotPrompt({ setting: "the river", inBeeld: [oma, tyrell, lilly], kader: "medium", actie: "Oma explains the river to the children" });
    expect(p).toContain('"the children"');
  });

  it("tekent geen publiek uit de plekbeschrijving", () => {
    const p = buildShotPrompt({ setting: "the waterfront, and people enjoying the scenery", inBeeld: [tyrell], kader: "medium" });
    expect(p).not.toContain("people enjoying");
  });
});

describe("iedereenZichtbaar", () => {
  it("geldt voor wijde kaders en niet voor close-ups", () => {
    expect(iedereenZichtbaar("totaal")).toBe(true);
    expect(iedereenZichtbaar(null)).toBe(true);
    expect(iedereenZichtbaar("close")).toBe(false);
    expect(iedereenZichtbaar("detail")).toBe(false);
  });
});

describe("buildTwoShotBrief", () => {
  it("zet ze aan tafel als de scène zo begint", () => {
    const zittend = buildTwoShotBrief("a living room with a table", [tyrell, lilly, oma], 0, false, null, true);
    expect(zittend).toContain("SITTING");
    expect(zittend).not.toContain("They stand on");
    expect(buildTwoShotBrief("a living room", [tyrell, lilly], 0)).toContain("They stand on");
  });

  it("vraagt om een filmbeeld in plaats van een rij", () => {
    expect(buildTwoShotBrief("a square", [tyrell, lilly, oma], 0)).toContain("not a group photo");
    expect(buildTwoShotBrief("a forest", [tyrell], 0)).not.toContain("not a group photo");
  });
});

describe("NATUURWETTEN", () => {
  it("houdt de symbolen van gebedshuizen uit elkaar", () => {
    expect(NATUURWETTEN).toContain("Star of David");
    expect(NATUURWETTEN).toContain("never two faiths' symbols on one building");
    expect(NATUURWETTEN).toContain("leave the flagpole bare");
    expect(NATUURWETTEN).toContain("nobody is barefoot");
    expect(NATUURWETTEN).toContain("never on top of a table");
  });
});

describe("vaste voorwerpen", () => {
  const wagen = { naam: "Oma's Wonderwagen", uiterlijk: "a small round purple camper van with porthole windows" };
  const kaart = { naam: "de schatkaart", uiterlijk: "an old rolled-up paper map" };
  const scene = (setting: string, lines: { kind?: string; actie?: string; text?: string }[]) =>
    ({ id: "s", setting, lines: lines.map((l) => ({ characterId: "verteller", text: "", ...l })) }) as unknown as DialogueScene;

  it("neemt een voorwerp mee dat in een handeling genoemd wordt", () => {
    const s = scene("a cozy living room", [{ kind: "actie", actie: "The Wonderwagen is standing in the living room" }]);
    expect(voorwerpenInScene([wagen, kaart], s)).toEqual([wagen]);
  });

  it("vindt het ook in een gesproken zin", () => {
    const s = scene("a beach", [{ kind: "dialoog", text: "Pak de schatkaart erbij!" }]);
    expect(voorwerpenInScene([wagen, kaart], s)).toEqual([kaart]);
  });

  it("zet een voorwerp pas in beeld vanaf de regel waarin het genoemd wordt", () => {
    const s = scene("an old room with a large object under a cloth", [
      { kind: "actie", actie: "Oma walks into the old room" },
      { kind: "actie", actie: "Oma pulls the cloth off the Wonderwagen" },
      { kind: "dialoog", text: "Kunnen we echt overal naartoe?" },
    ]);
    expect(voorwerpenInScene([wagen], s, 0)).toEqual([]);
    expect(voorwerpenInScene([wagen], s, 1)).toEqual([wagen]);
    expect(voorwerpenInScene([wagen], s, 2)).toEqual([wagen]);
  });

  it("laat een voorwerp thuis dat niet in de scène voorkomt", () => {
    const s = scene("Fort Zeelandia with cannons", [{ kind: "dialoog", text: "Wat een kanonnen!" }]);
    expect(voorwerpenInScene([wagen, kaart], s)).toEqual([]);
  });

  it("stuurt er hooguit twee mee, en werkt zonder lijst", () => {
    const vier = ["fiets", "kaart", "sleutel", "lamp"].map((naam) => ({ naam, uiterlijk: "x" }));
    const s = scene("a shed with a fiets, a kaart, a sleutel and a lamp", []);
    expect(voorwerpenInScene(vier, s).length).toBe(2);
    expect(voorwerpenInScene(null, s)).toEqual([]);
  });

  it("beschrijft het voorwerp, en noemt het blad alleen als dat er is", () => {
    expect(voorwerpRegie([])).toBe("");
    expect(voorwerpRegie([wagen])).toContain("purple camper van");
    expect(voorwerpRegie([wagen])).toContain("never more than ONE");
    expect(voorwerpRegie([wagen])).toContain("never a toy");
    expect(voorwerpRegie([wagen])).not.toContain("reference image");
    expect(voorwerpRegie([{ ...wagen, bladUrl: "https://x/blad.jpg" }])).toContain("reference image");
  });

  it("zet het voorwerp vol in beeld als de handeling erover gaat", () => {
    const onthulling = voorwerpRegie([wagen], "Oma removes the cover, revealing the Wonderwagen");
    expect(onthulling).toContain("clearly and fully visible");
    expect(voorwerpRegie([wagen], "Tyrell and Lilly look at each other")).not.toContain("clearly and fully visible");
  });
});
