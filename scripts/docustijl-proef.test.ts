// Een bestaande docu in een andere docu-stijl tekenen (gratis, geen AI):
//   STIJL_UIT=/tmp/s npx vitest run --config vitest.bench.config.mts scripts/docustijl-proef.test.ts
import { test } from "vitest";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
for (const regel of readFileSync(".env.local", "utf8").split("\n")) { const m = regel.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

test("docu-stijlen", async () => {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const { voorProef } = await import("@/lib/motion/regie");
  const { deelWerk } = await import("@/lib/motion/lang");
  const { paginaHtml } = await import("@/lib/motion/pagina");
  const { leesLib } = await import("@/lib/docu/sjablonen");
  const { chromium } = await import("playwright");
  const uit = process.env.STIJL_UIT ?? "/tmp/docustijl";
  await mkdir(uit, { recursive: true });
  const { data } = await createServiceClient().from("creaties").select("*").eq("maker", "docu").eq("status", "klaar").order("created_at", { ascending: false }).limit(5);
  const c = data!.find((r) => r.invoer?.voortgang?.werk)!;
  const werk = await voorProef.leesWerk(c.invoer.voortgang.werk);
  const tijden = (process.env.STIJL_T ?? "6,20,40,60").split(",").map(Number);
  const browser = await chromium.launch();
  for (const stijl of ["archief", "krant", "truecrime"]) {
    const basis = await voorProef.basisVan({ ...c.invoer, stijl });
    const d = deelWerk(basis, c.invoer.plan, werk.woorden, werk.delen, 0);
    let code = werk.codes[0]!;
    code = (await leesLib()) + "\n" + code.slice(code.lastIndexOf("window.VIDEO = docuVideo("));
    const pagina = voorProef.alleenFotos(d.pagina, voorProef.genoemd(code));
    const p = await browser.newPage({ viewport: { width: pagina.w, height: pagina.h } });
    await p.setContent(await paginaHtml({ ...pagina, code }, { browser: true }));
    await p.waitForFunction("window.READY === true");
    for (const t of tijden) {
      await p.evaluate(`window.render(${t})`);
      await p.screenshot({ path: path.join(uit, `${stijl}_${t}.jpg`), type: "jpeg", quality: 70 });
    }
    await p.close();
  }
  await browser.close();
}, 300000);
