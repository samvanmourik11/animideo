import { describe, it, expect } from "vitest";
import { aanwijzingContext, aanwijzingVraag } from "./beeld-aanwijzing";
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
