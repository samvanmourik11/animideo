import { describe, expect, it } from "vitest";
import {
  DEFAULT_STORY_STYLE,
  INTERNE_STIJLEN,
  STORY_STYLE_PRESETS,
  storyStylePreamble,
  toegestaneStijl,
} from "./story-style";

// De interne stijlen mogen nooit bij klanten terechtkomen: niet via de kiezer,
// niet via de dialoog-AI (die kiest uit STORY_STYLE_PRESETS) en niet via een
// nagespeelde aanroep met een interne id.
describe("interne tekenstijlen", () => {
  const intern = INTERNE_STIJLEN[0].id;

  it("staan niet in de lijst die klanten en de dialoog-AI te zien krijgen", () => {
    const klantIds = new Set(STORY_STYLE_PRESETS.map((s) => s.id));
    for (const s of INTERNE_STIJLEN) expect(klantIds.has(s.id)).toBe(false);
  });

  it("vallen voor een klant terug op de standaardstijl", () => {
    expect(toegestaneStijl(intern, false)).toBe(DEFAULT_STORY_STYLE);
  });

  it("blijven voor ons team gewoon werken, met hun eigen tekenstijl", () => {
    expect(toegestaneStijl(intern, true)).toBe(intern);
    expect(storyStylePreamble(intern)).toBe(INTERNE_STIJLEN[0].preamble);
  });

  it("laten klantstijlen ongemoeid", () => {
    expect(toegestaneStijl("papercut", false)).toBe("papercut");
    expect(toegestaneStijl(undefined, false)).toBe(DEFAULT_STORY_STYLE);
  });
});
