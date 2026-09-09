import { describe, it, expect } from "vitest";
import { tekstInBeeldAan, storySpecSchema, type StoryScene, type StorySpec } from "./story-schema";

// Deze regel bepaalt of een bestaand project zijn tekst terugziet. Toen de tekst
// in beeld werd weggehaald, verdween bij een klant tien scenes aan koppen en
// accentwoorden uit haar e-learning — de gegevens stonden er nog, maar niemand
// toonde ze meer. Vandaar dat dit gedrag vastligt in tests.

const scene = (extra: Partial<StoryScene> = {}): StoryScene => ({
  id: "s1",
  voiceover: "Een zin.",
  illustration: "A scene.",
  ...extra,
});

const spec = (scenes: StoryScene[], tekstInBeeld?: boolean | null): Pick<StorySpec, "tekstInBeeld" | "scenes"> => ({
  scenes,
  tekstInBeeld,
});

describe("tekstInBeeldAan", () => {
  it("staat aan bij een bestaand project met koppen", () => {
    expect(tekstInBeeldAan(spec([scene({ headline: "Je gezicht als sleutel" })]))).toBe(true);
  });

  it("staat aan bij een bestaand project met alleen een groot getal", () => {
    expect(tekstInBeeldAan(spec([scene(), scene({ bigNumber: "5.500€" })]))).toBe(true);
  });

  it("staat uit bij een nieuw verhaal zonder tekst", () => {
    expect(tekstInBeeldAan(spec([scene(), scene()]))).toBe(false);
  });

  it("laat een lege kop niet meetellen", () => {
    expect(tekstInBeeldAan(spec([scene({ headline: "   ", bigNumber: "" })]))).toBe(false);
  });

  it("respecteert een uitdrukkelijke keuze, ook als die tegen de inhoud in gaat", () => {
    // Uitgezet terwijl er koppen staan: de klant wil ze even niet zien.
    expect(tekstInBeeldAan(spec([scene({ headline: "Kop" })], false))).toBe(false);
    // Aangezet terwijl er nog niets staat: de velden horen dan wél te verschijnen.
    expect(tekstInBeeldAan(spec([scene()], true))).toBe(true);
  });

  it("gaat om met een spec zonder scenes", () => {
    expect(tekstInBeeldAan({ scenes: [], tekstInBeeld: undefined })).toBe(false);
  });
});

describe("storySpecSchema", () => {
  const sceneVelden = (tekst: boolean) => {
    const s = storySpecSchema(tekst) as unknown as {
      properties: { scenes: { items: { required: string[] } } };
    };
    return s.properties.scenes.items.required;
  };

  it("vraagt de AI alleen om koppen als de tekst aanstaat", () => {
    expect(sceneVelden(false)).not.toContain("headline");
    expect(sceneVelden(true)).toContain("headline");
    expect(sceneVelden(true)).toContain("emphasis");
    expect(sceneVelden(true)).toContain("bigNumber");
  });

  it("vraagt in beide gevallen om de voice-over en de illustratie", () => {
    for (const tekst of [true, false]) {
      expect(sceneVelden(tekst)).toContain("voiceover");
      expect(sceneVelden(tekst)).toContain("illustration");
    }
  });
});
