import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/openai", () => ({ openai: {}, transcribeWords: async () => ({ words: [] }) }));

const { ondertitelBlokken } = await import("./montage");
const { controleerUgcScript } = await import("./script");
const { ugcCredits, stukjeCredits, geschatteUgcCredits, geschatteSec, UGC_BROLL_MODEL } = await import("./types");
const { CREDIT_COSTS } = await import("@/lib/credit-costs");
const { videoModel } = await import("@/lib/video-modellen");

const w = (word: string, start: number, end: number) => ({ word, start, end });

describe("ondertitels", () => {
  test("hooguit drie woorden per blok, en een nieuw blok na een leesteken", () => {
    const b = ondertitelBlokken([w("Ik", 0, 0.2), w("moet", 0.2, 0.4), w("jullie", 0.4, 0.7), w("iets", 0.7, 0.9), w("vertellen.", 0.9, 1.4), w("Echt", 1.6, 1.9)]);
    expect(b.map((x) => x.tekst)).toEqual(["Ik moet jullie", "iets vertellen.", "Echt"]);
  });
  test("lange woorden: niet meer dan ~16 tekens per blok", () => {
    const b = ondertitelBlokken([w("onwaarschijnlijk", 0, 0.6), w("lekkere", 0.6, 1), w("koffie", 1, 1.3)]);
    expect(b[0].tekst).toBe("onwaarschijnlijk");
  });
  test("korte pauzes worden overbrugd, zodat de tekst niet knippert", () => {
    const b = ondertitelBlokken([w("Dit", 0, 0.3), w("is", 0.3, 0.5), w("top!", 0.5, 0.9), w("Echt", 1.1, 1.4)]);
    expect(b[0].tot).toBe(1.1);
  });
});

describe("script", () => {
  const praat = { soort: "praat", tekst: "Ik moet jullie iets laten zien", uitleg: "x", beeld: "kitchen" };
  test("eerste stukje is altijd praten, B-roll alleen als die aan staat", () => {
    const s = controleerUgcScript({ stukjes: [{ ...praat, soort: "broll" }, { ...praat, soort: "broll" }] }, false);
    expect(s.stukjes.map((x) => x.soort)).toEqual(["praat", "praat"]);
    const t = controleerUgcScript({ stukjes: [{ ...praat, soort: "broll" }, { ...praat, soort: "broll", tekst: "kort" }] }, true);
    expect(t.stukjes.map((x) => x.soort)).toEqual(["praat", "broll"]);
  });
  test("weigert te weinig of te lange stukjes", () => {
    expect(() => controleerUgcScript({ stukjes: [praat] }, true)).toThrow(/niet compleet/);
    expect(() => controleerUgcScript({ stukjes: [praat, { ...praat, tekst: "woord ".repeat(30) }] }, true)).toThrow(/te lang/);
  });
});

test("prijs: lipsync naar lengte, B-roll vast, en de schatting ligt in de buurt", () => {
  const kort = stukjeCredits({ soort: "praat", tekst: "Dit is echt top" });
  const lang = stukjeCredits({ soort: "praat", tekst: "woord ".repeat(18) });
  expect(lang).toBeGreaterThan(kort);
  expect(stukjeCredits({ soort: "broll", tekst: "kijk dan" })).toBe(CREDIT_COSTS.IMAGE_GENERATION_PRO + 1 + videoModel(UGC_BROLL_MODEL).credits);
  expect(geschatteSec("een twee drie vier vijf zes")).toBeCloseTo(2.8, 1);
  const script = { stukjes: [{ soort: "praat" as const, tekst: "woord ".repeat(14), uitleg: "", beeld: "" }, { soort: "broll" as const, tekst: "woord ".repeat(8), uitleg: "", beeld: "" }, { soort: "praat" as const, tekst: "woord ".repeat(14), uitleg: "", beeld: "" }] };
  expect(Math.abs(ugcCredits(script) - geschatteUgcCredits(15, true))).toBeLessThanOrEqual(6);
});

describe("ondertitels volgen het script", async () => {
  const { metScriptTekst } = await import("./montage");
  test("zelfde aantal woorden: script-woorden met Whisper-tijden", () => {
    const r = metScriptTekst([w("tonyschokolownly", 1, 1.6), w("com", 1.6, 1.9)], "tonyschocolonely.com nu!");
    expect(r.map((x) => x.word)).toEqual(["tonyschocolonely.com", "nu!"]);
    expect(r[0].start).toBe(1);
  });
  test("ander aantal: evenredig verdeeld, tijden lopen op", () => {
    const r = metScriptTekst([w("a", 0, 0.5), w("b", 0.5, 1), w("c", 1, 1.5)], "een twee drie vier vijf");
    expect(r).toHaveLength(5);
    for (let i = 1; i < r.length; i++) expect(r[i].start).toBeGreaterThanOrEqual(r[i - 1].start);
  });
});
