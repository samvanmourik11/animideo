import { describe, it, expect } from "vitest";
import { telFout } from "./beeldtelling";

// Uit de vierde Wonderwagen-video: vier mensen langs de Waterkant, drie verwacht.

describe("telFout", () => {
  it("keurt een beeld met een persoon te veel af", () => {
    expect(telFout(4, 3, false)).toContain("extra persoon");
    expect(telFout(4, 3, true)).toContain("extra persoon");
  });

  it("vindt te weinig alleen fout als iedereen zichtbaar hoort te zijn", () => {
    expect(telFout(2, 3, true)).toContain("ontbreekt");
    expect(telFout(1, 3, false)).toBeNull();
  });

  it("laat een kloppende telling met rust", () => {
    expect(telFout(3, 3, true)).toBeNull();
  });

  it("negeert een telling die er niet is of nergens op slaat", () => {
    expect(telFout(undefined, 3, true)).toBeNull();
    expect(telFout("vier", 3, true)).toBeNull();
    expect(telFout(-1, 3, true)).toBeNull();
  });
});
