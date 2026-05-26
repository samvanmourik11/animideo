// Upload style-pack referenties naar de Supabase `style-refs` bucket.
//
// Per pack mag de bron ofwel een ZIP zijn ofwel een gewone folder op je
// Desktop. De PNG's worden alfabetisch gesorteerd (= chronologisch op
// screenshot-naam) en geüpload als `style-refs/<slug>/01.png`, `02.png`, …
// Opnieuw draaien overschrijft (upsert), dus dit is idempotent.
//
// Voor 3D Pixar maak je zelf een folder `~/Desktop/3D Pixar/` en zet daar
// je Pixar-referenties (PNG's) in. Voor de andere packs gebruik je de ZIP's
// die je al hebt.
//
// Usage: node scripts/upload-style-packs.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdtempSync, rmSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir, homedir } from "node:os";
import { execSync } from "node:child_process";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE env vars in .env.local");

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Slug = URL-pad in de bucket (matcht `slug` in lib/style-packs.ts).
// `zip` of `folder` op ~/Desktop — wat van toepassing is.
const PACKS = [
  { slug: "kurzgezagt",  zip:    "Kurzgezagt Stijl.zip" },
  { slug: "realistic",   zip:    "Realistic Animation.zip" },
  { slug: "cartoon",     zip:    "Cartoon Animatie.zip" },
  { slug: "3d-animatie", zip:    "3D Animatie.zip" },
  { slug: "3d-pixar",    folder: "3D Pixar" },
];

const desktop = join(homedir(), "Desktop");

function listPngs(dir) {
  return readdirSync(dir)
    .filter((n) => n.toLowerCase().endsWith(".png") && !n.startsWith("._"))
    .sort();
}

async function uploadPack(pack) {
  console.log(`\n=== ${pack.slug} ===`);

  let imageDir;
  let cleanup = null;

  if (pack.folder) {
    imageDir = join(desktop, pack.folder);
    if (!existsSync(imageDir)) {
      console.warn(
        `  Folder ${imageDir} bestaat nog niet — maak hem aan en zet je PNG's erin, draai daarna opnieuw.`
      );
      return;
    }
  } else if (pack.zip) {
    const zipPath = join(desktop, pack.zip);
    if (!existsSync(zipPath)) {
      console.warn(`  ZIP ${zipPath} bestaat niet — overgeslagen.`);
      return;
    }
    const tmp = mkdtempSync(join(tmpdir(), `pack-${pack.slug}-`));
    cleanup = tmp;
    execSync(`unzip -o ${JSON.stringify(zipPath)} -d ${JSON.stringify(tmp)}`, {
      stdio: "ignore",
    });
    // ZIP heeft meestal een outer dir, vind het.
    const topEntries = readdirSync(tmp).filter((n) => n !== "__MACOSX");
    imageDir = tmp;
    if (topEntries.length === 1 && statSync(join(tmp, topEntries[0])).isDirectory()) {
      imageDir = join(tmp, topEntries[0]);
    }
  } else {
    console.warn(`  Pack ${pack.slug} heeft geen zip of folder gedefinieerd, overgeslagen.`);
    return;
  }

  try {
    const pngs = listPngs(imageDir);
    if (pngs.length === 0) {
      console.warn(`  Geen PNG's gevonden in ${imageDir}`);
      return;
    }

    console.log(`  ${pngs.length} PNG('s) gevonden, uploaden...`);
    let i = 1;
    for (const png of pngs) {
      const buf = readFileSync(join(imageDir, png));
      const dest = `${pack.slug}/${String(i).padStart(2, "0")}.png`;
      const { error } = await supabase.storage
        .from("style-refs")
        .upload(dest, buf, { contentType: "image/png", upsert: true });
      if (error) {
        console.error(`  ✗ ${dest}: ${error.message}`);
      } else {
        const { data } = supabase.storage.from("style-refs").getPublicUrl(dest);
        console.log(`  ✓ ${dest}  →  ${data.publicUrl}`);
      }
      i++;
    }
  } finally {
    if (cleanup) rmSync(cleanup, { recursive: true, force: true });
  }
}

for (const pack of PACKS) {
  await uploadPack(pack);
}

console.log("\nKlaar.");
