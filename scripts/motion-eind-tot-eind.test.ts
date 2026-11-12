// Maakt één motion graphics-video van begin tot eind, buiten de app om (geen credits, geen
// bibliotheek): script → stem → woordtijden → animatie met controlerondes → video.
// Kost echt geld (Claude ±$1-2, stem een paar cent). Draaien:
//   MOTION_UIT=/tmp/uit npx vitest run --config vitest.bench.config.mts scripts/motion-eind-tot-eind.test.ts
// Met MOTION_HERGEBRUIK=1 worden script, stem en code uit de map hergebruikt als ze er staan.
import { test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

for (const regel of readFileSync(".env.local", "utf8").split("\n")) {
  const m = regel.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

test("motion graphics van begin tot eind", async () => {
  const { schrijfPlan } = await import("@/lib/motion/plan");
  const { tekenAnimatie } = await import("@/lib/motion/animatie");
  const { maakStil, monteer, proef, voegStemSamen, FPS } = await import("@/lib/motion/render");
  const { deelWerk, stemBlokken, verdeel } = await import("@/lib/motion/lang");
  const { transcribeWords } = await import("@/lib/openai");
  const { musicTrackUrl } = await import("@/lib/music/library");
  const { fal } = await import("@/lib/fal");
  fal.config({ credentials: process.env.FAL_KEY });

  const uit = process.env.MOTION_UIT ?? "/tmp/motion-test";
  const her = process.env.MOTION_HERGEBRUIK === "1";
  await mkdir(uit, { recursive: true });
  const pad = (n: string) => path.join(uit, n);
  const staand = process.env.MOTION_STAAND === "1";
  const lengte = (Number(process.env.MOTION_LENGTE) || 30) as 30 | 45 | 60 | 120 | 180 | 300 | 600;
  const taal = process.env.MOTION_TAAL === "en" ? ("en" as const) : ("nl" as const);
  const bedrijf = process.env.MOTION_NAAM ?? "Loonwijs";
  const onderwerp =
    process.env.MOTION_ONDERWERP ??
    "Leg uit hoe Loonwijs de salarisadministratie voor kleine bedrijven overneemt. De ondernemer geeft de gewerkte uren door in de app, wij maken de loonstroken en doen de loonaangifte bij de Belastingdienst. Het kost € 7,50 per medewerker per maand, zonder opstartkosten. Voor ondernemers met 1 tot 25 medewerkers die nu elke maand een avond kwijt zijn aan de lonen.";
  const merk = { naam: bedrijf, website: process.env.MOTION_SITE ?? "loonwijs.nl", kleur: process.env.MOTION_KLEUR ?? "#1c72ed", kleur2: process.env.MOTION_KLEUR2 ?? "#ffc21a" };

  let t0 = Date.now();
  const klok = (wat: string) => { console.log(`[${wat}] ${((Date.now() - t0) / 1000).toFixed(0)} s`); t0 = Date.now(); };

  const plan = her && existsSync(pad("plan.json")) ? JSON.parse(await readFile(pad("plan.json"), "utf8")) : (await schrijfPlan({ onderwerp, bedrijf, lengte, staand, eigenScript: process.env.MOTION_EIGEN_SCRIPT === "1", taal })).plan;
  await writeFile(pad("plan.json"), JSON.stringify(plan, null, 2));
  klok("script");
  // Een lange video wordt in een paar opnames ingesproken, geknipt op een hoofdstukwissel.
  let stem: Buffer;
  if (her && existsSync(pad("stem.mp3"))) stem = await readFile(pad("stem.mp3"));
  else {
    const blokken = await Promise.all(
      stemBlokken(plan).map(async (text) => {
        const r = await fal.subscribe("fal-ai/elevenlabs/tts/eleven-v3", {
          input: { text, voice: process.env.MOTION_STEM ?? "rbqBOMK4BPTMGvIB7N8w", language_code: taal, stability: 0.5, similarity_boost: 0.75, speed: 1 } as never,
        });
        return Buffer.from(await (await fetch((r.data as { audio: { url: string } }).audio.url)).arrayBuffer());
      }),
    );
    console.log(`stem in ${blokken.length} opname(s)`);
    stem = await voegStemSamen(blokken);
    await writeFile(pad("stem.mp3"), stem);
  }
  klok("stem");
  const { words } = await transcribeWords(stem, { language: taal });
  await writeFile(pad("woorden.json"), JSON.stringify(words));
  klok("woordtijden");

  const basis = { w: staand ? 1080 : 1920, h: staand ? 1920 : 1080, merk, stijl: process.env.MOTION_STIJL || null };
  const delen = await verdeel(basis, plan, words);
  await writeFile(pad("delen.json"), JSON.stringify(delen, null, 1));
  console.log(`${delen.length} hoofdstuk(ken):`, delen.map((d) => `${d.van + 1}-${d.tot} @${d.start.toFixed(1)}s`).join("  "));
  // MOTION_START_CODE: een bestaand ontwerp alleen laten nakijken (om controlemodellen te vergelijken).
  const startCode = process.env.MOTION_START_CODE ? await readFile(process.env.MOTION_START_CODE, "utf8") : undefined;
  const tegelijk = Number(process.env.MOTION_TEGELIJK) || 6;
  const codes: string[] = [];
  const totaal = { usd: 0, usdOntwerp: 0, usdControle: 0, rondes: 0, sec: 0, perDeel: [] as unknown[] };
  for (let b = 0; b < delen.length; b += tegelijk) {
    await Promise.all(
      delen.slice(b, b + tegelijk).map(async (_, i) => {
        const k = b + i;
        const naam = delen.length > 1 ? `code_${k + 1}.js` : "code.js";
        if (her && existsSync(pad(naam))) { codes[k] = await readFile(pad(naam), "utf8"); return; }
        const d = deelWerk(basis, plan, words, delen, k);
        const debug = process.env.MOTION_DEBUG_DIR;
        const a = await tekenAnimatie({ pagina: d.pagina, plan: d.plan, plek: d.plek, onderwerp, startCode, taal }, (w) => console.log(`  claude ${k + 1}:`, w));
        void debug;
        codes[k] = a.code;
        await writeFile(pad(naam), a.code);
        totaal.usd += a.gebruik.usd; totaal.usdOntwerp += a.gebruik.usdOntwerp ?? 0; totaal.usdControle += a.gebruik.usdControle ?? 0; totaal.rondes += a.gebruik.rondes; totaal.sec += a.gebruik.sec ?? 0;
        totaal.perDeel.push({ k: k + 1, ...a.gebruik, rest: a.rest, einde: a.einde });
      }),
    );
  }
  if (totaal.rondes) await writeFile(pad("gebruik.json"), JSON.stringify(totaal, null, 2));
  klok("animatie");

  for (let k = 0; k < delen.length; k++) {
    const d = deelWerk(basis, plan, words, delen, k);
    const p = await proef({ ...d.pagina, code: codes[k] });
    for (const bld of p.beelden) await writeFile(pad(`proef_${String(k + 1).padStart(2, "0")}_${bld.scene}_${bld.t}.jpg`), bld.jpg);
    if (p.fouten.length) console.log(`fouten eindversie hoofdstuk ${k + 1}`, JSON.stringify(p.fouten));
  }
  klok("proefbeelden");

  if (process.env.MOTION_GEEN_VIDEO === "1") return;
  const stillen: Buffer[] = [];
  let beelden = 0, renderMs = 0;
  for (let k = 0; k < delen.length; k++) {
    const d = deelWerk(basis, plan, words, delen, k);
    const stil = await maakStil({ ...d.pagina, code: codes[k] }, { beelden: delen[k].beelden, compact: delen.length > 1 });
    stillen.push(stil.mp4); beelden += stil.beelden; renderMs += stil.renderMs;
  }
  const mp4 = await monteer(stillen, beelden, stem, musicTrackUrl(process.env.MOTION_MUZIEK ?? "upbeat-corporate-vlog"));
  await writeFile(pad("video.mp4"), mp4);
  await writeFile(pad("video.json"), JSON.stringify({ seconden: beelden / FPS, renderSec: Math.round(renderMs / 1000), mb: +(mp4.length / 1e6).toFixed(1) }));
  klok("video");
}, 3 * 60 * 60 * 1000);
