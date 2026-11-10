// VOORBEELD — een complete video voor "Kapsalon Knip" (liggend, 1920 x 1080).
// Het script (window.SCRIPT) waar deze code bij hoort:
//   s1   "Ken je dat? De telefoon gaat, maar je staat net te knippen. Weer een gemiste afspraak."
//   s2   "Met online afspreken kiezen klanten zelf een moment. Dag en nacht, zonder dat jij hoeft op te nemen."
//   s3   "Je agenda loopt vanzelf vol, en klanten krijgen automatisch een herinnering. Zo komt bijna iedereen opdagen."
//   eind "Benieuwd wat het jou oplevert? Kapsalon Knip laat het je graag zien."
window.VIDEO = {
  hfd: { s2: '01  Online afspreken', s3: '02  Volle agenda' },
  eind: { regel1: 'Benieuwd wat het', regel2: 'jou oplevert?', knop: 'Plan een demo' },

  bouw(E, SC) {
    const t = E.t = {};

    // ===== s1: de telefoon gaat, de kapper is bezig, gemiste oproepen tellen op =====
    const s1 = SC.s1;
    E.tel = G(s1); E.telIc = IC.telefoon(E.tel);
    // een rinkelend belletje op het scherm, zelf getekend
    el('path', { d: 'M-16,8 C-16,-18 16,-18 16,8 L22,18 H-22Z', fill: F(C.accent), stroke: C.inkt, 'stroke-width': 4, 'stroke-linejoin': 'round' }, E.telIc.scherm);
    el('circle', { cy: 24, r: 5, fill: C.inkt }, E.telIc.scherm);
    E.ring = [0, 1, 2].map(() => el('circle', { r: 150, fill: 'none', stroke: C.accent, 'stroke-width': 10 }, E.tel));
    // de schaar: twee bladen die open en dicht gaan
    E.schaar = G(s1);
    E.blad = [1, -1].map(k => {
      const g = G(E.schaar);
      el('path', { d: 'M0,0 L190,-22 L196,-8 L0,22Z', fill: '#fff', stroke: C.inkt, 'stroke-width': 7, 'stroke-linejoin': 'round' }, g);
      el('circle', { cx: -64, cy: 30 * k, r: 34, fill: 'none', stroke: F(C.accent2), 'stroke-width': 16 }, g);
      el('path', { d: `M-36,${18 * k} L0,0`, stroke: F(C.accent2), 'stroke-width': 16, 'stroke-linecap': 'round' }, g);
      return { g, k };
    });
    el('circle', { r: 9, fill: C.inkt }, E.schaar);
    E.bezig = pil(s1, 'Net aan het knippen', { size: 40 });
    E.gemist = G(s1); kaart(E.gemist, 560, 250);
    T(E.gemist, 0, -52, 'Gemiste afspraken', 36, { fill: C.muted, 'font-weight': 600 });
    E.gemistN = T(E.gemist, 0, 72, '0', 120, { fill: C.rood });
    t.telefoon = wt('telefoon'); t.knippen = wt('knippen'); t.gemist = wt('gemiste');

    // ===== s2: klanten kiezen zelf een moment in de agenda, dag en nacht =====
    const s2 = SC.s2, a2 = sStart('s2');
    E.agenda = G(s2); kaart(E.agenda, 900, 600);
    el('text', { x: -400, y: -228, 'font-size': 38, fill: C.inkt, 'font-weight': 800 }, E.agenda, 'Kies je moment');
    E.vak = [];
    ['ma', 'di', 'wo', 'do', 'vr'].forEach((d, i) => {
      T(E.agenda, -320 + i * 160, -150, d, 30, { fill: C.muted, 'font-weight': 600 });
      for (let r = 0; r < 4; r++) E.vak.push({ r: el('rect', { x: -390 + i * 160, y: -120 + r * 96, width: 140, height: 78, rx: 16, fill: '#eef3f8' }, E.agenda), i, rij: r });
    });
    // de vakjes die geboekt worden: [index, moment]
    t.kiezen = wt('kiezen', a2); t.dag = wt('dag', t.kiezen); t.nacht = wt('nacht', t.dag); t.zonder = wt('zonder', t.nacht);
    E.geboekt = [[2, t.kiezen], [9, t.kiezen + .5], [16, t.dag], [7, t.dag + .4], [13, t.nacht], [19, t.nacht + .4]];
    E.klik = G(s2); el('path', { d: 'M0,0 L0,62 L16,48 L28,76 L40,70 L28,44 L48,44Z', fill: '#fff', stroke: C.inkt, 'stroke-width': 6, 'stroke-linejoin': 'round' }, E.klik);
    E.dagnacht = pil(s2, 'Dag en nacht open', { fill: C.accent, size: 44, icoon: g => IC.klok(G(g, { transform: 'scale(.3)' })) });
    E.vrij = pil(s2, 'Jij hoeft niet op te nemen', { size: 40, icoon: g => IC.vink(G(g, { transform: 'scale(.34)' })) });

    // ===== s3: de agenda loopt vol, herinnering, bijna iedereen komt =====
    const s3 = SC.s3, a3 = sStart('s3');
    t.vol = wt('vol', a3); t.herinnering = wt('herinnering', a3); t.opdagen = wt('opdagen', t.herinnering);
    E.vol = G(s3); kaart(E.vol, 760, 300);
    el('text', { x: -330, y: -78, 'font-size': 36, fill: C.inkt, 'font-weight': 800 }, E.vol, 'Agenda deze week');
    E.volBalk = balk(G(E.vol, { transform: 'translate(0,10)' }), 660, 56, C.accent);
    E.volPct = el('text', { x: 330, y: 104, 'font-size': 44, fill: C.accent, 'font-weight': 800, 'text-anchor': 'end' }, E.vol, '0%');
    E.sms = G(s3); E.smsIc = IC.telefoon(E.sms);
    E.bel = G(s3); kaart(E.bel, 520, 150);
    IC.spraak(G(E.bel, { transform: 'translate(-190,0) scale(.62)' }));
    el('text', { x: -120, y: -8, 'font-size': 32, fill: C.inkt, 'font-weight': 800 }, E.bel, 'Morgen om 10:00');
    el('text', { x: -120, y: 34, 'font-size': 28, fill: C.muted, 'font-weight': 600 }, E.bel, 'Tot dan bij Knip!');
    E.mensen = [...Array(10)].map((_, i) => { const g = G(s3); const ic = IC.gebruiker(g, i === 9 ? C.grijs : C.groen); return { g, i }; });
    E.komt = pil(s3, '9 van de 10 komt opdagen', { fill: C.groen, size: 44 });
  },

  teken(tt, cur, E, SC) {
    const t = E.t;
    if (cur === 's1') {
      // telefoon schuift in beeld en schudt zolang hij rinkelt
      const p = pop(tt, t.telefoon - .25, .5), schud = tt < t.gemist ? golf(tt, 9, 7) : 0;
      op(E.tel, p); tf(E.tel, 580, 560, p * 2.6, schud);
      E.ring.forEach((c, i) => { const u = ((tt - t.telefoon) * .9 + i / 3) % 1; c.setAttribute('r', 70 + u * 60); op(c, tt > t.telefoon && tt < t.gemist ? (1 - u) * .6 : 0); });
      // schaar knipt
      const sp = pop(tt, t.knippen - .3, .5), hoek = 14 + golf(tt, 2.2, 12);
      op(E.schaar, sp); tf(E.schaar, 1250, 520, sp * 1.25, -18);
      E.blad.forEach(b => b.g.setAttribute('transform', `rotate(${b.k * hoek}) scale(1,${b.k})`));
      const bp = pop(tt, t.knippen, .45); op(E.bezig, bp); tf(E.bezig, 1300, 270, bp);
      // teller met gemiste afspraken loopt op
      const gp = pop(tt, t.gemist - .1, .5); op(E.gemist, gp); tf(E.gemist, 1300, 800 + (1 - gp) * 60, gp);
      E.gemistN.textContent = nl(lerp(0, 7, eo(P(tt, t.gemist, t.gemist + 1.4))));
    }
    if (cur === 's2') {
      const a = sStart('s2'), ap = eo(P(tt, a + .1, a + .6));
      op(E.agenda, ap); tf(E.agenda, 700, 610 + (1 - ap) * 70);
      // vakjes kleuren zodra ze geboekt worden
      E.vak.forEach(v => v.r.setAttribute('fill', '#eef3f8'));
      let laatste = null;
      E.geboekt.forEach(([i, tijd]) => {
        const q = P(tt, tijd, tijd + .3); if (q <= 0) return;
        E.vak[i].r.setAttribute('fill', q < 1 ? mix('#eef3f8', C.accent, q) : F(C.accent)); laatste = [i, tijd];
      });
      // muisje springt naar het laatst geboekte vakje
      if (laatste) { const v = E.vak[laatste[0]], q = eo(P(tt, laatste[1] - .25, laatste[1])); op(E.klik, 1); tf(E.klik, 700 - 320 + v.i * 160 + 10, 610 - 80 + v.rij * 96 + (1 - q) * 50, 1.1); } else op(E.klik, 0);
      const dp = pop(tt, t.dag, .45); op(E.dagnacht, dp); tf(E.dagnacht, 1490, 480, dp);
      const vp = pop(tt, t.zonder, .45); op(E.vrij, vp); tf(E.vrij, 1490, 640, vp * .92);
    }
    if (cur === 's3') {
      const a = sStart('s3'), kp = eo(P(tt, a + .1, a + .6));
      op(E.vol, kp); tf(E.vol, 560, 420 + (1 - kp) * 60);
      const f = eo(P(tt, t.vol - .5, t.vol + 1));
      E.volBalk.zet(f * .96); E.volPct.textContent = nl(f * 96) + '%';
      // herinnering: telefoon met berichtje
      const hp = pop(tt, t.herinnering - .2, .5); op(E.sms, hp); tf(E.sms, 1180, 440, hp * 1.5, golf(tt, .5, 3));
      const bp = pop(tt, t.herinnering + .15, .45); op(E.bel, bp); tf(E.bel, 1500, 400, bp);
      // tien klanten op een rij; negen worden groen
      E.mensen.forEach(m => { const q = pop(tt, t.opdagen - .5 + m.i * .07, .4); op(m.g, q); tf(m.g, 380 + m.i * 130, 800 + golf(tt, .6, 5, m.i), q * .8); });
      const cp = pop(tt, t.opdagen + .5, .45); op(E.komt, cp); tf(E.komt, 960, 950, cp);
    }
  },
};
