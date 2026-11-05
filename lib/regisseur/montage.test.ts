import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openai", () => ({ openai: {}, transcribeWords: vi.fn() }));
vi.mock("next/server", () => ({ after: () => {} }));
import { leesMontage, montageCredits, stemDelen, MAX_VOICEOVER } from "./montage";
import { CREDIT_COSTS } from "@/lib/credit-costs";

const zin = "Dit is een gewone zin van ongeveer vijftig tekens lang. ";

describe("montage: voice-over", () => {
  it("kapt een lange tekst niet meer af", () => {
    const tekst = zin.repeat(40).trim(); // ~2.200 tekens, zoals bij Sterrenrijk
    expect(leesMontage({ clipIds: ["a"], voiceover: tekst }).voiceover).toBe(tekst);
  });
  it("knipt in delen op zinsgrenzen, zonder iets kwijt te raken", () => {
    const tekst = zin.repeat(120).trim();
    const delen = stemDelen(tekst, 2400);
    expect(delen.length).toBeGreaterThan(1);
    expect(delen.every((d) => d.length <= 2400 && /[.!?]$/.test(d))).toBe(true);
    expect(delen.join(" ").replace(/\s+/g, " ")).toBe(tekst.replace(/\s+/g, " "));
  });
  it("te lange tekst geeft een melding", () => {
    expect(() => leesMontage({ clipIds: ["a"], voiceover: "a".repeat(MAX_VOICEOVER + 1) })).toThrow(/te lang/);
  });
  it("prijs per begonnen 1.000 tekens", () => {
    expect(montageCredits({ voiceover: "x".repeat(900) })).toBe(CREDIT_COSTS.VOICE);
    expect(montageCredits({ voiceover: "x".repeat(2124) })).toBe(CREDIT_COSTS.VOICE * 3);
    expect(montageCredits({})).toBe(0);
  });
});

describe("montage: aantal stukken", () => {
  it("34 stukken kan, niets valt weg", () => {
    const ids = Array.from({ length: 34 }, (_, i) => `c${i}`);
    expect(leesMontage({ clipIds: ids }).clipIds).toHaveLength(34);
  });
  it("te veel stukken geeft een melding", () => {
    expect(() => leesMontage({ clipIds: Array.from({ length: 61 }, (_, i) => `c${i}`) })).toThrow(/hoogstens/);
  });
});
