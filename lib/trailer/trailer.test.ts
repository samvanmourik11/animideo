import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/openai", () => ({ openai: {} }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/creaties/wachtrij", () => ({}));
vi.mock("@/lib/team/team", () => ({}));
vi.mock("next/server", () => ({ after: () => {} }));

const { controleerTrailerPlan, beginRuimte, EERSTE_BEWEGING } = await import("./plan");
const { plaatsStemmen, muziekVolume, muziekNiveau, muziekSleutels, begintijden, zinsgrenzen, volgDeStem } = await import("./montage");
const { stemVoor, voOpdracht, TRAILERSTEM } = await import("./regie");
const { tijdlijnDuur, trailerCredits } = await import("./types");

const clip = { beeld: "a castle", beweging: "push in", personages: ["Mira"], uitleg: "kasteel" };
function ruwPlan(shots: number, duur = 2) {
  return {
    titel: "De Laatste Draak",
    personages: [{ naam: "Mira", rol: "smidsdochter", uiterlijk: "young woman", geslacht: "vrouw" }],
    clips: Array.from({ length: 6 }, () => clip),
    tijdlijn: [
      { soort: "zwart", deel: "opening", duur: 1.5 },
      ...Array.from({ length: shots }, (_, i) => ({ soort: "shot", deel: i < 4 ? "wereld" : "escalatie", clip: i % 6, van: 0, duur, ...(i === 0 ? { regel: { wie: "Mira", tekst: "Ik ben niet bang." } } : {}) })),
      { soort: "zwart", deel: "adem", duur: 2 },
      { soort: "titel", deel: "titel", duur: 4 },
    ],
  };
}

describe("plan controleren", () => {
  test("wordt op de gekozen lengte gebracht via de shots", () => {
    const p = controleerTrailerPlan(ruwPlan(20, 1), 60);
    expect(Math.abs(tijdlijnDuur(p.tijdlijn) - 60)).toBeLessThan(3);
    expect(p.tijdlijn.find((e) => e.soort === "zwart" && e.deel === "adem")).toMatchObject({ stil: true });
  });
  test("onbekende clips en sprekers worden opgevangen", () => {
    const r = ruwPlan(10);
    (r.tijdlijn as Record<string, unknown>[]).push({ soort: "shot", deel: "klap", clip: 99, duur: 2 });
    (r.tijdlijn[1] as Record<string, unknown>).regel = { wie: "Onbekend", tekst: "hallo" };
    const p = controleerTrailerPlan(r, 60);
    expect(p.tijdlijn.every((e) => e.soort !== "shot" || e.clip < 6)).toBe(true);
    expect(p.tijdlijn[1].regel?.wie).toBe("verteller");
  });
  test("te weinig shots: weigeren", () => {
    expect(() => controleerTrailerPlan(ruwPlan(3), 60)).toThrow(/te kort/);
  });
});

test("stemmen overlappen nooit en schuiven op als een zin uitloopt", () => {
  const t = controleerTrailerPlan(ruwPlan(12), 60).tijdlijn;
  const met = t.map((e, i) => i).filter((i) => t[i].soort === "shot").slice(0, 3);
  const duren = new Map(met.map((i) => [i, 10]));
  const p = plaatsStemmen(t, duren);
  for (let i = 1; i < p.length; i++) expect(p[i].start).toBeGreaterThanOrEqual(p[i - 1].start + p[i - 1].duur);
  expect(p[0].start).toBeCloseTo(begintijden(t)[met[0]] + 0.15);
});

test("muziek: stil bij de adem, en glijdend in plaats van springend", () => {
  const t = controleerTrailerPlan(ruwPlan(12), 60).tijdlijn;
  const i = t.findIndex((e) => e.deel === "adem");
  const midden = begintijden(t)[i] + t[i].duur / 2;
  expect(muziekNiveau(t, [], midden)).toBe(0.05);
  expect(t[i].duur).toBeLessThanOrEqual(1.5);
  const stem = [{ index: 1, start: 10, duur: 2 }];
  const k = muziekSleutels(t, stem);
  // Vóór de zin zakt de muziek in 0,3 s weg, erna komt hij in 0,8 s terug.
  expect(k).toContainEqual([9.6, 0.9]);
  expect(k).toContainEqual([9.9, 0.35]);
  expect(k).toContainEqual([12.1, 0.35]);
  expect(k).toContainEqual([12.9, 0.9]);
  expect(muziekVolume(t, stem)).toContain("if(lt(t,9.90),(0.900+(-0.550)*(t-9.60)/0.30)");
});

test("stemmen: verteller vast, personages per geslacht", () => {
  const plan = { personages: [{ naam: "Mira", geslacht: "vrouw" }, { naam: "Ruben", geslacht: "man" }, { naam: "Lot", geslacht: "vrouw" }] } as never;
  expect(stemVoor("verteller", plan)).not.toBe(stemVoor("Mira", plan));
  expect(stemVoor("Mira", plan)).not.toBe(stemVoor("Lot", plan));
});

test("prijs telt portretten, clips en zinnen", () => {
  const p = controleerTrailerPlan(ruwPlan(12), 60);
  expect(trailerCredits(p)).toBe(1 * 2 + 6 * (2 + 4) + 1 * 1);
});

test("geen zwarte flitsen tussen de snelle shots van de escalatie", () => {
  const r = ruwPlan(10);
  (r.tijdlijn as Record<string, unknown>[]).splice(8, 0, { soort: "zwart", deel: "escalatie", duur: 0.2 });
  const p = controleerTrailerPlan(r, 60);
  expect(p.tijdlijn.some((e) => e.soort === "zwart" && e.deel === "escalatie")).toBe(false);
});

describe("gaten uit de proeftrailer van 20-10-2026", () => {
  test("geen shot langer dan de clip en nooit een negatieve starttijd", () => {
    const r = ruwPlan(9, 6);
    (r.tijdlijn[1] as Record<string, unknown>).van = -2;
    const p = controleerTrailerPlan(r, 60);
    for (const e of p.tijdlijn) if (e.soort === "shot") {
      expect(e.duur).toBeLessThanOrEqual(5);
      expect(e.van).toBeGreaterThanOrEqual(0);
      expect(e.van + e.duur).toBeLessThanOrEqual(5.001);
    }
  });

  test("zwart: openingsstilte max 2 s, dips max 0,8 s, samen hooguit 12%", () => {
    const r = ruwPlan(14);
    (r.tijdlijn[0] as Record<string, unknown>).duur = 4.5;
    r.tijdlijn.splice(3, 0, { soort: "zwart", deel: "opening", duur: 2 } as never, { soort: "zwart", deel: "wereld", duur: 3, stil: true } as never);
    const p = controleerTrailerPlan(r, 60);
    const zwart = p.tijdlijn.filter((e) => e.soort === "zwart");
    expect(zwart[0].duur).toBeLessThanOrEqual(2);
    expect(zwart.slice(1).filter((e) => e.soort === "zwart" && !e.stil).every((e) => e.duur <= 0.8)).toBe(true);
    expect(zwart.reduce((s, e) => s + e.duur, 0)).toBeLessThanOrEqual(60 * 0.12 + 0.01);
  });

  test("een herhaald shot laat een ander stuk van de clip zien en wordt gemarkeerd", () => {
    const r = ruwPlan(12); // 6 clips, elk twee keer
    const p = controleerTrailerPlan(r, 60);
    const perClip = new Map<number, { van: number; duur: number }[]>();
    for (const e of p.tijdlijn) if (e.soort === "shot") perClip.set(e.clip, [...(perClip.get(e.clip) ?? []), { van: e.van, duur: e.duur }]);
    const tweede = p.tijdlijn.filter((e) => e.soort === "shot" && e.herhaling);
    expect(tweede.length).toBeGreaterThan(0);
    // Zo ver uit elkaar als de clip toelaat (een shot van 4,5 s laat maar 0,5 s ruimte).
    for (const [, s] of perClip) if (s.length > 1) {
      const [vroegst, laatst] = beginRuimte(s[1].duur);
      expect(Math.abs(s[1].van - s[0].van)).toBeGreaterThanOrEqual(Math.min(1, laatst - vroegst) - 0.01);
    }
  });

  test("terugkerende wezens horen bij het plan, mogen in een clip staan en tellen mee in de prijs", () => {
    const r = { ...ruwPlan(12), wezens: [{ naam: "De draak", uiterlijk: "huge black dragon with ember-red eyes" }] };
    r.clips = r.clips.map((c, i) => (i === 2 ? { ...c, personages: ["De draak"] } : c));
    const p = controleerTrailerPlan(r, 60);
    expect(p.wezens).toEqual([{ naam: "De draak", uiterlijk: "huge black dragon with ember-red eyes" }]);
    expect(p.clips[2].personages).toEqual(["De draak"]);
    expect(trailerCredits(p)).toBe(trailerCredits({ ...p, wezens: [] }) + 2);
  });

  test("de openingsstilte is bijna stil, de adem helemaal", () => {
    const t = controleerTrailerPlan({ ...ruwPlan(12), tijdlijn: [{ soort: "zwart", deel: "opening", duur: 1.5, stil: true }, ...ruwPlan(12).tijdlijn.slice(1)] }, 60).tijdlijn;
    expect(muziekNiveau(t, [], 0.5)).toBe(0.06);
    expect(muziekSleutels(t, [])[0]).toEqual([0, 0.06]);
  });
});

describe("één verteller (22-10-2026)", () => {
  test("met een taal spreekt alleen de verteller, in één opname met pauzes", () => {
    const r = ruwPlan(12);
    const p = controleerTrailerPlan({ ...r, taal: "en" }, 60);
    expect(p.taal).toBe("en");
    expect(p.tijdlijn.filter((e) => e.regel).every((e) => e.regel!.wie === "verteller")).toBe(true);
    const o = voOpdracht({ ...p, tijdlijn: [{ soort: "zwart", deel: "opening", duur: 1, regel: { wie: "verteller", tekst: "In a world..." } }, { soort: "zwart", deel: "titel", duur: 1, regel: { wie: "verteller", tekst: "one girl." } }] });
    expect(o.text).toBe("In a world... [long pause] one girl. [long pause]");
    expect(o.voice).toBe(TRAILERSTEM.en);
  });

  test("oude plannen zonder taal houden hun stemmen per personage", () => {
    const p = controleerTrailerPlan(ruwPlan(12), 60);
    expect(p.taal).toBeUndefined();
    expect(p.tijdlijn.find((e) => e.regel)?.regel?.wie).toBe("Mira");
  });

  test("de opname wordt op de langste pauzes geknipt, met wat lucht na elke zin", () => {
    // Gemeten op een echte opname van Hank: 6 zinnen, 5 lange pauzes en 2 korte ademhalingen.
    const stil: [number, number][] = [[2.32, 4.73], [6.1, 6.4], [8.08, 9.96], [11.96, 13.38], [15.46, 16.96], [17.0, 17.3], [18.02, 18.49]];
    const g = zinsgrenzen(stil, 20.61, 6)!;
    expect(g).toHaveLength(6);
    expect(g[0]).toEqual({ start: 0, eind: 2.57 });
    expect(g[1].start).toBeCloseTo(4.65);
    // De korte ademhaling midden in zin 2 (6,1-6,4) is geen knip.
    expect(g[1].eind).toBeGreaterThan(8);
    expect(zinsgrenzen(stil.slice(0, 2), 20.61, 6)).toBeNull();
  });

  test("het beeld wacht op de stem: shots worden langer tot de zin uit is, niet over de adem heen", () => {
    const t = [
      { soort: "shot", deel: "wereld", clip: 0, van: 0, duur: 1, regel: { wie: "verteller", tekst: "x" } },
      { soort: "shot", deel: "wereld", clip: 1, van: 0, duur: 1 },
      { soort: "zwart", deel: "adem", duur: 2, stil: true },
      { soort: "shot", deel: "klap", clip: 2, van: 0, duur: 2, regel: { wie: "verteller", tekst: "y" } },
    ] as never;
    const uit = volgDeStem(t, new Map([[0, 3.5], [3, 1]]));
    expect(uit[0].duur + uit[1].duur).toBeCloseTo(4, 1);
    expect(uit[2].duur).toBe(2);
    expect(uit[3].duur).toBe(2);
  });
});

test("een shot begint niet in het stilstaande begin van een clip, als de clip ruimte heeft", () => {
  const p = controleerTrailerPlan({ ...ruwPlan(24, 1), taal: "en" }, 60);
  for (const e of p.tijdlijn) if (e.soort === "shot") expect(e.van).toBeGreaterThanOrEqual(Math.min(EERSTE_BEWEGING, 5 - e.duur) - 0.001);
});
