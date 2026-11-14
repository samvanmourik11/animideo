// De pagina waarin een motion graphics-video wordt getekend: één SVG, de bouwstenen
// (public/motion/kern.js) en de code van de video zelf. Alles staat in de pagina; er wordt
// niets van buiten geladen behalve het lettertype.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { WhisperWord } from "@/lib/openai";
import type { PaginaFoto, PaginaLogo } from "./beelden";
import { MOTION_FONTS, STANDAARD_FONT } from "./types";
import { stijlVan } from "./stijlen";
import { lettertypeCss } from "./fonts";

export interface PaginaInvoer {
  w: number;
  h: number;
  woorden: WhisperWord[];
  /** [[sceneId, gesproken tekst], ...]; de laatste heet 'eind'. */
  script: [string, string][];
  merk: { naam: string; website: string; kleur: string; kleur2: string; font?: string; logo?: PaginaLogo | null };
  /** Foto's van de klant die zelf in beeld komen, op id (f1, f2, ...). */
  fotos?: Record<string, PaginaFoto>;
  /**
   * Alleen bij een lange video: dit is één hoofdstuk. `voor`/`na` zeggen of er een hoofdstuk
   * aan voorafgaat of op volgt, `einde` hoe lang dit hoofdstuk precies duurt (s).
   */
  deel?: { voor: boolean; na: boolean; einde?: number };
  /** De tekenstijl (id uit lib/motion/stijlen.ts); leeg = de standaardstijl. */
  stijl?: string | null;
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

/**
 * `browser`: de pagina voor de browser van de klant. Lettertypes zitten er dan als data in,
 * de pagina mag niets ophalen (vastgelegd in de pagina zelf), en er hoort een stukje bij
 * dat elk beeld op verzoek als afbeelding teruggeeft aan de studio.
 */
export async function paginaHtml(p: PaginaInvoer, o: { browser?: boolean } = {}): Promise<string> {
  const kern = await leesKern();
  // Alleen een lettertype uit onze eigen lijst: de naam gaat een adres en een stijlregel in.
  const font = (MOTION_FONTS as readonly string[]).includes(p.merk.font ?? "") ? p.merk.font! : STANDAARD_FONT;
  // Een tekenstijl heeft zijn eigen letter: krijt op een schoolbord in het lettertype van de
  // huisstijl is geen schoolbord meer.
  const stijl = stijlVan(p.stijl);
  const families = stijl ? stijl.fonts : [`${font.replace(/ /g, "+")}:wght@500;600;700;800`];
  const merk = { ...p.merk, font: stijl ? stijl.font : font };
  return `<!doctype html>
<html><head><meta charset="utf-8">
${o.browser
  ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:">
<style id="letters">${await lettertypeCss(families)}</style>`
  : `<link href="https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap" rel="stylesheet">`}
<style>
  html,body{margin:0;overflow:hidden;background:#f3f8fb}
  svg{display:block}
  text{font-family:"${merk.font}",system-ui,sans-serif;font-weight:${stijl?.thema.gewicht ?? 700}${stijl ? ";font-synthesis:none" : ""}}${stijl?.thema.gewicht ? `
  text[font-weight]{font-weight:${stijl.thema.gewicht}}` : ""}
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
<g id="bgx"></g>
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
window.MERK = ${json(merk)};
window.FOTOS = ${json(p.fotos ?? {})};
window.DEEL = ${json(p.deel ?? {})};
window.STIJL = ${json(stijl?.thema ?? null)};
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
</script>${o.browser ? `\n<script>${BRUG}</script>` : ""}
</body></html>`;
}

/**
 * De brug tussen de pagina (in een afgeschermd venstertje in de studio) en de studio: op
 * verzoek een tijdstip tekenen en het beeld als afbeelding terugsturen. Het beeld is de SVG
 * zelf, met de stijlregels en lettertypes erin, op een canvas getekend: hetzelfde als wat
 * de browser op het scherm zou zetten.
 */
const BRUG = `(function () {
  var css = Array.prototype.map.call(document.querySelectorAll('style'), function (s) { return s.textContent; }).join('\\n');
  var doek = null, ctx = null;
  function wacht() { return new Promise(function (ok) { (function kijk() { if (window.READY) ok(); else setTimeout(kijk, 40); })(); }); }
  async function beeld(t) {
    window.render(t);
    var svg = document.getElementById('st').cloneNode(true);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    var st = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    st.textContent = css;
    svg.insertBefore(st, svg.firstChild);
    var url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    try {
      var img = new Image();
      img.src = url;
      await img.decode();
      if (!doek) { doek = new OffscreenCanvas(window.W, window.H); ctx = doek.getContext('2d'); }
      ctx.fillStyle = '#f3f8fb';
      ctx.fillRect(0, 0, window.W, window.H);
      ctx.drawImage(img, 0, 0, window.W, window.H);
      return await createImageBitmap(doek);
    } finally { URL.revokeObjectURL(url); }
  }
  window.addEventListener('message', async function (e) {
    if (e.source !== window.parent) return;
    var m = e.data || {};
    try {
      if (m.soort === 'start') {
        await wacht();
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        // Een eerste beeld wegtekenen: dan zijn alle lettertypes in de afbeelding ook geladen.
        (await beeld(0)).close();
        parent.postMessage({ soort: 'klaar', nr: m.nr, einde: window.END, fouten: (window.FOUTEN || []).slice(0, 5) }, '*');
      } else if (m.soort === 'beeld') {
        var bmp = await beeld(m.t);
        parent.postMessage({ soort: 'beeld', nr: m.nr, bmp: bmp }, '*', [bmp]);
      }
    } catch (err) {
      parent.postMessage({ soort: 'fout', nr: m.nr, fout: String(err && err.message || err) }, '*');
    }
  });
  parent.postMessage({ soort: 'geladen' }, '*');
})();`;
