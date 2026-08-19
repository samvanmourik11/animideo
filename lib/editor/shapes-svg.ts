// ── Vormenbibliotheek ────────────────────────────────────────────────────────
//
// Alles wat je in Canva onder "Elementen → Vormen" vindt, maar dan als wiskunde
// in plaats van als plaatje: lijnen, basisvormen, veelhoeken, sterren, pijlen,
// tekstballonnen en kleurverlopen. Een cirkel is hier altijd een perfecte
// cirkel, op elke resolutie, elke keer hetzelfde. Geen model dat er iets van
// maakt, geen bestand dat gedownload moet worden.
//
// Dit bestand is met opzet vrij van Node- én browser-afhankelijkheden: het
// draait in het paneel (om de tegel te tonen), in de compositor (preview) en op
// de server (render). Daardoor is de tegel die je aanklikt letterlijk hetzelfde
// beeld als wat er in de MP4 belandt.
//
// Een vorm komt als ImageClip op de tijdlijn met een `data:`-URL als bron. Pixi
// laadt SVG-data-URL's rechtstreeks, dus er hoeft niets geüpload of gerasterd te
// worden — plaatsen gaat direct, en de bron blijft klein genoeg om gewoon in het
// document te staan. De parameters bewaren we in `meta.vorm`, zodat je de kleur
// achteraf nog kunt wijzigen zonder de vorm opnieuw te hoeven kiezen.

export type VormGroepId =
  | "lijnen"
  | "basis"
  | "veelhoeken"
  | "sterren"
  | "pijlen"
  | "ballonnen"
  | "verlopen"
  | "markeren";

export interface VormStijl {
  /** Vulkleur; genegeerd bij vormen die alleen lijn zijn. */
  vulling: string;
  /** Lijnkleur; genegeerd bij vormen die alleen vulling zijn. */
  lijn: string;
  /** Lijndikte als fractie van de kleinste zijde (0,01–0,25). */
  dikte: number;
}

export const STANDAARD_VORMSTIJL: VormStijl = {
  vulling: "#2563eb",
  lijn: "#111827",
  dikte: 0.06,
};

export interface VormDefinitie {
  id: string;
  label: string;
  groep: VormGroepId;
  /** Breedte gedeeld door hoogte waarin de vorm het beste tot zijn recht komt. */
  verhouding: number;
  /** Welke knoppen in het eigenschappenpaneel zin hebben. */
  heeftVulling: boolean;
  heeftLijn: boolean;
  /** Hoe breed hij standaard in beeld komt, als fractie van de compositie. */
  standaardBreedte: number;
  teken: (b: number, h: number, s: VormStijl) => string;
}

// ── Hulpjes ──────────────────────────────────────────────────────────────────

const nr = (n: number) => (Math.round(n * 100) / 100).toString();

/** Lijndikte in pixels, met een ondergrens zodat dunne vormen zichtbaar blijven. */
function dik(b: number, h: number, s: VormStijl): number {
  return Math.max(2, Math.min(b, h) * Math.min(0.25, Math.max(0.005, s.dikte)));
}

function punten(lijst: Array<[number, number]>): string {
  return lijst.map(([x, y]) => `${nr(x)},${nr(y)}`).join(" ");
}

/** Regelmatige veelhoek met de punt naar boven. */
function veelhoekPunten(zijden: number, b: number, h: number, marge: number): Array<[number, number]> {
  const rx = b / 2 - marge;
  const ry = h / 2 - marge;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < zijden; i++) {
    const t = -Math.PI / 2 + (i * 2 * Math.PI) / zijden;
    out.push([b / 2 + rx * Math.cos(t), h / 2 + ry * Math.sin(t)]);
  }
  return out;
}

/** Ster met `punten` punten; `binnen` is de verhouding van de binnenstraal. */
function sterPunten(aantal: number, b: number, h: number, marge: number, binnen: number): Array<[number, number]> {
  const rx = b / 2 - marge;
  const ry = h / 2 - marge;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < aantal * 2; i++) {
    const f = i % 2 === 0 ? 1 : binnen;
    const t = -Math.PI / 2 + (i * Math.PI) / aantal;
    out.push([b / 2 + rx * f * Math.cos(t), h / 2 + ry * f * Math.sin(t)]);
  }
  return out;
}

/** Blokpijl die naar rechts wijst; draaien doe je met de rotatie van de clip. */
function blokPijl(b: number, h: number): Array<[number, number]> {
  const staaf = h * 0.42;
  const kop = b * 0.36;
  const m = h / 2;
  return [
    [0, m - staaf / 2],
    [b - kop, m - staaf / 2],
    [b - kop, 0],
    [b, m],
    [b - kop, h],
    [b - kop, m + staaf / 2],
    [0, m + staaf / 2],
  ];
}

/** Dezelfde punten gespiegeld/gedraaid, zodat elke richting een eigen tegel krijgt. */
function draai(p: Array<[number, number]>, b: number, h: number, graden: 90 | 180 | 270): Array<[number, number]> {
  return p.map(([x, y]) => {
    const nx = x / b - 0.5;
    const ny = y / h - 0.5;
    const r = (graden * Math.PI) / 180;
    const rx = nx * Math.cos(r) - ny * Math.sin(r);
    const ry = nx * Math.sin(r) + ny * Math.cos(r);
    // Na een kwartslag wisselen breedte en hoogte van rol; we schalen terug naar
    // het vlak dat we hebben, zodat de vorm nooit buiten zijn tegel valt.
    return [(rx + 0.5) * b, (ry + 0.5) * h] as [number, number];
  });
}

const vlak = (d: string, s: VormStijl) => `<path d="${d}" fill="${s.vulling}" />`;
const veelhoekVlak = (p: Array<[number, number]>, s: VormStijl) =>
  `<polygon points="${punten(p)}" fill="${s.vulling}" />`;

// ── De catalogus ─────────────────────────────────────────────────────────────

const DEFS: VormDefinitie[] = [];

function vorm(d: VormDefinitie) {
  DEFS.push(d);
}

// Lijnen ─────────────────────────────────────────────────────────────────────
// Allemaal even hoog opgezet (een dunne strook), zodat de lijndikte de enige
// knop is die ertoe doet.

function lijnBasis(b: number, h: number, s: VormStijl, streep?: string, marge = 0): string {
  const w = dik(b, h, s);
  const y = h / 2;
  return `<line x1="${nr(w / 2 + marge)}" y1="${nr(y)}" x2="${nr(b - w / 2 - marge)}" y2="${nr(y)}"
    stroke="${s.lijn}" stroke-width="${nr(w)}" stroke-linecap="round"${streep ? ` stroke-dasharray="${streep}"` : ""} />`;
}

vorm({
  id: "lijn", label: "Lijn", groep: "lijnen", verhouding: 8, heeftVulling: false, heeftLijn: true,
  standaardBreedte: 0.4,
  teken: (b, h, s) => lijnBasis(b, h, s),
});
vorm({
  id: "lijn-streep", label: "Streepjes", groep: "lijnen", verhouding: 8, heeftVulling: false, heeftLijn: true,
  standaardBreedte: 0.4,
  teken: (b, h, s) => lijnBasis(b, h, s, `${nr(dik(b, h, s) * 2.4)} ${nr(dik(b, h, s) * 1.8)}`),
});
vorm({
  id: "lijn-stip", label: "Stippels", groep: "lijnen", verhouding: 8, heeftVulling: false, heeftLijn: true,
  standaardBreedte: 0.4,
  teken: (b, h, s) => lijnBasis(b, h, s, `0.01 ${nr(dik(b, h, s) * 2)}`),
});
vorm({
  id: "lijn-pijl", label: "Pijllijn", groep: "lijnen", verhouding: 8, heeftVulling: false, heeftLijn: true,
  standaardBreedte: 0.4,
  teken: (b, h, s) => {
    const w = dik(b, h, s);
    const kop = w * 3;
    return `${lijnBasis(b - kop, h, s, undefined, 0)}
      <polygon points="${punten([[b - kop * 1.2, h / 2 - kop * 0.7], [b, h / 2], [b - kop * 1.2, h / 2 + kop * 0.7]])}" fill="${s.lijn}" />`;
  },
});
vorm({
  id: "lijn-pijl-dubbel", label: "Dubbele pijl", groep: "lijnen", verhouding: 8, heeftVulling: false, heeftLijn: true,
  standaardBreedte: 0.4,
  teken: (b, h, s) => {
    const w = dik(b, h, s);
    const kop = w * 3;
    const y = h / 2;
    return `<line x1="${nr(kop)}" y1="${nr(y)}" x2="${nr(b - kop)}" y2="${nr(y)}" stroke="${s.lijn}" stroke-width="${nr(w)}" />
      <polygon points="${punten([[b - kop * 1.2, y - kop * 0.7], [b, y], [b - kop * 1.2, y + kop * 0.7]])}" fill="${s.lijn}" />
      <polygon points="${punten([[kop * 1.2, y - kop * 0.7], [0, y], [kop * 1.2, y + kop * 0.7]])}" fill="${s.lijn}" />`;
  },
});

// Basisvormen ────────────────────────────────────────────────────────────────

vorm({
  id: "vierkant", label: "Vierkant", groep: "basis", verhouding: 1, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.3,
  teken: (b, h, s) => `<rect x="0" y="0" width="${nr(b)}" height="${nr(h)}" fill="${s.vulling}" />`,
});
vorm({
  id: "rechthoek-rond", label: "Afgerond", groep: "basis", verhouding: 1, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.3,
  teken: (b, h, s) => `<rect x="0" y="0" width="${nr(b)}" height="${nr(h)}" rx="${nr(Math.min(b, h) * 0.14)}" fill="${s.vulling}" />`,
});
vorm({
  id: "cirkel", label: "Cirkel", groep: "basis", verhouding: 1, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.3,
  teken: (b, h, s) => `<ellipse cx="${nr(b / 2)}" cy="${nr(h / 2)}" rx="${nr(b / 2)}" ry="${nr(h / 2)}" fill="${s.vulling}" />`,
});
vorm({
  id: "driehoek", label: "Driehoek", groep: "basis", verhouding: 1, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.3,
  teken: (b, h, s) => veelhoekVlak([[b / 2, 0], [b, h], [0, h]], s),
});
vorm({
  id: "driehoek-omlaag", label: "Punt omlaag", groep: "basis", verhouding: 1, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.3,
  teken: (b, h, s) => veelhoekVlak([[0, 0], [b, 0], [b / 2, h]], s),
});
vorm({
  id: "ruit", label: "Ruit", groep: "basis", verhouding: 1, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.3,
  teken: (b, h, s) => veelhoekVlak([[b / 2, 0], [b, h / 2], [b / 2, h], [0, h / 2]], s),
});
vorm({
  id: "halve-cirkel", label: "Halve cirkel", groep: "basis", verhouding: 2, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.3,
  teken: (b, h, s) => vlak(`M 0 ${nr(h)} A ${nr(b / 2)} ${nr(h)} 0 0 1 ${nr(b)} ${nr(h)} Z`, s),
});
vorm({
  id: "hart", label: "Hart", groep: "basis", verhouding: 1, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.25,
  teken: (b, h, s) =>
    vlak(
      `M ${nr(b / 2)} ${nr(h * 0.95)}
       C ${nr(b * -0.08)} ${nr(h * 0.55)} ${nr(b * 0.08)} ${nr(h * 0.02)} ${nr(b / 2)} ${nr(h * 0.28)}
       C ${nr(b * 0.92)} ${nr(h * 0.02)} ${nr(b * 1.08)} ${nr(h * 0.55)} ${nr(b / 2)} ${nr(h * 0.95)} Z`,
      s
    ),
});
vorm({
  id: "plus", label: "Plus", groep: "basis", verhouding: 1, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.22,
  teken: (b, h, s) => {
    const d = Math.min(b, h) * 0.3;
    return veelhoekVlak(
      [
        [b / 2 - d / 2, 0], [b / 2 + d / 2, 0], [b / 2 + d / 2, h / 2 - d / 2],
        [b, h / 2 - d / 2], [b, h / 2 + d / 2], [b / 2 + d / 2, h / 2 + d / 2],
        [b / 2 + d / 2, h], [b / 2 - d / 2, h], [b / 2 - d / 2, h / 2 + d / 2],
        [0, h / 2 + d / 2], [0, h / 2 - d / 2], [b / 2 - d / 2, h / 2 - d / 2],
      ],
      s
    );
  },
});

// Veelhoeken ─────────────────────────────────────────────────────────────────

for (const [zijden, label] of [[5, "Vijfhoek"], [6, "Zeshoek"], [7, "Zevenhoek"], [8, "Achthoek"]] as const) {
  vorm({
    id: `veelhoek-${zijden}`, label, groep: "veelhoeken", verhouding: 1, heeftVulling: true, heeftLijn: false,
    standaardBreedte: 0.28,
    teken: (b, h, s) => veelhoekVlak(veelhoekPunten(zijden, b, h, 0), s),
  });
}

// Sterren ────────────────────────────────────────────────────────────────────

for (const [aantal, binnen, label] of [
  [4, 0.34, "Vier punten"],
  [5, 0.4, "Vijf punten"],
  [6, 0.5, "Zes punten"],
  [8, 0.58, "Acht punten"],
] as const) {
  vorm({
    id: `ster-${aantal}`, label, groep: "sterren", verhouding: 1, heeftVulling: true, heeftLijn: false,
    standaardBreedte: 0.22,
    teken: (b, h, s) => veelhoekVlak(sterPunten(aantal, b, h, 0, binnen), s),
  });
}
vorm({
  id: "uitbarsting", label: "Knalster", groep: "sterren", verhouding: 1, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.26,
  teken: (b, h, s) => veelhoekVlak(sterPunten(12, b, h, 0, 0.74), s),
});

// Pijlen ─────────────────────────────────────────────────────────────────────

vorm({
  id: "pijl-rechts", label: "Rechts", groep: "pijlen", verhouding: 1.6, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.28,
  teken: (b, h, s) => veelhoekVlak(blokPijl(b, h), s),
});
vorm({
  id: "pijl-links", label: "Links", groep: "pijlen", verhouding: 1.6, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.28,
  teken: (b, h, s) => veelhoekVlak(draai(blokPijl(b, h), b, h, 180), s),
});
vorm({
  id: "pijl-omhoog", label: "Omhoog", groep: "pijlen", verhouding: 0.625, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.18,
  teken: (b, h, s) => veelhoekVlak(draai(blokPijl(b, h), b, h, 270), s),
});
vorm({
  id: "pijl-omlaag", label: "Omlaag", groep: "pijlen", verhouding: 0.625, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.18,
  teken: (b, h, s) => veelhoekVlak(draai(blokPijl(b, h), b, h, 90), s),
});
vorm({
  id: "pijl-dubbel", label: "Twee kanten", groep: "pijlen", verhouding: 1.8, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.3,
  teken: (b, h, s) => {
    const staaf = h * 0.42;
    const kop = b * 0.24;
    const m = h / 2;
    return veelhoekVlak(
      [
        [0, m], [kop, 0], [kop, m - staaf / 2], [b - kop, m - staaf / 2],
        [b - kop, 0], [b, m], [b - kop, h], [b - kop, m + staaf / 2],
        [kop, m + staaf / 2], [kop, h],
      ],
      s
    );
  },
});
vorm({
  id: "punt-rechts", label: "Punthaak", groep: "pijlen", verhouding: 1.2, heeftVulling: false, heeftLijn: true,
  standaardBreedte: 0.16,
  teken: (b, h, s) => {
    const w = dik(b, h, s);
    return `<polyline points="${punten([[w, w], [b - w, h / 2], [w, h - w]])}" fill="none"
      stroke="${s.lijn}" stroke-width="${nr(w)}" stroke-linecap="round" stroke-linejoin="round" />`;
  },
});

// Tekstballonnen ─────────────────────────────────────────────────────────────

vorm({
  id: "ballon-recht", label: "Ballon", groep: "ballonnen", verhouding: 1.4, heeftVulling: true, heeftLijn: true,
  standaardBreedte: 0.34,
  teken: (b, h, s) => {
    const w = dik(b, h, s);
    const body = h * 0.76;
    const r = Math.min(b, body) * 0.14;
    return `<path d="M ${nr(r + w)} ${nr(w)} H ${nr(b - r - w)} A ${nr(r)} ${nr(r)} 0 0 1 ${nr(b - w)} ${nr(r + w)}
      V ${nr(body - r)} A ${nr(r)} ${nr(r)} 0 0 1 ${nr(b - r - w)} ${nr(body)}
      H ${nr(b * 0.36)} L ${nr(b * 0.22)} ${nr(h - w)} L ${nr(b * 0.26)} ${nr(body)}
      H ${nr(r + w)} A ${nr(r)} ${nr(r)} 0 0 1 ${nr(w)} ${nr(body - r)}
      V ${nr(r + w)} A ${nr(r)} ${nr(r)} 0 0 1 ${nr(r + w)} ${nr(w)} Z"
      fill="${s.vulling}" stroke="${s.lijn}" stroke-width="${nr(w)}" stroke-linejoin="round" />`;
  },
});
vorm({
  id: "ballon-rond", label: "Ronde ballon", groep: "ballonnen", verhouding: 1.4, heeftVulling: true, heeftLijn: true,
  standaardBreedte: 0.34,
  teken: (b, h, s) => {
    const w = dik(b, h, s);
    const body = h * 0.76;
    return `<ellipse cx="${nr(b / 2)}" cy="${nr(body / 2)}" rx="${nr(b / 2 - w)}" ry="${nr(body / 2 - w)}"
        fill="${s.vulling}" stroke="${s.lijn}" stroke-width="${nr(w)}" />
      <polygon points="${punten([[b * 0.3, body * 0.86], [b * 0.24, h - w], [b * 0.46, body * 0.94]])}"
        fill="${s.vulling}" stroke="${s.lijn}" stroke-width="${nr(w)}" stroke-linejoin="round" />`;
  },
});
vorm({
  id: "ballon-gedachte", label: "Gedachte", groep: "ballonnen", verhouding: 1.3, heeftVulling: true, heeftLijn: true,
  standaardBreedte: 0.34,
  teken: (b, h, s) => {
    const w = dik(b, h, s);
    const body = h * 0.72;
    return `<ellipse cx="${nr(b / 2)}" cy="${nr(body / 2)}" rx="${nr(b / 2 - w)}" ry="${nr(body / 2 - w)}"
        fill="${s.vulling}" stroke="${s.lijn}" stroke-width="${nr(w)}" />
      <circle cx="${nr(b * 0.3)}" cy="${nr(body + (h - body) * 0.35)}" r="${nr(h * 0.07)}" fill="${s.vulling}" stroke="${s.lijn}" stroke-width="${nr(w * 0.8)}" />
      <circle cx="${nr(b * 0.21)}" cy="${nr(h - h * 0.05)}" r="${nr(h * 0.042)}" fill="${s.vulling}" stroke="${s.lijn}" stroke-width="${nr(w * 0.7)}" />`;
  },
});
vorm({
  id: "ballon-knal", label: "Knalballon", groep: "ballonnen", verhouding: 1.2, heeftVulling: true, heeftLijn: true,
  standaardBreedte: 0.32,
  teken: (b, h, s) => {
    const w = dik(b, h, s);
    return `<polygon points="${punten(sterPunten(14, b, h, w, 0.78))}"
      fill="${s.vulling}" stroke="${s.lijn}" stroke-width="${nr(w)}" stroke-linejoin="round" />`;
  },
});

// Kleurverlopen ──────────────────────────────────────────────────────────────
// Een verloop van de vulkleur naar niets. Handig om tekst leesbaar te maken over
// een druk beeld — precies waar een vormgever hem voor gebruikt.

function verloop(b: number, h: number, s: VormStijl, richting: [number, number, number, number]): string {
  const [x1, y1, x2, y2] = richting;
  return `<defs><linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
      <stop offset="0" stop-color="${s.vulling}" stop-opacity="0.95" />
      <stop offset="1" stop-color="${s.vulling}" stop-opacity="0" />
    </linearGradient></defs>
    <rect width="${nr(b)}" height="${nr(h)}" fill="url(#g)" />`;
}

vorm({
  id: "verloop-omhoog", label: "Van onder", groep: "verlopen", verhouding: 2.4, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 1,
  teken: (b, h, s) => verloop(b, h, s, [0, 1, 0, 0]),
});
vorm({
  id: "verloop-omlaag", label: "Van boven", groep: "verlopen", verhouding: 2.4, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 1,
  teken: (b, h, s) => verloop(b, h, s, [0, 0, 0, 1]),
});
vorm({
  id: "verloop-zij", label: "Van links", groep: "verlopen", verhouding: 1.6, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.6,
  teken: (b, h, s) => verloop(b, h, s, [0, 0, 1, 0]),
});
vorm({
  id: "verloop-rond", label: "Vignet", groep: "verlopen", verhouding: 1.78, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 1,
  teken: (b, h, s) =>
    `<defs><radialGradient id="g"><stop offset="0.45" stop-color="${s.vulling}" stop-opacity="0" />
      <stop offset="1" stop-color="${s.vulling}" stop-opacity="0.9" /></radialGradient></defs>
      <rect width="${nr(b)}" height="${nr(h)}" fill="url(#g)" />`,
});

// Markeren ───────────────────────────────────────────────────────────────────
// Dezelfde vormen die de AI-monteur gebruikt om iets aan te wijzen, nu ook met
// de hand te pakken.

vorm({
  id: "markeer-cirkel", label: "Omcirkelen", groep: "markeren", verhouding: 1.3, heeftVulling: false, heeftLijn: true,
  standaardBreedte: 0.3,
  teken: (b, h, s) => {
    const w = dik(b, h, s);
    const rx = b / 2 - w;
    const ry = h / 2 - w;
    // Bewust niet helemaal dicht: een cirkel die net openstaat leest als "iemand
    // heeft dit aangewezen", een perfecte ellips leest als een UI-element.
    const lijst: Array<[number, number]> = [];
    for (let i = 0; i <= 64; i++) {
      const t = -0.35 * Math.PI + ((1.85 * Math.PI) * i) / 64;
      lijst.push([b / 2 + rx * Math.cos(t), h / 2 + ry * Math.sin(t)]);
    }
    return `<polyline points="${punten(lijst)}" fill="none" stroke="${s.lijn}" stroke-width="${nr(w)}" stroke-linecap="round" />`;
  },
});
vorm({
  id: "markeer-kader", label: "Kader", groep: "markeren", verhouding: 1.5, heeftVulling: false, heeftLijn: true,
  standaardBreedte: 0.34,
  teken: (b, h, s) => {
    const w = dik(b, h, s);
    return `<rect x="${nr(w / 2)}" y="${nr(w / 2)}" width="${nr(b - w)}" height="${nr(h - w)}"
      rx="${nr(Math.min(b, h) * 0.08)}" fill="none" stroke="${s.lijn}" stroke-width="${nr(w)}" />`;
  },
});
vorm({
  id: "markeer-streep", label: "Marker", groep: "markeren", verhouding: 6, heeftVulling: false, heeftLijn: true,
  standaardBreedte: 0.34,
  teken: (b, h, s) => {
    const w = Math.max(4, h * 0.5);
    return `<line x1="${nr(w / 2)}" y1="${nr(h / 2)}" x2="${nr(b - w / 2)}" y2="${nr(h / 2)}"
      stroke="${s.lijn}" stroke-width="${nr(w)}" stroke-linecap="round" opacity="0.85" />`;
  },
});
vorm({
  id: "markeer-balk", label: "Balk", groep: "markeren", verhouding: 4, heeftVulling: true, heeftLijn: false,
  standaardBreedte: 0.5,
  teken: (b, h, s) => `<rect width="${nr(b)}" height="${nr(h)}" rx="${nr(h * 0.16)}" fill="${s.vulling}" opacity="0.82" />`,
});

// ── Publieke API ─────────────────────────────────────────────────────────────

export const VORMEN: VormDefinitie[] = DEFS;

export const VORM_GROEPEN: Array<{ id: VormGroepId; label: string }> = [
  { id: "lijnen", label: "Lijnen" },
  { id: "basis", label: "Basisvormen" },
  { id: "veelhoeken", label: "Veelhoeken" },
  { id: "sterren", label: "Sterren" },
  { id: "pijlen", label: "Pijlen" },
  { id: "ballonnen", label: "Tekstballonnen" },
  { id: "markeren", label: "Aanwijzen" },
  { id: "verlopen", label: "Kleurverlopen" },
];

export function vindVorm(id: string): VormDefinitie | undefined {
  return VORMEN.find((v) => v.id === id);
}

/**
 * De SVG-bron van één vorm. `breedtePx` bepaalt de tekenresolutie; omdat het
 * vectoren zijn maakt de waarde alleen uit voor de verhouding tussen lijndikte
 * en vlak — 400 is ruim genoeg en houdt de data-URL kort.
 */
export function vormSvg(id: string, stijl: Partial<VormStijl> = {}, breedtePx = 400): string {
  const def = vindVorm(id);
  if (!def) throw new Error(`Onbekende vorm: ${id}`);
  const s: VormStijl = { ...STANDAARD_VORMSTIJL, ...stijl };
  const b = breedtePx;
  const h = Math.max(8, Math.round(breedtePx / def.verhouding));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${b}" height="${h}" viewBox="0 0 ${b} ${h}">${def.teken(b, h, s)}</svg>`;
}

/**
 * De vorm als bron voor een ImageClip.
 *
 * URI-gecodeerd in plaats van base64: Pixi herkent `data:image/svg+xml` aan het
 * begin van de URL, het scheelt een derde in lengte, en je kunt in de
 * ontwikkeltools gewoon zien wat er staat.
 */
export function vormDataUri(id: string, stijl: Partial<VormStijl> = {}, breedtePx = 400): string {
  const svg = vormSvg(id, stijl, breedtePx).replace(/\s+/g, " ").trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
