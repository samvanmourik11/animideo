import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
import { meldingVoor, nlMoment, ritmeTekst, schoonTaak, volgendeKeer } from "./taken";

const iso = (t: number) => new Date(t).toISOString();

describe("vaste taken: wanneer", () => {
  it("rekent Nederlandse tijd om, in zomer- en wintertijd", () => {
    expect(iso(nlMoment(2026, 10, 23, 8))).toBe("2026-10-23T06:00:00.000Z"); // zomertijd, +2
    expect(iso(nlMoment(2026, 10, 26, 8))).toBe("2026-10-26T07:00:00.000Z"); // wintertijd, +1
    expect(iso(nlMoment(2027, 3, 28, 8))).toBe("2027-03-28T06:00:00.000Z"); // dag van de omschakeling
  });

  it("vindt de volgende maandag 8:00, ook over de wintertijd heen", () => {
    // Vrijdag 23 oktober 2026, 20:00 Nederlandse tijd.
    const nu = Date.parse("2026-10-23T18:00:00Z");
    expect(iso(volgendeKeer({ ritme: "week", weekdag: 1, maanddag: null, uur: 8 }, nu))).toBe("2026-10-26T07:00:00.000Z");
  });

  it("dag: vandaag nog als het uur nog moet komen, anders morgen", () => {
    const ochtend = Date.parse("2026-10-23T05:00:00Z"); // 7:00 NL
    expect(iso(volgendeKeer({ ritme: "dag", weekdag: null, maanddag: null, uur: 8 }, ochtend))).toBe("2026-10-23T06:00:00.000Z");
    expect(iso(volgendeKeer({ ritme: "dag", weekdag: null, maanddag: null, uur: 8 }, Date.parse("2026-10-23T06:00:00Z")))).toBe("2026-10-24T06:00:00.000Z");
  });

  it("maand: de gekozen dag van de volgende maand", () => {
    const nu = Date.parse("2026-10-23T18:00:00Z");
    expect(iso(volgendeKeer({ ritme: "maand", weekdag: null, maanddag: 1, uur: 9 }, nu))).toBe("2026-11-01T08:00:00.000Z");
  });

  it("de uitkomst ligt altijd na nu, en een week ritme valt op de goede weekdag", () => {
    for (let i = 0; i < 400; i++) {
      const nu = Date.parse("2026-01-01T00:00:00Z") + i * 21.7 * 3600 * 1000;
      const weekdag = i % 7;
      const t = volgendeKeer({ ritme: "week", weekdag, maanddag: null, uur: i % 24 }, nu);
      expect(t).toBeGreaterThan(nu);
      expect(t - nu).toBeLessThanOrEqual(7 * 24 * 3600 * 1000 + 3600 * 1000);
      const dag = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Amsterdam", weekday: "short" }).format(new Date(t));
      expect(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekdag]).toBe(dag);
    }
  });
});

describe("vaste taken: invoer", () => {
  it("maakt er een geldige taak van en weigert onzin", () => {
    const t = schoonTaak({ titel: "Posts", opdracht: "Maak 3 Instagram-posts voor bakkerij De Zoete Zwaan.", ritme: "week", weekdag: 1, uur: 8, max_credits: 20 });
    expect(t).toMatchObject({ ritme: "week", weekdag: 1, maanddag: null, uur: 8, max_credits: 20 });
    expect(ritmeTekst(t)).toBe("elke maandag om 08:00");
    expect(() => schoonTaak({ ...t, ritme: "uur" })).toThrow();
    expect(() => schoonTaak({ ...t, max_credits: 0 })).toThrow();
    expect(() => schoonTaak({ ...t, max_credits: 9999 })).toThrow();
    expect(schoonTaak({ ...t, ritme: "maand", maanddag: 31 }).maanddag).toBe(1);
  });

  it("meldt alleen eindstanden en wachten", () => {
    expect(meldingVoor("klaar")).toBe("klaar");
    expect(meldingVoor("wacht_op_bevestiging")).toBe("wacht");
    expect(meldingVoor("wacht_op_antwoord")).toBe("wacht");
    expect(meldingVoor("fout")).toBe("fout");
    expect(meldingVoor("denkt")).toBeNull();
    expect(meldingVoor("wacht_op_maken")).toBeNull();
  });
});
