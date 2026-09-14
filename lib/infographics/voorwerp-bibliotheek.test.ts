import { describe, it, expect } from "vitest";
import {
  bladUitAndereStijl, bladVoorStijl, koppelVoorwerpen, leesBibliotheekVoorwerp, naarDialoogVoorwerp, tabelOntbreekt,
  voegVoorwerpenSamen, voorwerpenZoekPrompt,
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
    expect(uit).toEqual({ naam: "bosanemoon", uiterlijk: "a small white woodland flower", bladUrl: null, bibliotheekId: null, voorbeeldUrl: null });
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
