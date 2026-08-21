import { describe, it, expect } from "vitest";
import { normaliseer } from "./billing-blocklist";

// De vergelijking is het hele mechanisme: staat er "NL90 INGB 0006 6590 02" in
// de betaling en "nl90ingb0006659002" op de lijst, dan moet dat een treffer
// zijn. Anders glipt iemand er langs met een spatie.

describe("normaliseer", () => {
  it("haalt spaties uit een rekeningnummer en maakt alles klein", () => {
    expect(normaliseer("iban", "NL90 INGB 0006 6590 02")).toBe("nl90ingb0006659002");
    expect(normaliseer("iban", "nl90ingb0006659002")).toBe("nl90ingb0006659002");
    expect(normaliseer("iban", "  NL75INGB0006057775  ")).toBe("nl75ingb0006057775");
  });

  it("laat spaties in een naam staan, want die horen erbij", () => {
    expect(normaliseer("naam", "Hr EKJ Matzer")).toBe("hr ekj matzer");
  });

  it("maakt een e-mailadres kleingeschreven", () => {
    expect(normaliseer("email", "E.Matzer@Outlook.COM")).toBe("e.matzer@outlook.com");
  });
});
