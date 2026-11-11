// DE KERN van de Motion graphics-studio: de bouwstenen waarmee een video in code wordt
// getekend (SVG + een render(t)-functie), zonder AI-beelden.
//
// Afgeleid van het Lichtveld-pakket (oktober 2026), dat Sam "echt een topstijl" vond.
// De pagina (lib/motion/pagina.ts) zet eerst klaar:
//   window.W, window.H        formaat in pixels
//   window.WORDS              woordtijden van de voice-over (Whisper)
//   window.SCRIPT             [[sceneId, tekst], ...], de laatste heet altijd 'eind'
//   window.MERK               { naam, website, kleur, kleur2, font, logo: { src, w, h, licht } | null }
//   window.FOTOS              { f1: { src, w, h }, ... }: foto's van de klant die zelf in beeld komen
// Daarna dit bestand, daarna de video zelf (window.VIDEO = {...}, geschreven door Claude),
// en tot slot start(). Alles hier is een gewone globale naam: de video-code gebruikt ze direct.
//
// Niets hierin mag van de klok of van toeval afhangen: hetzelfde tijdstip geeft altijd
// exact hetzelfde beeld, anders verspringt de video tussen de beelden.

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const W = window.W, H = window.H, STAAND = H > W, MX = W / 2, MY = H / 2;
/** Zo ver blijven teksten en logo's van de rand (Sams regel: nooit tegen de rand geplakt). */
const RAND = 140;
const MERK = window.MERK || { naam: '', website: '', kleur: '#1c72ed', kleur2: '#ffc21a' };
const FOTOS = window.FOTOS || {};
/** Het logo van de klant, of null: dan is het merkteken de eerste letter van de naam. */
const LOGO = MERK.logo && MERK.logo.src ? MERK.logo : null;
// Een breed logo (woordmerk) bevat de bedrijfsnaam al; een vierkant logo krijgt de naam ernaast.
const LOGO_BREED = !!LOGO && LOGO.w / LOGO.h > 1.5;

// ---------- rekenhulpjes ----------
const cl = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const P = (t, a, b) => cl((t - a) / (b - a));
const eo = x => 1 - Math.pow(1 - x, 3);
const eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const back = x => { const c = 1.7; return x <= 0 ? 0 : x >= 1 ? 1 : 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const lerp = (a, b, x) => a + (b - a) * x;
const pop = (t, a, d = .45) => back(P(t, a, a + d));
const win = (t, a, b, fi = .3, fo = .3) => Math.min(P(t, a, a + fi), 1 - P(t, b - fo, b));
const golf = (t, f, a, ph = 0) => Math.sin(t * f * 6.283 + ph) * a;
const hex = c => { c = String(c).replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) || 0); };
const mix = (a, b, x) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], cl(x))).toString(16).padStart(2, '0')).join(''); };
const nl = n => Math.round(n).toLocaleString('nl-NL');
/** Is een kleur licht? Dan hoort er donkere tekst op. */
const isLicht = k => { const [r, g, b] = hex(k); return (r * 299 + g * 587 + b * 114) / 1000 > 165; };

// ---------- svg-hulpjes ----------
// Een bouwsteen die een object teruggeeft ({ r, zet } e.d.) wordt vaak per ongeluk zelf aan
// tf of op gegeven; dan pakken we de groep erin. Echt niets gekregen: een fout die zegt wat
// er mis is, in plaats van "cannot read properties of undefined".
function elem(e, wie) {
  if (e && typeof e.setAttribute === 'function') return e;
  if (e && e.r && typeof e.r.setAttribute === 'function') return e.r;
  throw new Error(`${wie}() kreeg geen element maar ${e === undefined ? 'undefined' : Object.prototype.toString.call(e)}. Bestaat dit element wel in E, en is het een groep of een object met .r?`);
}
const tf = (e, x = 0, y = 0, s = 1, r = 0) => elem(e, 'tf').setAttribute('transform', `translate(${x},${y}) rotate(${r}) scale(${s})`);
function op(e, o) { e = elem(e, 'op'); e.setAttribute('opacity', cl(o)); e.style.display = o <= 0.002 ? 'none' : ''; }
function el(tag, at = {}, parent, tekst) { if (parent && typeof parent.appendChild !== 'function') parent = elem(parent, 'el'); const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); if (tekst != null) e.textContent = tekst; if (parent) parent.appendChild(e); return e; }
const G = (parent, at = {}) => el('g', at, parent);
const T = (parent, x, y, s, size, at = {}) => el('text', { x, y, 'font-size': size, 'text-anchor': 'middle', fill: C.inkt, 'font-weight': 800, ...at }, parent, s);
/** Laat een lijn zichzelf tekenen: p van 0 naar 1. Het pad heeft pathLength="1" nodig. */
const draw = (e, p) => { e.setAttribute('pathLength', 1); e.style.strokeDasharray = '1 1'; e.style.strokeDashoffset = 1 - cl(p); op(e, p > 0.001 ? 1 : 0); };

// ---------- kleuren ----------
// Verzadigd en helder (Sam: geen doffe kleuren). accent = de merkkleur van de klant.
const C = {
  inkt: '#0b1d3a', wit: '#ffffff', accent: MERK.kleur, accent2: MERK.kleur2,
  groen: '#00c08b', rood: '#f43f52', geel: '#ffc21a', oranje: '#ff9417', blauw: '#2a8cff', paars: '#7b5cff',
  grijs: '#d3dde4', licht: '#f3f8fb', muted: '#6b7a90',
};
C.navy = C.inkt;
// Elk vlak in een van deze kleuren krijgt via F() een zacht verloop: dat maakt het gelikt.
const GR = {};
function maakVerloop(id, kleur, schuin = false) {
  const g = el('linearGradient', { id, x1: 0, y1: 0, x2: schuin ? 1 : 0, y2: 1 }, $('defs'));
  el('stop', { offset: 0, 'stop-color': mix(kleur, '#ffffff', .22) }, g);
  el('stop', { offset: 1, 'stop-color': mix(kleur, '#000000', .1) }, g);
  GR[kleur] = `url(#${id})`;
}
const F = k => GR[k] || k;
// Meteen bij het laden, zodat ook code bovenaan de video al F() kan gebruiken.
[['gAccent', C.accent], ['gAccent2', C.accent2], ['gGroen', C.groen], ['gRood', C.rood], ['gGeel', C.geel], ['gOranje', C.oranje], ['gBlauw', C.blauw], ['gPaars', C.paars]].forEach(([id, k]) => { if (!GR[k]) maakVerloop(id, k); });
{
  // De eindkaart en donkere vlakken: de merkkleur, flink donker gemaakt.
  const donker = el('linearGradient', { id: 'gDonker', x1: 0, y1: 0, x2: 1, y2: 1 }, $('defs'));
  el('stop', { offset: 0, 'stop-color': mix(C.accent, '#0b1d3a', .72) }, donker); el('stop', { offset: 1, 'stop-color': mix(C.accent, '#050d22', .9) }, donker);
  GR[C.inkt] = 'url(#gDonker)';
}

// ---------- fouten ----------
// Alles wat misgaat komt hier terecht; de server leest het uit en laat Claude het herstellen.
const FOUTEN = window.FOUTEN = window.FOUTEN || [];
/** Waar in de code van de video ging het mis: het regelnummer en de regel zelf. */
function waar(err) {
  const m = err && err.stack && String(err.stack).match(/video\.js:(\d+):\d+/);
  // Geen regel in de video-code: dan zat het in de kern zelf. De plek erbij, voor ons.
  if (!m) { const k = err && err.stack && String(err.stack).split('\n').slice(1, 3).map(x => x.trim()).join(' < '); return k ? ` [${k}]` : ''; }
  const regel = (window.CODE || '').split('\n')[+m[1] - 1];
  return ` (regel ${m[1]}${regel ? ': `' + regel.trim().slice(0, 220) + '`' : ''})`;
}
function meld(tekst) { if (!FOUTEN.includes(tekst) && FOUTEN.length < 40) FOUTEN.push(tekst); }

// ---------- woordtijden ----------
const D = 0.3;               // de stem begint 0,3 s na het eerste beeld
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const WRD = (window.WORDS || []).map(w => ({ ...w, n: norm(w.word) })).filter(w => w.n);
// Whisper schrijft "één" als "1" en "twee" soms als "2".
const GETAL = { een: '1', twee: '2', drie: '3', vier: '4', vijf: '5', zes: '6', zeven: '7', acht: '8', negen: '9', tien: '10' };
const past = (w, s) => { const n = norm(s); return !!w && !!n && (w.n === n || w.n === GETAL[n] || w.n.startsWith(n) && w.n.length - n.length < 3 || n.startsWith(w.n) && w.n.length > 2); };
/** Tijdstip (s) waarop `woord` wordt uitgesproken, het eerste op of na `na`. */
function wt(woord, na = -1) {
  const n = norm(woord);
  const w = WRD.find(w => w.start >= na - 0.05 && (w.n === n || w.n === GETAL[n] || w.n.startsWith(n) || n.startsWith(w.n) && w.n.length > 3));
  if (!w) { meld(`wt('${woord}') na ${(+na).toFixed(1)} s: dit woord komt (daarna) niet voor in de voice-over. Kies een woord dat letterlijk in het script staat.`); return Math.max(0, na) + 1; }
  return w.start;
}
function wtZin(zin, na = -1) {
  const ws = String(zin).split(/\s+/).filter(x => norm(x));
  const i = WRD.findIndex((w, k) => w.start >= na - 0.05 && past(w, ws[0]) && (ws.length < 2 || past(WRD[k + 1], ws[1]) || past(WRD[k + 2], ws[1])));
  return i >= 0 ? WRD[i].start : wt(ws[0], na);
}
function sceneTijden() {
  const out = []; let na = -1;
  (window.SCRIPT || []).forEach(([id, tekst], i) => { const t = i ? wtZin(tekst, na + .4) : 0; out.push([id, t]); na = t; });
  return out;
}

// ---------- bouwstenen ----------
/** Tekstpil. r.breedte = de breedte, zodat je hem kunt uitlijnen. */
function pil(parent, tekst, { fill = '#fff', kleur = null, size = 42, padX = 34, h = 84, rand = null, icoon = null, schaduw = true } = {}) {
  const r = G(parent, schaduw ? { filter: 'url(#sch)' } : {});
  const tk = kleur || (fill === '#fff' || isLicht(fill) ? C.inkt : '#fff');
  const rect = el('rect', { y: -h / 2, height: h, rx: h / 2, fill: F(fill), ...(rand ? { stroke: rand, 'stroke-width': 4 } : {}) }, r);
  const glans = fill !== '#fff' ? el('rect', { y: -h / 2, height: h * .55, rx: h * .275, fill: 'url(#glans)' }, r) : null;
  const t = el('text', { y: size * .36, 'font-size': size, fill: tk, 'font-weight': 800 }, r, tekst);
  const ic = icoon ? size * 1.25 : 0, w = t.getComputedTextLength() + padX * 2 + ic;
  rect.setAttribute('x', -w / 2); rect.setAttribute('width', w); t.setAttribute('x', -w / 2 + padX + ic);
  if (glans) { glans.setAttribute('x', -w / 2 + h * .2); glans.setAttribute('width', w - h * .4); glans.setAttribute('y', -h / 2 + 3); }
  if (icoon) icoon(G(r, { transform: `translate(${-w / 2 + padX + size * .45},0)` }));
  r.breedte = w; r.tekst = t;
  return r;
}
/** Witte (of gekleurde) kaart met zachte schaduw, midden op 0,0. */
function kaart(parent, w, h, fill = '#fff', rx = 34) {
  const r = G(parent);
  el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx, fill: F(fill), filter: 'url(#sch)' }, r);
  el('rect', { x: -w / 2 + .75, y: -h / 2 + .75, width: w - 1.5, height: h - 1.5, rx: rx - 1, fill: 'none', stroke: fill === '#fff' ? C.inkt : '#fff', 'stroke-opacity': fill === '#fff' ? .06 : .12, 'stroke-width': 1.5 }, r);
  return r;
}
function munt(parent, kleur = C.groen, teken = '€') {
  const r = G(parent);
  el('circle', { r: 34, fill: F(kleur), stroke: '#fff', 'stroke-width': 5, filter: 'url(#sch)' }, r);
  T(r, 0, 13, teken, 36, { fill: '#fff' });
  return r;
}
/** Bolletjes die langs een pad stromen (geld, data, stroom, mensen ...). Animeren met flow(). */
function stroom(parent, d, n, rad, kleur) {
  const p = el('path', { d, fill: 'none', stroke: 'none' }, parent), L = p.getTotalLength();
  const dots = [...Array(n)].map(() => el('circle', { r: rad, fill: kleur }, parent));
  return { p, L, dots };
}
function flow(f, tt, a, b, snel = .55) {
  const o = win(tt, a, b, .35, .35);
  f.dots.forEach((c, i) => {
    const u = (((i / f.dots.length) + (tt - a) * snel) % 1 + 1) % 1, pt = f.p.getPointAtLength(u * f.L);
    c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y); op(c, o * Math.min(u / .07, (1 - u) / .07, 1));
  });
}
/** Zet e op het pad, q van 0 (begin) tot 1 (eind). */
function langsPad(e, pad, q, s = 1) { const pt = pad.getPointAtLength(cl(q) * pad.getTotalLength()); tf(e, pt.x, pt.y, s); }
/** Regel tekst waarvan elk woord verschijnt op het moment dat het wordt uitgesproken. */
function zinWoorden(parent, x, y, woorden, size, at = {}) {
  const t = el('text', { x, y, 'font-size': size, 'text-anchor': 'middle', fill: C.inkt, 'font-weight': 800, ...at }, parent);
  const spans = woorden.map(([w, tijd], i) => ({ s: el('tspan', {}, t, (i ? ' ' : '') + w), tijd }));
  return { t, spans };
}
function woordenIn(z, tt) { z.spans.forEach(({ s, tijd }) => s.setAttribute('opacity', eo(P(tt, tijd - .08, tijd + .22)))); }
function zinAuto(parent, x, y, tekst, na, size, at = {}) {
  let t = na; const w = String(tekst).split(' ').filter(Boolean).map(s => { t = wt(s, t); const r = [s, t]; t += .05; return r; });
  return zinWoorden(parent, x, y, w, size, at);
}
/** Breekt tekst in regels van hooguit `max` tekens; geeft de regels terug. */
function regels(tekst, max) {
  const uit = []; let r = '';
  String(tekst).split(/\s+/).forEach(w => { if (r && (r + ' ' + w).length > max) { uit.push(r); r = w; } else r = r ? r + ' ' + w : w; });
  if (r) uit.push(r); return uit;
}
/** Meerdere regels gecentreerde tekst. Geeft de groep terug. */
function tekstBlok(parent, x, y, tekst, size, { max = 28, lh = 1.22, ...at } = {}) {
  const r = G(parent), rs = regels(tekst, max);
  rs.forEach((s, i) => T(r, x, y + (i - (rs.length - 1) / 2) * size * lh, s, size, at));
  return r;
}
/** Simpel, vriendelijk poppetje (±300 px hoog, voeten op 0,0). */
function persoon(parent, { kleur = C.accent, huid = '#ffd9b8', haar = C.inkt } = {}) {
  const r = G(parent);
  el('path', { d: 'M-34,0 V-96 M34,0 V-96', stroke: C.inkt, 'stroke-width': 30, 'stroke-linecap': 'round' }, r);
  el('path', { d: 'M-66,-96 C-66,-190 -44,-214 0,-214 C44,-214 66,-190 66,-96 Z', fill: F(kleur) }, r);
  const armL = el('path', { d: 'M-56,-190 C-92,-160 -96,-130 -90,-96', stroke: F(kleur), 'stroke-width': 26, 'stroke-linecap': 'round', fill: 'none' }, r);
  const armR = el('path', { d: 'M56,-190 C92,-160 96,-130 90,-96', stroke: F(kleur), 'stroke-width': 26, 'stroke-linecap': 'round', fill: 'none' }, r);
  el('rect', { x: -13, y: -236, width: 26, height: 30, fill: huid }, r);
  const hoofd = G(r, { transform: 'translate(0,-268)' });
  el('circle', { r: 46, fill: huid }, hoofd);
  el('path', { d: 'M-46,-6 C-48,-52 48,-52 46,-6 C30,-26 -30,-26 -46,-6Z', fill: haar }, hoofd);
  el('circle', { cx: -16, cy: 4, r: 4.5, fill: C.inkt }, hoofd); el('circle', { cx: 16, cy: 4, r: 4.5, fill: C.inkt }, hoofd);
  el('path', { d: 'M-13,20 Q0,31 13,20', stroke: C.inkt, 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' }, hoofd);
  return { r, hoofd, armL, armR };
}
/** Balk die volloopt. zet(f) met f van 0 tot 1. */
function balk(parent, w, h = 50, kleur = C.accent) {
  const r = G(parent);
  el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: h * .3, fill: '#e9eef2' }, r);
  const v = el('rect', { x: -w / 2, y: -h / 2, width: 0, height: h, rx: h * .3, fill: F(kleur) }, r);
  return { r, zet: f => v.setAttribute('width', w * cl(f)) };
}

// ---------- iconen (±120 px, midden op 0,0) ----------
const lijn = (p, kleur = C.inkt, dik = 9) => G(p, { fill: 'none', stroke: kleur, 'stroke-width': dik, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
const rond = (p, kleur) => { const r = G(p); el('circle', { r: 56, fill: F(kleur), stroke: '#fff', 'stroke-width': 8, filter: 'url(#sch)' }, r); return r; };
const IC = {
  vink(p, kleur = C.groen) { const r = rond(p, kleur); el('path', { d: 'M-24,2 L-6,20 L26,-16', stroke: '#fff', 'stroke-width': 12, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }, r); return r; },
  kruis(p, kleur = C.rood) { const r = rond(p, kleur); el('path', { d: 'M-20,-20 L20,20 M20,-20 L-20,20', stroke: '#fff', 'stroke-width': 12, 'stroke-linecap': 'round', fill: 'none' }, r); return r; },
  euro(p, kleur = C.groen) { const r = rond(p, kleur); T(r, 0, 22, '€', 64, { fill: '#fff' }); return r; },
  vraag(p, kleur = C.accent) { const r = rond(p, kleur); T(r, 0, 24, '?', 70, { fill: isLicht(kleur) ? C.inkt : '#fff' }); return r; },
  uitroep(p, kleur = C.oranje) { const r = rond(p, kleur); T(r, 0, 24, '!', 70, { fill: '#fff' }); return r; },
  plus(p, kleur = C.groen) { const r = rond(p, kleur); el('path', { d: 'M-24,0 H24 M0,-24 V24', stroke: '#fff', 'stroke-width': 12, 'stroke-linecap': 'round' }, r); return r; },
  bliksem(p, kleur = C.geel) { const r = G(p); el('path', { d: 'M12,-62 L-36,8 H-4 L-14,62 L36,-10 H4 Z', fill: F(kleur), stroke: C.inkt, 'stroke-width': 6, 'stroke-linejoin': 'round' }, r); return r; },
  vlam(p, kleur = C.oranje) { const r = G(p); el('path', { d: 'M0,-60 C30,-20 48,0 44,24 C40,50 20,62 0,62 C-20,62 -40,50 -44,24 C-48,0 -20,-14 -10,-40 C-4,-20 6,-14 10,-10 C14,-26 8,-44 0,-60Z', fill: F(kleur) }, r); el('path', { d: 'M0,10 C14,24 20,34 16,46 C12,56 -12,56 -16,46 C-20,34 -8,24 0,10Z', fill: F(C.geel) }, r); return r; },
  blad(p, kleur = C.groen) { const r = G(p); el('path', { d: 'M-46,46 C-56,-20 -10,-58 52,-56 C56,4 22,52 -46,46Z', fill: F(kleur) }, r); el('path', { d: 'M-46,46 C-10,10 10,-10 34,-36', stroke: '#fff', 'stroke-width': 6, 'stroke-linecap': 'round', fill: 'none' }, r); return r; },
  hart(p, kleur = C.rood) { const r = G(p); el('path', { d: 'M0,50 C-70,6 -62,-52 -28,-52 C-10,-52 0,-38 0,-28 C0,-38 10,-52 28,-52 C62,-52 70,6 0,50Z', fill: F(kleur) }, r); return r; },
  ster(p, kleur = C.geel) { const r = G(p); el('path', { d: 'M0,-60 L17,-21 L59,-18 L27,9 L37,51 L0,28 L-37,51 L-27,9 L-59,-18 L-17,-21Z', fill: F(kleur), stroke: F(kleur), 'stroke-width': 8, 'stroke-linejoin': 'round' }, r); return r; },
  /** r.wijzer en r.uur kun je draaien met setAttribute('transform', `rotate(${graden})`). */
  klok(p) { const r = G(p); el('circle', { r: 58, fill: '#fff', stroke: C.inkt, 'stroke-width': 8 }, r); r.wijzer = el('path', { d: 'M0,0 V-38', stroke: C.inkt, 'stroke-width': 8, 'stroke-linecap': 'round' }, r); r.uur = el('path', { d: 'M0,0 H26', stroke: C.accent, 'stroke-width': 8, 'stroke-linecap': 'round' }, r); el('circle', { r: 7, fill: C.inkt }, r); return r; },
  doc(p) { const r = G(p); el('path', { d: 'M-48,-64 H22 L50,-36 V64 H-48Z', fill: '#fff', stroke: C.inkt, 'stroke-width': 7, 'stroke-linejoin': 'round' }, r); el('path', { d: 'M22,-64 V-36 H50', fill: 'none', stroke: C.inkt, 'stroke-width': 7, 'stroke-linejoin': 'round' }, r); [-18, 0, 18].forEach(y => el('rect', { x: -32, y, width: y ? 50 : 66, height: 8, rx: 4, fill: C.grijs }, r)); el('rect', { x: -32, y: 36, width: 30, height: 14, rx: 4, fill: F(C.accent) }, r); return r; },
  /** r.scherm is een lege groep (72 x 124, midden op 0,-2) om iets op het scherm te tekenen. */
  telefoon(p) { const r = G(p); el('rect', { x: -44, y: -78, width: 88, height: 156, rx: 16, fill: C.inkt }, r); el('rect', { x: -36, y: -64, width: 72, height: 124, rx: 8, fill: '#fff' }, r); r.scherm = G(r, { transform: 'translate(0,-2)' }); return r; },
  /** r.scherm is een lege groep (150 x 92, midden op 0,-14). */
  laptop(p) { const r = G(p); el('rect', { x: -84, y: -66, width: 168, height: 108, rx: 10, fill: C.inkt }, r); el('rect', { x: -75, y: -58, width: 150, height: 92, rx: 4, fill: '#fff' }, r); el('path', { d: 'M-104,42 H104 L92,60 H-92Z', fill: C.grijs, stroke: C.inkt, 'stroke-width': 6, 'stroke-linejoin': 'round' }, r); r.scherm = G(r, { transform: 'translate(0,-12)' }); return r; },
  vergroot(p) { const r = lijn(p, C.inkt, 10); el('circle', { cx: -10, cy: -10, r: 36, fill: '#eaf4ff' }, r); el('path', { d: 'M17,17 L50,50', 'stroke-width': 16 }, r); return r; },
  team(p) { const r = G(p); [[-46, 10, C.groen], [46, 10, C.oranje], [0, -6, C.accent]].forEach(([x, y, k]) => { el('circle', { cx: x, cy: y - 34, r: 24, fill: '#fff', stroke: C.inkt, 'stroke-width': 6 }, r); el('path', { d: `M${x - 36},${y + 40} a36,36 0 0 1 72,0Z`, fill: F(k), stroke: C.inkt, 'stroke-width': 6 }, r); }); return r; },
  gebruiker(p, kleur = C.accent) { const r = G(p); el('circle', { cy: -26, r: 28, fill: '#fff', stroke: C.inkt, 'stroke-width': 7 }, r); el('path', { d: 'M-48,58 a48,48 0 0 1 96,0Z', fill: F(kleur), stroke: C.inkt, 'stroke-width': 7, 'stroke-linejoin': 'round' }, r); return r; },
  /** r.wiel kun je draaien. */
  tandwiel(p, kleur = C.muted) { const r = G(p); r.wiel = G(r); for (let i = 0; i < 8; i++) el('rect', { x: -11, y: -62, width: 22, height: 30, rx: 5, fill: kleur, transform: `rotate(${i * 45})` }, r.wiel); el('circle', { r: 44, fill: kleur }, r.wiel); el('circle', { r: 18, fill: '#fff' }, r.wiel); return r; },
  mail(p) { const r = G(p); el('rect', { x: -62, y: -42, width: 124, height: 84, rx: 12, fill: '#fff', stroke: C.inkt, 'stroke-width': 7 }, r); el('path', { d: 'M-58,-36 L0,10 L58,-36', fill: 'none', stroke: C.inkt, 'stroke-width': 7, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, r); return r; },
  kalender(p) { const r = G(p); el('rect', { x: -56, y: -48, width: 112, height: 104, rx: 14, fill: '#fff', stroke: C.inkt, 'stroke-width': 7 }, r); el('path', { d: 'M-56,-34 a14,14 0 0 1 14,-14 H42 a14,14 0 0 1 14,14 V-16 H-56Z', fill: F(C.accent), stroke: C.inkt, 'stroke-width': 7, 'stroke-linejoin': 'round' }, r); el('path', { d: 'M-28,-62 V-40 M28,-62 V-40', stroke: C.inkt, 'stroke-width': 8, 'stroke-linecap': 'round' }, r); [[-28, 6], [0, 6], [28, 6], [-28, 32], [0, 32]].forEach(([x, y]) => el('rect', { x: x - 8, y: y - 8, width: 16, height: 16, rx: 4, fill: C.grijs }, r)); return r; },
  grafiek(p) { const r = G(p); [[-44, 30, C.grijs], [-14, 54, C.accent2], [16, 78, C.accent], [46, 104, C.groen]].forEach(([x, h, k]) => el('rect', { x: x - 11, y: 52 - h, width: 22, height: h, rx: 6, fill: F(k) }, r)); el('path', { d: 'M-62,56 H62', stroke: C.inkt, 'stroke-width': 7, 'stroke-linecap': 'round' }, r); return r; },
  schild(p, kleur = C.accent) { const r = G(p); el('path', { d: 'M0,-62 L50,-42 V-4 C50,30 28,52 0,64 C-28,52 -50,30 -50,-4 V-42Z', fill: F(kleur), stroke: C.inkt, 'stroke-width': 7, 'stroke-linejoin': 'round' }, r); el('path', { d: 'M-20,0 L-5,15 L22,-14', stroke: '#fff', 'stroke-width': 11, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }, r); return r; },
  lamp(p, kleur = C.geel) { const r = G(p); el('path', { d: 'M0,-60 C34,-60 48,-34 48,-14 C48,8 30,18 26,36 H-26 C-30,18 -48,8 -48,-14 C-48,-34 -34,-60 0,-60Z', fill: F(kleur), stroke: C.inkt, 'stroke-width': 7, 'stroke-linejoin': 'round' }, r); el('path', { d: 'M-20,50 H20 M-12,64 H12', stroke: C.inkt, 'stroke-width': 8, 'stroke-linecap': 'round' }, r); return r; },
  huis(p, kleur = C.accent) { const r = G(p); el('rect', { x: -44, y: -14, width: 88, height: 70, rx: 6, fill: '#fff', stroke: C.inkt, 'stroke-width': 7 }, r); el('path', { d: 'M-62,-10 L0,-62 L62,-10Z', fill: F(kleur), stroke: C.inkt, 'stroke-width': 7, 'stroke-linejoin': 'round' }, r); el('rect', { x: -12, y: 14, width: 24, height: 42, rx: 4, fill: F(kleur) }, r); return r; },
  gebouw(p, kleur = C.accent) { const r = G(p); el('rect', { x: -46, y: -62, width: 92, height: 124, rx: 8, fill: '#fff', stroke: C.inkt, 'stroke-width': 7 }, r); [-40, -12, 16].forEach(y => [-22, 22].forEach(x => el('rect', { x: x - 11, y, width: 22, height: 18, rx: 4, fill: F(kleur) }, r))); el('rect', { x: -12, y: 40, width: 24, height: 22, fill: C.inkt }, r); return r; },
  winkelwagen(p) { const r = lijn(p, C.inkt, 9); el('path', { d: 'M-62,-46 H-42 L-24,22 H40 L54,-22 H-34' }, r); el('circle', { cx: -16, cy: 46, r: 9, fill: C.inkt }, r); el('circle', { cx: 32, cy: 46, r: 9, fill: C.inkt }, r); return r; },
  pijl(p, kleur = C.accent) { const r = lijn(p, kleur, 14); el('path', { d: 'M-52,0 H46 M14,-32 L48,0 L14,32' }, r); return r; },
  duim(p, kleur = C.accent) { const r = G(p); el('rect', { x: -56, y: -6, width: 30, height: 62, rx: 8, fill: C.inkt }, r); el('path', { d: 'M-18,-4 C0,-20 6,-40 4,-58 C22,-62 32,-40 24,-16 H48 C62,-16 62,4 52,8 C60,16 56,30 46,32 C52,42 46,54 34,54 H-18Z', fill: F(kleur), stroke: C.inkt, 'stroke-width': 7, 'stroke-linejoin': 'round' }, r); return r; },
  spraak(p, kleur = C.accent) { const r = G(p); el('path', { d: 'M-60,-48 H60 V26 H-8 L-34,54 V26 H-60Z', fill: F(kleur), stroke: C.inkt, 'stroke-width': 7, 'stroke-linejoin': 'round' }, r); [-28, 0, 28].forEach(x => el('circle', { cx: x, cy: -11, r: 7, fill: '#fff' }, r)); return r; },
  wereld(p, kleur = C.blauw) { const r = G(p); el('circle', { r: 56, fill: F(kleur), stroke: C.inkt, 'stroke-width': 7 }, r); el('path', { d: 'M-56,0 H56 M0,-56 C-34,-24 -34,24 0,56 M0,-56 C34,-24 34,24 0,56', fill: 'none', stroke: '#fff', 'stroke-width': 5, 'stroke-opacity': .85 }, r); return r; },
  slot(p, kleur = C.accent) { const r = G(p); el('path', { d: 'M-26,-10 V-30 a26,26 0 0 1 52,0 V-10', fill: 'none', stroke: C.inkt, 'stroke-width': 10 }, r); el('rect', { x: -44, y: -12, width: 88, height: 70, rx: 14, fill: F(kleur), stroke: C.inkt, 'stroke-width': 7 }, r); el('circle', { cy: 18, r: 9, fill: '#fff' }, r); return r; },
  raket(p, kleur = C.accent) { const r = G(p, { transform: 'rotate(45)' }); el('path', { d: 'M0,-66 C26,-40 28,0 20,30 H-20 C-28,0 -26,-40 0,-66Z', fill: '#fff', stroke: C.inkt, 'stroke-width': 7, 'stroke-linejoin': 'round' }, r); el('circle', { cy: -18, r: 12, fill: F(kleur), stroke: C.inkt, 'stroke-width': 5 }, r); el('path', { d: 'M-20,8 L-42,40 L-20,30Z M20,8 L42,40 L20,30Z', fill: F(kleur), stroke: C.inkt, 'stroke-width': 6, 'stroke-linejoin': 'round' }, r); el('path', { d: 'M-10,34 L0,62 L10,34Z', fill: F(C.oranje) }, r); return r; },
};

// ---------- merk ----------
/** Het vlak waar een logo op staat: wit, of donker als het logo zelf wit is. */
const logoVlak = () => (LOGO && LOGO.licht ? F(C.inkt) : '#fff');
/** Vierkant merkteken: het logo van de klant, of anders de eerste letter van de naam. */
function logoMerk(parent, s = 1) {
  const r = G(parent, { transform: `scale(${s})` });
  if (LOGO) {
    el('rect', { x: -60, y: -60, width: 120, height: 120, rx: 32, fill: logoVlak() }, r);
    el('image', { href: LOGO.src, x: -46, y: -46, width: 92, height: 92, preserveAspectRatio: 'xMidYMid meet' }, r);
    return r;
  }
  el('rect', { x: -60, y: -60, width: 120, height: 120, rx: 32, fill: F(C.accent) }, r);
  el('rect', { x: -54, y: -56, width: 108, height: 60, rx: 28, fill: 'url(#glans)' }, r);
  T(r, 0, 28, (MERK.naam || 'A').trim().charAt(0).toUpperCase(), 80, { fill: isLicht(C.accent) ? C.inkt : '#fff' });
  return r;
}
/** Een breed logo op een eigen kaartje, gecentreerd op 0,0. `hoogte` is de hoogte van het logo zelf. */
function logoKaart(parent, hoogte, maxBreedte, { kaal = false } = {}) {
  const r = G(parent);
  let h = hoogte, b = h * LOGO.w / LOGO.h;
  if (b > maxBreedte) { b = maxBreedte; h = b * LOGO.h / LOGO.w; }
  const px = hoogte * .42, py = hoogte * .32;
  if (!kaal) el('rect', { x: -b / 2 - px, y: -hoogte / 2 - py, width: b + 2 * px, height: hoogte + 2 * py, rx: Math.min(40, (hoogte + 2 * py) / 2), fill: logoVlak() }, r);
  el('image', { href: LOGO.src, x: -b / 2, y: -h / 2, width: b, height: h, preserveAspectRatio: 'xMidYMid meet' }, r);
  r.breedte = b + (kaal ? 0 : 2 * px);
  return r;
}
/** Het logo groot, gecentreerd op 0,0: voor de eindkaart (donkere achtergrond). */
function logoVol(parent, { s = 1, kleur = '#fff' } = {}) {
  const r = G(parent), lb = G(r);
  if (LOGO_BREED) {
    // Een wit logo staat rechtstreeks op de donkere eindkaart; elk ander logo op een wit kaartje,
    // anders valt een donker logo weg.
    logoKaart(lb, 150 * s, W - 2 * RAND - 140, { kaal: LOGO.licht });
    return r;
  }
  logoMerk(lb, 1.15);
  el('text', { x: 100, y: 32, 'font-size': 96, fill: kleur, 'font-weight': 800 }, lb, MERK.naam || '');
  const bb = lb.getBBox();
  // Een lange bedrijfsnaam mag nooit buiten beeld vallen.
  const pas = Math.min(s, (W - 2 * RAND) / bb.width);
  lb.setAttribute('transform', `scale(${pas}) translate(${-(bb.x + bb.width / 2)},0)`);
  return r;
}

// ---------- foto's van de klant ----------
let fotoNr = 0;
/**
 * Zet een foto van de klant in beeld, gecentreerd op 0,0, met ronde hoeken, een witte rand en
 * een schaduw. `breedte` in pixels; de hoogte volgt uit de foto, of geef `hoogte` mee (dan
 * wordt de foto passend uitgesneden). Geeft een groep terug met .breedte en .hoogte.
 */
function foto(parent, id, breedte = 600, { hoogte, rond = 28, rand = 10, schaduw = true } = {}) {
  const r = G(parent), f = FOTOS[id];
  if (!f) { meld(`foto(parent, '${id}'): dat beeld bestaat niet. Beschikbaar: ${Object.keys(FOTOS).join(', ') || 'geen'}.`); r.breedte = r.hoogte = 0; return r; }
  const b = breedte, h = hoogte || b * f.h / f.w, cid = 'fotoKnip' + (++fotoNr);
  el('rect', { x: -b / 2, y: -h / 2, width: b, height: h, rx: rond }, el('clipPath', { id: cid }, $('defs')));
  if (rand || schaduw) el('rect', { x: -b / 2 - rand, y: -h / 2 - rand, width: b + 2 * rand, height: h + 2 * rand, rx: rond + rand, fill: '#fff', ...(schaduw ? { filter: 'url(#sch)' } : {}) }, r);
  el('image', { href: f.src, x: -b / 2, y: -h / 2, width: b, height: h, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${cid})` }, r);
  r.breedte = b + 2 * rand; r.hoogte = h + 2 * rand;
  return r;
}

// ---------- harnas ----------
// E is van de video (Claude bewaart er zijn elementen in); K is van de kern zelf. Eerst
// deelden ze één object, en een video die zijn eigen E.deel maakte, brak de achtergrond.
const SC = {}, E = {}, K = {};
let SCENES = [], END = 10, V = null;
/** Maakt de groep van een scene; alles wat je erin tekent is alleen in die scene te zien. */
const sc = id => (SC[id] = SC[id] || G($('scenes'), { id: 'sc_' + id }));
const sStart = id => { const s = SCENES.find(s => s[0] === id); if (!s) { meld(`sStart('${id}'): die scene bestaat niet.`); return 0; } return s[1]; };
const sEind = id => { const i = SCENES.findIndex(s => s[0] === id); return i < 0 || i === SCENES.length - 1 ? END : SCENES[i + 1][1]; };

function bouwHarnas() {
  const st = $('st'); st.setAttribute('width', W); st.setAttribute('height', H); st.setAttribute('viewBox', `0 0 ${W} ${H}`);
  document.body.style.width = W + 'px'; document.body.style.height = H + 'px';
  [['bg', 0], ['vig', 0], ['bgDots', 96]].forEach(([id, extra]) => { $(id).setAttribute('width', W + extra); $(id).setAttribute('height', H + extra); });
  SCENES = sceneTijden();
  const last = WRD[WRD.length - 1]; END = +((last ? last.end : 10) + D + (V.naloop ?? 2.8)).toFixed(2);
  K.deel = [...Array(16)].map((_, i) => ({ c: el('circle', { r: 3 + (i * 7) % 6, fill: [C.accent, C.accent2, C.groen][i % 3], 'fill-opacity': .32 }, $('deeltjes')), x: (i * 397) % W, y: (i * 251) % H, v: 14 + (i * 13) % 22 }));
  K.orbs = [[C.accent, .2, .25], [C.accent2, .85, .2], [C.groen, .7, .9]].map(([k, x, y], i) => ({ c: el('circle', { r: Math.max(W, H) * .26, fill: k, 'fill-opacity': .12 }, $('orbs')), x: x * W, y: y * H, i }));
  SCENES.forEach(([id]) => sc(id));
  V.bouw(E, SC);
  bouwEind();
  // merk linksboven + hoofdstukpil rechtsboven
  K.bug = G($('hud'));
  const bp = G(K.bug, { filter: 'url(#sch)' });
  if (LOGO_BREED) {
    // Het logo bevat de naam al: alleen het logo, links uitgelijnd op de veilige rand.
    const k = logoKaart(bp, 46, 300);
    k.setAttribute('transform', `translate(${k.breedte / 2 - 14},0)`);
  } else {
    const bR = el('rect', { x: -14, y: -40, width: 318, height: 80, rx: 40, fill: '#fff' }, bp);
    logoMerk(G(bp, { transform: 'translate(26,0)' }), .48);
    const bt = el('text', { x: 70, y: 11, 'font-size': 30, fill: C.inkt, 'font-weight': 800 }, bp, MERK.naam || '');
    bR.setAttribute('width', 70 + bt.getComputedTextLength() + 44);
  }
  K.hfdG = {}; for (const k in (V.hfd || {})) if (SC[k]) K.hfdG[k] = pil($('hud'), V.hfd[k], { size: 32, h: 70, padX: 30 });
  const wg = G($('wipe'));
  K.wA = el('rect', { x: -400, y: -300, width: W + H + 1300, height: H + 600, fill: F(C.accent) }, wg);
  K.wB = el('rect', { x: -400, y: -300, width: W + H + 1300, height: H + 600, fill: F(C.accent2) }, wg);
}

function bouwEind() {
  const se = sc('eind'), e = V.eind || {}; K.eind = {};
  el('rect', { width: W, height: H, fill: 'url(#gDonker)' }, se);
  el('circle', { cx: MX, cy: STAAND ? H * .5 : 575, r: Math.max(W, H) * .32, fill: C.accent, 'fill-opacity': .28, filter: 'url(#zacht)' }, se);
  el('rect', { x: -48, y: -48, width: W + 96, height: H + 96, fill: 'url(#dotsW)' }, se);
  K.eind.str = G(se);
  for (let i = 0; i < 18; i++) el('rect', { x: -3, y: -1400, width: 6, height: 980, rx: 3, fill: C.accent2, 'fill-opacity': .07, transform: `rotate(${i * 20})` }, K.eind.str);
  const na = sStart('eind'), fs = STAAND ? 72 : 68;
  // Te lange regels worden kleiner gezet in plaats van buiten beeld te vallen.
  const pasRegel = z => { if (!z) return; const b = z.t.getComputedTextLength(), max = W - 2 * RAND; if (b > max) z.t.setAttribute('font-size', Math.floor(fs * max / b)); };
  K.eind.r1 = e.regel1 ? zinAuto(se, MX, STAAND ? 560 : 250, e.regel1, na, fs, { fill: '#fff' }) : null;
  K.eind.r2 = e.regel2 ? zinAuto(se, MX, STAAND ? 660 : 345, e.regel2, na, fs, { fill: isLicht(C.accent2) ? C.accent2 : mix(C.accent2, '#ffffff', .45) }) : null;
  pasRegel(K.eind.r1); pasRegel(K.eind.r2);
  K.eind.logo = logoVol(se, { s: STAAND ? .82 : 1 });
  K.eind.knop = pil(se, e.knop || 'Meer weten?', { fill: C.accent2, size: STAAND ? 52 : 50, h: 104, padX: 48 });
  K.eind.url = T(se, MX, STAAND ? 1360 : 905, MERK.website || '', 46, { fill: '#c3cfdf', 'font-weight': 600 });
  K.eind.logoY = STAAND ? 960 : 575; K.eind.knopY = STAAND ? 1200 : 770;
  // Het logo staat er meteen: de slotzin begint vaak met een aanloop ("Heb je ...?") en
  // dan keek je seconden naar een leeg donker vlak. De knop komt als de regels zijn gezegd.
  K.eind.tLogo = na + .35;
  const laatste = [K.eind.r1, K.eind.r2].filter(Boolean).flatMap(z => z.spans.map(x => x.tijd)).reduce((a, b) => Math.max(a, b), 0);
  K.eind.tKnop = Math.max(na + 1, Math.min(Math.max(K.eind.tLogo + 1.1, laatste + .35), END - 1.6));
}
function tekenEind(tt) {
  const e = K.eind;
  e.str.setAttribute('transform', `translate(${MX},${e.logoY}) rotate(${tt * 4})`);
  e.r1 && woordenIn(e.r1, tt); e.r2 && woordenIn(e.r2, tt);
  const lp = pop(tt, e.tLogo, .6); op(e.logo, lp); tf(e.logo, MX, e.logoY, lp);
  const kp = pop(tt, e.tKnop, .5); op(e.knop, kp); tf(e.knop, MX, e.knopY, kp * (1 + .025 * Math.sin(Math.max(0, tt - e.tKnop - .6) * 4)));
  const up = eo(P(tt, e.tKnop + .3, e.tKnop + .7)); op(e.url, up); e.url.setAttribute('transform', `translate(0,${(1 - up) * 20})`);
}

function render(t) {
  const tt = t - D;
  let cur = SCENES[0][0]; for (const [id, a] of SCENES) if (tt >= a - .02) cur = id;
  for (const k in SC) SC[k].style.display = k === cur ? '' : 'none';
  $('bgDots').setAttribute('transform', `translate(${-(tt * 6) % 48},${-(tt * 4) % 48})`);
  K.orbs.forEach(o => { o.c.setAttribute('cx', o.x + golf(tt, .03, 120, o.i)); o.c.setAttribute('cy', o.y + golf(tt, .025, 90, o.i + 2)); });
  K.deel.forEach(d => { d.c.setAttribute('cx', d.x + golf(tt, .05, 40, d.x)); d.c.setAttribute('cy', ((d.y - tt * d.v) % (H + 100) + H + 100) % (H + 100) - 50); });
  // veeg tussen de scenes
  let wp = 0; for (const [, a] of SCENES.slice(1)) if (tt > a - .45 && tt < a + .45) wp = P(tt, a - .45, a + .45);
  const wx = wp ? lerp(-(W + H + 1700), W + 800 + H * .3, eio(wp)) : -12000;
  K.wB.setAttribute('transform', `translate(${wx},0) skewX(-14)`); K.wA.setAttribute('transform', `translate(${wx - 260},0) skewX(-14)`);
  // merk en hoofdstuk
  const s2 = SCENES.length > 1 ? SCENES[1][1] : 0, eind = sStart('eind'), hudAan = tt >= s2 && tt < eind && V.hud !== false;
  op(K.bug, hudAan ? P(tt, s2 + .2, s2 + .6) : 0); if (hudAan) tf(K.bug, RAND + (1 - eo(P(tt, s2 + .2, s2 + .65))) * -60, STAAND ? 150 : 100);
  for (const k in K.hfdG) {
    const a = sStart(k), p = eo(P(tt, a + .3, a + .75)), g = K.hfdG[k];
    op(g, cur === k ? p : 0); tf(g, W - RAND - g.breedte / 2 + (1 - p) * 120, STAAND ? 250 : 100);
  }
  try {
    if (cur === 'eind') tekenEind(tt); else V.teken(tt, cur, E, SC);
  } catch (err) { meld(`Fout in teken() bij scene ${cur}, t=${tt.toFixed(1)} s: ${err && err.message}${waar(err)}`); }
}
window.render = render;

// ---------- zelfcontrole ----------
// Wat een mens meteen ziet maar een model in zijn eigen code mist: tekst die buiten beeld
// valt. Geeft per zichtbare tekst die over de rand gaat een regel terug.
function zichtbaar(e) {
  for (let n = e; n && n.nodeType === 1 && n.id !== 'st'; n = n.parentNode) {
    if (n.style && n.style.display === 'none') return false;
    const o = n.getAttribute('opacity'); if (o !== null && +o < .5) return false;
  }
  return true;
}
window.controle = function () {
  const uit = [], marge = 36;
  document.querySelectorAll('#scenes text, #hud text').forEach(t => {
    if (!t.textContent.trim() || !zichtbaar(t)) return;
    const b = t.getBoundingClientRect(); if (b.width < 2) return;
    if (b.left < marge || b.right > W - marge || b.top < marge || b.bottom > H - marge)
      uit.push(`De tekst "${t.textContent.trim().slice(0, 50)}" valt (deels) buiten beeld: x ${Math.round(b.left)} tot ${Math.round(b.right)}, y ${Math.round(b.top)} tot ${Math.round(b.bottom)} (beeld is ${W} x ${H}).`);
  });
  return uit;
};

/** Start de video; de pagina roept dit aan nadat window.VIDEO is gezet. */
window.start = function () {
  const klaar = () => { window.END = END; window.SCENES = SCENES; window.READY = true; };
  V = window.VIDEO;
  if (!V || typeof V.bouw !== 'function' || typeof V.teken !== 'function') { meld('window.VIDEO ontbreekt of heeft geen bouw() en teken().'); return klaar(); }
  const begin = () => {
    try { bouwHarnas(); render(0); } catch (err) { meld(`Fout tijdens het opbouwen (bouw): ${err && err.message}${waar(err)}`); }
    klaar();
  };
  // Zonder het lettertype meet pil() de tekstbreedtes verkeerd.
  const letters = document.fonts && document.fonts.load ? Promise.all(['800', '700', '600', '500'].map(g => document.fonts.load(`${g} 40px "${MERK.font || 'Plus Jakarta Sans'}"`))).catch(() => {}) : Promise.resolve();
  // Ook het logo en de foto's moeten uitgepakt zijn voor het eerste beeld; anders ontbreken
  // ze op de eerste foto's van de video.
  const plaatjes = [LOGO && LOGO.src, ...Object.values(FOTOS).map(f => f.src)].filter(Boolean).map(src => { const i = new Image(); i.src = src; return i.decode ? i.decode().catch(() => {}) : Promise.resolve(); });
  Promise.race([Promise.all([letters, ...plaatjes]), new Promise(r => setTimeout(r, 8000))]).then(begin);
};
