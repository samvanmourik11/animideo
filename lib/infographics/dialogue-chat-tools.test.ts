import { describe, it, expect } from "vitest";
import { toonDraaiboek } from "./dialogue-chat-tools";
import { VERTELLER_ID } from "./dialogue-schema";

// Het draaiboek zoals elke vervolgstap het te zien krijgt. Wat hier niet staat, kan
// een model ook niet bewaren: een actiebeeld met een vertellerzin erover stond hier
// als "geen gesproken tekst", en de samenhangcontrole gaf daarna alle
// vertellerzinnen terug in de mond van de personages.

const cast = [
  { id: "char-1", name: "Tyrell", role: "kleinzoon", position: "left" },
  { id: "char-2", name: "Oma", role: "oma", position: "right" },
];

describe("toonDraaiboek", () => {
  it("laat bij een actiebeeld met een stem zien wie er praat en wat", () => {
    const tekst = toonDraaiboek(cast, [{
      setting: "Fort Zeelandia", deel: 5, licht: "dag",
      lines: [
        { kind: "actie", characterId: VERTELLER_ID, text: "Hun eerste stop was Fort Zeelandia.", emotion: "", actie: "A wide view of the fort." },
        { kind: "actie", characterId: "char-1", text: "", emotion: "", actie: "Tyrell touches an old cannon.", seconden: 3 },
        { characterId: "char-2", text: "Dit fort is heel oud.", emotion: "neutraal" },
      ],
    }]);
    expect(tekst).toContain("Verteller [verteller] spreekt eroverheen");
    expect(tekst).toContain("gesproken: Hun eerste stop was Fort Zeelandia.");
    expect(tekst).toContain("[ACTIEBEELD, 3s, geen gesproken tekst] Tyrell touches an old cannon.");
    expect(tekst).toContain("Oma [char-2] (neutraal): Dit fort is heel oud.");
  });

  it("zet het deel en het licht bij de scène, zodat een vervolgstap ze kan overnemen", () => {
    const tekst = toonDraaiboek(cast, [{ setting: "a kitchen", deel: 2, licht: "nacht", lines: [] }]);
    expect(tekst).toContain("SCÈNE 1 — deel 2 — licht: nacht — omgeving: a kitchen");
  });
});
