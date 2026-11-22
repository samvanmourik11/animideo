// Schetsbeelden proberen zonder app: SCHETS_UIT=/tmp/s npx vitest run --config vitest.bench.config.mts scripts/schets-proef.test.ts
import { test } from "vitest";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const plan = {
  titel: "Eiffeltoren",
  scenes: [
    { tekst: "De Eiffeltoren had een vervaldatum. In 1909 mocht hij gesloopt worden.", beeld: "Silhouet van de Eiffeltoren in het midden van het beeld. Op 'vervaldatum' verschijnt een label aan de top met '1909'. Op 'gesloopt' slaat een rode stempel 'SLOOP' schuin over de toren.", kop: "" },
    { tekst: "Hij werd gebouwd voor de Wereldtentoonstelling van 1889 in Parijs. Gustave Eiffel kreeg een vergunning voor twintig jaar.", beeld: "De toren bouwt zich laag voor laag op, met '1889' eronder. Op 'twintig jaar' verschijnt een tijdlijn van 1889 naar 1909.", kop: "Tijdelijk" },
    { tekst: "Kunstenaars noemden hem lelijk. Ze protesteerden per brief.", beeld: "Tekstballonnen 'Lelijk!' en 'Monster!' rond de toren, een teller met duimpjes omlaag.", kop: "Gehaat" },
    { tekst: "Eiffel zocht een reden om hem te houden. Hij liet er proeven met radio doen.", beeld: "Een antenne op de top zendt golven uit. Label 'Radio'.", kop: "De redding" },
  ],
  eind: { tekst: "Zo werd een tijdelijke attractie het symbool van Parijs.", regel1: "Van tijdelijk", regel2: "tot icoon", knop: "Volg voor meer" },
};

test("schetsen", async () => {
  const { schetsPagina } = await import("@/lib/motion/schets");
  const { chromium } = await import("playwright");
  const uit = process.env.SCHETS_UIT ?? "/tmp/schets";
  await mkdir(uit, { recursive: true });
  const browser = await chromium.launch();
  for (const [stijl, formaat] of [["", "16:9"], ["", "9:16"], ["prentenboek", "16:9"], ["nacht", "16:9"]] as const) {
    const r = await schetsPagina({ plan, formaat, stijl, kleur: "#1c72ed", kleur2: "#ffc21a", font: "Plus Jakarta Sans", bedrijf: "", website: "" });
    const p = await browser.newPage({ viewport: { width: r.w, height: r.h } });
    await p.setContent(r.html);
    await p.waitForFunction("window.READY === true");
    const fouten = await p.evaluate("window.FOUTEN");
    if ((fouten as string[]).length) console.error(stijl, fouten);
    for (let i = 0; i < r.tijden.length; i++) {
      await p.evaluate(`window.render(${r.tijden[i]})`);
      await p.screenshot({ path: path.join(uit, `${stijl || "standaard"}_${formaat.replace(":", "x")}_${i + 1}.jpg`), type: "jpeg", quality: 70 });
    }
    await p.close();
  }
  await browser.close();
}, 300000);
