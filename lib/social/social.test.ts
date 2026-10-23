import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/creaties/wachtrij", () => ({ startCreatie: vi.fn(), verversLopende: vi.fn(), WachtrijFout: class extends Error {} }));
vi.mock("@/lib/regisseur/tools", () => ({ leesGeheugen: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { static APIError = class extends Error {} } }));
import { schoonIdee } from "./kalender";

const k = {
  start_datum: "2026-10-26",
  weken: 2,
  kanalen: [
    { platform: "instagram" as const, accountId: "a1", naam: "zoetezwaan" },
    { platform: "tiktok" as const, accountId: "a2", naam: "zoetezwaan" },
    { platform: "twitter" as const, accountId: "a3", naam: "zoetezwaan" },
  ],
};
const basis = { datum: "2026-10-27", tijd: "18:30", platforms: ["instagram"], soort: "beeld", idee: "Verse appeltaart", tekst: "Appeltaartweer! #bakkerij", beeld_prompt: "apple pie on a wooden table" };

describe("contentkalender: ideeën controleren", () => {
  it("zet het moment in Nederlandse tijd (wintertijd)", () => {
    expect(schoonIdee(basis, k)?.gepland_op).toBe("2026-10-27T17:30:00.000Z");
  });

  it("maakt een post met TikTok altijd een video, met een standaardbeweging", () => {
    const p = schoonIdee({ ...basis, platforms: ["instagram", "tiktok"] }, k)!;
    expect(p.soort).toBe("video");
    expect(p.beweging).toBeTruthy();
  });

  it("laat kanalen weg die niet gekoppeld zijn, en weigert een post zonder kanaal", () => {
    expect(schoonIdee({ ...basis, platforms: ["instagram", "youtube"] }, k)?.platforms).toEqual(["instagram"]);
    expect(schoonIdee({ ...basis, platforms: ["youtube"] }, k)).toBeNull();
  });

  it("geeft X een tekst van hoogstens 280 tekens", () => {
    const p = schoonIdee({ ...basis, platforms: ["twitter"], tekst: "x".repeat(500) }, k)!;
    expect(p.tekst_kort!.length).toBeLessThanOrEqual(280);
    expect(schoonIdee(basis, k)!.tekst_kort).toBeNull();
  });

  it("weigert een kapotte datum of een leeg beeldidee", () => {
    expect(schoonIdee({ ...basis, datum: "morgen" }, k)).toBeNull();
    expect(schoonIdee({ ...basis, beeld_prompt: " " }, k)).toBeNull();
    expect(schoonIdee({ ...basis, tijd: "laat" }, k)?.gepland_op).toBe("2026-10-27T08:00:00.000Z");
  });
});
