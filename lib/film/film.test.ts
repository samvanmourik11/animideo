import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/openai", () => ({ openai: {} }));

const { creditsVoorKosten, sceneCredits, shotKosten, teMaken, vingerafdruk, FILM_KOSTEN_USD, LEGE_FILM } = await import("./types");
const { leesCast, leesScene } = await import("./script");
const { shotDuren, muziekUitdrukking } = await import("./montage");
const { BIBLIOTHEEK } = await import("@/lib/stem/bibliotheek");

const stem = BIBLIOTHEEK[0].id;
const film = {
  ...LEGE_FILM,
  stijl: "warm 35mm",
  cast: [
    { naam: "Mira", soort: "personage" as const, rol: "heldin", uiterlijk: "19-year-old young woman, red hair", geslacht: "vrouw" as const, stem, portret: "https://x/m.jpg" },
    { naam: "De draak", soort: "wezen" as const, rol: "draak", uiterlijk: "huge black dragon" },
  ],
};

describe("prijs: kosten + minimaal 40% marge", () => {
  test("een credit is €0,098; 40% marge op de omzet", () => {
    // $0,50 inkoop (beeld + beweging) → 0,50 / 0,6 / 0,098 = 8,5 → 9 credits
    expect(creditsVoorKosten(FILM_KOSTEN_USD.beeld + FILM_KOSTEN_USD.beweging)).toBe(9);
    // De marge klopt: wat de klant betaalt min de inkoop is minstens 40% van wat hij betaalt.
    for (const usd of [0.12, 0.5, 3.7, 12]) {
      const omzet = creditsVoorKosten(usd) * (49 / 500);
      expect((omzet - usd) / omzet).toBeGreaterThanOrEqual(0.4 - 1e-9);
    }
  });
  test("een praatshot rekent lipsync per seconde", () => {
    const kort = shotKosten({ id: "a", beeld: "x", beweging: "", inBeeld: [], duur: 3, dialoog: { wie: "Mira", tekst: "Ja." } });
    const lang = shotKosten({ id: "a", beeld: "x", beweging: "", inBeeld: [], duur: 3, dialoog: { wie: "Mira", tekst: "Ik ga niet weg voordat ik weet wat er met mijn vader is gebeurd, begrijp je dat?" } });
    expect(lang).toBeGreaterThan(kort);
  });
});

describe("script controleren", () => {
  test("dialoog alleen voor iemand uit de cast met een stem; de spreker komt in beeld", () => {
    const s = leesScene({ nummer: 1, titel: "Smidse", plek: "dark forge, firelight", shots: [{ id: "s1", beeld: "medium close-up of Mira", dialoog: { wie: "mira", tekst: "Wie ben jij?" } }] }, film);
    expect(s.shots[0].dialoog).toEqual({ wie: "Mira", tekst: "Wie ben jij?" });
    expect(s.shots[0].inBeeld).toContain("Mira");
    expect(() => leesScene({ nummer: 1, titel: "x", plek: "y", shots: [{ id: "s1", beeld: "z", dialoog: { wie: "Onbekend", tekst: "hoi" } }] }, film)).toThrow(/niet in de cast/);
    expect(() => leesScene({ nummer: 1, titel: "x", plek: "y", shots: [{ id: "s1", beeld: "z", dialoog: { wie: "De draak", tekst: "grr" } }] }, film)).toThrow(/geen stem/);
  });
  test("dubbele shot-id's worden geweigerd, stille shots begrensd op 1,5-4,2 s", () => {
    expect(() => leesScene({ nummer: 1, titel: "x", plek: "y", shots: [{ id: "a", beeld: "1" }, { id: "a", beeld: "2" }] }, film)).toThrow(/twee keer/);
    const s = leesScene({ nummer: 1, titel: "x", plek: "y", shots: [{ id: "a", beeld: "1", duur: 9 }, { id: "b", beeld: "2", duur: 0.2 }] }, film);
    expect(s.shots.map((x) => x.duur)).toEqual([4.2, 1.5]);
  });
  test("cast: onbekende stem geweigerd, wie niet genoemd is blijft staan", () => {
    expect(() => leesCast([{ naam: "Bram", uiterlijk: "40-year-old man", stem: "verzonnen" }], film.cast)).toThrow(/Onbekende stem/);
    const c = leesCast([{ naam: "Bram", uiterlijk: "40-year-old man", geslacht: "man", stem }], film.cast);
    expect(c.map((x) => x.naam)).toEqual(["Mira", "De draak", "Bram"]);
  });
});

describe("feedback: alleen gewijzigde shots opnieuw", () => {
  const shots = [
    { id: "s1", beeld: "wide forge", beweging: "push in", inBeeld: ["Mira"], duur: 3 },
    { id: "s2", beeld: "close-up Mira", beweging: "", inBeeld: ["Mira"], duur: 3, dialoog: { wie: "Mira", tekst: "Wie ben jij?" } },
  ];
  const scene = { nummer: 1, titel: "x", samenvatting: "", plek: "forge", shots, status: "ter_keuring" as const };
  const gemaakt = Object.fromEntries(shots.map((s) => [s.id, { vingerafdruk: vingerafdruk(s, film, "forge"), clip: `https://x/${s.id}.mp4` }]));

  test("niets veranderd → niets te maken; één zin anders → alleen dat shot", () => {
    expect(teMaken({ ...scene, gemaakt }, film)).toEqual([]);
    const anders = { ...scene, gemaakt, shots: [shots[0], { ...shots[1], dialoog: { wie: "Mira", tekst: "Wat wil je?" } }] };
    expect(teMaken(anders, film).map((s) => s.id)).toEqual(["s2"]);
    expect(sceneCredits(anders, teMaken(anders, film))).toBeLessThan(sceneCredits(anders, anders.shots));
  });
  test("ander uiterlijk of een andere stem van iemand in beeld → die shots opnieuw", () => {
    const nieuwFilm = { ...film, cast: film.cast.map((c) => (c.naam === "Mira" ? { ...c, stem: BIBLIOTHEEK[1].id } : c)) };
    expect(teMaken({ ...scene, gemaakt }, nieuwFilm).map((s) => s.id)).toEqual(["s1", "s2"]);
  });
});

describe("montage", () => {
  test("stille shots rekken op tot de vertellerzin past, praatshots nooit", () => {
    const d = shotDuren([{ praat: false, duur: 2, verteller: true }, { praat: false, duur: 1.5 }, { praat: true, duur: 3 }], [5]);
    expect(d[0] + d[1]).toBeCloseTo(5.4, 1);
    expect(d[2]).toBe(3);
  });
  test("muziek gaat glijdend zachter onder spraak", () => {
    const e = muziekUitdrukking([[2, 4]]);
    expect(e).toContain("if(lt(t,1.70),0.55");
    expect(e).toContain("0.18");
  });
});
