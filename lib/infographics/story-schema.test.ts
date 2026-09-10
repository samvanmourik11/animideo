import { describe, it, expect } from "vitest";
import {
  tekstInBeeldAan,
  storySpecSchema,
  castRefsVanSpec,
  mergeVasteCast,
  castRefsVoorScene,
  type StoryScene,
  type StorySpec,
  type StoryCastMember,
  type StoryCastRef,
} from "./story-schema";

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

// De cast van een verhaal. Wat hier misgaat, gaat in élke scene mis: een portret
// dat zijn naam kwijtraakt komt in geen enkele scene-briefing terug, en dan
// tekent het beeldmodel er weer een vreemde bij.

const ref = (extra: Partial<StoryCastRef> = {}): StoryCastRef => ({
  url: "https://x/portret.png",
  name: "",
  role: "",
  ...extra,
});
const lid = (extra: Partial<StoryCastMember> = {}): StoryCastMember => ({
  name: "Lisa",
  role: "de monteur",
  appearance: "kort donker haar, blauwe overall",
  ...extra,
});

describe("castRefsVanSpec", () => {
  it("leest een verhaal van vóór het castblad als cast van één", () => {
    const uit = castRefsVanSpec({ characterUrl: "https://x/oud.png", characterRole: "de klant" });
    expect(uit).toEqual([{ url: "https://x/oud.png", name: "", role: "de klant" }]);
  });

  it("laat de nieuwe cast winnen van de oude velden", () => {
    const uit = castRefsVanSpec({
      castRefs: [ref({ url: "https://x/a.png", name: "Lisa" })],
      characterUrl: "https://x/oud.png",
      characterRole: "de klant",
    });
    expect(uit.map((r) => r.url)).toEqual(["https://x/a.png"]);
  });

  it("geeft een lege cast als er niets is gekozen", () => {
    expect(castRefsVanSpec({})).toEqual([]);
    expect(castRefsVanSpec(null)).toEqual([]);
    // Een leeggemaakte cast mag het oude personage niet terughalen.
    expect(castRefsVanSpec({ castRefs: [], characterUrl: null })).toEqual([]);
  });
});

describe("mergeVasteCast", () => {
  it("koppelt een gekozen personage aan het castlid met dezelfde naam", () => {
    const { cast, refs } = mergeVasteCast([lid()], [ref({ name: "lisa", role: "de chef" })]);
    expect(cast).toHaveLength(1);
    // Naam en rol van de klant winnen; het uiterlijk van de regie blijft staan.
    expect(cast[0]).toMatchObject({ name: "lisa", role: "de chef", appearance: "kort donker haar, blauwe overall" });
    expect(refs[0].name).toBe("lisa");
  });

  it("voegt een vergeten personage alsnog toe aan de cast", () => {
    const { cast, refs } = mergeVasteCast([lid()], [ref({ name: "Ahmed", role: "de klant" })]);
    expect(cast.map((c) => c.name)).toEqual(["Lisa", "Ahmed"]);
    expect(refs[0].name).toBe("Ahmed");
  });

  it("geeft een naamloos portret altijd een naam, zodat het scenes kan halen", () => {
    const { cast, refs } = mergeVasteCast([], [ref(), ref({ url: "https://x/b.png" })]);
    expect(refs.map((r) => r.name)).toEqual(["Personage 1", "Personage 2"]);
    expect(cast.map((c) => c.name)).toEqual(["Personage 1", "Personage 2"]);
  });

  it("laat een naamloos portret het castlid op dezelfde plek overnemen", () => {
    const { refs } = mergeVasteCast([lid(), lid({ name: "Ahmed" })], [ref(), ref({ url: "https://x/b.png" })]);
    expect(refs.map((r) => r.name)).toEqual(["Lisa", "Ahmed"]);
  });

  it("gooit bij te veel castleden de verzonnen rollen weg, niet die van de klant", () => {
    const verzonnen = ["A", "B", "C", "D"].map((n) => lid({ name: n }));
    const { cast } = mergeVasteCast(verzonnen, [ref({ name: "Ahmed", role: "de klant" })]);
    expect(cast).toHaveLength(4);
    expect(cast.map((c) => c.name)).toContain("Ahmed");
  });

  it("raakt de cast niet aan als de gebruiker niets heeft gekozen", () => {
    const gegenereerd = [lid()];
    expect(mergeVasteCast(gegenereerd, []).cast).toBe(gegenereerd);
  });
});

describe("castRefsVoorScene", () => {
  const cast = [ref({ url: "https://x/a.png", name: "Lisa" }), ref({ url: "https://x/b.png", name: "Ahmed" })];

  it("stuurt alleen de portretten mee van wie in deze scene staat", () => {
    expect(castRefsVoorScene(cast, ["Ahmed"]).map((r) => r.url)).toEqual(["https://x/b.png"]);
  });

  it("matcht ongeacht hoofdletters en spaties", () => {
    expect(castRefsVoorScene(cast, [" lisa "]).map((r) => r.name)).toEqual(["Lisa"]);
  });

  it("stuurt de hele cast mee als niemand getagd is", () => {
    // Geen opgave betekent "de regie weet het niet", niet "er staat niemand in":
    // een ontbrekend portret levert gegarandeerd een nieuw verzonnen gezicht.
    expect(castRefsVoorScene(cast, null)).toHaveLength(2);
    expect(castRefsVoorScene(cast, [])).toHaveLength(2);
  });

  it("stuurt niets mee als er wel getagd is maar niemand uit de cast", () => {
    expect(castRefsVoorScene(cast, ["Iemand anders"])).toEqual([]);
  });
});
