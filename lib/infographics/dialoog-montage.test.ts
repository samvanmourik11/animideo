import { describe, it, expect } from "vitest";
import {
  beginEindFade, montagePlan, overgangOffsets, segmentAudioFilter, segmentVideoFilter, zachteLassen,
  EIND_UITFADE, SCENE_OVERGANG, ZACHTE_LAS,
} from "./dialoog-montage";

// Tussen scènes liep een overvloeier van een kwart seconde dwars over de stemmen
// heen. Wat hier vastligt: de overvloeier valt op stille stukken, en er praat
// nooit iemand doorheen.

describe("montagePlan", () => {
  const plan = montagePlan([
    { scene: 0, spraak: 3 },
    { scene: 0, spraak: 4 },
    { scene: 1, spraak: 2 },
    { scene: 1, spraak: 5 },
  ]);

  it("geeft de laatste zin van een scène een stille staart en de eerste van de volgende een stille kop", () => {
    expect(plan[1].staart).toBe(SCENE_OVERGANG);
    expect(plan[2].kop).toBe(SCENE_OVERGANG);
  });

  it("zet binnen een scène geen stilte tussen de zinnen", () => {
    expect(plan[0]).toMatchObject({ kop: 0, staart: 0, duur: 3 });
    expect(plan[2].staart).toBe(0);
  });

  // Binnen een scène flikkerde het bij elke zin: een harde las tussen twee beelden
  // waarin de personages net anders staan.
  it("geeft binnen een scène een zachte las, maar niet voor een scènewissel of aan het eind", () => {
    expect(plan[0].las).toBe(ZACHTE_LAS);
    expect(plan[2].las).toBe(ZACHTE_LAS);
    expect(plan[1].las).toBe(0);
    expect(plan[3].las).toBe(0);
  });

  it("laat de zachte las de tijdlijn niet verlengen, zodat de stemmen niet schuiven", () => {
    expect(plan[0].duur).toBe(3);
  });

  it("geeft de allerlaatste zin ruimte voor de uitfade, en de eerste geen kop", () => {
    expect(plan[3].staart).toBe(EIND_UITFADE);
    expect(plan[0].kop).toBe(0);
  });

  it("laat de overvloeier helemaal binnen de stilte vallen: staart en kop zijn samen minstens zo lang", () => {
    expect(plan[1].staart + plan[2].kop).toBeGreaterThanOrEqual(SCENE_OVERGANG);
    // De overvloeier overlapt de laatste SCENE_OVERGANG seconden van scène 1 met de
    // eerste van scène 2: dat is precies de staart en precies de kop.
    expect(plan[1].staart).toBeGreaterThanOrEqual(SCENE_OVERGANG);
    expect(plan[2].kop).toBeGreaterThanOrEqual(SCENE_OVERGANG);
  });
});

describe("overgangOffsets", () => {
  it("laat elke overgang beginnen waar de vorige scène bijna klaar is", () => {
    const { offsets, totaal } = overgangOffsets([10, 12, 5]);
    expect(offsets[0]).toBeCloseTo(10 - SCENE_OVERGANG);
    expect(offsets[1]).toBeCloseTo(10 - SCENE_OVERGANG + 12 - SCENE_OVERGANG);
    expect(totaal).toBeCloseTo(27 - 2 * SCENE_OVERGANG);
  });

  it("werkt ook met één scène", () => {
    expect(overgangOffsets([7])).toEqual({ offsets: [], totaal: 7 });
  });
});

describe("filters", () => {
  it("bevriest bij een gesproken regel het laatste beeld in plaats van de pratende clip door te laten lopen", () => {
    const f = segmentVideoFilter("scale=1920:1080", { spraak: 3, kop: 0, staart: SCENE_OVERGANG }, true);
    expect(f).toContain("trim=duration=3.000");
    expect(f).toContain("stop_mode=clone");
  });

  it("zet een stilstaande kop voor het eerste beeld van een nieuwe scène", () => {
    expect(segmentVideoFilter("scale=1920:1080", { spraak: 2, kop: SCENE_OVERGANG, staart: 0 }, false)).toContain("start_mode=clone");
  });

  it("houdt bij een zachte las het laatste beeld extra lang vast", () => {
    const f = segmentVideoFilter("scale=1920:1080", { spraak: 3, kop: 0, staart: 0, las: ZACHTE_LAS }, true);
    expect(f).toContain(`stop_mode=clone:stop_duration=${ZACHTE_LAS.toFixed(3)}`);
  });

  it("zet de zinnen van een scène met overvloeiers aan elkaar, precies op het einde van elke zin", () => {
    // Zinnen van 3, 4 en 2 seconden; de eerste twee houden hun laatste beeld de las lang vast.
    const { filter, label } = zachteLassen([3 + ZACHTE_LAS, 4 + ZACHTE_LAS, 2]);
    expect(filter).toContain(`[0:v][1:v]xfade=transition=fade:duration=${ZACHTE_LAS.toFixed(3)}:offset=3.000[lv1]`);
    expect(filter).toContain(`[lv1][2:v]xfade=transition=fade:duration=${ZACHTE_LAS.toFixed(3)}:offset=7.000[lv2]`);
    expect(label).toBe("lv2");
    // Samen even lang als de zinnen: 3 + 4 + 2.
    expect(overgangOffsets([3 + ZACHTE_LAS, 4 + ZACHTE_LAS, 2], ZACHTE_LAS).totaal).toBeCloseTo(9);
  });

  it("laat een segment zonder kop en staart gewoon zoals het was", () => {
    expect(segmentVideoFilter("scale=1920:1080", { spraak: 2, kop: 0, staart: 0 }, false)).toBe("scale=1920:1080");
  });

  it("schuift de stem op met de kop, zodat de zin pas na de overvloeier begint", () => {
    expect(segmentAudioFilter({ kop: SCENE_OVERGANG })).toContain(`adelay=${SCENE_OVERGANG * 1000}`);
    expect(segmentAudioFilter({ kop: 0 })).not.toContain("adelay");
  });

  it("fadet aan het eind naar zwart op het juiste moment", () => {
    expect(beginEindFade(20)).toContain(`st=${(20 - EIND_UITFADE).toFixed(3)}`);
  });
});
