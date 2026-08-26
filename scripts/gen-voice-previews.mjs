// Eenmalig: genereert per stem een korte preview-mp3 en zet die in
// public/voice-previews/<id>.mp3. Daarna kan de tool de stem laten horen zonder
// telkens (betaalde) TTS te genereren.
//
//   node scripts/gen-voice-previews.mjs
//
// Vereist FAL_KEY in .env.local. Bestaande previews worden overgeschreven.

import { fal } from "@fal-ai/client";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// .env.local handmatig inlezen (geen dotenv-dependency nodig).
async function loadEnv() {
  try {
    const raw = await readFile(join(root, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

// Lijst met de hand bijgehouden, maar wél compleet: hij liep achter op
// lib/infographics/story-voices.ts, waardoor de Vlaamse stemmen nooit een preview
// kregen. Kinderstemmen krijgen een eigen zin — een kind dat "ik vertel jouw
// verhaal rustig en helder" zegt klinkt als een volwassene in een kinderlijf.
const VOLWASSEN = "Hoi! Zo klinkt mijn stem. Ik vertel jouw verhaal rustig, helder en met een glimlach.";
const KIND = "Hoi! Zo klinkt mijn stem. Kom je mee op avontuur? Het wordt echt heel erg leuk!";

const VOICES = [
  ["Charlotte", VOLWASSEN], ["Sarah", VOLWASSEN], ["Daniel", VOLWASSEN], ["George", VOLWASSEN],
  // Vlaams
  ["02TPKkY2rZbgnKFIPrT9", VOLWASSEN], ["Yv0oyZ3obP9foTH7emqG", VOLWASSEN], ["AgeYjqDIfXtkcA3mOcsH", VOLWASSEN],
  // Kinderstemmen
  ["5krdMTA5HonvWAlY2vSx", KIND], ["ihKwLOjVUMG4lgUI6meZ", KIND], ["XjGYkUkzth8BPs29fmcV", KIND],
  ["EeQEodFZVtBkjtgK3HBc", KIND], ["hO2yZ8lxM3axUxL8OeKX", KIND], ["0luPAj5RsdhmnkZaiYcb", KIND],
];

async function main() {
  await loadEnv();
  if (!process.env.FAL_KEY) throw new Error("FAL_KEY ontbreekt in .env.local");
  fal.config({ credentials: process.env.FAL_KEY });

  const outDir = join(root, "public", "voice-previews");
  await mkdir(outDir, { recursive: true });

  for (const [voice, tekst] of VOICES) {
    process.stdout.write(`Genereren: ${voice}… `);
    const result = await fal.subscribe("fal-ai/elevenlabs/tts/eleven-v3", {
      input: {
        text: tekst,
        voice,
        language_code: "nl",
        stability: 0.5,
        similarity_boost: 0.75,
        speed: 1,
      },
    });
    const url = result?.data?.audio?.url;
    if (!url) throw new Error(`geen audio voor ${voice}`);
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    await writeFile(join(outDir, `${voice}.mp3`), buf);
    console.log(`ok (${(buf.length / 1024).toFixed(0)} kB)`);
  }
  console.log("\nKlaar. Previews staan in public/voice-previews/");
}

main().catch((e) => {
  console.error("Mislukt:", e.message);
  process.exit(1);
});
