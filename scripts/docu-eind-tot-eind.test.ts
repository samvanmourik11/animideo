// Maakt één docu van begin tot eind, buiten de app om (geen credits, geen bibliotheek):
// onderzoek → feitencontrole → foto's → stem → animatie → video → YouTube-pakket.
// Kost echt geld (onderzoek ±$1,50, tekenen ±$0,15 + $0,01 per seconde, stem centen). Draaien:
//   DOCU_UIT=/tmp/docu DOCU_ONDERWERP="..." npx vitest run --config vitest.bench.config.mts scripts/docu-eind-tot-eind.test.ts
// Met DOCU_HERGEBRUIK=1 worden onderzoek, foto's, stem en code uit de map hergebruikt.
import { test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

for (const regel of readFileSync(".env.local", "utf8").split("\n")) {
  const m = regel.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

test("docu van begin tot eind", async () => {
  const { doeOnderzoek } = await import("@/lib/docu/onderzoek");
  const { zoekFotos } = await import("@/lib/docu/fotos");
  const { planMetFotos } = await import("@/lib/docu/regie");
  const { maakPakket, maakThumbnail, schrijfShort } = await import("@/lib/docu/extras");
  const { DOCU_STEM_EN, fotoCredit } = await import("@/lib/docu/types");
  const { tekenAnimatie, sceneTijden } = await import("@/lib/motion/animatie");
  const { bereidFotos } = await import("@/lib/motion/beelden");
  const { maakStil, monteer, proef, voegStemSamen, FPS } = await import("@/lib/motion/render");
  const { deelWerk, scriptVan, stemBlokken, verdeel } = await import("@/lib/motion/lang");
  const { transcribeWords } = await import("@/lib/openai");
  const { musicTrackUrl } = await import("@/lib/music/library");
  const { fal } = await import("@/lib/fal");
  fal.config({ credentials: process.env.FAL_KEY });

  const uit = process.env.DOCU_UIT ?? "/tmp/docu-test";
  const her = process.env.DOCU_HERGEBRUIK === "1";
  await mkdir(uit, { recursive: true });
  const pad = (n: string) => path.join(uit, n);
  const lengte = (Number(process.env.DOCU_LENGTE) || 180) as 180 | 300 | 600;
  const taal = process.env.DOCU_TAAL === "nl" ? ("nl" as const) : ("en" as const);
  const kanaal = process.env.DOCU_KANAAL ?? "KRONIK";
  const onderwerp = process.env.DOCU_ONDERWERP ?? "The collapse of V&D, the Dutch department store chain";
  const stemId = process.env.DOCU_STEM ?? (taal === "en" ? DOCU_STEM_EN : "rbqBOMK4BPTMGvIB7N8w");
  // Uploads van de foto's komen in een eigen map op de opslag.
  const userId = process.env.DOCU_USER ?? "docu-proef";
  const totaal: Record<string, number> = {};

  let t0 = Date.now();
  const klok = (wat: string) => { console.log(`[${wat}] ${((Date.now() - t0) / 1000).toFixed(0)} s`); t0 = Date.now(); };

  // ── Onderzoek ──
  type O = Awaited<ReturnType<typeof doeOnderzoek>>;
  let o: O;
  if (her && existsSync(pad("onderzoek.json"))) o = JSON.parse(await readFile(pad("onderzoek.json"), "utf8"));
  else {
    o = await doeOnderzoek({ onderwerp, lengte, taal, kanaal }, (s) => console.log(`  onderzoek: ${s}`));
    await writeFile(pad("onderzoek.json"), JSON.stringify(o, null, 2));
    totaal.onderzoek = o.usd;
    Object.assign(totaal, o.usdPerStap ?? {});
  }
  console.log(`${o.plan.scenes.length} scenes, ${o.feiten.length} feiten, controle: ${o.controle.gecontroleerd} nagelopen, ${o.controle.verbeterd.length} verbeterd`);
  for (const v of o.controle.verbeterd) console.log(`  verbeterd scene ${v.scene}: ${v.reden}`);
  klok("onderzoek");

  // ── Foto's ──
  type F = Awaited<ReturnType<typeof zoekFotos>>;
  let f: F;
  if (her && existsSync(pad("fotos.json"))) f = JSON.parse(await readFile(pad("fotos.json"), "utf8"));
  else {
    f = await zoekFotos(userId, o.plan, o.fotoZoek);
    await writeFile(pad("fotos.json"), JSON.stringify(f, null, 2));
    totaal.fotos = f.usd;
  }
  console.log(`${f.fotos.length} foto's van ${o.fotoZoek.filter(Boolean).length} zoektermen:`);
  for (const x of f.fotos) console.log(`  ${x.id} scene ${x.scene}: ${x.wat.slice(0, 60)} — ${fotoCredit(x, taal)}`);
  klok("fotos");

  const plan = planMetFotos(o.plan, f.fotos, taal);
  const beelden = f.fotos.map((x) => ({ id: x.id, url: x.url, doel: "tonen" as const, uitleg: `${x.wat} (${fotoCredit(x, taal)})` }));

  // ── Stem ──
  let stem: Buffer;
  if (her && existsSync(pad("stem.mp3"))) stem = await readFile(pad("stem.mp3"));
  else {
    const blokken = await Promise.all(
      stemBlokken(plan).map(async (text) => {
        const r = await fal.subscribe("fal-ai/elevenlabs/tts/eleven-v3", { input: { text, voice: stemId, language_code: taal, stability: 0.5, similarity_boost: 0.75, speed: 1 } as never });
        return Buffer.from(await (await fetch((r.data as { audio: { url: string } }).audio.url)).arrayBuffer());
      }),
    );
    stem = await voegStemSamen(blokken);
    await writeFile(pad("stem.mp3"), stem);
  }
  const { words } = await transcribeWords(stem, { language: taal });
  klok("stem");

  // ── Animatie, per hoofdstuk alleen de foto's die daar genoemd worden ──
  const fotos = await bereidFotos(beelden);
  const merk = { naam: kanaal, website: "", kleur: "#e3342f", kleur2: "#f3efe6", font: "Plus Jakarta Sans", logo: null };
  const basis = { w: 1920, h: 1080, merk, fotos, stijl: process.env.DOCU_STIJL ?? "archief" };
  const delen = await verdeel(basis, plan, words);
  console.log(`${delen.length} hoofdstukken`);
  const genoemd = (t: string) => new Set([...t.matchAll(/\bf\d+\b/g)].map((m) => m[0]));
  const alleen = <T extends { fotos?: Record<string, unknown> }>(p: T, ids: Set<string>): T => ({ ...p, fotos: Object.fromEntries(Object.entries(p.fotos ?? {}).filter(([id]) => ids.has(id))) });
  const codes: string[] = [];
  totaal.tekenen = 0;
  for (let b = 0; b < delen.length; b += 6) {
    await Promise.all(
      delen.slice(b, b + 6).map(async (_, i) => {
        const k = b + i;
        const naam = `code_${k + 1}.js`;
        if (her && existsSync(pad(naam))) { codes[k] = await readFile(pad(naam), "utf8"); return; }
        const d = deelWerk(basis, plan, words, delen, k);
        const ids = genoemd(d.plan.scenes.map((s) => s.beeld).join(" "));
        const a = await tekenAnimatie({ pagina: alleen(d.pagina, ids), plan: d.plan, plek: d.plek, onderwerp, taal, soort: "verhaal", beelden: beelden.filter((x) => ids.has(x.id)), docu: true });
        codes[k] = a.code;
        totaal.tekenen += a.gebruik.usd;
        await writeFile(pad(naam), a.code);
        if (a.rest.length) console.log(`  rest hoofdstuk ${k + 1}:`, a.rest.slice(0, 3));
      }),
    );
  }
  klok("animatie");

  for (let k = 0; k < delen.length; k++) {
    const d = deelWerk(basis, plan, words, delen, k);
    const p = await proef({ ...alleen(d.pagina, genoemd(codes[k])), code: codes[k] });
    for (const bld of p.beelden) await writeFile(pad(`proef_${String(k + 1).padStart(2, "0")}_${bld.scene}_${bld.t}.jpg`), bld.jpg);
  }

  if (process.env.DOCU_GEEN_VIDEO !== "1") {
    const stillen: Buffer[] = [];
    let n = 0;
    for (let k = 0; k < delen.length; k++) {
      const d = deelWerk(basis, plan, words, delen, k);
      const stil = await maakStil({ ...alleen(d.pagina, genoemd(codes[k])), code: codes[k] }, { beelden: delen[k].beelden, compact: delen.length > 1 });
      stillen.push(stil.mp4); n += stil.beelden;
    }
    const mp4 = await monteer(stillen, n, stem, musicTrackUrl(process.env.DOCU_MUZIEK ?? "piano-drama"));
    await writeFile(pad("video.mp4"), mp4);
    console.log(`video ${(n / FPS).toFixed(0)} s, ${(mp4.length / 1e6).toFixed(1)} MB`);
    klok("video");
  }

  // ── YouTube-pakket ──
  const leeg = await sceneTijden({ ...basis, fotos: {}, woorden: words, script: scriptVan(o.plan) });
  const pk = await maakPakket({ plan: o.plan, feiten: o.feiten, fotos: f.fotos, starts: leeg.scenes.map(([, t]) => t), taal, kanaal });
  totaal.pakket = pk.usd;
  await writeFile(pad("titels.txt"), pk.titels.join("\n"));
  await writeFile(pad("beschrijving.txt"), pk.beschrijving);
  const tf = f.fotos.find((x) => x.id === pk.thumbFoto);
  const thumb = await maakThumbnail({ foto: tf ? Buffer.from(await (await fetch(tf.url)).arrayBuffer()) : null, kop: pk.thumbKop, accent: pk.thumbAccent, kanaal, kleur: "#e3342f" });
  await writeFile(pad("thumbnail.jpg"), thumb);
  const sh = await schrijfShort({ plan: o.plan, fotos: f.fotos, taal, kanaal });
  totaal.short = sh.usd;
  await writeFile(pad("short_plan.json"), JSON.stringify(sh, null, 2));
  klok("pakket");
  await writeFile(pad("kosten.json"), JSON.stringify(totaal, null, 2));
  console.log("kosten (Claude, $):", totaal);
}, 3 * 60 * 60 * 1000);
