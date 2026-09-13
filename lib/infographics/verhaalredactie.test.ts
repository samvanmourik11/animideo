import { describe, it, expect } from "vitest";
import { vasteZinnen, redactieFout } from "./verhaalredactie";
import type { DialogueCastMember, DialogueScene } from "./dialogue-schema";
import type { VerhaalDeel } from "./verhaallijn";

// Uit de zesde Wonderwagen-video: Lilly vroeg "Kunnen we echt overal naartoe?"
// zonder dat oma iets had verteld. De redactie mag daar een zin vóór zetten, maar
// nooit aan de zinnen van de gebruiker zelf komen.

const cast = [
  { id: "char-1", characterId: "uuid-tyrell", name: "Tyrell" },
  { id: "char-2", characterId: "uuid-lilly", name: "Lilly" },
  { id: "char-3", characterId: "uuid-oma", name: "Oma" },
] as unknown as DialogueCastMember[];

const lijn = [
  { titel: "Bezoek", wat: "", plek: "", wie: [], fase: null, verteller: "Op een zonnige middag gingen ze bij oma op bezoek.", citaten: [] },
  {
    titel: "De Wonderwagen", wat: "", plek: "", wie: [], fase: null,
    verteller: "Oma stond op en liep naar een oude kamer achter in het huis.",
    citaten: [
      { wie: "uuid-lilly", tekst: "Kunnen we echt overal naartoe?" },
      { wie: "uuid-oma", tekst: "Overal waar jullie nieuwsgierig naar zijn." },
    ],
  },
] as unknown as VerhaalDeel[];

const regel = (characterId: string, text: string, kind = "dialoog") => ({ kind, characterId, text });
const scene = (lines: ReturnType<typeof regel>[]) => ({ id: "s", setting: "an old room", deel: 2, lines }) as unknown as DialogueScene;

const oud = scene([
  regel("verteller", "Oma stond op en liep naar een oude kamer achter in het huis.", "actie"),
  regel("char-2", "Kunnen we echt overal naartoe?"),
  regel("char-3", "Overal waar jullie nieuwsgierig naar zijn."),
]);

describe("vasteZinnen", () => {
  it("haalt vertellerzinnen en citaten uit het verhaal, met het cast-id", () => {
    const vast = vasteZinnen(lijn, cast);
    expect(vast).toContainEqual({ deel: 2, characterId: "verteller", tekst: "Oma stond op en liep naar een oude kamer achter in het huis." });
    expect(vast).toContainEqual({ deel: 2, characterId: "char-2", tekst: "Kunnen we echt overal naartoe?" });
    expect(vast).toContainEqual({ deel: 2, characterId: "char-3", tekst: "Overal waar jullie nieuwsgierig naar zijn." });
  });
});

describe("redactieFout", () => {
  const vast = vasteZinnen(lijn, cast);

  it("neemt een scène over waarin oma eerst uitlegt wat de Wonderwagen kan", () => {
    const nieuw = scene([
      regel("verteller", "Oma stond op en liep naar een oude kamer achter in het huis.", "actie"),
      regel("char-3", "Dit is de Wonderwagen. Hij brengt je naar elke plek op de wereld."),
      regel("char-2", "Kunnen we echt overal naartoe?"),
      regel("char-3", "Overal waar jullie nieuwsgierig naar zijn."),
    ]);
    expect(redactieFout(oud, nieuw, vast, [], "Nederlands")).toBeNull();
  });

  it("weigert als een zin van de gebruiker veranderd is", () => {
    const nieuw = scene([
      regel("verteller", "Oma stond op en liep naar een oude kamer achter in het huis.", "actie"),
      regel("char-2", "Kunnen we echt overal heen?"),
      regel("char-3", "Overal waar jullie nieuwsgierig naar zijn."),
    ]);
    expect(redactieFout(oud, nieuw, vast, [], "Nederlands")).toContain("vaste zin");
  });

  it("weigert als een zin bij iemand anders terechtkomt of van volgorde wisselt", () => {
    const andereSpreker = scene([
      regel("verteller", "Oma stond op en liep naar een oude kamer achter in het huis.", "actie"),
      regel("char-1", "Kunnen we echt overal naartoe?"),
      regel("char-3", "Overal waar jullie nieuwsgierig naar zijn."),
    ]);
    const omgedraaid = scene([
      regel("verteller", "Oma stond op en liep naar een oude kamer achter in het huis.", "actie"),
      regel("char-3", "Overal waar jullie nieuwsgierig naar zijn."),
      regel("char-2", "Kunnen we echt overal naartoe?"),
    ]);
    expect(redactieFout(oud, andereSpreker, vast, [], "Nederlands")).not.toBeNull();
    expect(redactieFout(oud, omgedraaid, vast, [], "Nederlands")).not.toBeNull();
  });

  it("weigert te veel erbij, te veel eraf, Engels en castbeschrijvingen", () => {
    const vaste = oud.lines;
    const extra = (n: number) => Array.from({ length: n }, (_, i) => regel("char-1", `Een gewone zin nummer ${i} over de wagen.`));
    expect(redactieFout(oud, scene([...vaste, ...extra(4)] as ReturnType<typeof regel>[]), vast, [], "Nederlands")).toContain("erbij");
    expect(redactieFout(oud, scene([vaste[0]] as ReturnType<typeof regel>[]), vast, [], "Nederlands")).not.toBeNull();
    expect(redactieFout(oud, scene([...vaste, regel("char-1", "Look at the wagon, it is so big and shiny!")] as ReturnType<typeof regel>[]), vast, [], "Nederlands")).toContain("Engels");
    expect(redactieFout(oud, scene([...vaste, regel("char-1", "Enthousiast en nieuwsgierig, stelt veel vragen.")] as ReturnType<typeof regel>[]), vast, ["Enthousiast en nieuwsgierig, stelt veel vragen"], "Nederlands")).toContain("beschrijving");
  });
});
