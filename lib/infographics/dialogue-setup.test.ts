import { describe, it, expect } from "vitest";
import { mergeCast, opzetKlaar, type DialogueSetup, type VastCastLid } from "./dialogue-setup";
import type { DialogueCastMember } from "./dialogue-schema";

// De belofte van de opzet is: wat jij vastlegt, blijft staan. Gaat dat stuk, dan
// typ je een rol, vraag je een nieuw voorstel, en staat er iets anders — en dan is
// "vooraf kiezen" een illusie. Vandaar dat die voorrang hier vastligt in tests.

const vast = (extra: Partial<VastCastLid> = {}): VastCastLid => ({
  characterId: "uuid-lisa",
  name: "Lisa",
  portraitUrl: "https://x/lisa.png",
  ...extra,
});

const voorstel = (extra: Partial<DialogueCastMember> = {}): DialogueCastMember => ({
  id: "char-1",
  characterId: "uuid-lisa",
  name: "Lisa",
  role: "de expert",
  wil: "overtuigen",
  spraak: "kort en direct",
  leeftijd: "ongeveer 40",
  voice: "stem-a",
  portraitUrl: "https://x/lisa.png",
  position: "left",
  appearance: "donker haar",
  ...extra,
});

describe("mergeCast", () => {
  it("laat de rol van de gebruiker winnen van het voorstel", () => {
    const uit = mergeCast([vast({ role: "de monteur" })], [voorstel({ role: "de expert" })]);
    expect(uit[0].role).toBe("de monteur");
  });

  it("vult alleen de velden in die de gebruiker leeg liet", () => {
    const uit = mergeCast([vast({ role: "" })], [voorstel()]);
    expect(uit[0].role).toBe("de expert");
    expect(uit[0].wil).toBe("overtuigen");
    expect(uit[0].spraak).toBe("kort en direct");
    expect(uit[0].leeftijd).toBe("ongeveer 40");
  });

  it("koppelt het voorstel ook als het model naar de naam verwijst", () => {
    const uit = mergeCast([vast()], [voorstel({ characterId: "", name: "lisa" })]);
    expect(uit[0].wil).toBe("overtuigen");
  });

  it("laat de assistent aanvullen tot een gesprek, maar nooit iemand vervangen", () => {
    const uit = mergeCast(
      [vast({ role: "de monteur" })],
      [voorstel({ characterId: "uuid-ahmed", name: "Ahmed", role: "de klant", portraitUrl: "https://x/a.png" })],
    );
    expect(uit.map((c) => c.name)).toEqual(["Lisa", "Ahmed"]);
    expect(uit[0].role).toBe("de monteur");
  });

  it("voegt niemand toe die de gebruiker al koos", () => {
    const uit = mergeCast([vast()], [voorstel(), voorstel()]);
    expect(uit).toHaveLength(1);
  });

  it("negeert een voorgesteld personage zonder portret", () => {
    // Zonder portret valt het renderen later om; dan liever nu niet toevoegen.
    const uit = mergeCast([vast()], [voorstel({ characterId: "uuid-x", name: "X", portraitUrl: "" })]);
    expect(uit).toHaveLength(1);
  });

  it("geeft posities en id's op volgorde uit", () => {
    const uit = mergeCast(
      [vast(), vast({ characterId: "uuid-b", name: "B", portraitUrl: "https://x/b.png" })],
      [],
    );
    expect(uit.map((c) => c.id)).toEqual(["char-1", "char-2"]);
    expect(uit.map((c) => c.position)).toEqual(["left", "right"]);
  });

  it("haalt een dubbele stem weg zodat twee personages niet hetzelfde klinken", () => {
    const uit = mergeCast(
      [vast(), vast({ characterId: "uuid-b", name: "B", portraitUrl: "https://x/b.png" })],
      [voorstel({ voice: "stem-a" }), voorstel({ characterId: "uuid-b", name: "B", voice: "stem-a" })],
    );
    expect(uit[0].voice).toBe("stem-a");
    expect(uit[1].voice).toBe("");
  });
});

describe("opzetKlaar", () => {
  const basis = (extra: Partial<DialogueSetup> = {}): DialogueSetup => ({
    title: "T", topic: "", text: "Waar het over gaat.",
    kern: "", wending: "", tone: "zakelijk", angle: "",
    language: "Nederlands", keepTerms: [], avoidTerms: [],
    format: "16:9", styleId: "flat-vector", illustrationBrief: "",
    cast: [voorstel(), voorstel({ characterId: "uuid-b", name: "B", id: "char-2", voice: "stem-b" })],
    targetSeconds: 60,
    ...extra,
  });

  it("laat door met twee personages met stem en portret", () => {
    expect(opzetKlaar(basis()).klaar).toBe(true);
  });

  it("blokkeert zonder brontekst", () => {
    expect(opzetKlaar(basis({ text: "  " })).klaar).toBe(false);
  });

  it("blokkeert bij minder dan twee personages", () => {
    expect(opzetKlaar(basis({ cast: [voorstel()] })).klaar).toBe(false);
  });

  it("blokkeert als iemand geen stem heeft", () => {
    expect(opzetKlaar(basis({ cast: [voorstel(), voorstel({ id: "char-2", characterId: "uuid-b", voice: "" })] })).klaar).toBe(false);
  });

  it("blokkeert NIET op smaakvelden — de opzet is geen verplicht formulier", () => {
    expect(opzetKlaar(basis({ kern: "", wending: "", illustrationBrief: "" })).klaar).toBe(true);
  });
});
