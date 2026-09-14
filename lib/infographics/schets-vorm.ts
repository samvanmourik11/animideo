// DE SCHETS VOOR "OP DE GROND ZETTEN" — pure meetkunde, zonder AI-aanroep.
//
// "De deur moet tot de grond reiken" werd acht keer netjes begrepen en acht keer niet
// uitgevoerd: een bewerking in woorden verplaatst of verlengt niets, het beeldmodel gaf
// steeds bijna hetzelfde beeld terug. Met de deur als bruine vorm tot op het pad erin
// geschilderd, en het meisje ervoor er weer overheen, tekende hetzelfde model een echte
// deur die op de grond staat. Hier staat hoe die vorm berekend wordt; het zoeken en
// tekenen staat in schets-bewerking.ts.

/** Een rechthoek in pixels, vanaf linksboven. */
export interface Vak {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Een kader van het aanwijsmodel (midden, fracties van het beeld) in pixels vanaf linksboven. */
export function vakInPixels(k: { x: number; y: number; breedte: number; hoogte: number }, W: number, H: number): Vak {
  return { x: (k.x - k.breedte / 2) * W, y: (k.y - k.hoogte / 2) * H, w: k.breedte * W, h: k.hoogte * H };
}

const overlaptHorizontaal = (a: Vak, b: Vak) => a.x < b.x + b.w && a.x + a.w > b.x;

/**
 * Waar de grond onder een voorwerp begint.
 *
 * Het aanwijsmodel kadert "the ground" als het hele stuk grond; de bovenrand daarvan
 * is waar de muur ophoudt. Een klein stukje eronder, zodat de vorm echt óp het pad
 * staat en niet net erboven eindigt. Geen grond gevonden: dan laag in beeld, waar de
 * grond in een getekende scène bijna altijd ligt.
 */
export function grondOnder(voorwerp: Vak, gronden: Vak[], H: number): number {
  const onder = gronden.filter((g) => overlaptHorizontaal(g, voorwerp) && g.y + g.h > voorwerp.y + voorwerp.h);
  const bovenrand = onder.length ? Math.min(...onder.map((g) => g.y)) + 0.04 * H : 0.85 * H;
  return Math.round(Math.min(H, Math.max(voorwerp.y + voorwerp.h, bovenrand)));
}

/** De vorm: even breed als het voorwerp, van zijn bovenkant tot de grond. Nooit kleiner dan het voorwerp. */
export function schetsVak(voorwerp: Vak, grondY: number): Vak {
  return { x: voorwerp.x, y: voorwerp.y, w: voorwerp.w, h: Math.max(voorwerp.h, grondY - voorwerp.y) };
}

export const SCHETS_KLEUR = "#7a4a24";

/** De vorm als SVG over het hele beeld, met een ronde bovenkant zoals een deur of poort. */
export function schetsSvg(vak: Vak, W: number, H: number): string {
  const r = (n: number) => Math.round(n);
  return (
    `<svg width="${r(W)}" height="${r(H)}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="${r(vak.x)}" y="${r(vak.y)}" width="${r(vak.w)}" height="${r(vak.h)}" rx="${r(vak.w / 2)}" fill="${SCHETS_KLEUR}"/>` +
    `</svg>`
  );
}

/**
 * Wie deels vóór de vorm staat, afgerond en binnen het beeld.
 *
 * Die knippen we uit het origineel terug over de vorm. Zonder dat verdween het meisje
 * half onder het bruin, en een tweede beeld met het origineel erbij hielp niet: dan gaf
 * het model gewoon het origineel terug, met de zwevende deur.
 */
export function mensenVoorVorm(vorm: Vak, mensen: Vak[], W: number, H: number): Vak[] {
  return mensen
    .map((m) => {
      const x = Math.max(0, Math.round(m.x));
      const y = Math.max(0, Math.round(m.y));
      return { x, y, w: Math.min(W - x, Math.round(m.w + Math.min(0, m.x))), h: Math.min(H - y, Math.round(m.h + Math.min(0, m.y))) };
    })
    .filter((m) => m.w > 0 && m.h > 0 && overlaptHorizontaal(m, vorm) && m.y < vorm.y + vorm.h && m.y + m.h > vorm.y);
}
