import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/creaties/wachtrij", () => ({ uploadNaarOpslag: async () => "" }));

const { nieuweCode, deelLink } = await import("./delen");
const { herkomst, heeftGezicht } = await import("./herkomst");

test("deelcode: 8 tekens, geen verwarrende 0/O/1/l/I, en steeds anders", () => {
  const codes = new Set(Array.from({ length: 200 }, () => nieuweCode()));
  expect(codes.size).toBe(200);
  for (const c of codes) expect(c).toMatch(/^[2-9a-km-zA-HJ-NP-Z]{8}$/);
  expect(deelLink("https://animideo.nl", "abc")).toBe("https://animideo.nl/d/abc");
});

describe("herkomst", () => {
  test("recept: naam en pagina van het recept", () => {
    expect(herkomst({ maker: "recept", soort: "beeld", invoer: { receptId: "vermeer" } })).toEqual({ naam: "Jij als Vermeer", pad: "/apps/vermeer" });
    expect(herkomst({ maker: "recept", soort: "beeld", invoer: { receptId: "makelaar-avond" } }).pad).toBe("/branches/makelaar/makelaar-avond");
  });
  test("reclame en losse makers", () => {
    expect(herkomst({ maker: "reclame", soort: "video", invoer: {} }).pad).toBe("/apps/reclame");
    expect(herkomst({ maker: "beeld-naar-video", soort: "video", invoer: {} }).pad).toBe("/maak/video");
    expect(herkomst({ maker: "beeld", soort: "beeld", invoer: {} }).pad).toBe("/maak/beeld");
  });
});

test("toestemming bij delen: alleen waar een gezicht op staat", () => {
  expect(heeftGezicht({ maker: "recept", invoer: { receptId: "vermeer" } })).toBe(true);
  expect(heeftGezicht({ maker: "recept", invoer: { receptId: "delfts-blauw" } })).toBe(false);
  expect(heeftGezicht({ maker: "gezicht", invoer: {} })).toBe(true);
  expect(heeftGezicht({ maker: "reclame", invoer: {} })).toBe(false);
});

import { controleerHandle, websiteNetjes } from "./profiel-regels";

describe("profielnaam", () => {
  test("netjes gemaakt: kleine letters, zonder @", () => {
    expect(controleerHandle("@BakkerijJansen")).toEqual({ handle: "bakkerijjansen", fout: null });
    expect(controleerHandle("bakkerij-jansen").fout).toBeNull();
  });
  test("geweigerd: te kort, rare tekens, streepjes aan de rand, gereserveerd", () => {
    expect(controleerHandle("ab").fout).toMatch(/Minstens/);
    expect(controleerHandle("bakkerij jansen").fout).toMatch(/Alleen/);
    expect(controleerHandle("-jansen").fout).toMatch(/streepje/);
    expect(controleerHandle("jan--sen").fout).toMatch(/streepje/);
    expect(controleerHandle("animideo").fout).toMatch(/niet beschikbaar/);
    expect(controleerHandle("Admin").fout).toMatch(/niet beschikbaar/);
  });
  test("website krijgt https erbij", () => {
    expect(websiteNetjes("jansen.nl")).toBe("https://jansen.nl");
    expect(websiteNetjes("http://jansen.nl")).toBe("http://jansen.nl");
    expect(websiteNetjes("  ")).toBe("");
  });
});
