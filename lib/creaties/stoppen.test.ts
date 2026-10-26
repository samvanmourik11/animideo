import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fal", () => ({ fal: {} }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/team/team", () => ({ betaalTerug: vi.fn() }));
vi.mock("./wachtrij", () => ({ WachtrijFout: class extends Error {} }));

import { STOP_MELDING, stopUitkomst } from "./stoppen";

describe("stopUitkomst", () => {
  it("geeft altijd terug als het model nog niet begonnen was", () => {
    expect(stopUitkomst(false, true)).toBe("nog-niet-begonnen");
  });
  it("de eerste keer tijdens het maken: terug, met waarschuwing", () => {
    expect(stopUitkomst(true, false)).toBe("eerste-keer");
    expect(STOP_MELDING["eerste-keer"]).toMatch(/voortaan/);
  });
  it("daarna tijdens het maken: verbruikt", () => {
    expect(stopUitkomst(true, true)).toBe("verbruikt");
  });
});
