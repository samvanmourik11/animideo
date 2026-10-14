import { describe, expect, it } from "vitest";
import { vatKostenSamen, USD_NAAR_EUR, type KostenRij } from "./provider-kosten";

describe("vatKostenSamen", () => {
  const nu = new Date("2026-10-02T12:00:00Z");
  const rij = (dagenTerug: number, email: string | null, usd: number, actie: string | null = "Story genereren (12 scenes)"): KostenRij => ({
    created_at: new Date(nu.getTime() - dagenTerug * 86400_000).toISOString(),
    email, model: "fal-ai/nano-banana", kosten_usd: usd, actie,
  });
  const intern = (e: string | null) => !!e?.endsWith("@jouwanimatievideo.nl");

  it("telt vandaag, 7 en 30 dagen apart en rekent om naar euro", () => {
    const s = vatKostenSamen([rij(0, "a@b.nl", 10), rij(3, "a@b.nl", 10), rij(20, "a@b.nl", 10)], nu, intern);
    expect(s.vandaagEur).toBeCloseTo(10 * USD_NAAR_EUR, 2);
    expect(s.zevenDagenEur).toBeCloseTo(20 * USD_NAAR_EUR, 2);
    expect(s.dertigDagenEur).toBeCloseTo(30 * USD_NAAR_EUR, 2);
    expect(s.perDag).toHaveLength(7);
  });

  it("laat zien hoeveel van het verbruik intern is", () => {
    const s = vatKostenSamen([rij(1, "sam@jouwanimatievideo.nl", 30), rij(1, "klant@x.nl", 10)], nu, intern);
    expect(s.internAandeel).toBe(75);
    expect(s.perAccount[0]).toMatchObject({ naam: "sam@jouwanimatievideo.nl", intern: true });
  });

  it("groepeert acties los van het aantal scenes", () => {
    const s = vatKostenSamen([rij(1, null, 1, "Story genereren (12 scenes)"), rij(1, null, 1, "Story genereren (8 scenes)")], nu, intern);
    expect(s.perActie).toHaveLength(1);
    expect(s.perActie[0].aantal).toBe(2);
    expect(s.perAccount[0].naam).toMatch(/onbekend/);
  });
});
