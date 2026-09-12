import { describe, it, expect } from "vitest";
import { zonderHerhaling, sceneCast, MAX_PER_SCENE, VERTELLER_ID } from "./dialogue-schema";
import type { DialogueScene, DialogueCastMember, DialogueLine } from "./dialogue-schema";

// De bug die dit moet vangen: een video van twee minuten kwam terug met het
// verhaal er twee keer in — scène 13 t/m 21 waren woord voor woord scène 1 t/m 9.

const scene = (setting: string, lines: DialogueScene["lines"]): DialogueScene => ({
  id: setting, setting, lines,
});
const zegt = (characterId: string, text: string) => ({
  kind: "dialoog" as const, characterId, text, emotion: "neutraal",
});
const doet = (actie: string, text = "") => ({
  kind: "actie" as const, characterId: "char-1", text, emotion: "", actie, seconden: 4,
});

describe("zonderHerhaling", () => {
  const bestaand = [
    scene("grandma's living room", [
      zegt("char-1", "Ik moet jullie iets vertellen dat ik nog nooit aan iemand heb verteld."),
      zegt("char-2", "Wat is het dan, oma?"),
    ]),
    scene("a wooden shed", [doet("The shed doors open, the beam of light falls on the wagon.", "De wagen stond daar al veertig jaar.")]),
  ];

  it("laat echt nieuwe scènes gewoon door", () => {
    const nieuw = [scene("a river in Suriname", [zegt("char-2", "Kijk, daar is de markt!")])];
    expect(zonderHerhaling(bestaand, nieuw)).toEqual(nieuw);
  });

  it("gooit een letterlijk gekopieerde scène weg", () => {
    expect(zonderHerhaling(bestaand, [bestaand[0]])).toEqual([]);
  });

  it("trekt zich niets aan van leestekens of hoofdletters", () => {
    const nieuw = [scene("elders", [zegt("char-2", "wat is het dan oma")])];
    expect(zonderHerhaling(bestaand, nieuw)).toEqual([]);
  });

  it("houdt de nieuwe regels over uit een half gekopieerde scène", () => {
    const nieuw = [
      scene("grandma's living room", [
        zegt("char-1", "Ik moet jullie iets vertellen dat ik nog nooit aan iemand heb verteld."),
        zegt("char-2", "En toen gingen we naar de rivier zwemmen."),
      ]),
    ];
    const uit = zonderHerhaling(bestaand, nieuw);
    expect(uit).toHaveLength(1);
    expect(uit[0].lines.map((l) => l.text)).toEqual(["En toen gingen we naar de rivier zwemmen."]);
  });

  it("herkent een herhaald actiebeeld aan de handeling", () => {
    const nieuw = [scene("a wooden shed", [doet("The shed doors open, the beam of light falls on the wagon.", "De wagen stond daar al veertig jaar.")])];
    expect(zonderHerhaling(bestaand, nieuw)).toEqual([]);
  });

  it("gooit hetzelfde beeld ook weg als er een andere voice-over overheen staat", () => {
    // Zo ontsnapte de echte fout: dezelfde reeks beelden kwam er nog een keer
    // achteraan, nu zonder tekst, en gold daardoor als iets nieuws.
    const nieuw = [scene("a wooden shed", [doet("The shed doors open, the beam of light falls on the wagon.")])];
    expect(zonderHerhaling(bestaand, nieuw)).toEqual([]);
  });

  it("herkent een zin die is overgeschreven met een paar woorden erbij", () => {
    const nieuw = [scene("elders", [zegt("char-2", "Wat is het dan, oma? Zeg het nou!")])];
    expect(zonderHerhaling(bestaand, nieuw)).toEqual([]);
  });

  it("houdt zinnen die alleen op elkaar lijken wel apart", () => {
    const eerst = [scene("x", [zegt("char-1", "Dank je wel oma, voor de wonderwagen.")])];
    const nieuw = [scene("y", [zegt("char-1", "Dank je wel oma, voor de allermooiste reis ooit.")])];
    expect(zonderHerhaling(eerst, nieuw)).toHaveLength(1);
  });

  it("staat korte kreten toe die twee keer mogen vallen", () => {
    const eerst = [scene("x", [zegt("char-1", "Suriname!")])];
    const nieuw = [scene("y", [zegt("char-2", "Suriname!")])];
    expect(zonderHerhaling(eerst, nieuw)).toHaveLength(1);
  });

  it("vangt ook herhaling BINNEN de nieuwe scènes zelf", () => {
    const a = scene("a", [zegt("char-1", "Wij gaan vandaag naar de grote rivier toe.")]);
    const b = scene("b", [zegt("char-1", "Wij gaan vandaag naar de grote rivier toe.")]);
    expect(zonderHerhaling([], [a, b])).toHaveLength(1);
  });
});

// Wie er in één scene in beeld komt. Sinds de cast tot zes personages mag, is dit
// de rem die voorkomt dat het eendje, de haan, de vos en drie wolven samen in één
// keukenscene staan.

describe("sceneCast", () => {
  const maak = (id: string, naam: string): DialogueCastMember => ({
    id, characterId: `uuid-${id}`, name: naam, role: "", voice: `stem-${id}`,
    portraitUrl: `https://x/${id}.png`, position: "left",
  });
  const cast = ["a", "b", "c", "d"].map((x, i) => maak(`char-${i + 1}`, x.toUpperCase()));
  const regel = (cid: string): DialogueLine => ({ characterId: cid, text: "hoi", emotion: "neutraal" });
  const scene = (ids: string[]): DialogueScene => ({ id: "s1", setting: "a room", lines: ids.map(regel) });

  it("geeft alleen de personages die in deze scene praten", () => {
    expect(sceneCast(scene(["char-2", "char-4"]), cast).map((c) => c.name)).toEqual(["B", "D"]);
  });

  it("houdt de castvolgorde aan, niet de volgorde van spreken", () => {
    expect(sceneCast(scene(["char-3", "char-1"]), cast).map((c) => c.name)).toEqual(["A", "C"]);
  });

  it("telt de verteller niet mee — dat is een stem, geen figuur", () => {
    expect(sceneCast(scene([VERTELLER_ID, "char-1"]), cast).map((c) => c.name)).toEqual(["A"]);
  });

  it("valt terug op de eerste personages bij een scene zonder sprekers", () => {
    // Een scene met alleen muziek of alleen verteller mag geen leeg beeld geven.
    const uit = sceneCast(scene([VERTELLER_ID]), cast);
    expect(uit.length).toBeGreaterThan(0);
    expect(uit.length).toBeLessThanOrEqual(MAX_PER_SCENE);
  });

  it("zet er nooit meer dan drie in één beeld", () => {
    expect(sceneCast(scene(["char-1", "char-2", "char-3", "char-4"]), cast)).toHaveLength(MAX_PER_SCENE);
  });
});
