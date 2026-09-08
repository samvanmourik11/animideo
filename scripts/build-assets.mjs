#!/usr/bin/env node
// Bouwt lib/infographics/assets-generated.ts uit de SVG-bestanden in
// lib/infographics/assets/.
//
// Waarom een generator en geen inlezen tijdens het draaien: de assets worden op
// twee plekken getekend — in de browser (preview) en op de server (export). De
// browser kan geen bestanden lezen, en de export wil geen async IO midden in een
// frame-lus. Door ze bij het bouwen in één TypeScript-bestand te zetten, werkt
// dezelfde code aan beide kanten en zit alles gewoon in de bundel.
//
// Gebruik: npm run assets

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ASSET_MAP = path.join(HIER, "..", "lib", "infographics", "assets");
const DOEL = path.join(HIER, "..", "lib", "infographics", "assets-generated.ts");

/** Haalt de inhoud uit een <svg> en normaliseert die naar een vak van 100×100. */
function normaliseer(svg, bestand) {
  const svgTag = svg.match(/<svg\b[^>]*>/i);
  if (!svgTag) throw new Error(`${bestand}: geen <svg>-element gevonden`);
  const open = svgTag[0];

  const start = svg.indexOf(open) + open.length;
  const eind = svg.lastIndexOf("</svg>");
  if (eind < 0) throw new Error(`${bestand}: geen sluitende </svg>`);
  let inhoud = svg.slice(start, eind).trim();

  // Commentaar eruit: dat is voor de tekenaar, niet voor de bundel.
  inhoud = inhoud.replace(/<!--[\s\S]*?-->/g, "").trim();

  // Alles moet op 100×100 staan. Wijkt de viewBox af, dan schalen we het geheel
  // in plaats van de tekenaar te dwingen tot rekenen.
  const vb = open.match(/viewBox\s*=\s*"([^"]+)"/i);
  if (vb) {
    const [minX, minY, breedte, hoogte] = vb[1].trim().split(/[\s,]+/).map(Number);
    if ([minX, minY, breedte, hoogte].some((n) => !Number.isFinite(n)) || breedte <= 0 || hoogte <= 0) {
      throw new Error(`${bestand}: onbruikbare viewBox "${vb[1]}"`);
    }
    const schaal = 100 / Math.max(breedte, hoogte);
    // Horizontaal centreren als de tekening smaller is dan hoog.
    const dx = (100 - breedte * schaal) / 2;
    if (minX !== 0 || minY !== 0 || Math.abs(schaal - 1) > 0.001 || dx > 0.01) {
      inhoud = `<g transform="translate(${round(dx)}, 0) scale(${round(schaal)}) translate(${round(-minX)}, ${round(-minY)})">${inhoud}</g>`;
    }
  }
  return inhoud;
}

const round = (n) => Number(n.toFixed(4));

async function main() {
  const manifestPad = path.join(ASSET_MAP, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPad, "utf8"));
  const bestanden = new Set((await readdir(ASSET_MAP)).filter((f) => f.endsWith(".svg")));

  const uit = [];
  const gebruikt = new Set();
  for (const item of manifest.assets ?? []) {
    for (const veld of ["sleutel", "bestand", "omschrijving", "categorie", "maat"]) {
      if (item[veld] === undefined) throw new Error(`manifest: "${veld}" ontbreekt bij ${item.sleutel ?? "een asset"}`);
    }
    if (!bestanden.has(item.bestand)) throw new Error(`manifest: ${item.bestand} bestaat niet in ${ASSET_MAP}`);
    if (gebruikt.has(item.sleutel)) throw new Error(`manifest: sleutel "${item.sleutel}" komt dubbel voor`);
    gebruikt.add(item.sleutel);
    gebruikt.add(item.bestand);

    const svg = await readFile(path.join(ASSET_MAP, item.bestand), "utf8");
    uit.push({
      sleutel: item.sleutel,
      omschrijving: item.omschrijving,
      categorie: item.categorie,
      maat: item.maat,
      zweeft: item.zweeft === true,
      inhoud: normaliseer(svg, item.bestand),
    });
  }

  const wees = [...bestanden].filter((b) => !gebruikt.has(b));
  if (wees.length) {
    console.warn(`[assets] let op: ${wees.join(", ")} staat niet in manifest.json en wordt dus niet gebruikt`);
  }

  const bestand =
    `// GEGENEREERD BESTAND — niet met de hand aanpassen.\n` +
    `// Gemaakt door scripts/build-assets.mjs uit lib/infographics/assets/.\n` +
    `// Nieuw asset? Zet het .svg-bestand erbij, voeg een regel toe aan\n` +
    `// manifest.json en draai \`npm run assets\`.\n\n` +
    `export interface BestandAsset {\n` +
    `  sleutel: string;\n  omschrijving: string;\n  categorie: string;\n  maat: number;\n  zweeft: boolean;\n` +
    `  /** SVG-inhoud op een vak van 100×100, met plaatshouderkleuren. */\n  inhoud: string;\n}\n\n` +
    `export const BESTAND_ASSETS: BestandAsset[] = ${JSON.stringify(uit, null, 2)};\n`;

  await writeFile(DOEL, bestand, "utf8");
  console.log(`[assets] ${uit.length} asset(s) geschreven naar ${path.relative(process.cwd(), DOEL)}`);
}

main().catch((e) => {
  console.error(`[assets] mislukt: ${e.message}`);
  process.exit(1);
});
