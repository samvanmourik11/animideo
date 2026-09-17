import { describe, it, expect } from "vitest";
import {
  bladUitAndereStijl, bladVoorStijl, koppelVoorwerpen, leesBibliotheekVoorwerp, naarDialoogVoorwerp, tabelOntbreekt,
  voegVoorwerpenSamen, voorwerpenVoorStijl, voorwerpenZoekPrompt, zonderPersonagesEnPlekken,
  MAX_VOORWERPEN, type BibliotheekVoorwerp,
} from "./voorwerp-bibliotheek";

// De Wonderwagen hoort in elke video dezelfde te zijn. Wat hier vastligt: een
// voorwerp uit de bibliotheek komt precies zo in de video, met het blad van de
// juiste tekenstijl, ook als het taalmodel het anders opschreef.

const WAGEN: BibliotheekVoorwerp = {
  id: "w-1",
  naam: "Wonderwagen",
  uiterlijk: "an old wooden covered wagon on four big red wheels, big enough for three people to sit inside",
  bladen: { "soft-3d": "https://x/wagen-3d.png" },
};

describe("koppelVoorwerpen", () => {
  it("neemt naam, beschrijving en blad uit de bibliotheek over, ook als het model iets anders schreef", () => {
    const [uit] = koppelVoorwerpen([{ naam: "de magische wagen", uiterlijk: "a magical colourful wagon", bibliotheekId: "w-1" }], [WAGEN], "soft-3d");
    expect(uit.naam).toBe("Wonderwagen");
    expect(uit.uiterlijk).toBe(WAGEN.uiterlijk);
    expect(uit.bladUrl).toBe("https://x/wagen-3d.png");
    expect(uit.bibliotheekId).toBe("w-1");
  });

  it("herkent een bibliotheekvoorwerp aan zijn naam als het model het id vergat", () => {
    const [uit] = koppelVoorwerpen([{ naam: "de Wonderwagen", uiterlijk: "a wagon", bibliotheekId: "" }], [WAGEN], "soft-3d");
    expect(uit.bibliotheekId).toBe("w-1");
  });

  it("maakt van een onbekend voorwerp een nieuw voorwerp zonder blad", () => {
    const [uit] = koppelVoorwerpen([{ naam: "bosanemoon", uiterlijk: "a small white woodland flower", bibliotheekId: "bestaat-niet" }], [WAGEN], "soft-3d");
    expect(uit).toEqual({ naam: "bosanemoon", uiterlijk: "a small white woodland flower", bladUrl: null, bibliotheekId: null, voorbeeldUrl: null, zoekwoorden: [] });
  });

  it("zet hetzelfde voorwerp er maar één keer in", () => {
    const uit = koppelVoorwerpen([
      { naam: "Wonderwagen", uiterlijk: "x", bibliotheekId: "w-1" },
      { naam: "wonderwagen", uiterlijk: "y", bibliotheekId: "" },
    ], [WAGEN], "soft-3d");
    expect(uit).toHaveLength(1);
  });

  it("gooit voorwerpen zonder naam of beschrijving weg, en houdt het bij het maximum", () => {
    const voorstel = [{ naam: "", uiterlijk: "iets" }, ...Array.from({ length: 6 }, (_, i) => ({ naam: `ding ${i}`, uiterlijk: "a thing" }))];
    expect(koppelVoorwerpen(voorstel, [], "soft-3d")).toHaveLength(MAX_VOORWERPEN);
  });
});

describe("bladen per tekenstijl", () => {
  it("geeft een blad uit een andere stijl alleen als voorbeeld, nooit als blad", () => {
    const uit = naarDialoogVoorwerp(WAGEN, "flat-vector");
    expect(uit.bladUrl).toBeNull();
    expect(uit.voorbeeldUrl).toBe("https://x/wagen-3d.png");
  });

  it("vindt het blad van precies deze stijl", () => {
    expect(bladVoorStijl(WAGEN, "soft-3d")).toBe("https://x/wagen-3d.png");
    expect(bladVoorStijl(WAGEN, null)).toBeNull();
    expect(bladUitAndereStijl(WAGEN, "soft-3d")).toBeNull();
  });
});

describe("leesBibliotheekVoorwerp", () => {
  it("laat een kapotte rij of een blad zonder geldige URL vallen", () => {
    expect(leesBibliotheekVoorwerp({ id: "x" })).toBeNull();
    const v = leesBibliotheekVoorwerp({ ...WAGEN, bladen: { "soft-3d": "https://x/a.png", "flat-vector": "javascript:1", papercut: 3 } });
    expect(v?.bladen).toEqual({ "soft-3d": "https://x/a.png" });
  });
});

// De opzet koos voor een verhaal over een klaproos en een grote boom geen enkel
// voorwerp. Het zoeken in het geschreven draaiboek vult aan zonder weg te gooien.
describe("voegVoorwerpenSamen", () => {
  const bloem = { naam: "klaproos", uiterlijk: "a red poppy", bladUrl: "https://x/klaproos.png", bibliotheekId: null };

  it("houdt een voorwerp dat er al stond, met zijn blad", () => {
    const uit = voegVoorwerpenSamen([bloem], [{ naam: "Klaproos", uiterlijk: "iets anders", bladUrl: null }]);
    expect(uit).toEqual([bloem]);
  });

  it("zet een nieuw gevonden voorwerp erbij", () => {
    const uit = voegVoorwerpenSamen([bloem], [{ naam: "de grote eik", uiterlijk: "a huge old oak", bladUrl: null }]);
    expect(uit.map((v) => v.naam)).toEqual(["klaproos", "de grote eik"]);
  });

  it("herkent hetzelfde bibliotheekvoorwerp ook onder een andere naam", () => {
    const wagen = naarDialoogVoorwerp(WAGEN, "soft-3d");
    const uit = voegVoorwerpenSamen([wagen], [{ ...wagen, naam: "de wagen van oma" }]);
    expect(uit).toHaveLength(1);
  });

  it("gaat niet over het maximum", () => {
    const vol = Array.from({ length: MAX_VOORWERPEN }, (_, i) => ({ naam: `ding ${i}`, uiterlijk: "x" }));
    expect(voegVoorwerpenSamen(vol, [{ naam: "nog een", uiterlijk: "y" }])).toHaveLength(MAX_VOORWERPEN);
  });
});

// "grote boom" in de lijst, "a massive oak tree" in de shots: zonder zoekwoorden ging
// het boomplaatje niet mee.
describe("zoekwoorden", () => {
  it("komen mee uit het antwoord, zonder dubbelingen, lege woorden of de naam zelf", () => {
    const [uit] = koppelVoorwerpen(
      [{ naam: "grote boom", uiterlijk: "a huge oak", bibliotheekId: "", zoekwoorden: ["Tree", "oak", "tree", "", "grote boom", "x"] }],
      [], "soft-3d",
    );
    expect(uit.zoekwoorden).toEqual(["tree", "oak"]);
  });

  it("komen ook bij een bibliotheekvoorwerp uit het antwoord", () => {
    const [uit] = koppelVoorwerpen([{ bibliotheekId: "w-1", naam: "x", uiterlijk: "y", zoekwoorden: ["wagon", "wagen"] }], [WAGEN], "soft-3d");
    expect(uit.bibliotheekId).toBe("w-1");
    expect(uit.zoekwoorden).toEqual(["wagon", "wagen"]);
  });

  it("worden bij een voorwerp dat er al stond aangevuld, zonder de rest te veranderen", () => {
    const boom = { naam: "grote boom", uiterlijk: "a huge oak", bladUrl: "https://x/boom.png" };
    const [uit] = voegVoorwerpenSamen([boom], [{ naam: "Grote boom", uiterlijk: "anders", bladUrl: null, zoekwoorden: ["tree", "oak"] }]);
    expect(uit).toEqual({ ...boom, zoekwoorden: ["tree", "oak"] });
  });
});

// De grote boom was getekend in Flat vector, de video werd Soft 3D, en het platte
// boomplaatje ging mee naar elk shot: in elk beeld een andere boom.
describe("voorwerpenVoorStijl", () => {
  const boom = { naam: "grote boom", uiterlijk: "a huge oak", bladUrl: "https://x/boom-plat.png", bladStijl: "flat-vector" };

  it("maakt van een blad uit een andere stijl een voorbeeld, zodat het opnieuw getekend wordt", () => {
    const [uit] = voorwerpenVoorStijl([boom], "soft-3d");
    expect(uit).toEqual({ ...boom, bladUrl: null, bladStijl: null, voorbeeldUrl: "https://x/boom-plat.png" });
  });

  it("laat een blad in de goede stijl ongemoeid", () => {
    expect(voorwerpenVoorStijl([boom], "flat-vector")[0]).toBe(boom);
  });

  it("weet bij een voorwerp zonder bladstijl via de bibliotheek in welke stijl het blad is", () => {
    const oud = { naam: "Wonderwagen", uiterlijk: WAGEN.uiterlijk, bladUrl: "https://x/wagen-plat.png", bibliotheekId: "w-1" };
    const bieb = { ...WAGEN, bladen: { "flat-vector": "https://x/wagen-plat.png" } };
    expect(voorwerpenVoorStijl([oud], "soft-3d", { bibliotheek: [bieb] })[0]).toMatchObject({
      bladUrl: null, voorbeeldUrl: "https://x/wagen-plat.png",
    });
  });

  it("neemt het blad uit de bibliotheek als die het voorwerp al in deze stijl heeft", () => {
    const oud = { naam: "Wonderwagen", uiterlijk: WAGEN.uiterlijk, bladUrl: "https://x/wagen-plat.png", bladStijl: "flat-vector", bibliotheekId: "w-1" };
    expect(voorwerpenVoorStijl([oud], "soft-3d", { bibliotheek: [WAGEN] })[0]).toMatchObject({
      bladUrl: "https://x/wagen-3d.png", bladStijl: "soft-3d", voorbeeldUrl: null,
    });
  });

  it("gaat bij een stijlwissel uit van de vorige stijl, en laat zonder die kennis alles staan", () => {
    const oud = { naam: "klaproos", uiterlijk: "a red poppy", bladUrl: "https://x/klaproos.png" };
    expect(voorwerpenVoorStijl([oud], "papercut", { vorigeStijl: "soft-3d" })[0].bladUrl).toBeNull();
    expect(voorwerpenVoorStijl([oud], "papercut")[0]).toBe(oud);
  });

  it("geeft het blad van de juiste stijl mee bij een bibliotheekvoorwerp", () => {
    expect(naarDialoogVoorwerp(WAGEN, "soft-3d").bladStijl).toBe("soft-3d");
    expect(naarDialoogVoorwerp(WAGEN, "flat-vector").bladStijl).toBeNull();
  });
});

describe("voorwerpenZoekPrompt", () => {
  it("geeft het draaiboek, de bibliotheek en wat al vastligt mee", () => {
    const { vraag } = voorwerpenZoekPrompt(
      {
        title: "Het bos",
        cast: [{ id: "c1", characterId: "u1", name: "Tyrell", role: "", voice: "v", portraitUrl: "https://x/t.png", position: "left" }],
        voorwerpen: [{ naam: "klaproos", uiterlijk: "a red poppy" }],
        scenes: [{ id: "s", setting: "a forest path", lines: [{ characterId: "c1", text: "Deze bloem heet een klaproos.", emotion: "blij" }] }],
      },
      [WAGEN],
    );
    expect(vraag).toContain('Tyrell: "Deze bloem heet een klaproos."');
    expect(vraag).toContain('id "w-1": Wonderwagen');
    expect(vraag).toContain("VOORWERPEN DIE AL VASTLIGGEN");
  });
});

describe("tabelOntbreekt", () => {
  it("herkent een tabel die nog niet bestaat, zodat de rest zonder bibliotheek doorwerkt", () => {
    expect(tabelOntbreekt({ code: "42P01", message: 'relation "public.voorwerpen" does not exist' })).toBe(true);
    expect(tabelOntbreekt({ code: "PGRST205", message: "Could not find the table 'public.voorwerpen'" })).toBe(true);
    expect(tabelOntbreekt({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(tabelOntbreekt(null)).toBe(false);
  });
});

describe("zonderPersonagesEnPlekken", () => {
  // "Prinses Isabella en het kleine draakje": het draakje werd een speelgoedje in haar hand,
  // de kasteeltuin een kasteel op een plateau voor een witte achtergrond.
  const ctx = {
    castNamen: ["Prinses Isabella", "Draakje", "Koning"],
    plekken: ["Kasteeltuin - Verdwaald Draakje", "de kasteeltuin", "Fort Zeelandia"],
  };
  const vw = (naam: string) => ({ naam, zoekwoorden: [] as string[] });

  it("haalt personages eruit, ook als verkleinwoord of met een bijvoeglijk naamwoord", () => {
    expect(zonderPersonagesEnPlekken([vw("klein draakje"), vw("de draak"), vw("kroon van de koning")], ctx).map((v) => v.naam)).toEqual([]);
  });

  it("haalt plekken eruit", () => {
    expect(zonderPersonagesEnPlekken([vw("kasteeltuin"), vw("Fort Zeelandia"), vw("castle garden"), vw("sprookjesbos")], ctx)).toEqual([]);
  });

  it("laat echte voorwerpen staan", () => {
    const echt = [vw("Wonderwagen"), vw("gouden sleutel"), vw("grote eik"), vw("mushroom"), vw("klaproos")];
    expect(zonderPersonagesEnPlekken(echt, ctx)).toEqual(echt);
  });
});
