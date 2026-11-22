// Proef van de ondertitels op een bestaande video, zonder credits en zonder AI: tekent een
// paar beelden per stijl.
//   OT_ID=<creatie-id-begin> OT_UIT=/tmp/ot npx vitest run --config vitest.bench.config.mts scripts/ondertitels-proef.test.ts
import { test } from "vitest";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

for (const regel of readFileSync(".env.local", "utf8").split("\n")) {
  const m = regel.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

test("ondertitels", async () => {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const { voorProef } = await import("@/lib/motion/regie");
  const { deelWerk } = await import("@/lib/motion/lang");
  const { paginaHtml } = await import("@/lib/motion/pagina");
  const { chromium } = await import("playwright");
  const uit = process.env.OT_UIT ?? "/tmp/ot";
  await mkdir(uit, { recursive: true });
  const { data: rijen } = await createServiceClient().from("creaties").select("*").in("maker", ["motion", "docu"]).eq("status", "klaar").order("created_at", { ascending: false }).limit(60);
  const c = rijen!.find((r) => (process.env.OT_ID ? r.id.startsWith(process.env.OT_ID) : r.maker === "docu" && r.invoer?.voortgang?.werk))!;
  const r = c.invoer;
  const werk = await voorProef.leesWerk(r.voortgang.werk);
  const basis = await voorProef.basisVan(r);
  const d = deelWerk(basis, r.plan, werk.woorden, werk.delen, 0);
  let code = werk.codes[0]!;
  // Een docu heeft de sjablonen van toen in de code; neem de nieuwste.
  if (c.maker === "docu") { const { leesLib } = await import("@/lib/docu/sjablonen"); code = (await leesLib()) + "\n" + code.slice(code.lastIndexOf("window.VIDEO = docuVideo(")); }
  const pagina = c.maker === "docu" ? voorProef.alleenFotos(d.pagina, voorProef.genoemd(code)) : d.pagina;
  const { srt } = await import("@/lib/motion/ondertitels");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path.join(uit, "proef.srt"), srt(werk.woorden, pagina.h > pagina.w));
  console.info("maker", c.maker, c.id);
  const tijden = (process.env.OT_T ?? "3,8,14").split(",").map(Number);
  const browser = await chromium.launch();
  for (const stijl of ["woord", "balk", "klein"] as const) {
    const p = await browser.newPage({ viewport: { width: pagina.w, height: pagina.h } });
    await p.setContent(await paginaHtml({ ...pagina, code, ondertitels: stijl }, { browser: true }));
    await p.waitForFunction("window.READY === true");
    console.info(stijl, await p.evaluate("window.FOUTEN"));
    for (const t of tijden) {
      await p.evaluate(`window.render(${t})`);
      await p.screenshot({ path: path.join(uit, `${stijl}_${t}.jpg`), type: "jpeg", quality: 70 });
    }
    await p.close();
  }
  await browser.close();
}, 10 * 60 * 1000);
