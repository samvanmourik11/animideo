import { describe, it, expect } from "vitest";
import {
  FASEN,
  normaliseerVerhaallijn,
  leesDeel,
  ordenDelen,
  scenesPerDeel,
  verhaallijnBlok,
  verhaalProblemen,
  vertellerBeeld,
  zorgVoorVerteller,
  voegGelijkePlekSamen,
  type VerhaalDeel,
} from "./verhaallijn";
import { VERTELLER_ID, type DialogueScene } from "./dialogue-schema";

// Aanleiding: "Kerst zonder Keuze" (12-09-2026). Lily gaf de oplossing in regel
// twee, de ouders kwamen nooit in beeld, de omslag was een telefoontje, er sprak
// geen verteller, en vijftien scènes voor zeventien regels gaven elf keer een
// nieuw beeld van dezelfde woonkamer.

const CAST = [
  { id: "char-1", characterId: "uuid-tyrrell", name: "Tyrrell" },
  { id: "char-2", characterId: "uuid-lily", name: "Lily" },
  { id: "char-3", characterId: "uuid-mama", name: "Mama" },
];

function lijn(over: Partial<Record<(typeof FASEN)[number], Partial<VerhaalDeel>>> = {}): VerhaalDeel[] {
  return FASEN.map((fase) => ({
    fase,
    wat: `in het deel ${fase} gebeurt iets`,
    plek: "de woonkamer",
    wie: ["uuid-tyrrell", "uuid-lily", "uuid-mama"],
    verteller: fase === "begin" ? "Het was de week voor kerst." : "",
    ...over[fase],
  }));
}

const scene = (velden: Partial<DialogueScene> & { sprekers?: string[] }): DialogueScene => ({
  id: velden.id ?? "s",
  setting: velden.setting ?? "a cosy living room with a christmas tree",
  licht: velden.licht ?? null,
  deel: velden.deel ?? null,
  twoShotUrl: velden.twoShotUrl ?? null,
  lines: velden.lines ?? (velden.sprekers ?? ["char-1"]).map((id) => ({ characterId: id, text: `zin van ${id}`, emotion: "neutraal" })),
});

describe("normaliseerVerhaallijn", () => {
  it("zet de delen in de vaste volgorde, ook als het model ze husselt", () => {
    const ruw = [...lijn()].reverse();
    expect(normaliseerVerhaallijn(ruw, ["uuid-tyrrell"]).map((d) => d.fase)).toEqual([...FASEN]);
  });

  it("laat een overgeslagen deel leeg in plaats van de rest te laten opschuiven", () => {
    const ruw = lijn().filter((d) => d.fase !== "tegenslag");
    const uit = normaliseerVerhaallijn(ruw, ["uuid-tyrrell"]);
    expect(uit[2].fase).toBe("tegenslag");
    expect(uit[2].wat).toBe("");
    expect(uit[3].wat).toContain("omslag");
  });

  it("gooit personages weg die niet in de cast bestaan", () => {
    const ruw = lijn({ begin: { wie: ["uuid-tyrrell", "verzonnen", "uuid-tyrrell"] } });
    expect(normaliseerVerhaallijn(ruw, ["uuid-tyrrell"])[0].wie).toEqual(["uuid-tyrrell"]);
  });

  it("levert niets op als er nergens iets gebeurt", () => {
    expect(normaliseerVerhaallijn(FASEN.map((fase) => ({ fase, wat: "" })), [])).toEqual([]);
    expect(normaliseerVerhaallijn("onzin", [])).toEqual([]);
  });
});

describe("leesDeel", () => {
  it("accepteert alleen 1 tot en met 5", () => {
    expect(leesDeel(1)).toBe(1);
    expect(leesDeel("4")).toBe(4);
    expect(leesDeel(0)).toBeNull();
    expect(leesDeel(6)).toBeNull();
    expect(leesDeel(2.5)).toBeNull();
    expect(leesDeel(undefined)).toBeNull();
  });
});

describe("ordenDelen", () => {
  it("laat deelnummers oplopen en vult gaten met het deel ervoor", () => {
    const scenes = [null, 2, 1, 3, null].map((deel, i) => scene({ id: `s${i}`, deel }));
    expect(ordenDelen(scenes).map((s) => s.deel)).toEqual([1, 2, 2, 3, 3]);
  });

  it("laat een draaiboek van vóór de verhaallijn ongemoeid", () => {
    const scenes = [scene({}), scene({})];
    expect(ordenDelen(scenes)).toBe(scenes);
  });
});

describe("scenesPerDeel", () => {
  it("verdeelt precies het gevraagde aantal, met minstens één scène per deel", () => {
    for (let n = 5; n <= 80; n++) {
      const verdeling = scenesPerDeel(n);
      expect(verdeling).toHaveLength(5);
      expect(verdeling.reduce((a, b) => a + b, 0)).toBe(n);
      expect(Math.min(...verdeling)).toBeGreaterThanOrEqual(1);
    }
  });

  it("geeft de tegenslag nooit minder dan het probleem", () => {
    for (let n = 5; n <= 80; n++) {
      const [, probleem, tegenslag] = scenesPerDeel(n);
      expect(tegenslag).toBeGreaterThanOrEqual(probleem);
    }
  });

  it("maakt van te weinig scènes er vijf, want elk deel moet te zien zijn", () => {
    expect(scenesPerDeel(3)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("verhaallijnBlok", () => {
  it("noemt wie er in beeld is met naam én cast-id", () => {
    const blok = verhaallijnBlok(lijn(), CAST);
    expect(blok).toContain("Mama [char-3]");
    expect(blok).toContain("OMSLAG");
    expect(blok).toContain("Het was de week voor kerst.");
  });

  it("is leeg zonder verhaallijn, zodat oude draaiboeken hun prompt houden", () => {
    expect(verhaallijnBlok(null, CAST)).toBe("");
    expect(verhaallijnBlok([], CAST)).toBe("");
  });
});

describe("verhaalProblemen", () => {
  const cast = CAST.map(({ characterId, name }) => ({ characterId, name }));

  it("vindt niets mis aan een complete verhaallijn", () => {
    expect(verhaalProblemen(lijn(), cast)).toEqual([]);
  });

  it("ziet dat de omslag buiten beeld aan de telefoon gebeurt", () => {
    const fout = lijn({ omslag: { wat: "Ze bellen papa en mama, die het een goed idee vinden." } });
    expect(verhaalProblemen(fout, cast).join(" ")).toMatch(/telefoon/);
  });

  it("ziet dat iemand in de cast staat maar nergens meespeelt", () => {
    const zonderMama = lijn(Object.fromEntries(FASEN.map((f) => [f, { wie: ["uuid-tyrrell", "uuid-lily"] }])));
    expect(verhaalProblemen(zonderMama, cast).join(" ")).toContain("Mama");
  });

  it("mist de verteller aan het begin", () => {
    expect(verhaalProblemen(lijn({ begin: { verteller: "" } }), cast).join(" ")).toMatch(/verteller/);
  });

  it("zegt niets als er geen verhaallijn is", () => {
    expect(verhaalProblemen(undefined, cast)).toEqual([]);
  });
});

describe("vertellerBeeld", () => {
  it("gebruikt de Engelse omgeving, niet de Nederlandse vertellerzin", () => {
    const beeld = vertellerBeeld("Het was de week voor kerst.", "a snowy street at dusk");
    expect(beeld).toContain("a snowy street at dusk");
    expect(beeld).not.toContain("kerst");
  });
});

describe("zorgVoorVerteller", () => {
  it("opent het deel met de verteller als het model hem vergat", () => {
    const scenes = [scene({ id: "a", deel: 1 }), scene({ id: "b", deel: 2 })];
    const uit = zorgVoorVerteller(scenes, lijn());
    expect(uit[0].lines[0].characterId).toBe(VERTELLER_ID);
    expect(uit[0].lines[0].text).toBe("Het was de week voor kerst.");
    expect(uit[0].lines[0].kind).toBe("actie");
    // Deel 2 heeft geen vertellerzin, dus daar komt niets bij.
    expect(uit[1].lines.some((l) => l.characterId === VERTELLER_ID)).toBe(false);
    // Het origineel blijft onaangeroerd.
    expect(scenes[0].lines[0].characterId).toBe("char-1");
  });

  it("is veilig om vaker te draaien", () => {
    const eenKeer = zorgVoorVerteller([scene({ deel: 1 })], lijn());
    const tweeKeer = zorgVoorVerteller(eenKeer, lijn());
    expect(tweeKeer[0].lines.filter((l) => l.characterId === VERTELLER_ID)).toHaveLength(1);
  });

  it("laat een deel met al een verteller met rust, ook als die in een latere scène staat", () => {
    const scenes = [
      scene({ id: "a", deel: 1 }),
      scene({ id: "b", deel: 1, lines: [{ kind: "actie", characterId: VERTELLER_ID, text: "Eigen zin.", emotion: "", actie: "x" }] }),
    ];
    expect(zorgVoorVerteller(scenes, lijn())[0].lines).toHaveLength(1);
  });
});

describe("voegGelijkePlekSamen", () => {
  it("maakt van zinnen op dezelfde plek één scène", () => {
    const scenes = [
      scene({ id: "a", deel: 1 }),
      scene({ id: "b", deel: 1, setting: "A cosy living room, with a Christmas tree", sprekers: ["char-2"] }),
      scene({ id: "c", deel: 1, sprekers: ["char-1"] }),
    ];
    const uit = voegGelijkePlekSamen(scenes);
    expect(uit).toHaveLength(1);
    expect(uit[0].id).toBe("a");
    expect(uit[0].lines).toHaveLength(3);
  });

  it("houdt scènes apart bij ander licht, een ander deel of een andere plek", () => {
    expect(voegGelijkePlekSamen([scene({ deel: 1 }), scene({ deel: 1, licht: "nacht" })])).toHaveLength(2);
    expect(voegGelijkePlekSamen([scene({ deel: 1 }), scene({ deel: 2 })])).toHaveLength(2);
    expect(voegGelijkePlekSamen([scene({ deel: 1 }), scene({ deel: 1, setting: "a small kitchen" })])).toHaveLength(2);
  });

  it("gooit nooit een al gemaakt basisbeeld weg", () => {
    expect(voegGelijkePlekSamen([scene({ twoShotUrl: "https://x/a.png" }), scene({})])).toHaveLength(2);
  });

  it("zet nooit meer mensen in één scène dan het beeld aankan", () => {
    const scenes = [scene({ sprekers: ["char-1", "char-2"] }), scene({ sprekers: ["char-3", "char-4"] })];
    expect(voegGelijkePlekSamen(scenes)).toHaveLength(2);
  });

  it("telt de verteller niet als iemand in beeld", () => {
    const scenes = [scene({ sprekers: ["char-1", "char-2", "char-3"] }), scene({ sprekers: [VERTELLER_ID] })];
    expect(voegGelijkePlekSamen(scenes)).toHaveLength(1);
  });
});
