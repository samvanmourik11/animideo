// Tekent proefbeelden van een motion graphics-video zonder stem of Claude: de woordtijden
// worden verzonnen (0,38 s per woord). Handig om de bouwstenen en het voorbeeld te testen.
//   MOTION_CODE=public/motion/voorbeeld.js MOTION_UIT=/tmp/uit npx vitest run --config vitest.bench.config.mts scripts/motion-proef.test.ts
import { test } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { proef } from "@/lib/motion/render";
import { logoVanBuffer } from "@/lib/motion/beelden";

const SCRIPT: [string, string][] = process.env.MOTION_SCRIPT
  ? JSON.parse(process.env.MOTION_SCRIPT)
  : [
      ["s1", "Ken je dat? De telefoon gaat, maar je staat net te knippen. Weer een gemiste afspraak."],
      ["s2", "Met online afspreken kiezen klanten zelf een moment. Dag en nacht, zonder dat jij hoeft op te nemen."],
      ["s3", "Je agenda loopt vanzelf vol, en klanten krijgen automatisch een herinnering. Zo komt bijna iedereen opdagen."],
      ["eind", "Benieuwd wat het jou oplevert? Kapsalon Knip laat het je graag zien."],
    ];

test("proefbeelden", async () => {
  const code = await readFile(process.env.MOTION_CODE ?? "public/motion/voorbeeld.js", "utf8");
  const uit = process.env.MOTION_UIT ?? "/tmp/motion-proef";
  await mkdir(uit, { recursive: true });
  let t = 0;
  const woorden = SCRIPT.flatMap(([, tekst]) => tekst.split(/\s+/).map((word) => { const w = { word, start: +t.toFixed(2), end: +(t + 0.3).toFixed(2) }; t += /[.?!]$/.test(word) ? 0.75 : 0.38; return w; }));
  const staand = process.env.MOTION_STAAND === "1";
  const r = await proef({
    w: staand ? 1080 : 1920, h: staand ? 1920 : 1080, woorden, script: SCRIPT, code,
    merk: {
      naam: process.env.MOTION_NAAM ?? "Kapsalon Knip", website: "kapsalonknip.nl", kleur: process.env.MOTION_KLEUR ?? "#7b3ff2", kleur2: "#ffc21a",
      font: process.env.MOTION_FONT,
      // MOTION_LOGO: pad naar een logobestand. MOTION_FOTO: pad naar een foto, beschikbaar als 'f1'.
      logo: process.env.MOTION_LOGO ? await logoVanBuffer(await readFile(process.env.MOTION_LOGO)) : null,
    },
    fotos: process.env.MOTION_FOTO
      ? await (async () => {
          const { data, info } = await sharp(await readFile(process.env.MOTION_FOTO!)).jpeg().toBuffer({ resolveWithObject: true });
          return { f1: { src: `data:image/jpeg;base64,${data.toString("base64")}`, w: info.width, h: info.height } };
        })()
      : undefined,
  });
  console.log("scenes", JSON.stringify(r.scenes), "einde", r.einde);
  console.log("fouten", JSON.stringify(r.fouten, null, 1)); await writeFile(path.join(uit, "fouten.json"), JSON.stringify(r.fouten, null, 1));
  for (const b of r.beelden) await writeFile(path.join(uit, `${b.scene}_${b.t}.jpg`), b.jpg);
});
