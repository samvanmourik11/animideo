import { TEKENINGEN, grondbalk, boog as tekenBoog, muntlint, type TekenOpties } from "@/lib/infographics/illustrator";
import { assetVan, assetMaat, assetZweeft } from "@/lib/infographics/asset-register";
import type { OverheidKleuren } from "@/lib/infographics/overheid-scene";

// DE COMPOSER.
//
// De bibliotheek was niet het probleem — de opbouw was dat. Alles werd in
// hetzelfde vierkantje geschaald, dus een rijbewijs kwam even groot in beeld als
// een kerk, en alle elementen stonden netjes op een rij in een eigen kaartje.
// Dat leest als een dia. Een tekening leest anders, en dat komt door drie dingen:
//
//  1. MAATVERHOUDING. Een mens is 1,70 en een huis is 8 meter. Zodra je dat
//     respecteert, klopt een beeld meteen — ook als de vormen simpel zijn.
//  2. DIEPTE. Wat verder weg staat is kleiner en staat hoger op het grondvlak,
//     en wat dichterbij is overlapt wat erachter staat.
//  3. RELATIE. Een figuur die een document VASTHOUDT vertelt iets; een figuur
//     naast een document is een opsomming.
//
// Deze module doet die drie dingen. De AI levert alleen nog wat er in beeld staat
// en waar ongeveer; de rest is rekenwerk.

// ── Hoe groot iets in het echt is ──────────────────────────────────────────
//
// In meters, grof. Het gaat om de verhouding, niet om de precisie: zolang een
// mens kleiner is dan een huis en groter dan een koffer, klopt het beeld.

// Maten en tekeningen komen uit het asset-register (asset-register.ts). Die
// tabellen stonden hier eerst los, en liepen uit de pas zodra er een asset
// bijkwam: een nieuwe tekening had dan wel een omschrijving maar geen maat, en
// werd dus als "middelgroot" getekend.
const maatVan = (asset: string) => assetMaat(asset);
const ZWEEFT = (asset: string) => assetZweeft(asset);

// ── Wat er in beeld staat ──────────────────────────────────────────────────

export type Dieptevlak = "achter" | "midden" | "voor";

export interface TafereelElement {
  asset: string;
  label?: string | null;
  /** Dieptevlak. Achter = kleiner en hoger, voor = groter en lager. */
  vlak?: Dieptevlak;
  /** Horizontale plek, 0 (links) tot 1 (rechts). */
  x?: number;
  /** Dit element houdt een ander asset vast (bijv. een figuur met een document). */
  houdt?: string | null;
  /** Het onderwerp van de scene: wordt bewust groter getekend dan levensecht. */
  focus?: boolean;
  /** Uiterlijk, voor figuren. */
  variant?: number;
  huid?: number;
  haar?: number;
  kleding?: string;
}

export interface Tafereel {
  elementen: TafereelElement[];
  /** Lucht met wolken bovenin (buitenscène). */
  buiten?: boolean;
  /** Muntlint dat achterlangs loopt. */
  geldstroom?: boolean;
}

export interface TafereelOpties {
  W: number;
  H: number;
  k: OverheidKleuren;
  /** Tijd binnen de scene. */
  t: number;
  /** Wanneer elk element in beeld komt (zelfde volgorde als de elementen). */
  tijden: number[];
  verschijning: (t: number, at: number) => number;
  nadruk: (t: number, at: number) => number;
  /** Tekent een label; de scene bepaalt lettertype en grootte. */
  label: (tekst: string, x: number, y: number, grootte: number) => string;
}

const DIEPTE: Record<Dieptevlak, { schaal: number; grond: number }> = {
  // grond = waar de voetlijn van dit vlak ligt, als fractie van de hoogte.
  // Het achtervlak stond te dichtbij: een huis achter een persoon vulde het hele
  // beeld. Verder weg betekent kleiner én hoger op het grondvlak.
  achter: { schaal: 0.42, grond: 0.68 },
  midden: { schaal: 1, grond: 0.78 },
  voor: { schaal: 1.45, grond: 0.94 },
};

/**
 * Bepaalt hoeveel meter er verticaal in beeld past.
 *
 * Zit er een kerk in de scene, dan moet de camera ver naar achteren en wordt een
 * mens klein — precies zoals in het echt. Staat er alleen een document en een
 * hand, dan zit de camera er bovenop. Zonder deze stap moet de AI zelf maten
 * verzinnen, en dat gaat altijd mis.
 */
export function kaderHoogte(elementen: TafereelElement[]): number {
  // De camera volgt het ONDERWERP, niet het grootste ding in beeld. Nam je het
  // grootste, dan bepaalde een kerk op de achtergrond hoe groot de hoofdpersoon
  // werd — en die werd dan een poppetje van niks. Een gebouw dat daardoor deels
  // buiten beeld valt is precies wat een illustrator ook zou doen.
  const midden = elementen.filter((e) => (e.vlak ?? "midden") !== "achter");
  const onderwerp = midden.length ? midden : elementen;
  const maat = Math.max(...onderwerp.map((e) => maatVan(e.asset)));
  // Achtergrondgebouwen mogen wel meetellen, maar met een gedempt gewicht: zo
  // zoomt de camera een beetje uit als er een kerk in beeld staat, niet volledig.
  const achterMaat = Math.max(0, ...elementen.filter((e) => e.vlak === "achter").map((e) => maatVan(e.asset)));
  const gewogen = Math.max(maat * 2.4, achterMaat * 0.5);
  return Math.min(28, Math.max(1.6, gewogen));
}

/**
 * Bouwt het tafereel. Tekent van achter naar voren, zodat dichterbij altijd
 * over verder weg heen valt.
 */
export function bouwTafereel(tafereel: Tafereel, o: TafereelOpties): string {
  const { W, H, k, t } = o;
  const meters = kaderHoogte(tafereel.elementen);
  const pxPerMeter = H / meters;

  const volgorde: Dieptevlak[] = ["achter", "midden", "voor"];
  const stukken: string[] = [];

  // Lucht en grondvlak eerst: dat is het toneel waar alles op staat.
  if (tafereel.buiten) {
    const eLucht = o.verschijning(t, 0.1);
    // De lucht loopt tot de voetlijn van het achtervlak: daar ligt de horizon.
    stukken.push(`<rect x="0" y="0" width="${W}" height="${H * DIEPTE.achter.grond}" fill="#dcecf7" opacity="${eLucht.toFixed(3)}"/>`);
    // Het gras loopt door tot de onderrand; hield het halverwege op, dan zweefde
    // de hele scène op een strook groen met grijs eronder.
    stukken.push(
      `<rect x="0" y="${H * DIEPTE.achter.grond}" width="${W}" height="${H}" fill="${k.mint}" opacity="${(eLucht * 0.5).toFixed(3)}"/>`
    );
    stukken.push(
      `<g opacity="${(eLucht * 0.9).toFixed(3)}"><g transform="translate(${W * 0.08}, ${H * 0.08}) scale(${(H * 0.12) / 100})">${TEKENINGEN.wolk(k)}</g>` +
        `<g transform="translate(${W * 0.72}, ${H * 0.04}) scale(${(H * 0.16) / 100})">${TEKENINGEN.wolk(k)}</g></g>`
    );
  }

  if (tafereel.geldstroom) {
    const eLint = o.verschijning(t, 0.45);
    stukken.push(
      muntlint(k, {
        x1: -40, y1: H * 0.42, x2: W + 40, y2: H * 0.36,
        golf: H * 0.12, dikte: Math.max(16, H * 0.026), munten: 8, t, zichtbaar: eLint,
      })
    );
  }

  // De witte boog hoort bij een scène op een leeg vlak. Speelt het tafereel
  // buiten, dan is de lucht al de achtergrond en wordt de boog een witte heuvel
  // die nergens op slaat.
  if (!tafereel.buiten) {
    const eBoog = o.verschijning(t, 0.2);
    const boogR = Math.min(W * 0.26, H * 0.34);
    stukken.push(tekenBoog(k, W / 2, H * DIEPTE.midden.grond, boogR, eBoog * 0.95));
  }

  for (const vlak of volgorde) {
    tafereel.elementen.forEach((elm, i) => {
      if ((elm.vlak ?? "midden") !== vlak) return;
      const at = o.tijden[i] ?? 0;
      const e = o.verschijning(t, at);
      if (e <= 0) return;

      const diepte = DIEPTE[vlak];
      // Een gebouw op de achtergrond mag groot zijn, maar niet het hele frame
      // vullen: dan wordt het het onderwerp in plaats van de omgeving.
      const maxHoogte = vlak === "achter" ? H * 0.55 : H * 0.8;
      // Het onderwerp wordt groter getekend dan het in het echt is. Een koffer
      // van een halve meter naast een mens is levensecht maar onleesbaar; in deze
      // beeldtaal is het ding waar de scène over gaat juist het grootst.
      const focusFactor = elm.focus ? 1.9 : 1;
      const hoogtePx = Math.min(maxHoogte, maatVan(elm.asset) * pxPerMeter * diepte.schaal * focusFactor);
      const breedtePx = hoogtePx; // de tekeningen staan in een vierkant vak
      const x = (elm.x ?? 0.5) * W - breedtePx / 2;
      const grondY = H * diepte.grond;
      // Zwevende dingen hangen in de lucht in plaats van op de grondlijn.
      const y = ZWEEFT(elm.asset) ? H * 0.2 : grondY - hoogtePx + hoogtePx * 0.06;

      const tekenaar = assetVan(elm.asset)?.teken ?? TEKENINGEN.figuur;
      const opties: TekenOpties = { variant: elm.variant, huid: elm.huid, haar: elm.haar, kleding: elm.kleding };
      const schaal = 0.94 + 0.06 * e + 0.05 * o.nadruk(t, at);
      const omhoog = (1 - e) * hoogtePx * 0.12;

      let inhoud = `<g transform="translate(${x}, ${y}) scale(${hoogtePx / 100})">${tekenaar(k, opties)}</g>`;

      // Vasthouden: het object komt op handhoogte naast de figuur te hangen, op
      // zijn eigen ware maat. Dít is wat een opsomming tot een handeling maakt.
      if (elm.houdt) {
        const objAsset = elm.houdt;
        // Levensecht is een rijbewijs 14 centimeter: onzichtbaar naast een mens.
        // In deze beeldtaal worden vastgehouden dingen bewust groter getekend —
        // ze zijn het onderwerp, niet het decor.
        const echt = maatVan(objAsset) * pxPerMeter * diepte.schaal;
        const objH = Math.max(echt, hoogtePx * 0.42);
        const handY = y + hoogtePx * 0.46;
        const handX = x + hoogtePx * 0.86;
        const objTeken = assetVan(objAsset)?.teken ?? TEKENINGEN.document;
        inhoud += `<g transform="translate(${handX - objH / 2}, ${handY - objH / 2}) scale(${objH / 100})">${objTeken(k)}</g>`;
      }

      const cx = x + breedtePx / 2;
      const cy = y + hoogtePx / 2;
      stukken.push(
        `<g opacity="${e.toFixed(3)}" transform="translate(${cx}, ${cy + omhoog}) scale(${schaal.toFixed(3)}) translate(${-cx}, ${-cy})">${inhoud}</g>`
      );

      // Label onder de voetlijn van dit vlak, alleen in het midden- en voorvlak;
      // een label bij iets ver weg leest als ruis.
      if (elm.label && vlak !== "achter") {
        const grootte = Math.max(20, W * 0.02);
        stukken.push(
          `<g opacity="${e.toFixed(3)}">${o.label(elm.label, cx, Math.min(H - grootte, grondY + grootte * 1.6), grootte)}</g>`
        );
      }
    });

    // De grondbalk hoort tussen het midden- en het voorvlak: dingen die
    // dichterbij staan lopen eroverheen, wat de diepte compleet maakt.
    if (vlak === "midden") {
      stukken.push(grondbalk(k, W * 0.06, H * DIEPTE.midden.grond, W * 0.88, Math.max(10, H * 0.018)));
    }
  }

  return stukken.join("");
}
