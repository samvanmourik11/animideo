import { describe, it, expect } from "vitest";
import { leesRegie, pasRegieToe, regieNodig, regiePrompt, sfeerAnker } from "./beeldregie";
import type { DialogueCastMember, DialogueScene, DialogueSpec } from "./dialogue-schema";

// De beeldregie bepaalt per scène een eigen plekje en per regel wat je ziet. Het
// storyboard van Tyrell en Lilly in het bos was zeven keer hetzelfde bospad, en
// de bosanemoon waar Tyrell over praatte stond nergens. Wat hier vastligt: dat de
// regie aanvult zonder te overschrijven wat al getekend of aangepast is.

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

const REGIE = leesRegie({
  scenes: [{
    index: 0,
    gebied: "forest",
    plek: "a lush forest, a small clearing carpeted with white wood anemones",
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

  it("laat een geregisseerd draaiboek met alle beelden met rust", () => {
    const klaar = scene({ geregisseerd: true, lines: scene().lines.map((l) => ({ ...l, beeld: "iets" })) });
    expect(regieNodig(spec([klaar]))).toBe(false);
  });

  it("komt terug voor één gewijzigde zin waarvan het beeld ontbreekt", () => {
    const [eerste, tweede] = scene().lines;
    const s = scene({ geregisseerd: true, lines: [{ ...eerste, beeld: "iets" }, tweede] });
    expect(regieNodig(spec([s]))).toBe(true);
  });

  it("telt een lege regel niet mee, want daar valt niets te tekenen", () => {
    const s = scene({
      geregisseerd: true,
      lines: [{ ...scene().lines[0], beeld: "iets" }, { characterId: "char-2", text: "  ", emotion: "" }],
    });
    expect(regieNodig(spec([s]))).toBe(false);
  });
});

describe("pasRegieToe", () => {
  it("geeft een scène zonder beeld een eigen plek en elk shot een beeld", () => {
    const uit = pasRegieToe(spec([scene()]), REGIE).scenes[0];
    expect(uit.setting).toContain("white wood anemones");
    expect(uit.gebied).toBe("forest");
    expect(uit.geregisseerd).toBe(true);
    expect(uit.lines[0].beeld).toContain("anemone");
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

describe("sfeerAnker", () => {
  const plek = (setting: string, extra: Partial<DialogueScene> = {}) => scene({ id: setting, setting, ...extra });

  it("neemt het licht over van een andere plek in hetzelfde gebied", () => {
    const scenes = [
      plek("a forest path", { gebied: "forest", twoShotUrl: "https://x/pad.png" }),
      plek("a clearing with flowers", { gebied: "Forest" }),
    ];
    expect(sfeerAnker(scenes, 1)).toBe("https://x/pad.png");
  });

  it("niet uit een ander gebied", () => {
    const scenes = [plek("a kitchen", { gebied: "house", twoShotUrl: "https://x/k.png" }), plek("a clearing", { gebied: "forest" })];
    expect(sfeerAnker(scenes, 1)).toBeNull();
  });

  it("niet bij ander licht: een nachtscène hoort geen middagzon te krijgen", () => {
    const scenes = [
      plek("a forest path", { gebied: "forest", twoShotUrl: "https://x/pad.png" }),
      plek("a clearing", { gebied: "forest", licht: "nacht" }),
    ];
    expect(sfeerAnker(scenes, 1)).toBeNull();
  });

  it("niet van exact dezelfde plek, want die gaat al als locatiereferentie mee", () => {
    const scenes = [plek("a clearing", { gebied: "forest", twoShotUrl: "https://x/1.png" }), plek("a clearing", { gebied: "forest" })];
    expect(sfeerAnker(scenes, 1)).toBeNull();
  });

  it("niet zonder gebied", () => {
    const scenes = [plek("a forest path", { twoShotUrl: "https://x/pad.png" }), plek("a clearing")];
    expect(sfeerAnker(scenes, 1)).toBeNull();
  });
});

describe("leesRegie", () => {
  it("gooit onbruikbare stukken weg in plaats van te crashen", () => {
    expect(leesRegie(null).scenes).toEqual([]);
    expect(
      leesRegie({ scenes: [{ gebied: "zonder index" }, { index: 0, gebied: 3, plek: "p", regels: [{ index: 0, beeld: "  " }, { beeld: "y" }] }] }).scenes,
    ).toEqual([{ index: 0, gebied: "", plek: "p", regels: [] }]);
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
});
