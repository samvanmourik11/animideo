import { describe, it, expect } from "vitest";
import { opnameTekst, opnamesPerStem, zinTijden, stiltesUitLog, knipPunten } from "./stemknippen";

// De getallen komen uit een echte proefopname met de stem van oma (ElevenLabs v3):
// drie zinnen, 9,64 seconden. De stiltes zijn met ffmpeg in diezelfde opname gemeten.

/** Tijden per letter, zoals ElevenLabs ze teruggeeft, voor een willekeurige tekst. */
function tijdenVoor(tekst: string, perTeken = 0.05, pauze = 0.8) {
  const characters: string[] = [];
  const character_start_times_seconds: number[] = [];
  const character_end_times_seconds: number[] = [];
  let t = 0;
  for (const teken of tekst) {
    const lengte = teken === "\n" ? pauze / 2 : perTeken;
    characters.push(teken);
    character_start_times_seconds.push(t);
    character_end_times_seconds.push(t + lengte);
    t += lengte;
  }
  // ElevenLabs levert ze in brokjes; de verdeling mag er niet toe doen.
  const half = Math.floor(characters.length / 2);
  return [
    { characters: characters.slice(0, half), character_start_times_seconds: character_start_times_seconds.slice(0, half), character_end_times_seconds: character_end_times_seconds.slice(0, half) },
    { characters: characters.slice(half), character_start_times_seconds: character_start_times_seconds.slice(half), character_end_times_seconds: character_end_times_seconds.slice(half) },
  ];
}

describe("opnameTekst", () => {
  it("zet elke zin in een eigen alinea", () => {
    expect(opnameTekst(["Hoi oma!", "Wat  is\ndat?"])).toBe("Hoi oma!\n\nWat is dat?");
  });
});

describe("opnamesPerStem", () => {
  it("houdt de zinnen per stem bij elkaar, in verhaalvolgorde", () => {
    const groepen = opnamesPerStem([
      { stem: "oma", tekst: "Een" },
      { stem: "lilly", tekst: "Twee" },
      { stem: "oma", tekst: "Drie" },
    ]);
    expect(groepen.map((g) => [g.stem, g.regels.map((r) => r.tekst)])).toEqual([
      ["oma", ["Een", "Drie"]],
      ["lilly", ["Twee"]],
    ]);
  });

  it("begint een nieuwe opname als het te lang wordt", () => {
    const lang = "x".repeat(40);
    const groepen = opnamesPerStem([{ stem: "oma", tekst: lang }, { stem: "oma", tekst: lang }, { stem: "oma", tekst: lang }], 90);
    expect(groepen.map((g) => g.regels.length)).toEqual([2, 1]);
  });
});

describe("zinTijden", () => {
  it("vindt begin en eind van elke zin", () => {
    const tekst = opnameTekst(["Weten jullie dat?", "Overal!", "Dit paleis."]);
    const tijden = zinTijden(tijdenVoor(tekst), 3);
    expect(tijden).not.toBeNull();
    expect(tijden!.length).toBe(3);
    for (let i = 0; i < 2; i++) expect(tijden![i].eind).toBeLessThan(tijden![i + 1].start);
  });

  it("weigert als het aantal zinnen niet klopt", () => {
    const tekst = opnameTekst(["Een.", "Twee."]);
    expect(zinTijden(tijdenVoor(tekst), 3)).toBeNull();
    expect(zinTijden(null, 1)).toBeNull();
    expect(zinTijden([{ characters: "kapot" }], 1)).toBeNull();
  });
});

describe("stiltesUitLog", () => {
  it("leest de stiltes uit ffmpeg", () => {
    const log =
      "[silencedetect @ 0x1] silence_start: 2.684626\n" +
      "[silencedetect @ 0x1] silence_end: 3.677007 | silence_duration: 0.992381\n" +
      "[silencedetect @ 0x1] silence_start: 5.778277\n" +
      "[silencedetect @ 0x1] silence_end: 6.889365 | silence_duration: 1.111088\n";
    expect(stiltesUitLog(log)).toEqual([
      { start: 2.684626, eind: 3.677007 },
      { start: 5.778277, eind: 6.889365 },
    ]);
  });
});

describe("knipPunten (proefopname)", () => {
  const zinnen = [{ start: 0, eind: 2.68 }, { start: 2.96, eind: 6.16 }, { start: 6.66, eind: 9.6 }];
  const stiltes = [{ start: 2.684626, eind: 3.677007 }, { start: 5.778277, eind: 6.889365 }];
  const punten = knipPunten(zinnen, stiltes, 9.639);

  it("knipt in de stilte, niet op de tijden per letter", () => {
    // Zin twee eindigt volgens de letters op 6,16s, maar het geluid stopte al op 5,78s.
    expect(punten[1].eind).toBeGreaterThanOrEqual(5.778);
    expect(punten[1].eind).toBeLessThan(6.16);
    // Zin twee begint pas als de stilte bijna voorbij is, niet een seconde ervoor.
    expect(punten[1].start).toBeGreaterThan(3.5);
    expect(punten[1].start).toBeLessThan(3.677);
  });

  it("laat de zinnen niet overlappen en blijft binnen de opname", () => {
    for (let i = 0; i < punten.length - 1; i++) expect(punten[i].eind).toBeLessThanOrEqual(punten[i + 1].start);
    expect(punten[0].start).toBe(0);
    expect(punten[2].eind).toBeLessThanOrEqual(9.639);
  });

  it("valt terug op het midden als er geen stilte gemeten is", () => {
    const zonder = knipPunten(zinnen, [], 9.639);
    expect(zonder[0].eind).toBeCloseTo(2.82, 2);
    expect(zonder[1].start).toBeCloseTo(2.82, 2);
  });
});
