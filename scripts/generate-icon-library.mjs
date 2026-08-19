// Vult de iconenbibliotheek: elk icoon uit lib/editor/icons/library.ts wordt één
// keer gegenereerd, van zijn achtergrond ontdaan en in de publieke `icons`-bucket
// gezet.
//
// Waarom vooraf en niet per keer: een icoon dat al bestaat is gratis, direct
// beschikbaar en elke keer hetzelfde. Alleen wat er níet in staat laten we later
// op verzoek bijmaken.
//
// Idempotent: bestaande bestanden worden overgeslagen, dus opnieuw draaien vult
// alleen de gaten. Met --opnieuw maak je alles opnieuw.
//
// Usage: node scripts/generate-icon-library.mjs [--opnieuw] [--alleen=slug,slug]

import { createClient } from "@supabase/supabase-js";
import { fal } from "@fal-ai/client";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
fal.config({ credentials: env.FAL_KEY });

const BEELD_MODEL = "fal-ai/nano-banana";
const KNIP_MODEL = "fal-ai/imageutils/rembg";
const TEGELIJK = 6; // genoeg om vlot te vullen, niet zoveel dat fal gaat knijpen

// De stijl staat hier één keer, zodat de hele bibliotheek er als één set uitziet.
// Dat is het verschil tussen een bibliotheek en een verzameling losse plaatjes.
const STIJL =
  "Flat vector illustration icon, simple bold shapes, clean thin dark outline, " +
  "friendly modern business style, bright saturated colors, subtle shading, " +
  "centered, complete object, front view. " +
  "Isolated on a plain pure white background. No shadow, no reflection, no text, " +
  "no letters, no watermark, no border, no frame, single object only.";

// De catalogus uit de TypeScript-bron halen zonder build-stap: we lezen de
// slug/prompt-paren er met een reguliere expressie uit. Blijft in de pas doordat
// het script faalt als er niets gevonden wordt.
function leesCatalogus() {
  const bron = readFileSync(new URL("../lib/editor/icons/library.ts", import.meta.url), "utf8");
  const iconen = [];
  const regex = /\{\s*slug:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*categorie:\s*"([^"]+)",\s*prompt:\s*"([^"]+)"/g;
  let m;
  while ((m = regex.exec(bron)) !== null) {
    iconen.push({ slug: m[1], label: m[2], categorie: m[3], prompt: m[4] });
  }
  if (iconen.length === 0) throw new Error("Geen iconen gevonden in library.ts — is het formaat veranderd?");
  return iconen;
}

async function bestaatAl(slug) {
  const { data } = await supabase.storage.from("icons").list("", { search: `${slug}.png`, limit: 1 });
  return (data ?? []).some((f) => f.name === `${slug}.png`);
}

async function maakIcoon(icoon) {
  const gen = await fal.subscribe(BEELD_MODEL, {
    input: { prompt: `${icoon.prompt}. ${STIJL}`, num_images: 1, output_format: "png" },
  });
  const ruw = gen.data?.images?.[0]?.url;
  if (!ruw) throw new Error("geen beeld ontvangen");

  const geknipt = await fal.subscribe(KNIP_MODEL, { input: { image_url: ruw } });
  const transparant = geknipt.data?.image?.url ?? geknipt.data?.images?.[0]?.url;
  if (!transparant) throw new Error("achtergrond weghalen mislukt");

  const bytes = Buffer.from(await (await fetch(transparant)).arrayBuffer());
  const { error } = await supabase.storage.from("icons").upload(`${icoon.slug}.png`, bytes, {
    contentType: "image/png",
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) throw new Error(error.message);
  return bytes.length;
}

const opnieuw = process.argv.includes("--opnieuw");
const alleenArg = process.argv.find((a) => a.startsWith("--alleen="));
const alleen = alleenArg ? new Set(alleenArg.slice(9).split(",")) : null;

const catalogus = leesCatalogus().filter((i) => !alleen || alleen.has(i.slug));
console.log(`${catalogus.length} iconen in de catalogus.`);

// Bestaande bucket? Anders aanmaken (zie ook migratie 039).
const { data: buckets } = await supabase.storage.listBuckets();
if (!buckets?.some((b) => b.id === "icons")) {
  const { error } = await supabase.storage.createBucket("icons", { public: true });
  if (error) throw new Error(`Bucket 'icons' aanmaken mislukt: ${error.message}`);
  console.log("Bucket 'icons' aangemaakt (publiek).");
}

let gemaakt = 0;
let overgeslagen = 0;
const mislukt = [];

// In blokken, zodat het vlot gaat zonder de API te overvragen.
for (let i = 0; i < catalogus.length; i += TEGELIJK) {
  const blok = catalogus.slice(i, i + TEGELIJK);
  await Promise.all(
    blok.map(async (icoon) => {
      try {
        if (!opnieuw && (await bestaatAl(icoon.slug))) {
          overgeslagen++;
          return;
        }
        const bytes = await maakIcoon(icoon);
        gemaakt++;
        console.log(`  ${icoon.slug.padEnd(22)} ${icoon.categorie.padEnd(11)} ${(bytes / 1024).toFixed(0)} kB`);
      } catch (e) {
        // fal geeft de echte reden in `body.detail` en laat `message` leeg; zonder
        // dit stond er alleen "MISLUKT vliegtuig:" en kon je niets uitzoeken.
        const detail = e?.body?.detail;
        const reden =
          (Array.isArray(detail) ? detail[0]?.msg : detail) ||
          e?.message ||
          String(e);
        mislukt.push({ slug: icoon.slug, reden: String(reden).slice(0, 110) });
      }
    })
  );
  console.log(`— ${Math.min(i + TEGELIJK, catalogus.length)}/${catalogus.length}`);
}

console.log(`\nKlaar: ${gemaakt} gemaakt, ${overgeslagen} bestonden al, ${mislukt.length} mislukt.`);
for (const m of mislukt) console.log(`  MISLUKT ${m.slug}: ${m.reden}`);
if (mislukt.length) console.log("\nOpnieuw draaien pakt alleen de gaten op.");
