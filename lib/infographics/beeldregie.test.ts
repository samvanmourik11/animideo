import { describe, it, expect } from "vitest";
import { dubbelePlekken, leesRegie, pasRegieToe, regieNodig, regiePrompt } from "./beeldregie";
import type { DialogueCastMember, DialogueScene, DialogueSpec } from "./dialogue-schema";

// De beeldregie bepaalt per gebied de wereld, per scène een eigen plekje en per
// regel wat je ziet. Het storyboard van Tyrell en Lilly in het bos was zeven keer
// hetzelfde bospad, de bosanemoon waar Tyrell over praatte stond nergens, en het bos
// wisselde per beeld van seizoen en stijl. Wat hier vastligt: dat de regie aanvult
// zonder te overschrijven wat al getekend of aangepast is.

const lid = (extra: Partial<DialogueCastMember> = {}): DialogueCastMember => ({
  id: "char-1",
  characterId: "uuid-1",
  name: "Tyrell",
  role: "de ontdekker",
  voice: "stem-a",
  portraitUrl: "https://x/t.png",
  position: "left",
  ...extra,
});
const cast = [lid(), lid({ id: "char-2", characterId: "uuid-2", name: "Lilly", position: "right" })];
const BOS = "a lush forest with tall green trees";
const WERELD = "Tall beech trees with smooth grey trunks, a floor of brown leaves and green moss, bluebells in late spring.";

const scene = (extra: Partial<DialogueScene> = {}): DialogueScene => ({
  id: "s0",
  setting: BOS,
  lines: [
    { characterId: "char-1", text: "Deze bloem heet een bosanemoon.", emotion: "blij" },
    { characterId: "char-2", text: "Wat een mooie naam!", emotion: "blij" },
  ],
  ...extra,
});
const spec = (scenes: DialogueScene[]): DialogueSpec => ({ version: 1, title: "Het bos", format: "16:9", cast, scenes });
const metBeelden = (extra: Partial<DialogueScene> = {}) =>
  scene({ geregisseerd: true, wereld: WERELD, lines: scene().lines.map((l) => ({ ...l, beeld: "iets" })), ...extra });

const REGIE = leesRegie({
  gebieden: [{ naam: "forest", wereld: WERELD }],
  scenes: [{
    index: 0,
    gebied: "forest",
    plek: "a small clearing carpeted with white wood anemones",
    regels: [
      { index: 0, beeld: "Tyrell crouches next to a white wood anemone, pointing at it." },
      { index: 1, beeld: "Lilly leans in to look at the flower." },
    ],
  }],
});

describe("regieNodig", () => {
  it("stuurt een draaiboek zonder beeldregie langs de regie", () => {
    expect(regieNodig(spec([scene()]))).toBe(true);
  });

  it("laat een geregisseerd draaiboek met wereld en alle beelden met rust", () => {
    expect(regieNodig(spec([metBeelden()]))).toBe(false);
  });

  it("komt terug voor één gewijzigde zin waarvan het beeld ontbreekt", () => {
    const s = metBeelden();
    s.lines[1] = { ...s.lines[1], beeld: null };
    expect(regieNodig(spec([s]))).toBe(true);
  });

  it("komt terug voor een storyboard van vóór de wereldbeschrijving", () => {
    expect(regieNodig(spec([metBeelden({ wereld: undefined })]))).toBe(true);
  });

  it("draait niet eindeloos als de regie geen wereld gaf", () => {
    expect(regieNodig(spec([metBeelden({ wereld: "" })]))).toBe(false);
  });

  it("telt een lege regel niet mee, want daar valt niets te tekenen", () => {
    const s = metBeelden();
    s.lines[1] = { characterId: "char-2", text: "  ", emotion: "" };
    expect(regieNodig(spec([s]))).toBe(false);
  });
});

describe("pasRegieToe", () => {
  it("geeft een scène zonder beeld een eigen plek, de wereld van het gebied en elk shot een beeld", () => {
    const uit = pasRegieToe(spec([scene()]), REGIE).scenes[0];
    expect(uit.setting).toContain("white wood anemones");
    expect(uit.gebied).toBe("forest");
    expect(uit.wereld).toBe(WERELD);
    expect(uit.geregisseerd).toBe(true);
    expect(uit.lines[0].beeld).toContain("anemone");
  });

  it("geeft scènes in hetzelfde gebied letterlijk dezelfde wereld, ook bij een andere schrijfwijze", () => {
    const regie = leesRegie({
      gebieden: [{ naam: "Forest", wereld: WERELD }],
      scenes: [
        { index: 0, gebied: "forest", plek: "a narrow path", regels: [] },
        { index: 1, gebied: "forest ", plek: "an old oak", regels: [] },
      ],
    });
    const uit = pasRegieToe(spec([scene({ id: "a" }), scene({ id: "b" })]), regie).scenes;
    expect(uit[0].wereld).toBe(WERELD);
    expect(uit[1].wereld).toBe(WERELD);
  });

  it("houdt een wereld die al beschreven is", () => {
    const uit = pasRegieToe(spec([scene({ wereld: "eigen wereld" })]), REGIE).scenes[0];
    expect(uit.wereld).toBe("eigen wereld");
  });

  it("laat de plek staan als die al getekend is, maar vult wel de beelden aan", () => {
    const uit = pasRegieToe(spec([scene({ twoShotUrl: "https://x/plek.png" })]), REGIE).scenes[0];
    expect(uit.setting).toBe(BOS);
    expect(uit.lines[1].beeld).toBe("Lilly leans in to look at the flower.");
  });

  it("overschrijft geen plek die de gebruiker na de regie zelf heeft aangepast", () => {
    const uit = pasRegieToe(spec([scene({ geregisseerd: true, setting: "a sandy beach" })]), REGIE).scenes[0];
    expect(uit.setting).toBe("a sandy beach");
  });

  it("overschrijft geen beeld dat al beschreven is", () => {
    const [eerste, tweede] = scene().lines;
    const uit = pasRegieToe(spec([scene({ lines: [{ ...eerste, beeld: "eigen beeld" }, tweede] })]), REGIE).scenes[0];
    expect(uit.lines[0].beeld).toBe("eigen beeld");
  });
});

// Zes bosscènes kregen van de regie alle zes dezelfde plek.
describe("dubbelePlekken", () => {
  const regieMet = (plekken: string[]) =>
    leesRegie({ gebieden: [], scenes: plekken.map((plek, index) => ({ index, gebied: "forest", plek, regels: [] })) });

  it("vindt scènes die exact dezelfde plek kregen", () => {
    const s = spec([scene({ id: "a" }), scene({ id: "b" }), scene({ id: "c" })]);
    expect(dubbelePlekken(s, regieMet(["a forest path", "a forest path", "a clearing with flowers"]))).toEqual([[0, 1]]);
  });

  it("ziet een lidwoord, hoofdletter of punt niet als een andere plek", () => {
    const s = spec([scene({ id: "a" }), scene({ id: "b" })]);
    expect(dubbelePlekken(s, regieMet(["A forest path.", "forest path"]))).toEqual([[0, 1]]);
  });

  it("telt een plek die al vastligt niet mee", () => {
    const s = spec([scene({ id: "a" }), scene({ id: "b", twoShotUrl: "https://x/1.png" })]);
    expect(dubbelePlekken(s, regieMet(["a forest path", "a forest path"]))).toEqual([]);
  });
});

describe("leesRegie", () => {
  it("gooit onbruikbare stukken weg in plaats van te crashen", () => {
    expect(leesRegie(null)).toEqual({ gebieden: [], scenes: [] });
    expect(
      leesRegie({
        gebieden: [{ naam: "forest", wereld: "  " }, { naam: "", wereld: "x" }],
        scenes: [{ gebied: "zonder index" }, { index: 0, gebied: 3, plek: "p", regels: [{ index: 0, beeld: "  " }, { beeld: "y" }] }],
      }),
    ).toEqual({ gebieden: [], scenes: [{ index: 0, gebied: "", plek: "p", regels: [] }] });
  });
});

describe("regiePrompt", () => {
  it("markeert een scène waarvan de plek al vastligt", () => {
    const { vraag } = regiePrompt(spec([scene(), scene({ id: "s1", twoShotUrl: "https://x/1.png" })]));
    expect(vraag).toContain("SCÈNE 0\n");
    expect(vraag).toContain("SCÈNE 1 (VAST)");
  });

  it("geeft de zinnen mee, want daarin staat wat er te zien moet zijn", () => {
    expect(regiePrompt(spec([scene()])).vraag).toContain("bosanemoon");
  });

  it("zegt dat een overal gelijke plek uit het draaiboek niet overgenomen wordt", () => {
    expect(regiePrompt(spec([scene()])).systeem).toContain("Neem die dan NIET over");
  });

  it("geeft een wereld die al vastligt mee, zodat een nieuwe scène hetzelfde bos krijgt", () => {
    const { vraag } = regiePrompt(spec([metBeelden({ gebied: "forest" }), scene({ id: "nieuw" })]));
    expect(vraag).toContain("GEBIEDEN DIE AL VASTLIGGEN");
    expect(vraag).toContain(WERELD);
  });
});
