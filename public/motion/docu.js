// DOCU-SJABLONEN — vaste beelden voor de docu-studio, getekend op de bouwstenen van kern.js.
//
// Waarom (Sam, 14-11-2026: "hoe krijgen we dit goedkoper?"): in de eerste proeven tekende
// Claude elke scene zelf, ±$4,50 voor tien minuten. Een docu bestaat echter steeds uit
// dezelfde soorten beelden, net als onze eigen KRONIK-video's (anim.html per kanaal):
// een archieffoto met een jaartal erover, een datum met een stempel, een teller, een
// tijdlijn, een dossierkaart. Claude kiest nu alleen nog per scene welk sjabloon en met
// welke tekst en getallen; deze code tekent het. Dat kost centen in plaats van dollars,
// en elke docu is even strak, zonder verzonnen vermeldingen of tekst over tekst.
//
// Gebruik: window.VIDEO = docuVideo({ scenes: [{ id: 's1', sjabloon: 'foto', ... }], hfd, eind, taal })
// Alleen liggend (1920 x 1080), in de stijl "archief".

function docuVideo(spec) {
  const KOP = "'Archivo Black', sans-serif";
  const MONO = "'IBM Plex Mono', monospace";
  const LOC = { en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-PT' }[spec.taal] || 'nl-NL';
  const DOSSIER = { en: 'File', de: 'Akte', fr: 'Dossier', es: 'Expediente', it: 'Fascicolo', pt: 'Processo' }[spec.taal] || 'Dossier';

  // Een woord in de voice-over opzoeken zonder foutmelding: een sjabloon heeft altijd een
  // eigen tijd als het woord er niet (meer) in staat, bijvoorbeeld na een verbetering.
  function zoek(woord, na) {
    const n = norm(woord || '');
    if (!n) return null;
    const w = WRD.find(w => w.start >= na - .05 && (w.n === n || w.n.startsWith(n) || (n.startsWith(w.n) && w.n.length > 3)));
    return w ? w.start : null;
  }
  /** n momenten in de scene: op de sleutelwoorden, anders gelijk verdeeld. */
  function momenten(sh, a, e, n) {
    const uit = []; let na = a;
    const ruimte = Math.max(1, e - a - 1.2);
    for (let i = 0; i < n; i++) {
      const t = zoek((sh.woorden || [])[i], na);
      const gok = a + .35 + ruimte * (i / Math.max(1, n));
      let tijd = t != null && t < e - .4 ? Math.max(t, na) : Math.max(gok, na);
      // Het eerste element staat er snel: een scene die een seconde leeg blijft, voelt dood.
      if (i === 0) tijd = Math.min(tijd, a + .5);
      uit.push(tijd); na = tijd + .25;
    }
    return uit;
  }
  /** Lettergrootte waarbij `tekst` in `breed` past (schatting per teken, geen meting nodig). */
  const maat = (tekst, breed, size, f = .7) => Math.max(18, Math.min(size, Math.floor(breed / Math.max(1, String(tekst).length * f))));
  // Lettertype en dikte via style: de pagina zet ze voor alle tekst in een stijlregel, en
  // die gaat vóór op een gewoon attribuut.
  function tekst(p, x, y, s, size, at = {}) {
    const { 'font-family': ff, 'font-weight': fw, ...rest } = at;
    const stijl = [ff ? `font-family:${ff}` : '', fw != null ? `font-weight:${fw}` : ''].filter(Boolean).join(';');
    return el('text', { x, y, 'font-size': size, fill: C.inkt, 'text-anchor': 'start', ...(stijl ? { style: stijl } : {}), ...rest }, p, s);
  }
  const kop = (p, x, y, s, size, at = {}) => tekst(p, x, y, String(s).toUpperCase(), size, { 'font-family': KOP, 'font-weight': 400, ...at });
  const mono = (p, x, y, s, size, at = {}) => tekst(p, x, y, String(s).toUpperCase(), size, { 'font-family': MONO, 'font-weight': 600, 'letter-spacing': Math.round(size / 6), fill: C.muted, ...at });
  const getal = v => { const n = parseFloat(String(v).replace(/[^0-9,.\-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const schrijf = (v, dec) => v.toLocaleString(LOC, { minimumFractionDigits: dec, maximumFractionDigits: dec });

  function stempel(p, s) {
    const g = G(p), fs = maat(s, 700, 76, .74), w = String(s).length * fs * .74 + 80;
    el('rect', { x: -w / 2, y: -fs * .95, width: w, height: fs * 1.75, fill: 'none', stroke: C.rood, 'stroke-width': 10, rx: 6 }, g);
    kop(g, 0, fs * .35, s, fs, { fill: C.rood, 'text-anchor': 'middle' });
    return g;
  }
  function tekenStempel(g, tt, t, x, y) {
    const p = P(tt, t, t + .3);
    op(g, p > 0 ? 1 : 0); tf(g, x, y, lerp(1.7, 1, eo(p)), -8);
  }
  /** Iets laten binnenkomen: vervagen en een klein stukje omhoog schuiven. */
  function erin(g, tt, t, x, y, dy = 26) { const p = eo(P(tt, t, t + .55)); op(g, p); tf(g, x, y + (1 - p) * dy); return p; }

  // Eén keer: het donkere verloop over foto's.
  let verloop = false;
  function maakVerloop() {
    if (verloop) return; verloop = true;
    const d = $('defs');
    const g = el('linearGradient', { id: 'docuOnder', x1: 0, y1: 0, x2: 0, y2: 1 }, d);
    el('stop', { offset: 0, 'stop-color': '#000', 'stop-opacity': .05 }, g);
    el('stop', { offset: .45, 'stop-color': '#000', 'stop-opacity': .15 }, g);
    el('stop', { offset: 1, 'stop-color': '#000', 'stop-opacity': .82 }, g);
    const l = el('linearGradient', { id: 'docuLinks', x1: 0, y1: 0, x2: 1, y2: 0 }, d);
    el('stop', { offset: 0, 'stop-color': '#000', 'stop-opacity': .55 }, l);
    el('stop', { offset: .6, 'stop-color': '#000', 'stop-opacity': 0 }, l);
  }

  const S = {
    // Archieffoto beeldvullend, traag inzoomend; kop en ondertitel linksonder, vermelding eronder.
    foto: {
      bouw(g, sh, a, e, i) {
        maakVerloop();
        const o = { g: G(g), richting: i % 2 ? 1 : -1 };
        if (FOTOS[sh.foto]) o.f = foto(o.g, sh.foto, W, { hoogte: H, rond: 0, rand: 0, schaduw: false });
        el('rect', { width: W, height: H, fill: 'url(#docuOnder)' }, g);
        el('rect', { width: W, height: H, fill: 'url(#docuLinks)' }, g);
        const [t1, t2] = momenten(sh, a, e, 2);
        o.t1 = t1; o.t2 = t2;
        if (sh.kop) { o.kop = G(g); kop(o.kop, 0, 0, sh.kop, maat(sh.kop, W - 2 * RAND, 120, .72), { fill: '#f3efe6' }); }
        if (sh.sub) { o.sub = G(g); mono(o.sub, 0, 0, sh.sub, maat(sh.sub, W - 2 * RAND, 26, .75), { fill: '#d8d2c6' }); }
        if (sh.vermelding) tekst(g, RAND, H - 46, sh.vermelding, 18, { 'font-family': MONO, fill: '#f3efe6', opacity: .72 });
        return o;
      },
      teken(o, tt, a, e) {
        const q = P(tt, a - .45, e + .45);
        if (o.f) tf(o.f, MX + o.richting * lerp(-28, 28, q), MY + lerp(8, -8, q), lerp(1.02, 1.1, q));
        op(o.g, eo(P(tt, a - .3, a + .4)));
        if (o.kop) erin(o.kop, tt, o.t1, RAND, H - 190);
        if (o.sub) erin(o.sub, tt, o.t2, RAND, H - 128);
      },
    },

    // Een datum of jaartal dat het beeld vult, met een lijn eronder en eventueel een stempel.
    datum: {
      bouw(g, sh, a, e) {
        const [t1, t2, t3] = momenten(sh, a, e, 3), o = { t1, t2, t3 };
        o.kop = G(g); kop(o.kop, 0, 0, sh.kop || '', maat(sh.kop, W - 2 * RAND - 100, 190, .72), { 'text-anchor': 'middle' });
        o.lijn = el('line', { x1: MX - 420, x2: MX + 420, y1: MY + 60, y2: MY + 60, stroke: C.muted, 'stroke-width': 2 }, g);
        if (sh.sub) { o.sub = G(g); mono(o.sub, 0, 0, sh.sub, maat(sh.sub, 1300, 28, .75), { 'text-anchor': 'middle' }); }
        if (sh.stempel) o.st = stempel(g, sh.stempel);
        return o;
      },
      teken(o, tt) {
        erin(o.kop, tt, o.t1, MX, MY - 10, 40);
        draw(o.lijn, eo(P(tt, o.t1 + .2, o.t1 + 1)));
        if (o.sub) erin(o.sub, tt, o.t2, MX, MY + 130);
        if (o.st) tekenStempel(o.st, tt, o.t3, MX + 420, MY + 250);
      },
    },

    // Een getal dat oploopt: "€355 MILLION". getal is het getal; voor en na de tekens eromheen.
    teller: {
      bouw(g, sh, a, e) {
        const [t1, t2, t3] = momenten(sh, a, e, 3), o = { t1, t2, t3, doel: getal(sh.getal) };
        o.dec = Math.abs(o.doel % 1) > 0 ? 1 : 0;
        const breed = `${sh.voor || ''}${schrijf(o.doel, o.dec)}${sh.na || ''}`;
        o.fs = maat(breed, W - 2 * RAND, 200, .74);
        if (sh.kop) { o.lab = G(g); mono(o.lab, 0, 0, sh.kop, 28, { 'text-anchor': 'middle' }); }
        o.n = G(g); o.nt = kop(o.n, 0, 0, '', o.fs, { 'text-anchor': 'middle' });
        if (sh.sub) { o.sub = G(g); tekst(o.sub, 0, 0, sh.sub, maat(sh.sub, 1400, 34, .55), { 'text-anchor': 'middle', 'font-family': MONO, fill: C.inkt }); }
        if (sh.stempel) o.st = stempel(g, sh.stempel);
        return o;
      },
      teken(o, tt) {
        if (o.lab) erin(o.lab, tt, o.t1 - .3, MX, MY - 150);
        erin(o.n, tt, o.t1, MX, MY + 40, 30);
        const v = o.doel * eo(P(tt, o.t1, o.t1 + 1.6));
        o.nt.textContent = `${o.voorT}${schrijf(v, o.dec)}${o.naT}`.toUpperCase();
        if (o.sub) erin(o.sub, tt, o.t2, MX, MY + 150);
        if (o.st) tekenStempel(o.st, tt, o.t3, MX + 460, MY - 170);
      },
    },

    // Tijdlijn: punten die een voor een verschijnen, de lijn loopt mee.
    tijdlijn: {
      bouw(g, sh, a, e) {
        const items = (sh.items || []).slice(0, 6);
        // De buitenste momenten een halve tekstbreedte naar binnen: hun tekst staat gecentreerd
        // op de stip en liep anders tot tegen de rand van het beeld.
        const n = Math.max(1, items.length), breed = Math.min(380, (W - 2 * RAND) / n), x0 = RAND + breed / 2, x1 = W - RAND - breed / 2, y = MY + 30;
        const o = { ts: momenten(sh, a, e, n), y, x0, x1, punten: [] };
        if (sh.kop) { o.kop = G(g); mono(o.kop, 0, 0, sh.kop, 30, { 'text-anchor': 'middle' }); }
        el('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: C.grijs, 'stroke-width': 3 }, g);
        o.lijn = el('line', { x1: x0, x2: x0, y1: y, y2: y, stroke: C.rood, 'stroke-width': 4 }, g);
        const stap = n > 1 ? (x1 - x0) / (n - 1) : 0;
        items.forEach((it, i) => {
          const x = n > 1 ? x0 + i * stap : MX, p = G(g);
          o.punten.push({ g: p, x, stip: el('circle', { cx: x, cy: y, r: 13, fill: C.inkt }, p) });
          kop(p, x, y - 52, it.a || '', maat(it.a, breed - 20, 64, .74), { 'text-anchor': 'middle' });
          regels(it.b || '', Math.max(10, Math.floor(breed / 15))).slice(0, 3).forEach((r, k) => tekst(p, x, y + 62 + k * 32, r, 22, { 'text-anchor': 'middle', 'font-family': MONO, fill: C.muted }));
        });
        return o;
      },
      teken(o, tt) {
        if (o.kop) erin(o.kop, tt, o.ts[0] - .4, MX, MY - 260);
        let tot = o.x0, actief = -1;
        o.punten.forEach((p, i) => {
          const q = eo(P(tt, o.ts[i], o.ts[i] + .5)); op(p.g, q);
          if (q > 0) { tot = lerp(i ? o.punten[i - 1].x : o.x0, p.x, eo(P(tt, o.ts[i] - .3, o.ts[i] + .2))); actief = i; }
        });
        o.punten.forEach((p, i) => p.stip.setAttribute('fill', i === actief ? C.rood : C.inkt));
        o.lijn.setAttribute('x2', tot);
      },
    },

    // Dossierkaart van een persoon of partij: naam, rol, een paar regels, eventueel een stempel.
    dossier: {
      bouw(g, sh, a, e) {
        const rijen = (sh.items || []).slice(0, 4);
        const [t1, ...rest] = momenten(sh, a, e, 2 + rijen.length), o = { t1, tr: rest.slice(0, rijen.length), tst: rest[rijen.length], rijen: [] };
        const w = 1000, h = 250 + rijen.length * 70;
        o.kaart = G(g); o.h = h;
        el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, fill: C.wit, stroke: C.grijs, 'stroke-width': 2, rx: 4 }, o.kaart);
        el('rect', { x: -w / 2, y: -h / 2, width: 14, height: h, fill: C.rood }, o.kaart);
        mono(o.kaart, -w / 2 + 60, -h / 2 + 60, DOSSIER, 22);
        kop(o.kaart, -w / 2 + 60, -h / 2 + 140, sh.kop || '', maat(sh.kop, w - 120, 76, .74));
        if (sh.sub) mono(o.kaart, -w / 2 + 60, -h / 2 + 190, sh.sub, maat(sh.sub, w - 120, 24, .75), { fill: C.rood });
        rijen.forEach((r, i) => {
          const rg = G(o.kaart), y = -h / 2 + 260 + i * 70;
          el('line', { x1: -w / 2 + 60, x2: w / 2 - 60, y1: y - 42, y2: y - 42, stroke: C.grijs, 'stroke-width': 1.5 }, rg);
          mono(rg, -w / 2 + 60, y, r.a || '', 20);
          tekst(rg, -w / 2 + 360, y, r.b || '', maat(r.b, w - 420, 30, .58), { 'font-family': MONO, 'font-weight': 600 });
          o.rijen.push(rg);
        });
        if (sh.stempel) o.st = stempel(g, sh.stempel);
        return o;
      },
      teken(o, tt) {
        erin(o.kaart, tt, o.t1 - .2, MX, MY + 20, 40);
        o.rijen.forEach((r, i) => op(r, eo(P(tt, o.tr[i], o.tr[i] + .4))));
        if (o.st) tekenStempel(o.st, tt, o.tst, MX + 430, MY - o.h / 2 - 10);
      },
    },

    // Twee kolommen tegenover elkaar: label en waarde; de rechter in rood.
    vergelijk: {
      bouw(g, sh, a, e) {
        const items = (sh.items || []).slice(0, 2);
        const ts = momenten(sh, a, e, 3), o = { ts, kol: [] };
        el('line', { x1: MX, x2: MX, y1: MY - 220, y2: MY + 200, stroke: C.grijs, 'stroke-width': 2 }, g);
        items.forEach((it, i) => {
          const k = G(g);
          mono(k, 0, -80, it.a || '', maat(it.a, 700, 28, .75), { 'text-anchor': 'middle' });
          kop(k, 0, 60, it.b || '', maat(it.b, 720, 130, .74), { 'text-anchor': 'middle', fill: i === items.length - 1 ? C.rood : C.inkt });
          o.kol.push(k);
        });
        if (sh.sub) { o.sub = G(g); mono(o.sub, 0, 0, sh.sub, maat(sh.sub, 1400, 26, .75), { 'text-anchor': 'middle', fill: C.inkt }); }
        return o;
      },
      teken(o, tt) {
        o.kol.forEach((k, i) => erin(k, tt, o.ts[i], i ? MX + 440 : MX - 440, MY));
        if (o.sub) erin(o.sub, tt, o.ts[2], MX, MY + 300);
      },
    },

    // Een uitspraak als grote typografie, met wie het zei en wanneer.
    citaat: {
      bouw(g, sh, a, e) {
        const rs = regels(sh.kop || '', 30).slice(0, 4), ts = momenten(sh, a, e, rs.length + 1), o = { ts, rs: [] };
        const fs = rs.length > 3 ? 54 : 64, y0 = MY - (rs.length - 1) * fs * .62 - 40;
        tekst(g, RAND + 10, y0 - 40, '“', 220, { 'font-family': KOP, fill: C.rood, opacity: .9 });
        rs.forEach((r, i) => { const rg = G(g); tekst(rg, RAND + 150, y0 + i * fs * 1.25, r, fs, { 'font-family': KOP }); o.rs.push(rg); });
        if (sh.sub) { o.wie = G(g); mono(o.wie, RAND + 150, y0 + rs.length * fs * 1.25 + 40, `— ${sh.sub}`, 26, { fill: C.rood }); }
        return o;
      },
      teken(o, tt) {
        o.rs.forEach((r, i) => op(r, eo(P(tt, o.ts[i], o.ts[i] + .6))));
        if (o.wie) op(o.wie, eo(P(tt, o.ts[o.rs.length], o.ts[o.rs.length] + .5)));
      },
    },

    // Staafgrafiek: per item een label en een waarde; de laatste staaf in rood.
    grafiek: {
      bouw(g, sh, a, e) {
        const items = (sh.items || []).slice(0, 8), n = Math.max(1, items.length);
        const ws = items.map(it => getal(it.b)), max = Math.max(1e-9, ...ws.map(Math.abs)), neg = ws.some(v => v < 0);
        const basis = neg ? MY - 60 : MY + 230, hoog = neg ? 300 : 400, breed = Math.min(170, (W - 2 * RAND - 200) / n * .62);
        const ts = momenten(sh, a, e, n), o = { ts, staven: [] };
        if (sh.kop) { o.kop = G(g); mono(o.kop, 0, 0, sh.kop, 28, { 'text-anchor': 'middle' }); }
        el('line', { x1: RAND + 60, x2: W - RAND - 60, y1: basis, y2: basis, stroke: C.muted, 'stroke-width': 2 }, g);
        items.forEach((it, i) => {
          const x = RAND + 100 + (i + .5) * (W - 2 * RAND - 200) / n, h = Math.abs(ws[i]) / max * hoog, kleur = i === n - 1 ? C.rood : C.grijs;
          const r = el('rect', { x: x - breed / 2, width: breed, y: basis, height: 0, fill: kleur }, g);
          const lab = mono(g, x, ws[i] < 0 ? basis - 24 : basis + 44, it.a || '', 22, { 'text-anchor': 'middle' });
          const val = kop(g, x, 0, it.b || '', maat(it.b, breed + 60, 40, .74), { 'text-anchor': 'middle', fill: i === n - 1 ? C.rood : C.inkt });
          o.staven.push({ r, lab, val, h, neg: ws[i] < 0, basis });
        });
        if (sh.sub) { o.sub = G(g); mono(o.sub, 0, 0, sh.sub, maat(sh.sub, 1400, 24, .75), { 'text-anchor': 'middle', fill: C.inkt }); }
        return o;
      },
      teken(o, tt) {
        if (o.kop) erin(o.kop, tt, o.ts[0] - .5, MX, 230);
        o.staven.forEach((s, i) => {
          const q = eo(P(tt, o.ts[i], o.ts[i] + .8)), h = s.h * q;
          s.r.setAttribute('height', h); s.r.setAttribute('y', s.neg ? s.basis : s.basis - h);
          op(s.lab, q > 0 ? 1 : 0); op(s.val, P(tt, o.ts[i] + .5, o.ts[i] + .9));
          s.val.setAttribute('y', s.neg ? s.basis + h + 48 : s.basis - h - 18);
        });
        if (o.sub) erin(o.sub, tt, o.ts[o.ts.length - 1] + .6, MX, H - 120);
      },
    },

    // Een plek: de naam groot, een rode stip met een kring, een raster als ondergrond.
    plek: {
      bouw(g, sh, a, e) {
        const [t1, t2] = momenten(sh, a, e, 2), o = { t1, t2 };
        const r = G(g, { opacity: .35 });
        for (let x = RAND; x <= W - RAND; x += 120) el('line', { x1: x, x2: x, y1: 200, y2: H - 160, stroke: C.grijs, 'stroke-width': 1 }, r);
        for (let y = 200; y <= H - 160; y += 120) el('line', { x1: RAND, x2: W - RAND, y1: y, y2: y, stroke: C.grijs, 'stroke-width': 1 }, r);
        o.ring = el('circle', { cx: MX, cy: MY - 90, r: 30, fill: 'none', stroke: C.rood, 'stroke-width': 4 }, g);
        o.stip = el('circle', { cx: MX, cy: MY - 90, r: 16, fill: C.rood }, g);
        o.kop = G(g); kop(o.kop, 0, 0, sh.kop || '', maat(sh.kop, W - 2 * RAND, 130, .74), { 'text-anchor': 'middle' });
        if (sh.sub) { o.sub = G(g); mono(o.sub, 0, 0, sh.sub, maat(sh.sub, 1300, 28, .75), { 'text-anchor': 'middle' }); }
        return o;
      },
      teken(o, tt) {
        const p = pop(tt, o.t1 - .3, .5); op(o.stip, p);
        const u = ((tt - o.t1) * .7) % 1; o.ring.setAttribute('r', 20 + u * 70); op(o.ring, tt > o.t1 ? (1 - u) * .8 : 0);
        erin(o.kop, tt, o.t1, MX, MY + 110);
        if (o.sub) erin(o.sub, tt, o.t2, MX, MY + 190);
      },
    },

    // Een grote uitspraak of hoofdstuktitel, met een rode streep eronder.
    titel: {
      bouw(g, sh, a, e) {
        const rs = regels(sh.kop || '', 20).slice(0, 3), [t1, t2] = momenten(sh, a, e, 2), o = { t1, t2 };
        const fs = Math.min(...rs.map(r => maat(r, W - 2 * RAND, 130, .72)));
        o.kop = G(g);
        rs.forEach((r, i) => kop(o.kop, 0, (i - (rs.length - 1) / 2) * fs * 1.08, r, fs, { 'text-anchor': 'middle', fill: i === rs.length - 1 && rs.length > 1 ? C.rood : C.inkt }));
        o.streep = el('line', { x1: MX - 160, x2: MX + 160, y1: MY + rs.length * fs * .54 + 40, y2: MY + rs.length * fs * .54 + 40, stroke: C.rood, 'stroke-width': 8 }, g);
        o.sy = rs.length * fs * .54 + 110;
        if (sh.sub) { o.sub = G(g); mono(o.sub, 0, 0, sh.sub, maat(sh.sub, 1300, 28, .75), { 'text-anchor': 'middle' }); }
        return o;
      },
      teken(o, tt) {
        erin(o.kop, tt, o.t1, MX, MY - 20, 40);
        draw(o.streep, eo(P(tt, o.t1 + .3, o.t1 + 1)));
        if (o.sub) erin(o.sub, tt, o.t2, MX, MY + o.sy);
      },
    },

    // Een lijst: namen, onderdelen of oorzaken die een voor een verschijnen.
    lijst: {
      bouw(g, sh, a, e) {
        const items = (sh.items || []).slice(0, 5), ts = momenten(sh, a, e, items.length), o = { ts, rijen: [] };
        const y0 = MY - (items.length - 1) * 55 + 20;
        if (sh.kop) mono(g, RAND + 40, y0 - 110, sh.kop, 28);
        items.forEach((it, i) => {
          const r = G(g), y = y0 + i * 110;
          kop(r, RAND + 40, y, it.a || '', maat(it.a, it.b ? 1000 : W - 2 * RAND - 80, 64, .74));
          if (it.b) mono(r, W - RAND - 40, y, it.b, maat(it.b, 500, 26, .75), { 'text-anchor': 'end', fill: C.rood });
          el('line', { x1: RAND + 40, x2: W - RAND - 40, y1: y + 34, y2: y + 34, stroke: C.grijs, 'stroke-width': 1.5 }, r);
          o.rijen.push(r);
        });
        return o;
      },
      teken(o, tt) { o.rijen.forEach((r, i) => erin(r, tt, o.ts[i], 0, 0, 20)); },
    },
  };

  const lijstVan = spec.scenes || [];
  return {
    hfd: spec.hfd || {},
    eind: spec.eind,
    bouw(E, SC) {
      E.d = {};
      lijstVan.forEach((sh, i) => {
        const g = SC[sh.id]; if (!g) return;
        // Een foto die er niet is (weggehaald), wordt een titel: nooit een leeg beeld.
        let soort = S[sh.sjabloon] ? sh.sjabloon : 'titel';
        if (soort === 'foto' && !FOTOS[sh.foto]) soort = 'titel';
        const a = sStart(sh.id), e = sEind(sh.id);
        // De teller zet zijn tekens in bouw vast, zodat teken() alleen het getal hoeft te schrijven.
        const o = S[soort].bouw(g, sh, a, e, i);
        // "€" + "70" + "MILLION" moet "€70 MILLION" worden; de keuzes komen zonder spaties binnen.
        const voor = sh.voor || '', na = sh.na || '';
        o.voorT = /[\p{L}]$/u.test(voor) ? voor + ' ' : voor;
        o.naT = /^[\p{L}]/u.test(na) ? ' ' + na : na;
        E.d[sh.id] = { soort, o, a, e };
      });
    },
    teken(tt, cur, E) {
      const d = E.d[cur]; if (!d) return;
      S[d.soort].teken(d.o, tt, d.a, d.e);
    },
  };
}
