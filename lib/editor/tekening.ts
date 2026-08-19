// ── Tekenen, plakbriefjes en tabellen ────────────────────────────────────────
//
// De laatste drie dingen uit Canva's gereedschapsbalk die je met de hand doet en
// die daarom juist géén model nodig hebben: een streep die je zelf trekt, een
// geel briefje, en een tabel met vakjes.
//
// Voor het tekenen geldt hetzelfde als voor de vormen: wat je trekt wordt een
// SVG-pad, en dat pad is precies wat er in de export komt. Het wordt niet
// "nagetekend" en niet omgezet naar pixels, dus het blijft scherp op elke
// resolutie.

export interface Punt {
  /** Fractie van het canvas: 0..1. */
  x: number;
  y: number;
}

export interface PenStijl {
  kleur: string;
  /** Lijndikte als fractie van de composietbreedte. */
  dikte: number;
  /** Doorzichtigheid, voor een markeerstift-gevoel. */
  dekking?: number;
}

export const PENNEN: Array<{ id: string; label: string; stijl: PenStijl }> = [
  { id: "pen", label: "Pen", stijl: { kleur: "#ef4444", dikte: 0.006 } },
  { id: "dik", label: "Dikke stift", stijl: { kleur: "#111827", dikte: 0.014 } },
  { id: "marker", label: "Markeerstift", stijl: { kleur: "#facc15", dikte: 0.03, dekking: 0.45 } },
  { id: "handtekening", label: "Handtekening", stijl: { kleur: "#1e3a8a", dikte: 0.004 } },
];

const nr = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * Punten die dicht op elkaar liggen weglaten. Een muis levert er tientallen per
 * seconde; die allemaal bewaren maakt het pad onnodig lang zonder dat je er iets
 * van ziet — en het pad staat straks in het documentje dat we opslaan.
 */
export function dunUit(punten: Punt[], drempel = 0.004): Punt[] {
  const uit: Punt[] = [];
  for (const p of punten) {
    const vorige = uit[uit.length - 1];
    if (!vorige || Math.hypot(p.x - vorige.x, p.y - vorige.y) >= drempel) uit.push(p);
  }
  if (uit.length === 1 && punten.length > 1) uit.push(punten[punten.length - 1]);
  return uit;
}

/** Het vak waarin de tekening past, met wat lucht voor de lijndikte. */
export function omhullende(punten: Punt[], marge: number) {
  const xs = punten.map((p) => p.x);
  const ys = punten.map((p) => p.y);
  const links = Math.min(...xs) - marge;
  const rechts = Math.max(...xs) + marge;
  const boven = Math.min(...ys) - marge;
  const onder = Math.max(...ys) + marge;
  return {
    links, boven,
    breedte: Math.max(rechts - links, marge * 2),
    hoogte: Math.max(onder - boven, marge * 2),
    midden: { x: (links + rechts) / 2, y: (boven + onder) / 2 },
  };
}

/**
 * Een getrokken lijn als SVG.
 *
 * De punten komen binnen als fracties van het canvas; we rekenen ze om naar het
 * eigen vak van de tekening, zodat het element niet zo groot is als het hele
 * beeld maar precies zo groot als wat je hebt getekend. Anders zou je later niet
 * meer kunnen slepen — het kader zou overal overheen liggen.
 *
 * De hoeken worden afgerond met een quadratische curve door de middens van de
 * segmenten. Dat is de standaardtruc voor "vloeiend zonder na te denken": geen
 * bibliotheek nodig en geen slingers waar je ze niet wilt.
 */
export function tekeningSvg(
  punten: Punt[],
  stijl: PenStijl,
  compositie: { width: number; height: number }
): { svg: string; formaat: { breedte: number; hoogte: number }; midden: Punt; breedteFractie: number } | null {
  const p = dunUit(punten);
  if (p.length < 2) return null;

  const dikPx = Math.max(2, stijl.dikte * compositie.width);
  const margeX = (dikPx / compositie.width) * 1.2;
  const vak = omhullende(p, margeX);

  const bPx = Math.max(8, Math.round(vak.breedte * compositie.width));
  const hPx = Math.max(8, Math.round(vak.hoogte * compositie.height));
  const naarX = (x: number) => ((x - vak.links) / vak.breedte) * bPx;
  const naarY = (y: number) => ((y - vak.boven) / vak.hoogte) * hPx;

  let d = `M ${nr(naarX(p[0].x))} ${nr(naarY(p[0].y))}`;
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i].x + p[i + 1].x) / 2;
    const my = (p[i].y + p[i + 1].y) / 2;
    d += ` Q ${nr(naarX(p[i].x))} ${nr(naarY(p[i].y))} ${nr(naarX(mx))} ${nr(naarY(my))}`;
  }
  const laatste = p[p.length - 1];
  d += ` L ${nr(naarX(laatste.x))} ${nr(naarY(laatste.y))}`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bPx}" height="${hPx}" viewBox="0 0 ${bPx} ${hPx}">` +
    `<path d="${d}" fill="none" stroke="${stijl.kleur}" stroke-width="${nr(dikPx)}" ` +
    `stroke-linecap="round" stroke-linejoin="round"${stijl.dekking != null ? ` opacity="${stijl.dekking}"` : ""} /></svg>`;

  return {
    svg,
    formaat: { breedte: bPx, hoogte: hPx },
    midden: vak.midden,
    breedteFractie: vak.breedte,
  };
}

// ── Plakbriefje ──────────────────────────────────────────────────────────────

export const BRIEFJE_KLEUREN = ["#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#e9d5ff"];

/** Geel briefje met een omgekrulde hoek en een zachte slagschaduw. */
export function plakbriefjeSvg(kleur = BRIEFJE_KLEUREN[0], breedtePx = 400): string {
  const b = breedtePx;
  const h = Math.round(breedtePx * 0.85);
  const hoek = b * 0.18;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${b}" height="${h}" viewBox="0 0 ${b} ${h}">
    <defs><filter id="s" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="${nr(h * 0.02)}" stdDeviation="${nr(h * 0.02)}" flood-opacity="0.25" />
    </filter></defs>
    <path d="M 0 0 H ${nr(b)} V ${nr(h - hoek)} L ${nr(b - hoek)} ${nr(h)} H 0 Z" fill="${kleur}" filter="url(#s)" />
    <path d="M ${nr(b)} ${nr(h - hoek)} L ${nr(b - hoek)} ${nr(h)} V ${nr(h - hoek)} Z" fill="#00000022" />
  </svg>`;
}

// ── Tabel ────────────────────────────────────────────────────────────────────

export interface TabelOpties {
  rijen: number;
  kolommen: number;
  /** Eerste rij als koprij tonen. */
  kop?: boolean;
  lijnkleur?: string;
  vulkleur?: string;
  kopkleur?: string;
}

/**
 * Een leeg raster. Bewust zonder tekst: de cellen vul je met losse tekstlagen,
 * zodat je ze los kunt verplaatsen en opmaken. Een tabel met ingebakken tekst
 * zou je bij elke typefout opnieuw moeten laten tekenen.
 */
export function tabelSvg(o: TabelOpties, breedtePx = 800): string {
  const rijen = Math.max(1, Math.min(20, Math.round(o.rijen)));
  const kolommen = Math.max(1, Math.min(12, Math.round(o.kolommen)));
  const b = breedtePx;
  const rijHoogte = Math.max(24, Math.round(b / kolommen / 2.6));
  const h = rijHoogte * rijen;
  const kolomBreedte = b / kolommen;
  const lijn = Math.max(1, b * 0.002);
  const lijnkleur = o.lijnkleur ?? "#334155";
  const vul = o.vulkleur ?? "#ffffff";
  const kopkleur = o.kopkleur ?? "#e2e8f0";

  const delen: string[] = [`<rect width="${nr(b)}" height="${nr(h)}" fill="${vul}" />`];
  if (o.kop) delen.push(`<rect width="${nr(b)}" height="${nr(rijHoogte)}" fill="${kopkleur}" />`);
  for (let r = 1; r < rijen; r++) {
    const y = rijHoogte * r;
    delen.push(`<line x1="0" y1="${nr(y)}" x2="${nr(b)}" y2="${nr(y)}" stroke="${lijnkleur}" stroke-width="${nr(lijn)}" />`);
  }
  for (let k = 1; k < kolommen; k++) {
    const x = kolomBreedte * k;
    delen.push(`<line x1="${nr(x)}" y1="0" x2="${nr(x)}" y2="${nr(h)}" stroke="${lijnkleur}" stroke-width="${nr(lijn)}" />`);
  }
  delen.push(`<rect x="${nr(lijn / 2)}" y="${nr(lijn / 2)}" width="${nr(b - lijn)}" height="${nr(h - lijn)}"
    fill="none" stroke="${lijnkleur}" stroke-width="${nr(lijn)}" />`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${b}" height="${h}" viewBox="0 0 ${b} ${h}">${delen.join("")}</svg>`;
}

/** Elke tekening wordt op dezelfde manier een bron voor een ImageClip. */
export function alsDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;
}
