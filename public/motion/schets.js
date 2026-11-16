// SCHETS — een gratis schetsbeeld per scene, vóór de klant betaalt (verbeterplan idee 05,
// 17-11-2026). Geen AI: deze code zet per scene de kop, de woorden die in beeld komen (uit
// "Wat je ziet", tussen aanhalingstekens), een getal en een passend icoon neer, in de
// gekozen tekenstijl. Zo ziet de klant stijl, kleur en opbouw; de echte animatie wordt pas
// na betalen getekend.
//
// Gebruik: window.VIDEO = schetsVideo({ scenes: [{ id: 's1', kop, labels: [...], getal, icoon }], hfd })

function schetsVideo(spec) {
  return {
    hfd: spec.hfd || {},
    hud: true,
    naloop: 1,
    bouw(E, SC) {
      spec.scenes.forEach((s, i) => {
        const g = G(SC[s.id]);
        const kleur = i % 2 ? C.accent2 : C.accent;
        const labels = (s.labels || []).slice(0, 2);
        // Eén kaart in het midden: links het hoofdbeeld (getal of icoon), rechts (staand:
        // eronder) de woorden die in beeld komen.
        const kw = STAAND ? 880 : 1300, kh = STAAND ? 1080 : 560;
        const k = G(g, { transform: `translate(${MX},${MY + (STAAND ? -40 : 20)})` });
        kaart(k, kw, kh, '#fff', 48);
        const beeld = G(k, { transform: STAAND ? 'translate(0,-230)' : 'translate(-340,0)' });
        if (s.getal) {
          T(beeld, 0, 60, s.getal, s.getal.length > 5 ? 120 : 170, { fill: kleur });
        } else {
          const ic = IC[s.icoon] || IC.ster;
          ic(G(beeld, { transform: 'scale(3.2)' }), kleur);
        }
        const tx = STAAND ? 0 : 240, anker = 'middle';
        const groot = STAAND ? 76 : 70;
        if (labels[0]) {
          const t = T(k, tx, STAAND ? 150 : (labels[1] ? -30 : 26), labels[0], groot, { 'text-anchor': anker, fill: C.inkt });
          const max = STAAND ? kw - 120 : 640, b = t.getComputedTextLength();
          if (b > max) t.setAttribute('font-size', Math.floor(groot * max / b));
        }
        if (labels[1]) {
          const p = pil(k, labels[1], { size: STAAND ? 48 : 44, fill: kleur });
          p.setAttribute('transform', `translate(${tx},${STAAND ? 290 : 90})`);
        }
        if (!labels.length && s.kop) T(k, tx, 26, s.kop, groot, { fill: C.inkt });
      });
    },
    teken(tt, cur, E, SC) {
      // Stilstaand beeld: alles staat er al.
    },
  };
}
