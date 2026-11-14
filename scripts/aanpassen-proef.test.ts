// Proef van "video aanpassen" op een bestaande video, buiten de app om: geen credits, geen
// nieuwe rij. Schrijft per punt het beeld vóór en ná, en log.txt met de kosten. Kost echt
// geld (Claude, centen).
//   AANPAS_ID=<creatie> AANPAS_PUNTEN='[{"t":2,"x":0.5,"y":0.5,"tekst":"..."}]' AANPAS_UIT=/tmp/x \
//   npx vitest run --config vitest.bench.config.mts scripts/aanpassen-proef.test.ts
import { test } from "vitest";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

for (const regel of readFileSync(".env.local", "utf8").split("\n")) {
  const m = regel.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

test("video aanpassen", async () => {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const { voorProef } = await import("@/lib/motion/regie");
  const { leesPunten, puntenPerDeel, pasHoofdstukAan, aanpasCredits } = await import("@/lib/motion/aanpassen");
  const { momenten } = await import("@/lib/motion/render");
  const { deelWerk } = await import("@/lib/motion/lang");
  const uit = process.env.AANPAS_UIT ?? "/tmp/aanpas";
  await mkdir(uit, { recursive: true });
  // console.log komt in deze vitest-instelling niet altijd door: ook naar een bestand.
  const regels: string[] = [];
  const log = (t: string) => { regels.push(t); console.info(t); };
  const { data: c } = await createServiceClient().from("creaties").select("*").eq("id", process.env.AANPAS_ID!).single();
  const r = c.invoer;
  const werk = await voorProef.leesWerk(r.voortgang.werk);
  const basis = await voorProef.basisVan(r);
  const punten = leesPunten(JSON.parse(process.env.AANPAS_PUNTEN!));
  const groepen = puntenPerDeel(werk.delen, punten);
  log(`${werk.delen.length} hoofdstukken, punten in ${groepen.size}; prijs ${aanpasCredits(c.maker, groepen.size)} credits`);
  let usd = 0;
  for (const [k, ps] of groepen) {
    const d = deelWerk(basis, r.plan, werk.woorden, werk.delen, k);
    const code = werk.codes[k]!;
    const pagina = c.maker === "docu" ? voorProef.alleenFotos(d.pagina, voorProef.genoemd(code)) : d.pagina;
    const voor = await momenten({ ...pagina, code }, ps);
    const begin = Date.now();
    const a = await pasHoofdstukAan({ pagina, plan: d.plan, code, punten: ps, docu: c.maker === "docu", taal: r.taal === "en" ? "en" : "nl" });
    usd += a.usd;
    log(`hoofdstuk ${k + 1}: $${a.usd.toFixed(3)}, ${Math.round((Date.now() - begin) / 1000)} s`);
    const na = await momenten({ ...pagina, code: a.code }, ps);
    for (let i = 0; i < ps.length; i++) {
      log(`  punt ${ps[i].nr} (${ps[i].t}s, scene ${voor[i].scene}): ${voor[i].wat.join("; ")}`);
      await writeFile(path.join(uit, `punt${ps[i].nr}_voor.jpg`), voor[i].jpg);
      await writeFile(path.join(uit, `punt${ps[i].nr}_na.jpg`), na[i].jpg);
    }
    await writeFile(path.join(uit, `code_${k + 1}_voor.js`), code);
    await writeFile(path.join(uit, `code_${k + 1}_na.js`), a.code);
  }
  log(`totaal $${usd.toFixed(3)}`);
  await writeFile(path.join(uit, "log.txt"), regels.join("\n"));
}, 30 * 60 * 1000);
