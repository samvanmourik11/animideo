import { describe, it, expect } from "vitest";
import {
  FASEN,
  deelLabel,
  isUitgewerktVerhaal,
  normaliseerVerhaallijn,
  ontbrekendeRollen,
  namenUitTekst,
  ontbrekendeNamen,
  leesDeel,
  ordenDelen,
  scenesPerDeel,
  passendeLengte,
  verhaallijnBlok,
  verhaalProblemen,
  vertellerBeeld,
  zorgVoorVerteller,
  zorgVoorCitaten,
  zorgVoorMomenten,
  vertellerZinnenBijVerteller,
  voegGelijkePlekSamen,
  type VerhaalDeel,
} from "./verhaallijn";
import { VERTELLER_ID, type DialogueScene } from "./dialogue-schema";

// Aanleiding: "Kerst zonder Keuze" (12-09-2026). Lily gaf de oplossing in regel
// twee, de ouders kwamen nooit in beeld, de omslag was een telefoontje, er sprak
// geen verteller, en vijftien scènes voor zeventien regels gaven elf keer een
// nieuw beeld van dezelfde woonkamer.
//
// En daarna "Tyrell, Lilly en de Wonderwagen" (13-09-2026): een compleet verhaal
// dat in vijf vaste delen geperst werd, waardoor de reis langs zeven plekken in
// Paramaribo één zin in het slot werd.

const CAST = [
  { id: "char-1", characterId: "uuid-tyrrell", name: "Tyrrell" },
  { id: "char-2", characterId: "uuid-lily", name: "Lily" },
  { id: "char-3", characterId: "uuid-mama", name: "Mama" },
];

function lijn(over: Partial<Record<(typeof FASEN)[number], Partial<VerhaalDeel>>> = {}): VerhaalDeel[] {
  return FASEN.map((fase) => ({
    fase,
    titel: "",
    wat: `in het deel ${fase} gebeurt iets`,
    plek: "de woonkamer",
    wie: ["uuid-tyrrell", "uuid-lily", "uuid-mama"],
    verteller: fase === "begin" ? "Het was de week voor kerst." : "",
    ...over[fase],
  }));
}

const moment = (titel: string, wat: string, over: Partial<VerhaalDeel> = {}): VerhaalDeel => ({
  fase: null, titel, wat, plek: titel, wie: ["uuid-tyrrell"], verteller: "", ...over,
});

const scene = (velden: Partial<DialogueScene> & { sprekers?: string[] }): DialogueScene => ({
  id: velden.id ?? "s",
  setting: velden.setting ?? "a cosy living room with a christmas tree",
  licht: velden.licht ?? null,
  deel: velden.deel ?? null,
  twoShotUrl: velden.twoShotUrl ?? null,
  lines: velden.lines ?? (velden.sprekers ?? ["char-1"]).map((id) => ({ characterId: id, text: `zin van ${id}`, emotion: "neutraal" })),
});

// Ingekort uit het verhaal dat de gebruiker zelf aanleverde.
const WONDERWAGEN = `### Tyrell, Lilly en de Wonderwagen

Op een zonnige middag gaan **Tyrell en Lilly bij oma op bezoek**. Zoals altijd staat oma al klaar met iets lekkers.

**"Weten jullie dat ik vroeger een geheim heb ontdekt?"** vraagt oma met een mysterieuze glimlach.

Tyrell en Lilly besluiten meteen hun eerste bestemming te kiezen.

**Suriname!**

In een oogwenk zijn ze niet meer bij oma thuis, maar midden in **Paramaribo**.

Hun eerste stop is **Fort Zeelandia**. Daarna reizen ze verder naar de **Palmentuin**.

Vervolgens brengt de Wonderwagen hen naar het **Presidentieel Paleis en het Onafhankelijkheidsplein**.

Bij **De Waterkant** zien ze de rivier. Even later komen ze bij de bijzondere **Synagoge Neve Shalom en de Moskee**.`;

describe("isUitgewerktVerhaal", () => {
  it("herkent een compleet verhaal met alinea's en dialoog", () => {
    expect(isUitgewerktVerhaal(WONDERWAGEN)).toBe(true);
  });

  it("ziet een idee van een paar zinnen niet als verhaal", () => {
    expect(isUitgewerktVerhaal("Een kerstverhaal voor kinderen. Tyrrell en Lily moeten met kerst kiezen tussen papa en mama.")).toBe(false);
  });
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

  it("houdt bij een gevolgd verhaal alle momenten, in de gegeven volgorde", () => {
    const ruw = ["Bij oma", "Fort Zeelandia", "Palmentuin", "Waterkant", "Moskee", "Binnenstad", "Terug"]
      .map((titel) => ({ titel, wat: `ze zijn bij ${titel}`, plek: titel, wie: ["uuid-tyrrell"], verteller: "" }));
    const uit = normaliseerVerhaallijn(ruw, ["uuid-tyrrell"]);
    expect(uit.map((d) => d.titel)).toEqual(["Bij oma", "Fort Zeelandia", "Palmentuin", "Waterkant", "Moskee", "Binnenstad", "Terug"]);
    expect(uit.every((d) => d.fase === null)).toBe(true);
  });

  it("houdt letterlijke zinnen van bekende sprekers, en zet die sprekers in beeld", () => {
    const ruw = [{
      titel: "Oma's geheim", wat: "Oma vertelt over een geheim.", plek: "keuken", wie: ["uuid-tyrrell"], verteller: "",
      citaten: [
        { wie: "uuid-mama", tekst: "Weten jullie dat ik vroeger een geheim heb ontdekt?" },
        { wie: "verzonnen", tekst: "Deze zin heeft geen bestaande spreker." },
        { wie: "uuid-tyrrell", tekst: "" },
      ],
    }];
    const [deel] = normaliseerVerhaallijn(ruw, ["uuid-tyrrell", "uuid-mama"]);
    expect(deel.citaten).toEqual([{ wie: "uuid-mama", tekst: "Weten jullie dat ik vroeger een geheim heb ontdekt?" }]);
    expect(deel.wie).toEqual(["uuid-tyrrell", "uuid-mama"]);
  });

  it("gooit personages weg die niet in de cast bestaan", () => {
    const ruw = lijn({ begin: { wie: ["uuid-tyrrell", "verzonnen", "uuid-tyrrell"] } });
    expect(normaliseerVerhaallijn(ruw, ["uuid-tyrrell"])[0].wie).toEqual(["uuid-tyrrell"]);
  });

  it("levert niets op als er nergens iets gebeurt", () => {
    expect(normaliseerVerhaallijn(FASEN.map((fase) => ({ fase, wat: "" })), [])).toEqual([]);
    expect(normaliseerVerhaallijn([{ titel: "leeg", wat: "" }], [])).toEqual([]);
    expect(normaliseerVerhaallijn("onzin", [])).toEqual([]);
  });
});

describe("deelLabel", () => {
  it("gebruikt de titel, dan het vaste deel, dan het nummer", () => {
    expect(deelLabel(moment("Fort Zeelandia", "x"), 1)).toBe("Fort Zeelandia");
    expect(deelLabel(lijn()[3], 3)).toBe("Omslag");
    expect(deelLabel(undefined, 6)).toBe("Moment 7");
  });
});

describe("leesDeel", () => {
  it("accepteert alleen hele nummers binnen de grens", () => {
    expect(leesDeel(1)).toBe(1);
    expect(leesDeel("4")).toBe(4);
    expect(leesDeel(13)).toBe(13);
    expect(leesDeel(6, 5)).toBeNull();
    expect(leesDeel(0)).toBeNull();
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

  it("verdeelt een gevolgd verhaal gelijk, en nooit minder dan één scène per moment", () => {
    for (const [scenes, delen] of [[6, 13], [20, 13], [13, 13], [30, 7]]) {
      const verdeling = scenesPerDeel(scenes, delen, false);
      expect(verdeling).toHaveLength(delen);
      expect(verdeling.reduce((a, b) => a + b, 0)).toBe(Math.max(scenes, delen));
      expect(Math.max(...verdeling) - Math.min(...verdeling)).toBeLessThanOrEqual(1);
    }
  });
});

describe("passendeLengte", () => {
  it("kiest de kortste lengte waarin elk moment genoeg tijd krijgt", () => {
    const keuzes = [30, 60, 120, 180, 300];
    expect(passendeLengte(5, keuzes)).toBe(60);
    expect(passendeLengte(13, keuzes)).toBe(120);
    expect(passendeLengte(40, keuzes)).toBe(300);
  });
});

describe("verhaallijnBlok", () => {
  it("noemt wie er in beeld is met naam én cast-id", () => {
    const blok = verhaallijnBlok(lijn(), CAST);
    expect(blok).toContain("Mama [char-3]");
    expect(blok).toContain("OMSLAG");
    expect(blok).toContain("Het was de week voor kerst.");
  });

  it("gebruikt bij een gevolgd verhaal de titels van de momenten", () => {
    expect(verhaallijnBlok([moment("Fort Zeelandia", "ze staan bij het fort")], CAST)).toContain("1. FORT ZEELANDIA");
  });

  it("is leeg zonder verhaallijn, zodat oude draaiboeken hun prompt houden", () => {
    expect(verhaallijnBlok(null, CAST)).toBe("");
    expect(verhaallijnBlok([], CAST)).toBe("");
  });
});

describe("namenUitTekst en ontbrekendeNamen", () => {
  it("vindt de plekken uit de Wonderwagen, maar geen gewone zinsbegin-woorden", () => {
    const namen = namenUitTekst(WONDERWAGEN);
    for (const n of ["Fort Zeelandia", "Palmentuin", "Paramaribo", "Presidentieel Paleis", "Onafhankelijkheidsplein", "Waterkant", "Synagoge Neve Shalom", "Moskee"]) {
      expect(namen).toContain(n);
    }
    expect(namen).not.toContain("Daarna");
    expect(namen).not.toContain("Vervolgens");
    expect(namen).not.toContain("Hun");
  });

  it("meldt precies de plekken die de verhaallijn oversloeg", () => {
    // Zo zag de mislukte eerste versie eruit: alles bij oma, en Paramaribo in één zin.
    const mislukt = [
      moment("Bij oma", "Tyrell en Lilly gaan op bezoek bij oma. Oma vertelt over een geheim."),
      moment("De Wonderwagen", "Oma onthult de Wonderwagen. In een oogwenk zijn ze in Paramaribo, Suriname."),
      moment("Terug", "Na een dag vol avontuur stappen Tyrell en Lilly terug in de Wonderwagen."),
    ];
    const weg = ontbrekendeNamen(WONDERWAGEN, mislukt);
    expect(weg).toContain("Fort Zeelandia");
    expect(weg).toContain("Palmentuin");
    expect(weg).not.toContain("Paramaribo");
    expect(weg).not.toContain("Tyrell");
  });

  it("vergelijkt losjes, zodat een verbogen woord ook telt", () => {
    const lijnMetPaleis = [moment("Paleis", "Ze staan voor het presidentiële paleis op het onafhankelijkheidsplein.")];
    expect(ontbrekendeNamen("Ze gaan naar het Presidentieel Paleis.", lijnMetPaleis)).toEqual([]);
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

  it("ziet een telefoontje ook buiten de omslag", () => {
    const fout = lijn({ tegenslag: { wat: "Papa belt onverwacht op en Lily neemt op." } });
    expect(verhaalProblemen(fout, cast).join(" ")).toMatch(/Tegenslag: dit gebeurt via de telefoon/);
  });

  it("ziet dat iemand in de cast staat maar nergens meespeelt", () => {
    const zonderMama = lijn(Object.fromEntries(FASEN.map((f) => [f, { wie: ["uuid-tyrrell", "uuid-lily"] }])));
    expect(verhaalProblemen(zonderMama, cast).join(" ")).toContain("Mama");
  });

  it("ziet dat de ouders aan tafel zitten zonder in de cast te staan", () => {
    const zonderOuders = cast.filter((c) => c.name !== "Mama");
    const fout = lijn({ slot: { wat: "Ze zitten aan tafel met hun ouders en drinken chocolademelk." } });
    expect(verhaalProblemen(fout, zonderOuders).join(" ")).toMatch(/Mama komt/);
  });

  it("ontbrekendeRollen: 'ouders' vraagt om papa én mama", () => {
    expect(ontbrekendeRollen("Hun ouders zijn gescheiden.", [{ name: "Tyrrell" }, { name: "Oma" }])).toEqual(["Papa", "Mama"]);
    expect(ontbrekendeRollen("Hun ouders zijn gescheiden.", [{ name: "Papa" }, { name: "Mama" }])).toEqual([]);
    expect(ontbrekendeRollen("Ze gaan naar oma.", [{ name: "Beatrice", role: "oma van de kinderen" }])).toEqual([]);
  });

  it("accepteert een bibliotheekpersonage dat de rol van papa speelt", () => {
    const metPapa = [...cast, { characterId: "uuid-ousmane", name: "Ousmane", role: "papa van Tyrrell en Lily" }];
    const lijnMetPapa = lijn({ slot: { wat: "Papa zet de piek in de boom.", wie: ["uuid-ousmane"] } });
    expect(verhaalProblemen(lijnMetPapa, metPapa).join(" ")).not.toMatch(/Papa komt/);
  });

  it("laat 'oudere broer' niet doorgaan voor een ouder", () => {
    const broer = [{ characterId: "uuid-tyrrell", name: "Tyrrell", role: "de oudere broer" }];
    const fout = lijn({ slot: { wat: "Mama komt thuis.", wie: ["uuid-tyrrell"] } });
    const alleenTyrrell = fout.map((d) => ({ ...d, wie: ["uuid-tyrrell"] }));
    expect(verhaalProblemen(alleenTyrrell, broer).join(" ")).toMatch(/Mama komt/);
  });

  it("mist de verteller aan het begin", () => {
    expect(verhaalProblemen(lijn({ begin: { verteller: "" } }), cast).join(" ")).toMatch(/verteller/);
  });

  it("meldt bij een gevolgd verhaal wat er uit de tekst ontbreekt", () => {
    const kort = [moment("Bij oma", "Tyrell en Lilly zijn bij oma.", { verteller: "Het was middag." })];
    const tyrell = [{ characterId: "uuid-tyrrell", name: "Tyrell" }];
    expect(verhaalProblemen(kort, tyrell, WONDERWAGEN).join(" ")).toMatch(/Uit je verhaal ontbreekt: .*Fort Zeelandia/);
    // Zonder brontekst (verzonnen verhaal) wordt dat niet gecontroleerd.
    expect(verhaalProblemen(kort, tyrell).join(" ")).not.toMatch(/ontbreekt/);
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

describe("zorgVoorVerteller bij een zin die al in de mond van een personage lag", () => {
  const zin = "Hun eerste stop was Fort Zeelandia.";
  const fortLijn = [moment("Fort Zeelandia", "Ze staan bij het fort.", { verteller: zin })];

  it("maakt van die regel de verteller, in plaats van de zin twee keer te laten klinken", () => {
    const scenes = [scene({
      deel: 1, setting: "Fort Zeelandia",
      lines: [
        { kind: "actie", characterId: "char-1", text: zin, emotion: "", actie: "They arrive at the fort." },
        { characterId: "char-3", text: "Dit fort is heel oud.", emotion: "neutraal" },
      ],
    })];
    const uit = zorgVoorVerteller(scenes, fortLijn);
    expect(uit[0].lines).toHaveLength(2);
    expect(uit[0].lines[0].characterId).toBe(VERTELLER_ID);
    expect(uit[0].lines[0].actie).toBe("They arrive at the fort.");
    expect(scenes[0].lines[0].characterId).toBe("char-1");
  });

  it("geeft een stil vertellerbeeld de vertellerzin, in plaats van het deel over te slaan", () => {
    const scenes = [scene({
      deel: 1,
      lines: [
        { kind: "actie", characterId: VERTELLER_ID, text: "", emotion: "", actie: "A wide view of the fort." },
        { kind: "actie", characterId: VERTELLER_ID, text: "", emotion: "", actie: "The cannons on the wall." },
      ],
    })];
    const uit = zorgVoorVerteller(scenes, fortLijn);
    expect(uit[0].lines).toHaveLength(2);
    expect(uit[0].lines[0].text).toBe(zin);
    expect(uit[0].lines[0].actie).toBe("A wide view of the fort.");
  });

  it("haalt de dubbele zin weg als de verteller hem al uitsprak", () => {
    const scenes = [scene({
      deel: 1,
      lines: [
        { kind: "actie", characterId: VERTELLER_ID, text: zin, emotion: "", actie: "x" },
        { kind: "actie", characterId: "char-1", text: zin, emotion: "", actie: "y" },
        { characterId: "char-2", text: "Wat een muren!", emotion: "neutraal" },
      ],
    })];
    const uit = zorgVoorVerteller(scenes, fortLijn);
    expect(uit[0].lines.map((l) => l.characterId)).toEqual([VERTELLER_ID, "char-2"]);
  });
});

describe("vertellerZinnenBijVerteller", () => {
  const cast = [{ id: "char-1", name: "Tyrell" }, { id: "char-2", name: "Lilly" }];
  const eenRegel = (characterId: string, text: string) =>
    vertellerZinnenBijVerteller([scene({ lines: [{ kind: "actie", characterId, text, emotion: "", actie: "They look at each other." }] })], cast)[0].lines[0];

  it("geeft een zin over 'de kinderen' aan de verteller", () => {
    const l = eenRegel("char-1", "De kinderen keken elkaar nieuwsgierig aan, benieuwd naar oma's geheim.");
    expect(l.characterId).toBe(VERTELLER_ID);
    expect(l.actie).toBe("They look at each other.");
  });

  it("geeft een zin waarin een personage over zichzelf in de derde persoon praat aan de verteller", () => {
    expect(eenRegel("char-2", "Lilly's ogen werden groot van nieuwsgierigheid.").characterId).toBe(VERTELLER_ID);
  });

  it("laat een aanspreking van iemand anders staan", () => {
    expect(eenRegel("char-2", "Kijk Tyrell, dat is de mooiste vogel!").characterId).toBe("char-2");
  });

  it("laat een zin in de eerste persoon staan, ook met de eigen naam erin", () => {
    expect(eenRegel("char-1", "Ik ben Tyrell en ik wil naar Suriname!").characterId).toBe("char-1");
  });
});

describe("zorgVoorMomenten", () => {
  const cast = CAST.map(({ id, characterId }) => ({ id, characterId }));
  const reis = [
    moment("Bij oma", "Ze komen binnen.", { verteller: "Op een zonnige middag gingen ze naar oma." }),
    moment("Synagoge en Moskee", "Ze bezoeken de Synagoge Neve Shalom en de Moskee.", {
      citaten: [{ wie: "uuid-mama", tekst: "Kijk, ze staan vlak naast elkaar." }],
    }),
    moment("Terug", "Ze stappen weer in de wagen."),
  ];

  it("zet een verdwenen moment terug op zijn plek in de volgorde", () => {
    const scenes = [scene({ id: "a", deel: 1 }), scene({ id: "c", deel: 3 })];
    const uit = zorgVoorMomenten(scenes, reis, cast);
    expect(uit.map((s) => s.deel)).toEqual([1, 2, 3]);
    const terug = uit[1];
    expect(terug.lines[0].characterId).toBe(VERTELLER_ID);
    // Zonder vertellerzin vertelt de verteller wat er gebeurt.
    expect(terug.lines[0].text).toBe("Ze bezoeken de Synagoge Neve Shalom en de Moskee.");
    expect(terug.lines[1]).toMatchObject({ characterId: "char-3", text: "Kijk, ze staan vlak naast elkaar." });
  });

  it("zet een letterlijke zin niet dubbel als hij al bij een ander moment staat", () => {
    const scenes = [
      scene({ id: "a", deel: 1, lines: [{ characterId: "char-3", text: "Kijk, ze staan vlak naast elkaar.", emotion: "blij" }] }),
      scene({ id: "c", deel: 3 }),
    ];
    const uit = zorgVoorMomenten(scenes, reis, cast);
    expect(uit[1].lines.map((l) => l.characterId)).toEqual([VERTELLER_ID]);
  });

  it("laat een verzonnen verhaal met vaste delen ongemoeid", () => {
    const scenes = [scene({ deel: 1 })];
    expect(zorgVoorMomenten(scenes, lijn(), cast)).toBe(scenes);
  });
});

describe("zorgVoorCitaten", () => {
  const cast = CAST.map(({ id, characterId }) => ({ id, characterId }));
  const geheimLijn = [moment("De Wonderwagen", "Oma onthult de wagen.", {
    citaten: [
      { wie: "uuid-tyrrell", tekst: "Wat voor geheim?" },
      { wie: "uuid-lily", tekst: "Kunnen we echt overal naartoe?" },
      { wie: "uuid-mama", tekst: "Overal waar jullie nieuwsgierig naar zijn." },
    ],
  })];
  // Zoals de schrijfstap het bij de Wonderwagen opleverde.
  const geschreven = () => [scene({
    deel: 1,
    lines: [
      { characterId: "char-2", text: "Wat voor geheim, oma? Vertel het ons!", emotion: "nieuwsgierig" },
      { characterId: "char-1", text: "Kunnen we echt overal naartoe?", emotion: "verrast" },
    ],
  })];

  it("zet een zin terug in de mond van wie hem in het verhaal zegt", () => {
    const uit = zorgVoorCitaten(geschreven(), geheimLijn, cast);
    expect(uit[0].lines[0].characterId).toBe("char-1");
    expect(uit[0].lines[1].characterId).toBe("char-2");
  });

  it("voegt een ontbrekende zin letterlijk toe aan het einde van het moment", () => {
    const uit = zorgVoorCitaten(geschreven(), geheimLijn, cast);
    const laatste = uit[0].lines[uit[0].lines.length - 1];
    expect(laatste.text).toBe("Overal waar jullie nieuwsgierig naar zijn.");
    expect(laatste.characterId).toBe("char-3");
  });

  it("zet een zin niet dubbel als het model hem bij een verkeerd deelnummer schreef", () => {
    // Twee momenten; de zinnen van moment 2 staan in de scène van moment 1.
    const tweeMomenten = [moment("Bij oma", "Ze komen binnen."), geheimLijn[0]];
    const scenes = [
      scene({ id: "a", deel: 1, lines: [
        { characterId: "char-1", text: "Wat voor geheim?", emotion: "nieuwsgierig" },
        { characterId: "char-2", text: "Kunnen we echt overal naartoe?", emotion: "verrast" },
        { characterId: "char-3", text: "Overal waar jullie nieuwsgierig naar zijn.", emotion: "blij" },
      ] }),
      scene({ id: "b", deel: 2, lines: [{ characterId: "char-3", text: "Kom maar mee.", emotion: "neutraal" }] }),
    ];
    const uit = zorgVoorCitaten(scenes, tweeMomenten, cast);
    expect(uit[0].lines).toHaveLength(3);
    expect(uit[1].lines).toHaveLength(1);
  });

  it("is veilig om vaker te draaien", () => {
    const eenKeer = zorgVoorCitaten(geschreven(), geheimLijn, cast);
    expect(zorgVoorCitaten(eenKeer, geheimLijn, cast)[0].lines).toHaveLength(eenKeer[0].lines.length);
  });

  it("maakt nooit van de verteller een personage", () => {
    const scenes = [scene({ deel: 1, lines: [{ kind: "actie", characterId: VERTELLER_ID, text: "Wat voor geheim? vroeg Tyrell.", emotion: "", actie: "x" }] })];
    const uit = zorgVoorCitaten(scenes, [geheimLijn[0]], cast);
    expect(uit[0].lines[0].characterId).toBe(VERTELLER_ID);
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

describe("namenUitTekst bij het vaste ChatGPT-formaat", () => {
  const CHATGPT = `TITEL: Prinses Isabella en het Rekenfeest

LENGTE: 120 seconden · TAAL: Nederlands · DOELGROEP: kinderen van 4 tot 8 jaar

PERSONAGES
Uit de bibliotheek: Prinses Isabella, Vriendin 1
- Saar — mens, 7 jaar. Kleding (top tot teen): lichtblauwe jurk.

Moment 12 — Samen lukt het
Plek: Kasteeltuin – onder de appelboom · Licht: dag
In beeld: Prinses Isabella, Saar
Saar (vrolijk): "En stap voor stap moet je tellen."`;

  it("ziet kopjes en labels niet als namen, maar de plek wel", () => {
    const namen = namenUitTekst(CHATGPT);
    for (const label of ["LENGTE", "TAAL", "DOELGROEP", "Licht", "Moment", "Kleding", "Samen", "Rekenfeest LENGTE"]) {
      expect(namen).not.toContain(label);
    }
    expect(namen).toContain("Isabella");
  });

  it("meldt de cast niet als ontbrekend als die in de verhaallijn als id staat", () => {
    const lijn = [moment("Kasteeltuin", "Ze tellen appels in de kasteeltuin.")];
    const weg = ontbrekendeNamen(CHATGPT, lijn, ["Prinses Isabella", "Vriendin 1", "Saar"]);
    expect(weg).toEqual([]);
  });
});
