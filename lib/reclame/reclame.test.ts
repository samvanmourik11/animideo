import { describe, expect, test, vi } from "vitest";

// De AI-client wil een sleutel bij het laden; deze tests raken hem niet aan.
vi.mock("@/lib/openai", () => ({ openai: {} }));

import { eindkaartDuur, letterKleurOp, regels } from "./montage";
import { leesHtml, merkkleur } from "./pagina";
import { controleerPlan } from "./plan";

describe("regels", () => {
  test("breekt op woordgrenzen en houdt korte woordjes bij het volgende woord", () => {
    expect(regels("Koffie zoals 's ochtends hoort", 18)).toEqual(["Koffie zoals", "'s ochtends hoort"]);
  });
  test("korte tekst blijft één regel", () => {
    expect(regels("Bestel nu", 20)).toEqual(["Bestel nu"]);
  });
  test("hooguit drie regels", () => {
    expect(regels("een twee drie vier vijf zes zeven acht negen tien", 6).length).toBeLessThanOrEqual(3);
  });
});

test("letterkleur volgt de helderheid van de merkkleur", () => {
  expect(letterKleurOp("#1c72ed")).toBe("white");
  expect(letterKleurOp("#ffe066")).toBe("black");
});

test("eindkaart groeit mee met een lange voice-over", () => {
  expect(eindkaartDuur(10, 3)).toBe(2.5);
  expect(eindkaartDuur(17, 3)).toBeCloseTo(2.9);
  expect(eindkaartDuur(40, 3)).toBe(8);
});

describe("leesHtml", () => {
  const url = new URL("https://www.koffiebar.nl/barista-pro");
  test("haalt productgegevens uit de structured data", () => {
    const html = `<html><head><title>Barista Pro | Koffiebar</title>
      <meta name="theme-color" content="#E4572E">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Barista Pro 3000","brand":{"@type":"Brand","name":"Koffiebar"},"description":"Espresso &amp; meer","image":["/img/a.jpg","https://cdn.koffiebar.nl/b.jpg"],"offers":{"@type":"Offer","price":"249.95","priceCurrency":"EUR"}}]}</script>
      </head><body></body></html>`;
    const g = leesHtml(html, url);
    expect(g.naam).toBe("Barista Pro 3000");
    expect(g.merk).toBe("Koffiebar");
    expect(g.omschrijving).toBe("Espresso & meer");
    expect(g.prijs).toMatch(/249,95/);
    expect(g.kleur).toBe("#e4572e");
    expect(g.fotos.slice(0, 2)).toEqual(["https://www.koffiebar.nl/img/a.jpg", "https://cdn.koffiebar.nl/b.jpg"]);
  });
  test("valt terug op de deel-gegevens voor sociale media", () => {
    const html = `<meta property="og:title" content="Wollen deken"><meta content="https://x.nl/d.jpg" property="og:image"><meta property="product:price:amount" content="59">`;
    const g = leesHtml(html, url);
    expect(g.naam).toBe("Wollen deken");
    expect(g.fotos[0]).toBe("https://x.nl/d.jpg");
    expect(g.prijs).toMatch(/59,00/);
  });
});

test("merkkleur negeert grijs en zwart, en neemt de vaakst gebruikte kleur", () => {
  const html = "#333333 #ffffff #eeeeee #2a9d8f #2a9d8f #2a9d8f #e76f51";
  expect(merkkleur(html)).toBe("#2a9d8f");
  expect(merkkleur("#000 #fff #ccc")).toBe("#1c72ed");
});

describe("controleerPlan", () => {
  const shot = { beeld: "A kitchen", beweging: "push in", tekst: "Lekker" };
  test("accepteert een compleet plan", () => {
    const p = controleerPlan({ shots: [shot, shot, shot], voiceover: "Proef het verschil.", eindtekst: "Bestel nu" });
    expect(p.shots).toHaveLength(3);
  });
  test("weigert te weinig shots of een te lange voice-over", () => {
    expect(() => controleerPlan({ shots: [shot], voiceover: "x" })).toThrow();
    expect(() => controleerPlan({ shots: [shot, shot, shot], voiceover: "woord ".repeat(60) })).toThrow(/te lang/);
  });
});
