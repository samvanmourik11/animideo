import { beforeEach, describe, expect, test, vi } from "vitest";

// Een nep-database met alleen wat betaal() en betaalTerug() aanraken: het lidmaatschap
// opzoeken en het verbruik loggen. Zo testen we de geldstromen zonder Supabase.
const db = {
  lid: null as null | { rol: string; teams: { id: string; naam: string; eigenaar_id: string } },
  verbruik: [] as Record<string, unknown>[],
};
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabel: string) => {
      const keten = {
        select: () => keten,
        eq: () => keten,
        maybeSingle: async () => ({ data: tabel === "team_leden" ? db.lid : null, error: null }),
        insert: async (rij: Record<string, unknown>) => {
          if (tabel === "team_verbruik") db.verbruik.push(rij);
          return { error: null };
        },
      };
      return keten;
    },
  }),
}));

const saldo: Record<string, number> = {};
const aanroepen: { wie: string; bedrag: number; service?: boolean }[] = [];
vi.mock("@/lib/credits", () => ({
  getCredits: async (id: string) => saldo[id] ?? 0,
  deductCredits: async (id: string, bedrag: number, _r: string, o?: { service?: boolean }) => {
    aanroepen.push({ wie: id, bedrag: -bedrag, service: o?.service });
    if ((saldo[id] ?? 0) < bedrag) return { success: false, credits: saldo[id] ?? 0 };
    saldo[id] -= bedrag;
    return { success: true, credits: saldo[id] };
  },
  addCredits: async (id: string, bedrag: number, _r: string, o?: { service?: boolean }) => {
    aanroepen.push({ wie: id, bedrag, service: o?.service });
    saldo[id] = (saldo[id] ?? 0) + bedrag;
  },
  getProfile: async () => ({ plan: "pro", credits: 0 }),
}));
vi.mock("@/lib/provider-kosten", () => ({ zetKostenContext: () => {} }));

const { betaal, betaalTerug } = await import("./team");

beforeEach(() => {
  db.lid = null;
  db.verbruik = [];
  aanroepen.length = 0;
  for (const k of Object.keys(saldo)) delete saldo[k];
});

describe("betaal", () => {
  test("zonder team: van je eigen saldo, met je eigen sessie, niets in het teamlogboek", async () => {
    saldo.sam = 10;
    const r = await betaal("sam", 4, "beeld");
    expect(r).toEqual({ ok: true, betaald: 4, betalerId: "sam" });
    expect(saldo.sam).toBe(6);
    expect(aanroepen[0].service).toBe(false);
    expect(db.verbruik).toHaveLength(0);
  });

  test("teamlid: van de pot van de eigenaar, via de service-client, en gelogd op naam van het lid", async () => {
    db.lid = { rol: "lid", teams: { id: "t1", naam: "Team", eigenaar_id: "baas" } };
    saldo.baas = 50;
    saldo.lid = 3;
    const r = await betaal("lid", 19, "reclame");
    expect(r).toEqual({ ok: true, betaald: 19, betalerId: "baas" });
    expect(saldo.baas).toBe(31);
    expect(saldo.lid).toBe(3);
    expect(aanroepen[0]).toMatchObject({ wie: "baas", service: true });
    expect(db.verbruik).toEqual([{ team_id: "t1", user_id: "lid", credits: 19, omschrijving: "reclame" }]);
  });

  test("lege pot: geweigerd, ook als het lid zelf nog credits heeft", async () => {
    db.lid = { rol: "lid", teams: { id: "t1", naam: "Team", eigenaar_id: "baas" } };
    saldo.baas = 1;
    saldo.lid = 100;
    expect((await betaal("lid", 4, "beeld")).ok).toBe(false);
    expect(db.verbruik).toHaveLength(0);
  });
});

describe("betaalTerug", () => {
  test("gaat terug naar de pot die betaalde, met een min-regel in het teamlogboek", async () => {
    db.lid = { rol: "lid", teams: { id: "t1", naam: "Team", eigenaar_id: "baas" } };
    saldo.baas = 0;
    await betaalTerug({ user_id: "lid", betaald_door: "baas", credits: 19 }, "mislukt");
    expect(saldo.baas).toBe(19);
    expect(saldo.lid ?? 0).toBe(0);
    expect(db.verbruik[0]).toMatchObject({ user_id: "lid", credits: -19 });
  });

  test("zonder betaald_door (alles van vóór teams): naar de maker zelf", async () => {
    await betaalTerug({ user_id: "sam", credits: 2 }, "mislukt");
    expect(saldo.sam).toBe(2);
    expect(db.verbruik).toHaveLength(0);
  });

  test("niets betaald (onbeperkt account): niets terug", async () => {
    await betaalTerug({ user_id: "sam", credits: 0 }, "mislukt");
    expect(aanroepen).toHaveLength(0);
  });
});
