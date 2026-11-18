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

/**
 * Een route over de kaart van plaats A naar B (lengte/breedtegraad), als boog met een donkere
 * rand. Overgenomen uit de premiumproef (17-11-2026): dat zag er veel verzorgder uit dan een
 * kale lijn. In teken: `rt.zet(0..1)` tekent de route, `rt.op(e, 0..1)` zet iets erop (een
 * busje, een pakje). `bocht` is hoe krom (−.4 … .4).
 */
function route(kaartObj, van, naar, o = {}) {
  const [x1, y1] = kaartObj.punt(van[0], van[1]), [x2, y2] = kaartObj.punt(naar[0], naar[1]);
  const b = o.bocht ?? .18, dx = x2 - x1, dy = y2 - y1;
  const cx = (x1 + x2) / 2 - dy * b, cy = (y1 + y2) / 2 + dx * b;
  const d = `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`, kl = o.kleur || C.accent;
  const g = G(kaartObj);
  const onder = el('path', { d, fill: 'none', stroke: C.inkt, 'stroke-width': (o.dikte ?? 9) + 8, 'stroke-linecap': 'round' }, g);
  const lijn = el('path', { d, fill: 'none', stroke: kl, 'stroke-width': o.dikte ?? 9, 'stroke-linecap': 'round' }, g);
  const eind = G(g); el('circle', { r: 16, fill: '#fff', stroke: C.inkt, 'stroke-width': 6 }, eind); el('circle', { r: 7, fill: kl }, eind);
  tf(eind, x2, y2);
  return {
    r: g, lijn, eind, van: [x1, y1], naar: [x2, y2],
    zet(q) { draw(onder, q); draw(lijn, q); op(onder, q > 0 ? 1 : 0); op(lijn, q > 0 ? 1 : 0); op(eind, P(q, .85, 1)); tf(eind, x2, y2, back(P(q, .85, 1))); },
    op(e, q, s = 1) { const u = cl(q), a = 1 - u; tf(e, a * a * x1 + 2 * a * u * cx + u * u * x2, a * a * y1 + 2 * a * u * cy + u * u * y2, s); },
  };
}

/**
 * Een plaats op de kaart: stip met kloppende ring en een naamlabel erboven. In teken:
 * `pl.zet(tt, 0..1)`; de ring klopt vanzelf zodra de plaats er staat.
 */
function plaats(kaartObj, lon, lat, naam, o = {}) {
  const [x, y] = kaartObj.punt(lon, lat), kl = o.kleur || C.accent;
  const g = G(kaartObj), stip = G(g);
  const ring = el('circle', { r: 20, fill: 'none', stroke: kl, 'stroke-width': 6 }, stip);
  el('circle', { r: 20, fill: '#fff', stroke: C.inkt, 'stroke-width': 6 }, stip); el('circle', { r: 11, fill: F(kl) }, stip);
  const label = naam ? pil(g, naam, { fill: kl, kleur: '#fff', size: o.size ?? 32, h: (o.size ?? 32) * 1.95 }) : null;
  const lx = o.labelX ?? 0, ly = o.labelY ?? -64;
  return {
    r: g, x, y,
    zet(tt, p) {
      op(stip, p); tf(stip, x, y, Math.max(p, 0));
      const u = p >= 1 ? (tt * .7) % 1 : 0;
      ring.setAttribute('r', 20 + u * 46); op(ring, p >= 1 ? (1 - u) * .8 : 0);
      if (label) { const lp = P(p, .4, 1); op(label, lp); tf(label, x + lx, y + ly, back(lp)); }
    },
  };
}
