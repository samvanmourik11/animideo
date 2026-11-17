// Echte landkaarten voor motion graphics. Claude tekende landen vroeger uit het hoofd en dat
// werden willekeurige vlakken (Sam, 17-11-2026). Nu komen de grenzen uit Natural Earth
// (LANDEN_DATA, alleen de landen die de video nodig heeft, zie lib/motion/pagina.ts).
// Alle paden staan in één Miller-projectie van 3600 breed; hier wordt alleen geschaald.

/** Lengte/breedtegraad → punt in de wereldprojectie (zelfde formule als scripts/maak-landen.mjs). */
function millerXY(lon, lat) {
  const R = 3600 / (2 * Math.PI);
  const la = Math.max(-84, Math.min(84, lat)) * Math.PI / 180;
  return [R * lon * Math.PI / 180 + 1800, R * 2.3 - R * 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * la))];
}

function _landStijl(code, o, standaard) {
  const m = o.markeer && o.markeer[code];
  if (m) return { fill: F(m === true ? C.accent : m), stroke: C.inkt };
  return standaard;
}

/**
 * Kaart van een stuk wereld, gecentreerd op 0,0 en passend in breedte × hoogte.
 * `codes`: de landen waar het om draait (ISO-code, 'NL', 'DE', ...); de kaart zoomt daarop in
 * en tekent de buren er licht omheen. o.markeer = { NL: C.accent, DE: true } kleurt landen.
 * Geeft { r, land: { NL: pad }, punt(lon, lat) → [x, y], schaal } terug.
 */
function landkaart(parent, codes, breedte, hoogte, o = {}) {
  const r = G(parent);
  const D = typeof LANDEN_DATA === 'undefined' ? {} : LANDEN_DATA;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of codes) {
    const l = D[c]; if (!l) continue;
    x0 = Math.min(x0, l.b[0]); y0 = Math.min(y0, l.b[1]); x1 = Math.max(x1, l.b[2]); y1 = Math.max(y1, l.b[3]);
  }
  if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = 3600; y1 = 2300; }
  const marge = o.marge ?? .18;
  const bw = (x1 - x0) * (1 + 2 * marge) || 10, bh = (y1 - y0) * (1 + 2 * marge) || 10;
  const s = Math.min(breedte / bw, hoogte / bh);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const kader = el('clipPath', { id: 'lk' + Math.random().toString(36).slice(2, 8) }, r);
  el('rect', { x: -breedte / 2, y: -hoogte / 2, width: breedte, height: hoogte, rx: o.rond ?? 0 }, kader);
  const binnen = G(r, { 'clip-path': `url(#${kader.id})` });
  if (o.zee !== false) el('rect', { x: -breedte / 2, y: -hoogte / 2, width: breedte, height: hoogte, fill: o.zee || mix(C.blauw, '#fff', .86), rx: o.rond ?? 0 }, binnen);
  const g = G(binnen, { transform: `scale(${s}) translate(${-cx},${-cy})` });
  const lijn = (o.lijn ?? 2.2) / s;
  const land = {};
  const buur = { fill: o.buurKleur || '#fff', stroke: mix(C.inkt, '#fff', .55) };
  const wil = new Set(codes);
  for (const c in D) {
    const l = D[c];
    // Buren alleen als ze in beeld vallen; de gevraagde landen erbovenop.
    if (l.b[2] < cx - bw / 2 || l.b[0] > cx + bw / 2 || l.b[3] < cy - bh / 2 || l.b[1] > cy + bh / 2) continue;
    if (wil.has(c)) continue;
    if (o.buren === false) continue;
    const st = _landStijl(c, o, buur);
    land[c] = el('path', { d: l.d, fill: st.fill, stroke: st.stroke, 'stroke-width': lijn, 'stroke-linejoin': 'round' }, g);
  }
  for (const c of codes) {
    const l = D[c]; if (!l) continue;
    const st = _landStijl(c, o, { fill: F(o.kleur || C.accent), stroke: C.inkt });
    land[c] = el('path', { d: l.d, fill: st.fill, stroke: st.stroke, 'stroke-width': lijn * 1.4, 'stroke-linejoin': 'round' }, g);
  }
  r.land = land;
  r.schaal = s;
  r.punt = (lon, lat) => { const [x, y] = millerXY(lon, lat); return [(x - cx) * s, (y - cy) * s]; };
  return r;
}

/** Eén land los (zonder zee en buren), gecentreerd op 0,0, passend in breedte (en hoogte). */
function land(parent, code, breedte, o = {}) {
  const k = landkaart(parent, [code], breedte, o.hoogte ?? breedte, { ...o, zee: false, buren: false, marge: 0 });
  return k;
}

/** De hele wereld (zonder Antarctica), gecentreerd op 0,0. o.markeer kleurt landen. */
function wereldkaart(parent, breedte, o = {}) {
  const r = G(parent);
  const D = typeof LANDEN_DATA === 'undefined' ? {} : LANDEN_DATA;
  const s = breedte / 3600, cx = 1800, cy = 1060;
  const kader = el('clipPath', { id: 'wk' + Math.random().toString(36).slice(2, 8) }, r);
  el('rect', { x: -breedte / 2, y: -breedte, width: breedte, height: breedte * 2 }, kader);
  const g = G(G(r, { 'clip-path': `url(#${kader.id})` }), { transform: `scale(${s}) translate(${-cx},${-cy})` });
  const land = {};
  for (const c in D) {
    if (c === 'AQ') continue;
    const st = _landStijl(c, o, { fill: o.landKleur || mix(C.inkt, '#fff', .82), stroke: '#fff' });
    land[c] = el('path', { d: D[c].d, fill: st.fill, stroke: st.stroke, 'stroke-width': (o.lijn ?? 1.4) / s, 'stroke-linejoin': 'round' }, g);
  }
  r.land = land;
  r.schaal = s;
  r.punt = (lon, lat) => { const [x, y] = millerXY(lon, lat); return [(x - cx) * s, (y - cy) * s]; };
  return r;
}
