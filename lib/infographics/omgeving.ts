// DE OMGEVINGENBIBLIOTHEEK — een plek die in elk beeld dezelfde plek blijft.
//
// Personages hebben een vast plaatje als referentie, voorwerpen ook, maar de PLEK had
// niets: elk shot werd opnieuw getekend vanaf een geschreven omschrijving ("een
// voetbalveld in het park"). Dat is elke keer een nieuw bedacht veld. In "Leo de Leeuw
// leert voetballen" stonden er in shot 1 platte lollybomen zonder doel, in shot 2 een
// dicht bos mét doel, en halverwege ineens een hek rond een ander veld (gemeten
// 19-09-2026).
//
// Een omgeving is daarom één keer getekend en daarna vast: een omschrijving, een paar
// herkenningspunten die er moeten staan, en MEERDERE VARIANTEN van dezelfde plek — van
// veraf, van halverwege en een hoekje van dichtbij. Zo kan de camera variëren zonder dat
// de plek verandert: een gewoon shot krijgt het middenbeeld mee als referentie, een
// totaalbeeld het wijde en een gezicht van heel dichtbij het detailbeeld.

import type { Kader } from "./verhaal-kaders";

export const OMGEVING_VARIANTEN = ["totaal", "medium", "detail"] as const;
export type OmgevingVariantSoort = (typeof OMGEVING_VARIANTEN)[number];

export interface OmgevingVariant {
  soort: OmgevingVariantSoort;
  url: string;
}

export interface Omgeving {
  id: string;
  /** Wat de gebruiker ziet: "Het voetbalveld in het park". */
  naam: string;
  /** Waar de tekenaar op afgaat, in het Engels. */
  beschrijving: string;
  /**
   * Wat er in deze plek te zien hoort te zijn: "a white goal", "a red brick clubhouse",
   * "tall oak trees". Hiermee controleren we een getekend beeld — vragen naar wat er te
   * ZIEN is werkt, een beeld met een ander beeld laten vergelijken niet (zie
   * aanwijzing-controle.ts).
   */
  kenmerken: string[];
  varianten: OmgevingVariant[];
  /** De tekenstijl waarin de varianten gemaakt zijn; een andere stijl vraagt nieuwe beelden. */
  styleId?: string | null;
}

/** Wat elke variant laat zien. Gaat mee in de tekenopdracht van die variant. */
export const VARIANT_UITLEG: Record<OmgevingVariantSoort, string> = {
  totaal:
    "a wide establishing shot of the whole place, seen from eye level, with the horizon and the main landmarks " +
    "all visible at once",
  medium:
    "the middle of the same place from closer by, as a camera would see two people standing there — you see part " +
    "of the surroundings, not the whole place",
  detail:
    "a close view of one corner of the same place, the kind of background you would see behind someone's head in a " +
    "close-up — with at least one recognisable landmark of this place clearly in it, never an empty patch of ground",
};

/**
 * Welke variant hoort bij dit camerastandpunt?
 *
 * Een shot met het wijde totaalbeeld als referentie kreeg de hele horizon achter de
 * personages; een shot met het detailbeeld kreeg juist een lege lap gras. Is de gezochte
 * variant er niet, dan pakken we de dichtstbijzijnde die er wel is.
 */
export function variantVoorKader(omgeving: Pick<Omgeving, "varianten">, kader?: Kader | null): OmgevingVariant | null {
  // "close" hoort bij het MIDDEN-beeld, niet bij het detailbeeld: met een detailbeeld
  // als referentie kwam er een shot terug dat bijna helemaal uit leeg gras bestond
  // (gemeten 20-09-2026). Alleen echt dichtbij (een gezicht, een voorwerp groot in
  // beeld) heeft aan het detailbeeld genoeg.
  const wens: OmgevingVariantSoort =
    kader === "extreme-close" || kader === "detail"
      ? "detail"
      : kader === "totaal" || kader === "hoog" || kader === "laag"
        ? "totaal"
        : "medium";
  const volgorde: Record<OmgevingVariantSoort, OmgevingVariantSoort[]> = {
    totaal: ["totaal", "medium", "detail"],
    medium: ["medium", "totaal", "detail"],
    detail: ["detail", "medium", "totaal"],
  };
  for (const soort of volgorde[wens]) {
    const gevonden = omgeving.varianten.find((v) => v.soort === soort && v.url);
    if (gevonden) return gevonden;
  }
  return null;
}

/** Het beeld dat een plek het beste samenvat: het totaalbeeld, anders wat er is. */
export function hoofdbeeld(omgeving: Pick<Omgeving, "varianten">): string | null {
  return variantVoorKader(omgeving, "totaal")?.url ?? null;
}

/**
 * De tekenopdracht voor één variant van een omgeving. Zonder personages: dit beeld is
 * de plek, niet de scène. Staat er iemand op, dan tekent het beeldmodel die er in elk
 * shot bij.
 */
export function omgevingBrief(
  omgeving: Pick<Omgeving, "naam" | "beschrijving" | "kenmerken">,
  soort: OmgevingVariantSoort,
): string {
  const kenmerken = omgeving.kenmerken.filter(Boolean).slice(0, 8);
  return (
    `A location background for an animated film: ${VARIANT_UITLEG[soort]}. ` +
    `The place is ${omgeving.beschrijving.replace(/\.?$/, ".")} ` +
    (kenmerken.length
      ? `These things belong to this place and must look exactly the same every time: ${kenmerken.join(", ")}. `
      : "") +
    // Zonder dit verbod komt er een figuurtje in beeld, en dat figuurtje duikt daarna in
    // elk shot van die scène op als extra persoon.
    "EMPTY PLACE: there are no people, no animals and no characters anywhere in this image — only the place itself. " +
    "No text, no letters, no labels, no logos and no frames anywhere in the image."
  );
}

/**
 * Wat er in de tekenopdracht van een SHOT over de plek komt te staan, naast het
 * referentiebeeld van die plek.
 */
export function omgevingRegie(omgeving: Pick<Omgeving, "beschrijving" | "kenmerken">): string {
  const kenmerken = omgeving.kenmerken.filter(Boolean).slice(0, 6);
  return (
    "THE PLACE — one of the reference images is a picture of the LOCATION of this scene, without any characters " +
    `in it: ${omgeving.beschrijving.replace(/\.?$/, ".")} ` +
    "The background of this shot is that exact place: the same ground, the same sky, the same buildings, trees, " +
    "walls and objects in the same positions, in the same colours. Only the camera and the characters change. " +
    (kenmerken.length ? `Whatever the camera shows of it, these stay the same: ${kenmerken.join(", ")}. ` : "") +
    // Zie de cast-sheet-regel in dialogue-line: een referentiebeeld wordt anders als
    // voorwerp in de scène getekend, of de indeling ervan wordt overgenomen.
    "Do not copy the framing of that reference image, and never draw it as a picture, poster or screen inside the shot."
  );
}

/** Een lege omgeving om mee te beginnen. */
export function nieuweOmgeving(naam: string): Omgeving {
  return { id: "", naam: naam.trim(), beschrijving: "", kenmerken: [], varianten: [] };
}

/** Is deze omgeving af genoeg om als referentie te gebruiken? */
export function omgevingKlaar(omgeving?: Omgeving | null): boolean {
  return !!omgeving && omgeving.varianten.some((v) => !!v.url);
}
