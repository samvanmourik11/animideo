// Maakt public/motion/landen-data.js: echte landsgrenzen (Natural Earth 1:50m via world-atlas)
// als SVG-paden in één wereldprojectie (Miller), zodat landen in een video kloppen in plaats
// van door Claude uit het hoofd getekend te worden. Eenmalig draaien: node scripts/maak-landen.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";
import landen from "i18n-iso-countries";

const require = createRequire(import.meta.url);
landen.registerLocale(require("i18n-iso-countries/langs/nl.json"));
landen.registerLocale(require("i18n-iso-countries/langs/en.json"));
const topo = JSON.parse(readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8"));
const fc = feature(topo, topo.objects.countries);

// Miller-projectie op een wereld van 3600 breed; y van noord (0) naar zuid.
const BREED = 3600;
const R = BREED / (2 * Math.PI);
const proj = ([lon, lat]) => {
  const la = Math.max(-84, Math.min(84, lat)) * Math.PI / 180;
  const y = 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * la));
  return [R * (lon * Math.PI / 180) + BREED / 2, R * 2.3 - R * y];
};
const MIN = 1.1; // punten dichter bij elkaar dan dit vallen weg (vereenvoudigen)

function ring(coords) {
  const pts = [];
  // Over de datumgrens (Rusland, Fiji): lengtegraden doorlopend houden (190° i.p.v. -170°),
  // anders trekt het pad een streep dwars over de wereld. De wereldkaart knipt de rand af.
  let vorige = null, schuif = 0;
  for (const c0 of coords) {
    if (vorige !== null && Math.abs(c0[0] - vorige) > 180) schuif += c0[0] < vorige ? 360 : -360;
    vorige = c0[0];
    const p = proj([c0[0] + schuif, c0[1]]);
    const l = pts[pts.length - 1];
    if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) >= MIN) pts.push(p);
  }
  if (pts.length < 4) return "";
  let d = "M" + pts[0].map((v) => v.toFixed(1)).join(",");
  for (let i = 1; i < pts.length; i++) d += "L" + pts[i].map((v) => v.toFixed(1)).join(",");
  return d + "Z";
}

const uit = {};
for (const f of fc.features) {
  const a2 = landen.numericToAlpha2(f.id);
  if (!a2) continue;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let d = "";
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, grootste = null, gOpp = -1;
  for (const poly of polys) {
    const rd = ring(poly[0]);
    if (!rd) continue;
    d += rd;
    for (const h of poly.slice(1)) d += ring(h);
    const pts = poly[0].map(proj);
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const [x, y] of pts) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
    const opp = (bx1 - bx0) * (by1 - by0);
    if (opp > gOpp) { gOpp = opp; grootste = [bx0, by0, bx1, by1]; }
  }
  if (!d) continue;
  // Het kader van het hoofdland (zonder verre eilanden/overzeese gebieden) om op in te zoomen.
  [x0, y0, x1, y1] = grootste;
  uit[a2] = { d, b: [x0, y0, x1, y1].map((v) => +v.toFixed(1)), nl: landen.getName(a2, "nl"), en: landen.getName(a2, "en") };
}

const js = `// GEMAAKT DOOR scripts/maak-landen.mjs (Natural Earth 1:50m, publiek domein). Niet met de hand aanpassen.
var LANDEN_DATA = ${JSON.stringify(uit)};
`;
writeFileSync("public/motion/landen-data.js", js);
console.log(Object.keys(uit).length, "landen,", (js.length / 1024).toFixed(0), "KB");
