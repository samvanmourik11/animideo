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

describe("eigen script en huisstijl", () => {
  const plan = {
    titel: "x",
    scenes: [
      { tekst: "Ben jij elke maand een avond kwijt aan de lonen?", beeld: "b", kop: "" },
      { tekst: "Bij Loonwijs geef je alleen de uren door.", beeld: "b", kop: "01" },
    ],
    eind: { tekst: "Laat je lonen over aan Loonwijs.", regel1: "Laat je lonen over", regel2: "aan Loonwijs.", knop: "Probeer" },
  };
  const bron = "SCENE 1\nVoice-over: Ben jij elke maand een avond kwijt aan de lonen?\nBeeld: kalender\n\nBij Loonwijs geef je alleen de uren door. Laat je lonen over aan Loonwijs.";

  it("herkent tekst die letterlijk uit het script komt, ook met andere leestekens", async () => {
    const { afwijkingen } = await import("./plan");
    expect(afwijkingen(plan, bron)).toEqual([]);
    expect(afwijkingen(plan, bron.replace("lonen?", "LONEN !"))).toEqual([]);
  });

  it("meldt de scene waar een woord is veranderd, en de eindkaart als 0", async () => {
    const { afwijkingen } = await import("./plan");
    const anders = { ...plan, scenes: [plan.scenes[0], { ...plan.scenes[1], tekst: "Bij Loonwijs geef je enkel de uren door." }], eind: { ...plan.eind, tekst: "Kies voor Loonwijs." } };
    expect(afwijkingen(anders, bron)).toEqual([2, 0]);
  });

  it("kiest de kortste lengte waar de tekst in past", async () => {
    const { lengteVoorWoorden } = await import("./plan");
    expect(lengteVoorWoorden(60)).toBe(30);
    expect(lengteVoorWoorden(120)).toBe(45);
    expect(lengteVoorWoorden(180)).toBe(60);
    // Boven de minuut gaat het verder in minuten, tot tien.
    expect(lengteVoorWoorden(400)).toBe(180);
    expect(lengteVoorWoorden(1700)).toBe(600);
    expect(lengteVoorWoorden(2500)).toBeNull();
  });

  it("vindt het lettertype van een huisstijl terug, anders het standaardlettertype", async () => {
    const { motionFont, STANDAARD_FONT } = await import("./types");
    expect(motionFont("'Montserrat', sans-serif")).toBe("Montserrat");
    expect(motionFont("poppins")).toBe("Poppins");
    expect(motionFont("Helvetica Neue")).toBe(STANDAARD_FONT);
    expect(motionFont(undefined)).toBe(STANDAARD_FONT);
  });

  it("laat alleen beelden van onze eigen opslag toe en nummert ze opnieuw", async () => {
    const oud = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    try {
      const { leesBeelden } = await import("./beelden");
      const goed = "https://abc.supabase.co/storage/v1/object/public/scene-assets/u/creaties/1.jpg";
      const uit = leesBeelden([
        { url: "http://169.254.169.254/latest", doel: "natekenen", uitleg: "x" },
        { url: goed, doel: "onzin", uitleg: "x" },
        { url: goed, doel: "tonen", uitleg: "  ons   team ", vast: true, id: "f9" },
      ]);
      expect(uit).toEqual([{ id: "f1", url: goed, doel: "tonen", uitleg: "ons team", vast: true }]);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = oud;
    }
  });
});

describe("wijzigingen in een controleronde", () => {
  const code = "const a = 1;\nconst b = 2;\nconst c = 2;\n";
  const blok = (zoek: string, nieuw: string) => `<<<<<<< ZOEK\n${zoek}\n=======\n${nieuw}\n>>>>>>> KLAAR`;

  it("leest de blokken en past ze in volgorde toe", async () => {
    const { wijzigingenUit, pasToe } = await import("./animatie");
    const ws = wijzigingenUit(`${blok("const a = 1;", "const a = 5;")}\n\n${blok("const a = 5;\nconst b = 2;", "const a = 5;\nconst b = 3;\nconst d = 4;")}`);
    expect(ws).toHaveLength(2);
    const uit = pasToe(code, ws);
    expect(uit.mis).toEqual([]);
    expect(uit.code).toBe("const a = 5;\nconst b = 3;\nconst d = 4;\nconst c = 2;\n");
  });

  it("slaat een blok over dat niet of vaker dan eens past, en meldt het", async () => {
    const { wijzigingenUit, pasToe } = await import("./animatie");
    const uit = pasToe(code, wijzigingenUit(`${blok("= 2;", "= 9;")}\n${blok("const x = 0;", "")}\n${blok("const c = 2;", "const c = '$1';")}`));
    expect(uit.mis).toHaveLength(2);
    // Een dollarteken in de vervanging blijft letterlijk staan.
    expect(uit.code).toBe("const a = 1;\nconst b = 2;\nconst c = '$1';\n");
  });

  it("een lege vervanging haalt de regel weg", async () => {
    const { wijzigingenUit, pasToe } = await import("./animatie");
    const ws = wijzigingenUit("<<<<<<< ZOEK\nconst b = 2;\n=======\n>>>>>>> KLAAR");
    expect(ws).toEqual([{ zoek: "const b = 2;", nieuw: "" }]);
    expect(pasToe(code, ws).code).toBe("const a = 1;\n\nconst c = 2;\n");
  });
});

describe("lange video's in hoofdstukken", () => {
  const zin = (n: number) => Array.from({ length: n }, (_, i) => `woord${i}`).join(" ");
  const plan = (scenes: number, woorden = 24) => ({
    titel: "t",
    scenes: Array.from({ length: scenes }, () => ({ tekst: zin(woorden), beeld: "b", kop: "" })),
    eind: { tekst: zin(15), regel1: "", regel2: "", knop: "" },
  });

  it("een korte video blijft één hoofdstuk", async () => {
    const { hoofdstukken } = await import("./types");
    expect(hoofdstukken(plan(5))).toEqual([{ van: 0, tot: 5 }]);
  });

  it("een lange video wordt in aansluitende hoofdstukken van ruim een halve minuut verdeeld", async () => {
    const { hoofdstukken } = await import("./types");
    for (const n of [9, 12, 30, 65]) {
      const hs = hoofdstukken(plan(n));
      expect(hs.length).toBeGreaterThan(1);
      expect(hs[0].van).toBe(0);
      expect(hs[hs.length - 1].tot).toBe(n);
      hs.forEach((h, i) => {
        if (i) expect(h.van).toBe(hs[i - 1].tot);
        expect(h.tot - h.van).toBeGreaterThanOrEqual(1);
        expect(h.tot - h.van).toBeLessThanOrEqual(6);
      });
    }
    // Tien minuten (65 scenes van 24 woorden) wordt een stuk of achttien hoofdstukken.
    expect(hoofdstukken(plan(65)).length).toBeGreaterThanOrEqual(15);
    expect(hoofdstukken(plan(65)).length).toBeLessThanOrEqual(22);
  });

  it("de stem van een lange video gaat in een paar opnames, zonder tekst kwijt te raken", async () => {
    const { stemBlokken } = await import("./lang");
    expect(stemBlokken(plan(5))).toHaveLength(1);
    const p = plan(65);
    const blokken = stemBlokken(p);
    expect(blokken.length).toBeGreaterThan(2);
    blokken.forEach((b) => expect(b.length).toBeLessThanOrEqual(2600));
    expect(blokken.join(" ")).toBe([...p.scenes.map((s) => s.tekst), p.eind.tekst].join(" "));
  });

  it("de prijs loopt op met de lengte", async () => {
    const prijzen = MOTION_LENGTES.map((l) => motionCredits(l.sec));
    expect([...prijzen].sort((a, b) => a - b)).toEqual(prijzen);
  });
});
