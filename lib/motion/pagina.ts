// De pagina waarin een motion graphics-video wordt getekend: één SVG, de bouwstenen
// (public/motion/kern.js) en de code van de video zelf. Alles staat in de pagina; er wordt
// niets van buiten geladen behalve het lettertype.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { WhisperWord } from "@/lib/openai";

export interface PaginaInvoer {
  w: number;
  h: number;
  woorden: WhisperWord[];
  /** [[sceneId, gesproken tekst], ...]; de laatste heet 'eind'. */
  script: [string, string][];
  merk: { naam: string; website: string; kleur: string; kleur2: string };
  /** De code van de video: zet window.VIDEO. */
  code: string;
}

let kernCache: string | null = null;
/** De bouwstenen als tekst. Op Vercel gaat het bestand mee via outputFileTracingIncludes. */
export async function leesKern(): Promise<string> {
  if (kernCache && process.env.NODE_ENV === "production") return kernCache;
  return (kernCache = await readFile(path.join(process.cwd(), "public", "motion", "kern.js"), "utf8"));
}

// Een "</script>" in de code of in een tekst van de klant zou het scriptblok voortijdig
// sluiten; "<" als < is voor JavaScript hetzelfde teken.
const veilig = (js: string) => js.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, " ");

export async function paginaHtml(p: PaginaInvoer): Promise<string> {
  const kern = await leesKern();
  return `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;overflow:hidden;background:#f3f8fb}
  svg{display:block}
  text{font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-weight:700}
</style></head>
<body>
<svg id="st" xmlns="http://www.w3.org/2000/svg">
<defs id="defs">
  <pattern id="dots" width="48" height="48" patternUnits="userSpaceOnUse"><circle cx="24" cy="24" r="2" fill="#0b1d3a" fill-opacity=".045"/></pattern>
  <pattern id="dotsW" width="48" height="48" patternUnits="userSpaceOnUse"><circle cx="24" cy="24" r="2.4" fill="#fff" fill-opacity=".07"/></pattern>
  <filter id="sch" x="-40%" y="-120%" width="180%" height="400%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#0b1d3a" flood-opacity=".07"/><feDropShadow dx="0" dy="26" stdDeviation="30" flood-color="#0b1d3a" flood-opacity=".13"/></filter>
  <filter id="zacht" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="90"/></filter>
  <filter id="gloei" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <linearGradient id="gBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#f3f8fb"/><stop offset="1" stop-color="#eaf2fb"/></linearGradient>
  <linearGradient id="glans" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="vignet" cx=".5" cy=".5" r=".78"><stop offset=".62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#0b1d3a" stop-opacity=".07"/></radialGradient>
</defs>
<rect id="bg" fill="url(#gBg)"/>
<g id="orbs" filter="url(#zacht)"></g>
<rect id="bgDots" x="-48" y="-48" fill="url(#dots)"/>
<g id="deeltjes"></g>
<g id="scenes"></g>
<g id="hud"></g>
<rect id="vig" fill="url(#vignet)" pointer-events="none"/>
<g id="wipe"></g>
</svg>
<script>
window.FOUTEN = [];
window.addEventListener('error', function (e) { var m = 'Fout in de code: ' + (e.message || e.error) + (e.lineno ? ' (regel ' + e.lineno + ')' : ''); if (window.FOUTEN.indexOf(m) < 0) window.FOUTEN.push(m); });
window.W = ${p.w}; window.H = ${p.h};
window.WORDS = ${json(p.woorden)};
window.SCRIPT = ${json(p.script)};
window.MERK = ${json(p.merk)};
</script>
<script>${veilig(kern)}</script>
<script>
// De code van de video draait onder de naam video.js, zodat een foutmelding het regelnummer
// in díe code noemt en de kern de regel erbij kan zetten.
window.CODE = ${json(p.code)};
try { (0, eval)(window.CODE + "\\n//# sourceURL=video.js"); }
catch (e) { var m = String(e && e.stack || '').match(/video\\.js:(\\d+)/); window.FOUTEN.push('Fout in de code: ' + (e && e.message) + (m ? ' (regel ' + m[1] + ': "' + String(window.CODE.split('\\n')[m[1] - 1] || '').trim().slice(0, 220) + '")' : '')); }
</script>
<script>
if (typeof window.start === 'function') window.start(); else { window.FOUTEN.push('De bouwstenen zijn niet geladen.'); window.READY = true; }
</script>
</body></html>`;
}
