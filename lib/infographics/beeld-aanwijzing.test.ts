import { describe, it, expect } from "vitest";
import {
  aanwijzingContext, aanwijzingVraag, leesOpDeGrond, leesControle, leesKader, scherpereInstructie,
  AANWIJZING_SCHEMA, isIndelingsAanwijzing,
} from "./beeld-aanwijzing";
import type { DialogueScene, DialogueSpec } from "./dialogue-schema";

// "Het kapsel van het rechter poppetje moet hetzelfde zijn als de andere foto's van
// scène 6": de app moet die andere foto's erbij hebben, en de scènes ervoor en erna.

const shot = (url: string | null) => ({ characterId: "c1", text: "zin", emotion: "blij", shotImageUrl: url });
const scene = (id: string, urls: (string | null)[], plek: string | null = `https://x/${id}-plek.png`): DialogueScene => ({
  id, setting: "a forest", twoShotUrl: plek, lines: urls.map(shot),
});
const spec: Pick<DialogueSpec, "scenes" | "castSheetUrl"> = {
  castSheetUrl: "https://x/castblad.png",
  scenes: [
    scene("s5", ["https://x/5-1.png", "https://x/5-2.png", null]),
    scene("s6", ["https://x/6-1.png", "https://x/6-2.png", "https://x/6-3.png"]),
    scene("s7", [null, "https://x/7-2.png"]),
  ],
};

describe("aanwijzingContext", () => {
  const context = aanwijzingContext(spec, 1, 1);
  const urls = context.map((c) => c.url);

  it("geeft de plek en de andere shots van de scène, maar niet het doelbeeld zelf", () => {
    expect(urls).toContain("https://x/s6-plek.png");
    expect(urls).toContain("https://x/6-1.png");
    expect(urls).toContain("https://x/6-3.png");
    expect(urls).not.toContain("https://x/6-2.png");
  });

  it("neemt het laatste gemaakte shot van de scène ervoor en het eerste van de scène erna", () => {
    expect(urls).toContain("https://x/5-2.png");
    expect(urls).toContain("https://x/7-2.png");
    expect(context.find((c) => c.url === "https://x/7-2.png")?.label).toContain("scène 3, shot 2");
  });

  it("geeft het castblad mee, zodat 'zoals het hoort' ergens op slaat", () => {
    expect(urls).toContain("https://x/castblad.png");
  });

  it("slaat beelden over die er nog niet zijn", () => {
    expect(aanwijzingContext({ castSheetUrl: null, scenes: [scene("a", [null, null], null)] }, 0, 0)).toEqual([]);
  });
});

// "De deur moet tot de grond reiken": het antwoord zegt welk ding op de grond moet,
// zodat de route een schets kan maken in plaats van een bewerking in woorden.
describe("leesOpDeGrond", () => {
  it("geeft het ding terug, netjes ingekort", () => {
    expect(leesOpDeGrond("  the  wooden door ")).toBe("the wooden door");
  });

  it("geeft null als er niets op de grond hoeft, of het antwoord onbruikbaar is", () => {
    expect(leesOpDeGrond("")).toBeNull();
    expect(leesOpDeGrond(undefined)).toBeNull();
    expect(leesOpDeGrond(42)).toBeNull();
    expect(leesOpDeGrond("a".repeat(61))).toBeNull();
  });

  it("zit in het verplichte antwoord, anders weigert de strikte JSON-modus het veld", () => {
    expect(AANWIJZING_SCHEMA.required).toContain("opDeGrond");
  });
});

describe("aanwijzingVraag", () => {
  it("zet de aanwijzing, de personages en het shot erin", () => {
    const vraag = aanwijzingVraag(
      {
        scenes: spec.scenes,
        cast: [{ id: "c2", characterId: "u2", name: "Lilly", role: "", voice: "v", portraitUrl: "https://x/l.png", position: "right", appearance: "a big curly afro" }],
      },
      1, 1, "Het kapsel van het rechter poppetje moet hetzelfde zijn",
    );
    expect(vraag).toContain("scène 2, shot 2");
    expect(vraag).toContain("rechter poppetje");
    expect(vraag).toContain("Lilly: a big curly afro");
  });
});

describe("isIndelingsAanwijzing", () => {
  // Gemeten 19-09-2026: een bewerking verplaatst niets en zet niemand bij zonder de ander
  // te verdubbelen. Zulke aanwijzingen horen naar het opnieuw tekenen.
  it("herkent verplaatsen, groter maken en iemand erbij", () => {
    for (const t of [
      "het doel moet links staan in plaats van rechts",
      "zet Coco erbij, rechts naast Leo",
      "de bal moet groter zijn",
      "haal de tweede schildpad weg",
      "Move the soccer goal to the left side of the image.",
      "Add the green turtle next to the lion.",
    ]) expect(isIndelingsAanwijzing(t)).toBe(true);
  });

  it("laat gewone uiterlijk-aanwijzingen met rust", () => {
    for (const t of [
      "Coco moet zijn rode pet op hebben",
      "Leo moet blij kijken",
      "maak de lucht bewolkt",
      "zijn trui moet groen zijn",
      "Give the turtle a red cap.",
    ]) expect(isIndelingsAanwijzing(t)).toBe(false);
  });
});

// Het model schrijft de aanwijzing om naar het Engels, en gebruikt "add" voor het
// kleinste detail. Die omschrijving mocht niet meer beslissen dat het beeld opnieuw
// getekend wordt: "maak de lucht bewolkt" kwam zo terug met een ander kader en een
// andere achtergrond (gemeten 19-09-2026).
describe("isIndelingsAanwijzing met de Engelse omschrijving erbij", () => {
  it("laat 'add' in de omschrijving het beeld niet hertekenen", () => {
    expect(isIndelingsAanwijzing("maak de lucht bewolkt", "Add several fluffy white clouds across the sky.")).toBe(false);
    expect(isIndelingsAanwijzing("Coco moet zijn fluit vasthouden", "Add the whistle to the turtle's right hand.")).toBe(false);
  });

  it("blijft verplaatsen wél herkennen, ook alleen in de omschrijving", () => {
    expect(isIndelingsAanwijzing("het doel hoort aan de andere kant", "Move the goal to the left side.")).toBe(true);
    expect(isIndelingsAanwijzing("zet Coco erbij", "Draw the turtle beside the lion.")).toBe(true);
  });
});

describe("leesControle", () => {
  it("neemt een bruikbare kijkvraag over", () => {
    expect(leesControle("  Are the lion's eyes  open? ")).toBe("Are the lion's eyes open?");
  });

  it("weigert wat te kort of te lang is om een vraag te zijn", () => {
    expect(leesControle("ja?")).toBeNull();
    expect(leesControle("a".repeat(301))).toBeNull();
    expect(leesControle(null)).toBeNull();
  });

  it("staat in het verplichte antwoord", () => {
    expect(AANWIJZING_SCHEMA.required).toContain("controle");
  });
});

describe("leesKader", () => {
  it("neemt alleen bestaande camerastandpunten over", () => {
    expect(leesKader("close")).toBe("close");
    expect(leesKader("")).toBeNull();
    expect(leesKader("heel dichtbij")).toBeNull();
  });
});

describe("scherpereInstructie", () => {
  it("zet erbij wat er misging en wat er te zien moet zijn", () => {
    const t = scherpereInstructie("Open the lion's eyes.", "Are the lion's eyes open?", "The lion's eyes are closed.");
    expect(t).toContain("Open the lion's eyes.");
    expect(t).toContain("The lion's eyes are closed.");
    expect(t).toContain("Are the lion's eyes open?");
  });
});
