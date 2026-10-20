import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/openai", () => ({ openai: {} }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/creaties/wachtrij", () => ({}));
vi.mock("@/lib/team/team", () => ({}));
vi.mock("next/server", () => ({ after: () => {} }));

const { controleerTrailerPlan } = await import("./plan");
const { plaatsStemmen, muziekVolume, begintijden } = await import("./montage");
const { stemVoor } = await import("./regie");
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

test("muziek: stil bij de adem", () => {
  const t = controleerTrailerPlan(ruwPlan(12), 60).tijdlijn;
  const i = t.findIndex((e) => e.deel === "adem");
  expect(muziekVolume(t, [])).toContain(`between(t,${begintijden(t)[i].toFixed(2)}`);
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
