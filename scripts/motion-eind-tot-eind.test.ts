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
  const { maakVideo, proef } = await import("@/lib/motion/render");
  const { transcribeWords } = await import("@/lib/openai");
  const { musicTrackUrl } = await import("@/lib/music/library");
  const { fal } = await import("@/lib/fal");
  fal.config({ credentials: process.env.FAL_KEY });

  const uit = process.env.MOTION_UIT ?? "/tmp/motion-test";
  const her = process.env.MOTION_HERGEBRUIK === "1";
  await mkdir(uit, { recursive: true });
  const pad = (n: string) => path.join(uit, n);
  const staand = process.env.MOTION_STAAND === "1";
  const lengte = (Number(process.env.MOTION_LENGTE) || 30) as 30 | 45 | 60;
  const bedrijf = process.env.MOTION_NAAM ?? "Loonwijs";
  const onderwerp =
    process.env.MOTION_ONDERWERP ??
    "Leg uit hoe Loonwijs de salarisadministratie voor kleine bedrijven overneemt. De ondernemer geeft de gewerkte uren door in de app, wij maken de loonstroken en doen de loonaangifte bij de Belastingdienst. Het kost € 7,50 per medewerker per maand, zonder opstartkosten. Voor ondernemers met 1 tot 25 medewerkers die nu elke maand een avond kwijt zijn aan de lonen.";
  const merk = { naam: bedrijf, website: process.env.MOTION_SITE ?? "loonwijs.nl", kleur: process.env.MOTION_KLEUR ?? "#1c72ed", kleur2: process.env.MOTION_KLEUR2 ?? "#ffc21a" };

  let t0 = Date.now();
  const klok = (wat: string) => { console.log(`[${wat}] ${((Date.now() - t0) / 1000).toFixed(0)} s`); t0 = Date.now(); };

  const plan = her && existsSync(pad("plan.json")) ? JSON.parse(await readFile(pad("plan.json"), "utf8")) : await schrijfPlan({ onderwerp, bedrijf, lengte, staand });
  await writeFile(pad("plan.json"), JSON.stringify(plan, null, 2));
  klok("script");
  const script: [string, string][] = [...plan.scenes.map((s: { tekst: string }, k: number): [string, string] => [`s${k + 1}`, s.tekst]), ["eind", plan.eind.tekst]];

  let stem: Buffer;
  if (her && existsSync(pad("stem.mp3"))) stem = await readFile(pad("stem.mp3"));
  else {
    const r = await fal.subscribe("fal-ai/elevenlabs/tts/eleven-v3", {
      input: { text: script.map(([, t]) => t).join(" "), voice: "rbqBOMK4BPTMGvIB7N8w", language_code: "nl", stability: 0.5, similarity_boost: 0.75, speed: 1 } as never,
    });
    stem = Buffer.from(await (await fetch((r.data as { audio: { url: string } }).audio.url)).arrayBuffer());
    await writeFile(pad("stem.mp3"), stem);
  }
  klok("stem");
  const { words } = await transcribeWords(stem, { language: "nl" });
  await writeFile(pad("woorden.json"), JSON.stringify(words));
  klok("woordtijden");

  const pagina = { w: staand ? 1080 : 1920, h: staand ? 1920 : 1080, woorden: words, script, merk };
  let code: string;
  if (her && existsSync(pad("code.js"))) code = await readFile(pad("code.js"), "utf8");
  else {
    const a = await tekenAnimatie({ pagina, plan, onderwerp }, (w) => console.log("  claude:", w));
    code = a.code;
    await writeFile(pad("code.js"), code);
    await writeFile(pad("gebruik.json"), JSON.stringify({ ...a.gebruik, rest: a.rest, einde: a.einde }, null, 2));
    console.log("gebruik", JSON.stringify(a.gebruik), "rest", JSON.stringify(a.rest));
  }
  klok("animatie");

  const p = await proef({ ...pagina, code });
  for (const b of p.beelden) await writeFile(pad(`proef_${b.scene}_${b.t}.jpg`), b.jpg);
  console.log("fouten eindversie", JSON.stringify(p.fouten));
  klok("proefbeelden");

  if (process.env.MOTION_GEEN_VIDEO === "1") return;
  const v = await maakVideo({ ...pagina, code, stem, muziekUrl: musicTrackUrl(process.env.MOTION_MUZIEK ?? "upbeat-corporate-vlog") });
  await writeFile(pad("video.mp4"), v.mp4);
  console.log(`video ${v.seconden.toFixed(1)} s, gemaakt in ${(v.renderMs / 1000).toFixed(0)} s, ${(v.mp4.length / 1e6).toFixed(1)} MB`);
  klok("video");
});
