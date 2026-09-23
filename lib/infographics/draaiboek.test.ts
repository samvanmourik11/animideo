import { describe, it, expect } from "vitest";
import { lijktOpDraaiboek, staatInDocument, keurLezing } from "./draaiboek";

const DRAAIBOEK = `4. Shotlijst
# | Tijd | Beeld | Voice-over | Tekst in beeld
1 | 0:00–0:04 | Camera glijdt door een kantoor. | Uw kantoor is schoon. | —`;

describe("lijktOpDraaiboek", () => {
  it("herkent een draaiboek met shotlijst en tijdcodes", () => {
    expect(lijktOpDraaiboek(DRAAIBOEK)).toBe(true);
  });

  it("ziet gewone voice-overtekst niet aan voor een draaiboek", () => {
    expect(lijktOpDraaiboek("Uw kantoor is schoon. De vloer is gestofzuigd.\n\nMaar de raambekleding niet.")).toBe(false);
  });
});

describe("staatInDocument", () => {
  it("vindt tekst terug ondanks andere aanhalingstekens en spaties", () => {
    expect(staatInDocument('"Uw kantoor  is schoon."', "Uw kantoor is schoon. De vloer is gestofzuigd.")).toBe(true);
  });

  it("herkent een herschreven zin", () => {
    expect(staatInDocument("Uw kantoor is netjes.", "Uw kantoor is schoon.")).toBe(false);
  });

  it("rekent een leeg shot niet af", () => {
    expect(staatInDocument("", "wat dan ook")).toBe(true);
  });
});

describe("keurLezing", () => {
  const doc = "Uw kantoor is schoon.";

  it("markeert een verzonnen voice-over", () => {
    const lezing = keurLezing(
      { isDraaiboek: true, titel: "Test", opmerkingen: [], scenes: [
        { voiceover: "Uw kantoor is schoon.", beeld: "Kantoor", beweging: "", tekstInBeeld: "—" },
        { voiceover: "Dit stond er niet.", beeld: "Iets", beweging: "", tekstInBeeld: "" },
      ] },
      doc
    )!;
    expect(lezing.scenes.map((s) => s.letterlijk)).toEqual([true, false]);
    // Een streepje in "tekst in beeld" betekent: geen tekst.
    expect(lezing.scenes[0].tekstInBeeld).toBe("");
  });

  it("gooit shots zonder tekst én zonder beeld weg", () => {
    const lezing = keurLezing(
      { isDraaiboek: true, titel: "", opmerkingen: [], scenes: [
        { voiceover: "Uw kantoor is schoon.", beeld: "", beweging: "", tekstInBeeld: "" },
        { voiceover: "—", beeld: "—", beweging: "", tekstInBeeld: "" },
      ] },
      doc
    )!;
    expect(lezing.scenes).toHaveLength(1);
  });

  it("geeft niets terug als er geen bruikbare shots zijn", () => {
    expect(keurLezing({ scenes: [] }, doc)).toBeNull();
    expect(keurLezing(null, doc)).toBeNull();
  });
});

describe("regieaanwijzingen", () => {
  it("laat tekst tussen haakjes niet voorlezen", () => {
    const lezing = keurLezing(
      { isDraaiboek: true, titel: "", opmerkingen: [], scenes: [
        { voiceover: "(muziek loopt uit)", beeld: "Endcard met logo", beweging: "", tekstInBeeld: "" },
      ] },
      "Endcard: logo op rustige achtergrond. (muziek loopt uit)"
    )!;
    expect(lezing.scenes[0].voiceover).toBe("");
    expect(lezing.scenes[0].beeld).toBe("Endcard met logo");
  });
});
