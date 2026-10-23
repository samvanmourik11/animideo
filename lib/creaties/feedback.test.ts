import { beforeEach, describe, expect, it, vi } from "vitest";

// Nep-database: één creatie, een telling van eerdere beloningen en een unieke sleutel per creatie.
const db = { creatie: null as Record<string, unknown> | null, eerder: 0, rijen: [] as Record<string, unknown>[] };
const credits = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabel: string) => {
      const keten: Record<string, unknown> = {};
      const terug = () => keten;
      Object.assign(keten, {
        select: (_k: string, o?: { head?: boolean }) => (o?.head ? Object.assign(terug(), { then: (ok: (r: unknown) => void) => ok({ count: db.eerder }) }) : terug()),
        eq: terug, gt: terug, gte: terug,
        maybeSingle: async () => ({ data: tabel === "creaties" ? db.creatie : null }),
        insert: async (rij: Record<string, unknown>) => {
          if (db.rijen.some((r) => r.creatie_id === rij.creatie_id)) return { error: { code: "23505", message: "dubbel" } };
          db.rijen.push(rij);
          return { error: null };
        },
      });
      return keten;
    },
  }),
}));
vi.mock("@/lib/credits", () => ({ addCredits: (...a: unknown[]) => credits(...a) }));
vi.mock("@/lib/team/team", () => ({ betalerVan: async () => "pot-eigenaar" }));
import { BELONING, geefFeedback } from "./feedback";

const zin = "De stem past goed, maar scène 2 is te donker.";

describe("feedback met beloning", () => {
  beforeEach(() => {
    db.creatie = { id: "c1", maker: "montage", status: "klaar" };
    db.eerder = 0;
    db.rijen = [];
    credits.mockReset();
  });

  it("beloont een eindresultaat met credits, in de pot van het team", async () => {
    expect(await geefFeedback("lid", "c1", 4, zin)).toEqual({ beloond: BELONING });
    expect(credits).toHaveBeenCalledWith("pot-eigenaar", BELONING, "Bedankt voor je feedback", { service: true });
  });

  it("één keer per video: een tweede keer geeft geen extra credits", async () => {
    await geefFeedback("lid", "c1", 4, zin);
    await expect(geefFeedback("lid", "c1", 5, zin)).rejects.toThrow("al feedback");
    expect(credits).toHaveBeenCalledTimes(1);
  });

  it("boven het maandmaximum wel bewaren, maar zonder credits", async () => {
    db.eerder = 4;
    expect(await geefFeedback("lid", "c1", 3, zin)).toEqual({ beloond: 0 });
    expect(credits).not.toHaveBeenCalled();
    expect(db.rijen).toHaveLength(1);
  });

  it("weigert losse beelden, te korte tekst en rare sterren", async () => {
    await expect(geefFeedback("lid", "c1", 4, "ok")).rejects.toThrow("korte zin");
    await expect(geefFeedback("lid", "c1", 9, zin)).rejects.toThrow("sterren");
    db.creatie = { id: "c1", maker: "beeld", status: "klaar" };
    await expect(geefFeedback("lid", "c1", 4, zin)).rejects.toThrow("eindresultaat");
  });
});
