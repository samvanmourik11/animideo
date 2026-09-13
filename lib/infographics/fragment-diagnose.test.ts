import { describe, it, expect } from "vitest";
import { leesDiagnose } from "./fragment-diagnose";

describe("leesDiagnose", () => {
  it("neemt een fout in het bronbeeld over, met aanwijzing", () => {
    const d = leesDiagnose(
      { fouten: ["Lilly staat er twee keer in"], opnieuw: "beeld", beeldAanwijzing: "Lilly appears once, on the right.", bewegingAanwijzing: "Oma talks calmly." },
      true,
    );
    expect(d).toEqual({
      fouten: ["Lilly staat er twee keer in"],
      opnieuw: "beeld",
      beeldAanwijzing: "Lilly appears once, on the right.",
      bewegingAanwijzing: "Oma talks calmly.",
    });
  });

  it("houdt het beeld als alleen de beweging fout is, en laat dan geen beeldaanwijzing door", () => {
    const d = leesDiagnose({ fouten: ["mond beweegt niet"], opnieuw: "beweging", beeldAanwijzing: "iets", bewegingAanwijzing: "Tyrell talks clearly." }, true);
    expect(d.opnieuw).toBe("beweging");
    expect(d.beeldAanwijzing).toBe("");
  });

  it("maakt zonder bronbeeld altijd een nieuw beeld", () => {
    expect(leesDiagnose({ opnieuw: "beweging" }, false).opnieuw).toBe("beeld");
  });

  it("valt veilig terug bij een onbruikbaar antwoord", () => {
    expect(leesDiagnose("onzin", true)).toEqual({ fouten: [], opnieuw: "beweging", beeldAanwijzing: "", bewegingAanwijzing: "" });
    expect(leesDiagnose({ opnieuw: "alles", fouten: [3, "", "echt fout"] }, true)).toEqual({
      fouten: ["echt fout"], opnieuw: "beweging", beeldAanwijzing: "", bewegingAanwijzing: "",
    });
  });
});
