// ── Diagrammen ───────────────────────────────────────────────────────────────
//
// Canva's "Diagrammen" met een aanpak die bij deze editor past: je typt cijfers,
// wij tekenen ze. Geen model dat een grafiek "namaakt" met verzonnen assen —
// wat er staat is wat je hebt ingevoerd, en dat blijft zo als je het later
// aanpast.
//
// Net als bij de vormen: pure SVG zonder Node- of browser-afhankelijkheden,
// zodat het paneel, de preview en de server-render dezelfde tekening maken. De
// data blijft in `meta.diagram` staan, zodat je de cijfers achteraf nog kunt
// wijzigen zonder opnieuw te beginnen.

export type DiagramSoort = "staaf" | "rij" | "lijn" | "vlak" | "cirkel" | "ring";

export interface DiagramReeks {
  label: string;
  waarde: number;
}

export interface DiagramOpties {
  soort: DiagramSoort;
  data: DiagramReeks[];
  titel?: string;
  /** Kleuren per punt; loopt rond als er meer punten dan kleuren zijn. */
  kleuren?: string[];
  /** Letterkleur voor labels en waarden. */
  tekstkleur?: string;
  /** Waarden bij de punten zetten. */
  toonWaarden?: boolean;
  /** Tekenbreedte in px; alleen van invloed op de verhoudingen, niet op scherpte. */
  breedtePx?: number;
}

export const DIAGRAM_SOORTEN: Array<{ id: DiagramSoort; label: string }> = [
  { id: "staaf", label: "Staaf" },
  { id: "rij", label: "Rij" },
  { id: "lijn", label: "Lijn" },
  { id: "vlak", label: "Vlak" },
  { id: "cirkel", label: "Cirkel" },
  { id: "ring", label: "Ring" },
];

/** Rustige, goed onderscheidbare reeks; werkt op licht én donker beeld. */
export const DIAGRAM_KLEUREN = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444",
  "#a855f7", "#06b6d4", "#ec4899", "#84cc16",
];

export const VOORBEELD_DATA: DiagramReeks[] = [
  { label: "Jan", waarde: 40 },
  { label: "Feb", waarde: 65 },
  { label: "Mrt", waarde: 52 },
  { label: "Apr", waarde: 80 },
];

/** Verhouding (breedte / hoogte) waarin een diagram het beste leest. */
const VERHOUDING: Record<DiagramSoort, number> = {
  staaf: 1.5, rij: 1.5, lijn: 1.6, vlak: 1.6, cirkel: 1.25, ring: 1.25,
};

const nr = (n: number) => (Math.round(n * 100) / 100).toString();

/** &, < en > in een label zouden de SVG breken. */
function veilig(tekst: string): string {
  return tekst.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const LETTER = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/**
 * Zwart of wit, wat het beste afsteekt tegen deze kleur.
 */
function contrast(hex: string): string {
  const m = /^#?([\da-f]{6})/i.exec(hex.trim());
  if (!m) return "#000000";
  const n = parseInt(m[1], 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.55 ? "#000000" : "#ffffff";
}

/**
 * Labels krijgen een dunne omlijning in de tegenkleur.
 *
 * Een diagram ligt over beeld dat we niet kennen: witte labels verdwijnen op een
 * lichte lucht, zwarte op een donkere. Met `paint-order` komt de omlijning
 * áchter de letter te liggen, zodat hij leesbaar blijft zonder dik te worden.
 * Dit ging mis bij het eerste diagram op een licht huis: de maandnamen waren
 * gewoon weg.
 */
function tekst(x: number, y: number, inhoud: string, grootte: number, kleur: string, anker = "middle", vet = 500): string {
  return `<text x="${nr(x)}" y="${nr(y)}" font-family="${LETTER}" font-size="${nr(grootte)}"
    font-weight="${vet}" fill="${kleur}" stroke="${contrast(kleur)}" stroke-width="${nr(grootte * 0.16)}"
    stroke-opacity="0.55" paint-order="stroke" stroke-linejoin="round"
    text-anchor="${anker}" dominant-baseline="middle">${veilig(inhoud)}</text>`;
}

/** Netjes afgeronde waarde: 12,5 blijft 12,5 maar 12,50000001 wordt 12,5. */
function toonGetal(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace(".", ",");
}

interface Vlak {
  b: number;
  h: number;
  kleur: (i: number) => string;
  tk: string;
  data: DiagramReeks[];
  max: number;
  waarden: boolean;
  /** Ruimte die de titel bovenaan al inneemt. */
  top: number;
}

// ── De tekenaars ─────────────────────────────────────────────────────────────

function staaf(v: Vlak, horizontaal: boolean): string {
  const labelRuimte = v.h * 0.12;
  const uit: string[] = [];

  if (horizontaal) {
    const links = v.b * 0.18;
    const vak = (v.h - v.top) / v.data.length;
    const dikte = Math.min(vak * 0.62, v.h * 0.16);
    v.data.forEach((d, i) => {
      const y = v.top + vak * i + vak / 2;
      const lengte = Math.max(2, ((v.b - links - v.b * 0.12) * Math.max(0, d.waarde)) / v.max);
      uit.push(`<rect x="${nr(links)}" y="${nr(y - dikte / 2)}" width="${nr(lengte)}" height="${nr(dikte)}"
        rx="${nr(dikte * 0.18)}" fill="${v.kleur(i)}" />`);
      uit.push(tekst(links - v.b * 0.02, y, d.label, v.h * 0.055, v.tk, "end"));
      if (v.waarden) uit.push(tekst(links + lengte + v.b * 0.02, y, toonGetal(d.waarde), v.h * 0.05, v.tk, "start", 600));
    });
    return uit.join("\n");
  }

  const bodem = v.h - labelRuimte;
  const vak = v.b / v.data.length;
  const dikte = Math.min(vak * 0.6, v.b * 0.14);
  const hoogte = bodem - v.top - (v.waarden ? v.h * 0.06 : 0);
  v.data.forEach((d, i) => {
    const x = vak * i + vak / 2;
    const lengte = Math.max(2, (hoogte * Math.max(0, d.waarde)) / v.max);
    uit.push(`<rect x="${nr(x - dikte / 2)}" y="${nr(bodem - lengte)}" width="${nr(dikte)}" height="${nr(lengte)}"
      rx="${nr(dikte * 0.16)}" fill="${v.kleur(i)}" />`);
    uit.push(tekst(x, bodem + labelRuimte * 0.45, d.label, v.h * 0.055, v.tk));
    if (v.waarden) uit.push(tekst(x, bodem - lengte - v.h * 0.04, toonGetal(d.waarde), v.h * 0.05, v.tk, "middle", 600));
  });
  uit.push(`<line x1="0" y1="${nr(bodem)}" x2="${nr(v.b)}" y2="${nr(bodem)}" stroke="${v.tk}" stroke-opacity="0.25" stroke-width="${nr(v.h * 0.006)}" />`);
  return uit.join("\n");
}

function lijnOfVlak(v: Vlak, gevuld: boolean): string {
  const labelRuimte = v.h * 0.12;
  const bodem = v.h - labelRuimte;
  const top = v.top + v.h * 0.08;
  const vak = v.b / Math.max(1, v.data.length - 1 || 1);
  const kleur = v.kleur(0);
  const dik = v.h * 0.018;

  const pnt = v.data.map((d, i) => {
    const x = v.data.length === 1 ? v.b / 2 : vak * i;
    const y = bodem - ((bodem - top) * Math.max(0, d.waarde)) / v.max;
    return [x, y] as [number, number];
  });

  const pad = pnt.map(([x, y]) => `${nr(x)},${nr(y)}`).join(" ");
  const uit: string[] = [];
  uit.push(`<line x1="0" y1="${nr(bodem)}" x2="${nr(v.b)}" y2="${nr(bodem)}" stroke="${v.tk}" stroke-opacity="0.25" stroke-width="${nr(v.h * 0.006)}" />`);
  if (gevuld) {
    uit.push(`<polygon points="${nr(pnt[0][0])},${nr(bodem)} ${pad} ${nr(pnt[pnt.length - 1][0])},${nr(bodem)}"
      fill="${kleur}" fill-opacity="0.28" />`);
  }
  uit.push(`<polyline points="${pad}" fill="none" stroke="${kleur}" stroke-width="${nr(dik)}" stroke-linecap="round" stroke-linejoin="round" />`);
  pnt.forEach(([x, y], i) => {
    uit.push(`<circle cx="${nr(x)}" cy="${nr(y)}" r="${nr(dik * 1.5)}" fill="${kleur}" />`);
    uit.push(tekst(x, bodem + labelRuimte * 0.45, v.data[i].label, v.h * 0.055, v.tk));
    if (v.waarden) uit.push(tekst(x, y - v.h * 0.055, toonGetal(v.data[i].waarde), v.h * 0.05, v.tk, "middle", 600));
  });
  return uit.join("\n");
}

function taart(v: Vlak, gatFractie: number): string {
  const totaal = v.data.reduce((s, d) => s + Math.max(0, d.waarde), 0);
  const cx = v.b * 0.34;
  const cy = v.top + (v.h - v.top) / 2;
  const r = Math.min(v.b * 0.3, (v.h - v.top) * 0.44);
  const uit: string[] = [];

  if (totaal <= 0) return tekst(v.b / 2, v.h / 2, "Geen cijfers", v.h * 0.06, v.tk);

  // Eén punt van 100% zou een boog van precies 360° worden, en die tekent SVG
  // als een lege vorm. Dan dus gewoon een hele cirkel.
  if (v.data.filter((d) => d.waarde > 0).length === 1) {
    const i = v.data.findIndex((d) => d.waarde > 0);
    uit.push(`<circle cx="${nr(cx)}" cy="${nr(cy)}" r="${nr(r)}" fill="${v.kleur(i)}" />`);
  } else {
    let hoek = -Math.PI / 2;
    v.data.forEach((d, i) => {
      const deel = (Math.max(0, d.waarde) / totaal) * Math.PI * 2;
      if (deel <= 0) return;
      const eind = hoek + deel;
      const x1 = cx + r * Math.cos(hoek);
      const y1 = cy + r * Math.sin(hoek);
      const x2 = cx + r * Math.cos(eind);
      const y2 = cy + r * Math.sin(eind);
      const groot = deel > Math.PI ? 1 : 0;
      uit.push(`<path d="M ${nr(cx)} ${nr(cy)} L ${nr(x1)} ${nr(y1)} A ${nr(r)} ${nr(r)} 0 ${groot} 1 ${nr(x2)} ${nr(y2)} Z" fill="${v.kleur(i)}" />`);
      hoek = eind;
    });
  }

  if (gatFractie > 0) {
    // Het gat krijgt geen kleur maar wordt eruit gesneden, zodat de ring ook
    // werkt op beeld dat eronder doorloopt.
    uit.unshift(`<mask id="gat"><rect width="${nr(v.b)}" height="${nr(v.h)}" fill="white" />
      <circle cx="${nr(cx)}" cy="${nr(cy)}" r="${nr(r * gatFractie)}" fill="black" /></mask>`);
    const kern = uit.splice(1).join("\n");
    uit.push(`<g mask="url(#gat)">${kern}</g>`);
  }

  // Legenda rechts: bij een taartdiagram zijn de labels anders onleesbaar klein.
  const lx = v.b * 0.68;
  const regel = Math.min((v.h - v.top) / (v.data.length + 1), v.h * 0.12);
  const ly = cy - ((v.data.length - 1) * regel) / 2;
  v.data.forEach((d, i) => {
    const y = ly + regel * i;
    const blok = regel * 0.4;
    uit.push(`<rect x="${nr(lx)}" y="${nr(y - blok / 2)}" width="${nr(blok)}" height="${nr(blok)}" rx="${nr(blok * 0.25)}" fill="${v.kleur(i)}" />`);
    const pct = Math.round((Math.max(0, d.waarde) / totaal) * 100);
    uit.push(tekst(lx + blok * 1.6, y, v.waarden ? `${d.label} · ${pct}%` : d.label, v.h * 0.055, v.tk, "start"));
  });
  return uit.join("\n");
}

// ── Publieke API ─────────────────────────────────────────────────────────────

export function diagramSvg(opties: DiagramOpties): string {
  const soort = opties.soort;
  const breedte = opties.breedtePx ?? 720;
  const hoogte = Math.round(breedte / VERHOUDING[soort]);
  const data = (opties.data?.length ? opties.data : VOORBEELD_DATA).slice(0, 12);
  const palet = opties.kleuren?.length ? opties.kleuren : DIAGRAM_KLEUREN;
  const tk = opties.tekstkleur ?? "#f8fafc";
  const titel = opties.titel?.trim();

  const v: Vlak = {
    b: breedte,
    h: hoogte,
    kleur: (i) => palet[i % palet.length],
    tk,
    data,
    max: Math.max(...data.map((d) => Math.max(0, d.waarde)), 1),
    waarden: opties.toonWaarden !== false,
    top: titel ? hoogte * 0.16 : hoogte * 0.04,
  };

  let body: string;
  switch (soort) {
    case "staaf": body = staaf(v, false); break;
    case "rij": body = staaf(v, true); break;
    case "lijn": body = lijnOfVlak(v, false); break;
    case "vlak": body = lijnOfVlak(v, true); break;
    case "cirkel": body = taart(v, 0); break;
    case "ring": body = taart(v, 0.55); break;
  }

  const kop = titel ? tekst(breedte / 2, hoogte * 0.08, titel, hoogte * 0.075, tk, "middle", 700) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${breedte}" height="${hoogte}" viewBox="0 0 ${breedte} ${hoogte}">${kop}${body}</svg>`;
}

export function diagramDataUri(opties: DiagramOpties): string {
  const svg = diagramSvg(opties).replace(/\s+/g, " ").trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
