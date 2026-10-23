import { beforeEach, describe, expect, it, vi } from "vitest";

// Nep-profiel en nep-Mollie: zo testen we wie als "betalend" telt.
const profiel: { v: Record<string, unknown> | null } = { v: null };
const mollie = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profiel.v }) }) }) }) }),
}));
vi.mock("@/lib/mollie", () => ({ mollieFetch: (...a: unknown[]) => mollie(...a) }));
vi.mock("@/lib/team/team", () => ({ betalerVan: async (id: string) => id }));
vi.mock("./zernio", () => ({ accountsVan: vi.fn(), annuleer: vi.fn(), ontkoppel: vi.fn() }));
import { betaalt, intern, volgendeStap, GRATIE_DAGEN } from "./opruimen";
import { opruimMail } from "./mail";

const DAG = 24 * 3600 * 1000;
const betalend = { email: "klant@bakker.nl", plan: "pro", mollie_customer_id: "cst_1", mollie_subscription_id: "sub_1" };

describe("opruimen: wie betaalt", () => {
  beforeEach(() => mollie.mockReset());

  it("vraagt het aan Mollie, niet aan de vlag in de app", async () => {
    profiel.v = betalend;
    mollie.mockResolvedValueOnce({ status: "active" });
    expect(await betaalt("u1")).toBe(true);
    mollie.mockResolvedValueOnce({ status: "canceled" });
    expect(await betaalt("u1")).toBe(false);
  });

  it("verdwenen abonnement (404) telt als gestopt; Mollie onbereikbaar telt als betalend", async () => {
    profiel.v = betalend;
    mollie.mockRejectedValueOnce(new Error("Mollie 404 op /customers/…"));
    expect(await betaalt("u1")).toBe(false);
    mollie.mockRejectedValueOnce(new Error("Mollie 503 op /customers/…"));
    expect(await betaalt("u1")).toBe(true);
  });

  it("gratis = niet betalend; onze eigen accounts altijd betalend", async () => {
    profiel.v = { ...betalend, plan: "free" };
    expect(await betaalt("u1")).toBe(false);
    profiel.v = { ...betalend, plan: "free", email: "Isa@JouwAnimatieVideo.nl" };
    expect(await betaalt("u1")).toBe(true);
    expect(intern("sam@jouwanimatievideo.nl")).toBe(true);
    expect(intern("sam@jouwanimatievideo.nl.evil.com")).toBe(false);
  });
});

describe("opruimen: de stappen", () => {
  const nu = Date.parse("2026-11-20T06:00:00Z");
  it("waarschuwt eerst, ontkoppelt pas na de gratieperiode", () => {
    expect(volgendeStap({ betaalt: false, accounts: 2, sinds: null, nu })).toBe("gewaarschuwd");
    expect(volgendeStap({ betaalt: false, accounts: 2, sinds: nu - (GRATIE_DAGEN - 1) * DAG, nu })).toBe("wacht");
    expect(volgendeStap({ betaalt: false, accounts: 2, sinds: nu - GRATIE_DAGEN * DAG, nu })).toBe("ontkoppeld");
  });
  it("betaalt hij weer, dan terug op nul; zonder kanalen niets te doen", () => {
    expect(volgendeStap({ betaalt: true, accounts: 2, sinds: nu - 3 * DAG, nu })).toBe("hersteld");
    expect(volgendeStap({ betaalt: true, accounts: 2, sinds: null, nu })).toBe("niets");
    expect(volgendeStap({ betaalt: false, accounts: 0, sinds: null, nu })).toBe("niets");
  });
  it("de mails zeggen hoeveel kanalen en wat er gebeurt", () => {
    expect(opruimMail("waarschuwing", 3, "https://x/pricing").tekst).toContain("je 3 gekoppelde kanalen");
    expect(opruimMail("ontkoppeld", 1, "https://x").tekst).toContain("je gekoppelde kanaal");
  });
});
