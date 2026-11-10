import { describe, expect, it } from "vitest";
import { codeUit } from "./animatie";
import { controleerPlan, telWoorden } from "./plan";
import { ernstig, proefTijden, syntaxFout } from "./render";
import { maxWoorden, motionCredits, MOTION_LENGTES } from "./types";

const plan = (woordenPerScene: number, scenes = 3) => ({
  titel: "Test",
  scenes: [...Array(scenes)].map((_, i) => ({ tekst: Array(woordenPerScene).fill("woord").join(" "), beeld: `beeld ${i}`, kop: "" })),
  eind: { tekst: "Bel Testbedrijf vandaag nog.", regel1: "Bel ons", regel2: "vandaag nog", knop: "Bel nu" },
});

describe("het script controleren", () => {
  it("laat een passend script door en telt de woorden", () => {
    const p = controleerPlan(plan(15), 30);
    expect(p.scenes).toHaveLength(3);
    expect(telWoorden(p)).toBe(45 + 4);
  });

  it("weigert een script dat veel te lang is voor de gekozen lengte", () => {
    expect(() => controleerPlan(plan(60), 30)).toThrow(/te lang/);
    // Dezelfde tekst past wel in een video van een minuut.
    expect(() => controleerPlan(plan(60), 60)).not.toThrow();
  });

  it("weigert een script zonder slotzin of met te weinig scenes", () => {
    expect(() => controleerPlan({ ...plan(10), eind: { tekst: "" } }, 30)).toThrow(/slotzin/);
    expect(() => controleerPlan(plan(10, 1), 30)).toThrow(/niet compleet/);
  });

  it("kapt lange velden af in plaats van ze door te laten", () => {
    const p = controleerPlan({ ...plan(10), eind: { tekst: "Kom langs.", regel1: "x".repeat(80), regel2: "", knop: "y".repeat(80) } }, 30);
    expect(p.eind.regel1.length).toBeLessThanOrEqual(34);
    expect(p.eind.knop.length).toBeLessThanOrEqual(30);
  });
});

describe("de code uit het antwoord van Claude halen", () => {
  it("pakt het blok dat window.VIDEO zet", () => {
    expect(codeUit("Hier is hij:\n```js\nwindow.VIDEO = { bouw() {}, teken() {} };\n```\nKlaar.")).toBe("window.VIDEO = { bouw() {}, teken() {} };");
  });

  it("neemt bij meerdere blokken het laatste dat een video is", () => {
    const t = "```js\nwindow.VIDEO = { a: 1 };\n```\ntoch anders:\n```javascript\nwindow.VIDEO = { a: 2 };\n```\n```js\nconst x = 1;\n```";
    expect(codeUit(t)).toBe("window.VIDEO = { a: 2 };");
  });

  it("geeft niets terug bij alleen GOED", () => {
    expect(codeUit("GOED")).toBeNull();
  });
});

describe("fouten wegen", () => {
  it("ziet kapotte code als ernstig en een tekst over de rand niet", () => {
    expect(ernstig("Fout in teken() bij scene s2, t=4.0 s: x is not defined")).toBe(true);
    expect(ernstig("De code is geen geldige JavaScript: Unexpected token")).toBe(true);
    expect(ernstig('Scene s1, t=3 s: De tekst "Hallo" valt (deels) buiten beeld: x 10 tot 300')).toBe(false);
    expect(ernstig("wt('fiets') na 2.0 s: dit woord komt (daarna) niet voor in de voice-over.")).toBe(false);
  });

  it("vindt een schrijffout zonder de code uit te voeren", () => {
    expect(syntaxFout("window.VIDEO = { bouw() {} ")).toMatch(/geen geldige JavaScript/);
    let uitgevoerd = false;
    (globalThis as { __motionTest?: () => void }).__motionTest = () => { uitgevoerd = true; };
    expect(syntaxFout("globalThis.__motionTest();")).toBeNull();
    expect(uitgevoerd).toBe(false);
  });
});

describe("de momenten van de proefbeelden", () => {
  const scenes: [string, number][] = [["s1", 0], ["s2", 8], ["s3", 10], ["eind", 20]];
  const tijden = proefTijden(scenes, 27);

  it("neemt van een lange scene twee beelden en van een korte één", () => {
    expect(tijden.filter((t) => t.scene === "s1")).toHaveLength(2);
    expect(tijden.filter((t) => t.scene === "s2")).toHaveLength(1);
    expect(tijden.filter((t) => t.scene === "eind")).toHaveLength(1);
  });

  it("blijft met elk beeld binnen zijn eigen scene", () => {
    for (const { t, scene } of tijden) {
      const i = scenes.findIndex((s) => s[0] === scene);
      const eind = i + 1 < scenes.length ? scenes[i + 1][1] : 27;
      // 0,3 s: het beeld loopt zoveel voor op de stem.
      expect(t - 0.3).toBeGreaterThanOrEqual(scenes[i][1]);
      expect(t - 0.3).toBeLessThan(eind);
    }
  });
});

describe("de prijs", () => {
  it("loopt op met de lengte en is nooit gratis", () => {
    const prijzen = MOTION_LENGTES.map((l) => motionCredits(l.sec));
    expect(prijzen[0]).toBeGreaterThan(0);
    expect(prijzen[1]).toBeGreaterThan(prijzen[0]);
    expect(prijzen[2]).toBeGreaterThan(prijzen[1]);
  });

  it("geeft een langere video meer woorden", () => {
    expect(maxWoorden(60)).toBe(2 * maxWoorden(30));
  });
});
