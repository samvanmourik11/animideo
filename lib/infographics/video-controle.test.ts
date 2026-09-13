import { describe, it, expect } from "vitest";
import {
  bundelPerScene,
  controleerDraaiboek,
  herstelKosten,
  leesShotOordeel,
  leesVerhaalOordeel,
  nummerFouten,
  pasHerstelToe,
  versieVan,
  type ControleFout,
} from "./video-controle";
import { VERTELLER_ID, type DialogueCastMember, type DialogueLine, type DialogueSpec } from "./dialogue-schema";

// De fouten die in "Tyrell, Lilly en de Wonderwagen" met de hand gevonden werden,
// als vaste proef voor de controleknop.

const lid = (id: string, name: string, position: DialogueCastMember["position"]): DialogueCastMember => ({
  id, characterId: `uuid-${name.toLowerCase()}`, name, role: "", voice: "v", portraitUrl: "p", position,
});
const gemaakt = { audioUrl: "a.mp3", audioDuration: 3, shotImageUrl: "s.png", videoUrl: "v.mp4", mouthStart: 0 };
const zegt = (characterId: string, text: string, extra: Partial<DialogueLine> = {}): DialogueLine => ({
  characterId, text, emotion: "neutraal", ...gemaakt, ...extra,
});

function proefSpec(): DialogueSpec {
  return {
    version: 1,
    title: "Wonderwagen",
    format: "16:9",
    cast: [lid("char-1", "Tyrell", "left"), lid("char-2", "Lilly", "right"), lid("char-3", "Oma", "center")],
    verhaallijn: [
      { fase: null, titel: "Oma's geheim", wat: "Oma vertelt over een geheim.", plek: "woonkamer", wie: ["uuid-tyrell", "uuid-lilly", "uuid-oma"], verteller: "",
        citaten: [{ wie: "uuid-tyrell", tekst: "Wat voor geheim?" }] },
      { fase: null, titel: "De wagen", wat: "Oma trekt het kleed van de wagen.", plek: "oude kamer", wie: ["uuid-tyrell", "uuid-lilly", "uuid-oma"], verteller: "",
        citaten: [{ wie: "uuid-oma", tekst: "Overal waar jullie nieuwsgierig naar zijn." }] },
    ],
    scenes: [
      {
        id: "s0", setting: "a cosy living room", deel: 1, twoShotUrl: "t0.png",
        lines: [
          zegt("char-2", "Wat voor geheim, oma?"),
          zegt("char-1", "De kinderen keken elkaar nieuwsgierig aan.", { kind: "actie", actie: "They look at each other." }),
          zegt("char-3", "Weten jullie dat ik vroeger een geheim heb ontdekt?", { sprekerZeker: false }),
        ],
      },
      {
        id: "s1", setting: "an old room", deel: 2, twoShotUrl: "t1.png",
        lines: [zegt("char-2", "Kunnen we echt overal naartoe?")],
      },
    ],
  };
}

describe("controleerDraaiboek", () => {
  const fouten = controleerDraaiboek(proefSpec());
  const van = (soort: string) => fouten.filter((f) => f.soort === soort);

  it("ziet dat een letterlijke zin door de verkeerde persoon gezegd wordt", () => {
    expect(van("spreker")).toHaveLength(1);
    expect(van("spreker")[0]).toMatchObject({ scene: 0, regel: 0, herstel: { type: "spreker", characterId: "char-1" } });
  });

  it("ziet een ontbrekende letterlijke zin en zet hem aan het einde van zijn moment", () => {
    expect(van("zin")[0]).toMatchObject({
      scene: 1, herstel: { type: "regel-erbij", na: 0, regel: { characterId: "char-3", text: "Overal waar jullie nieuwsgierig naar zijn." } },
    });
  });

  it("ziet een vertellerzin in de mond van een personage", () => {
    expect(van("verteller")[0]).toMatchObject({ scene: 0, regel: 1, herstel: { type: "spreker", characterId: VERTELLER_ID } });
  });

  it("neemt twijfel over de spreker uit het maken mee", () => {
    expect(van("wie-praat")[0]).toMatchObject({ scene: 0, regel: 2, herstel: { type: "shot" } });
  });

  it("vindt niets als een letterlijke zin door de verteller verteld wordt", () => {
    const spec = proefSpec();
    spec.scenes[0].lines[0] = zegt(VERTELLER_ID, "\"Wat voor geheim?\" vroeg Tyrell.", { kind: "actie", actie: "x" });
    expect(controleerDraaiboek(spec).filter((f) => f.soort === "spreker" || f.soort === "zin").map((f) => f.scene)).toEqual([1]);
  });
});

describe("pasHerstelToe", () => {
  const spec = proefSpec();
  spec.controle = { versie: versieVan(spec), gecontroleerdOp: "nu", shotsBekeken: 4, fouten: nummerFouten(controleerDraaiboek(spec)) };
  const alle = spec.controle.fouten;

  it("zet alles klaar om opnieuw te maken, en verder niets", () => {
    const na = pasHerstelToe(spec, alle);
    const [s0, s1] = na.scenes;
    // Verkeerde spreker: andere mond, dus ook een andere stem.
    expect(s0.lines[0]).toMatchObject({ characterId: "char-1", audioUrl: null, videoUrl: null });
    // Vertellerzin: nu echt de verteller, over een beeld zonder pratende mond.
    expect(s0.lines[1]).toMatchObject({ characterId: VERTELLER_ID, kind: "actie", kader: "totaal", videoUrl: null });
    // Twijfel over de mond: alleen beeld en beweging opnieuw, met een correctie. De stem blijft.
    expect(s0.lines[2]).toMatchObject({ audioUrl: "a.mp3", shotImageUrl: null, videoUrl: null });
    expect(s0.lines[2].beeldAanwijzing).toContain("Oma");
    // Ontbrekende zin: erbij, na de bestaande regel.
    expect(s1.lines.map((l) => l.text)).toEqual(["Kunnen we echt overal naartoe?", "Overal waar jullie nieuwsgierig naar zijn."]);
    expect(na.controle?.fouten.every((f) => f.hersteld)).toBe(true);
    // Het origineel blijft onaangeroerd.
    expect(spec.scenes[0].lines[0].characterId).toBe("char-2");
  });

  it("herstelt een hele scène door het scènebeeld en alle beelden erin weg te halen", () => {
    const f: ControleFout = { id: "x", soort: "wie-in-beeld", scene: 0, regel: null, wat: "Lilly ontbreekt", herstel: { type: "scene", aanwijzing: "Lilly stands on the right." } };
    const na = pasHerstelToe(spec, [f]);
    expect(na.scenes[0].twoShotUrl).toBeNull();
    expect(na.scenes[0].beeldAanwijzing).toBe("Lilly stands on the right.");
    expect(na.scenes[0].lines.every((l) => !l.videoUrl && l.audioUrl === "a.mp3")).toBe(true);
    expect(na.scenes[1].twoShotUrl).toBe("t1.png");
  });

  it("laat de regelnummers van openstaande fouten meeschuiven na een ingevoegde regel", () => {
    const erbij: ControleFout = { id: "erbij", soort: "verhaal", scene: 0, regel: null, wat: "x",
      herstel: { type: "regel-erbij", na: -1, regel: { kind: "actie", characterId: "char-3", text: "", emotion: "", actie: "Oma pulls the cloth.", seconden: 4 } } };
    const shot: ControleFout = { id: "shot", soort: "tekst-in-beeld", scene: 0, regel: 2, wat: "x", herstel: { type: "shot", instructie: "No text." } };
    const metBeide = { ...spec, controle: { ...spec.controle!, fouten: [erbij, shot] } };
    const na = pasHerstelToe(metBeide, [erbij]);
    expect(na.scenes[0].lines[0].actie).toBe("Oma pulls the cloth.");
    const open = na.controle!.fouten.find((f) => f.id === "shot")!;
    expect(open.regel).toBe(3);
    expect(pasHerstelToe(na, [open]).scenes[0].lines[3].beeldAanwijzing).toBe("No text.");
  });
});

describe("herstelKosten", () => {
  const spec = proefSpec();
  const fouten = nummerFouten(controleerDraaiboek(spec));
  const van = (soort: string) => fouten.filter((f) => f.soort === soort);

  it("rekent een shot als beeld en beweging, zonder stem", () => {
    expect(herstelKosten(spec, van("wie-praat"))).toBe(3);
  });

  it("rekent een andere spreker en een nieuwe zin als stem, beeld en beweging", () => {
    expect(herstelKosten(spec, van("spreker"))).toBe(4);
    expect(herstelKosten(spec, van("zin"))).toBe(4);
  });

  it("rekent een scène als het scènebeeld plus elk shot erin", () => {
    const scene: ControleFout = { id: "x", soort: "wie-in-beeld", scene: 1, regel: null, wat: "x", herstel: { type: "scene", aanwijzing: "y" } };
    expect(herstelKosten(spec, [scene])).toBe(1 + 3);
  });

  it("telt een shot dat door twee fouten opnieuw moet maar één keer", () => {
    const tweeOpEenShot: ControleFout[] = [
      { id: "a", soort: "tekst-in-beeld", scene: 1, regel: 0, wat: "x", herstel: { type: "shot", instructie: "a" } },
      { id: "b", soort: "plek", scene: 1, regel: 0, wat: "x", herstel: { type: "shot", instructie: "b" } },
    ];
    expect(herstelKosten(spec, tweeOpEenShot)).toBe(3);
  });
});

describe("versieVan", () => {
  it("verandert als er een clip verandert, en niet zonder reden", () => {
    const spec = proefSpec();
    expect(versieVan(spec)).toBe(versieVan(proefSpec()));
    spec.scenes[1].lines[0].videoUrl = "nieuw.mp4";
    expect(versieVan(spec)).not.toBe(versieVan(proefSpec()));
  });
});

describe("leesShotOordeel en bundelPerScene", () => {
  it("houdt alleen bekende soorten met een uitleg én een correctie", () => {
    const fouten = leesShotOordeel({ fouten: [
      { soort: "wie-in-beeld", wat: "Lilly ontbreekt.", instructie: "Add Lilly on the right." },
      { soort: "stijl", wat: "Te vlak.", instructie: "More shading." },
      { soort: "tekst-in-beeld", wat: "Tekst op de muur.", instructie: "" },
    ] }, 2, 1);
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatchObject({ scene: 2, regel: 1, herstel: { type: "shot", instructie: "Add Lilly on the right." } });
    expect(leesShotOordeel("onzin", 0, 0)).toEqual([]);
  });

  it("meldt binnen of buiten hetzelfde gebouw niet als verkeerde plek", () => {
    const fouten = leesShotOordeel({ fouten: [
      { soort: "plek", wat: "Binnen in de basiliek, terwijl buiten hoort.", instructie: "Show them outside." },
      { soort: "plek", wat: "Synagoge en moskee ontbreken in de achtergrond.", instructie: "Keep the synagogue and mosque behind them." },
    ] }, 7, 0);
    expect(fouten.map((f) => f.wat)).toEqual(["Synagoge en moskee ontbreken in de achtergrond."]);
  });

  it("maakt van een ontbrekend personage in meerdere shots één herstel van de scène", () => {
    const shot = (regel: number) => leesShotOordeel({ fouten: [{ soort: "wie-in-beeld", wat: "Lilly ontbreekt.", instructie: "Lilly on the right." }] }, 3, regel)[0];
    const los = leesShotOordeel({ fouten: [{ soort: "tekst-in-beeld", wat: "Tekst.", instructie: "No text." }] }, 3, 0)[0];
    const uit = bundelPerScene([shot(0), shot(2), los]);
    expect(uit).toHaveLength(2);
    expect(uit.find((f) => f.soort === "wie-in-beeld")).toMatchObject({ regel: null, herstel: { type: "scene", aanwijzing: "Lilly on the right." } });
    // Eén shot met een ontbrekend personage blijft een shot.
    expect(bundelPerScene([shot(1)])[0].herstel.type).toBe("shot");
  });

  it("bundelt close-ups nooit tot een herstel van de hele scène", () => {
    const spec = proefSpec();
    spec.scenes[0].lines[0].kader = "close";
    spec.scenes[0].lines[2].kader = "close";
    const tegenstrijdig = [
      leesShotOordeel({ fouten: [{ soort: "wie-in-beeld", wat: "Extra kind.", instructie: "Only Tyrell." }] }, 0, 0)[0],
      leesShotOordeel({ fouten: [{ soort: "wie-in-beeld", wat: "Extra kind.", instructie: "Only Lilly." }] }, 0, 2)[0],
    ];
    const uit = bundelPerScene(tegenstrijdig, spec);
    expect(uit).toHaveLength(2);
    expect(uit.every((f) => f.herstel.type === "shot")).toBe(true);
  });
});

describe("leesVerhaalOordeel", () => {
  it("zet een ontbrekend moment als actiebeeld bij het goede deel", () => {
    const fouten = leesVerhaalOordeel({ fouten: [
      { deel: 2, wat: "Het kleed gaat nooit van de wagen.", actie: "Oma pulls the large cloth off the Wonderwagen while Tyrell and Lilly watch." },
      { deel: 9, wat: "Bestaat niet.", actie: "x" },
    ] }, proefSpec());
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatchObject({ soort: "verhaal", scene: 1, herstel: { type: "regel-erbij", na: -1, regel: { kind: "actie" } } });
  });
});
