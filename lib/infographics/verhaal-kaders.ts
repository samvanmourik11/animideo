/**
 * DE CAMERAKADERS — hoe een shot in beeld wordt gebracht.
 *
 * Dit is het verschil tussen "twee poppetjes die praten" en een verhaal dat je
 * blijft kijken. Tot nu toe kreeg élk beeld hetzelfde kader: twee personages
 * naast elkaar, hele lichaam, ooghoogte, elke scène opnieuw. In het Lelijke
 * Eendje — de referentie waar we naartoe werken — heeft bijna elk shot een eigen
 * afstand, hoogte en onderwerp: een snavel die het hele beeld vult, het eendje
 * van achteren bij een meer in de schemering, een haan die van onderaf in een
 * blikje kraait, een vos die uit een donker bos komt.
 *
 * Gemeten aan die video: 289 beeldwissels in twintig minuten, mediaan 3,2
 * seconden per shot, bijna een derde korter dan twee seconden.
 */

export const KADERS = [
  "totaal",
  "medium",
  "close",
  "extreme-close",
  "van-achteren",
  "laag",
  "hoog",
  "detail",
] as const;
export type Kader = (typeof KADERS)[number];

export const STANDAARD_KADER: Kader = "medium";

interface KaderDef {
  /** Wat de gebruiker in het draaiboek ziet staan. */
  label: string;
  /** Eén zin uitleg, voor de tooltip in de shotlijst. */
  uitleg: string;
  /** De Engelse cameraregie die in de beeld-prompt terechtkomt. */
  regie: string;
  /**
   * Hoeveel personages dit kader aankan. Een extreme close-up van twee mensen
   * bestaat niet; een totaalbeeld met één klein figuurtje juist wel.
   */
  maxPersonen: number;
  /**
   * Kan er in dit kader iemand zichtbaar praten? Bij een totaalbeeld staan de
   * figuren te klein voor een leesbare mond, dus daar hoort verteller of stilte.
   */
  geschiktVoorSpreken: boolean;
}

const DEF: Record<Kader, KaderDef> = {
  totaal: {
    label: "Totaalbeeld",
    uitleg: "De hele plek in beeld; de personages zijn klein. Voor het openen van een scène.",
    regie:
      "WIDE ESTABLISHING SHOT: the location fills the frame and the character(s) are small within it, " +
      "seen from a distance. The viewer should understand WHERE we are before anything else. " +
      "Plenty of sky, landscape or room around them.",
    maxPersonen: 3,
    geschiktVoorSpreken: false,
  },
  medium: {
    label: "Medium",
    uitleg: "Van de knieën of het middel af. De standaard voor een gesprek.",
    regie:
      "MEDIUM SHOT at eye level: framed from roughly the knees up, close enough to read faces and gestures " +
      "while the surroundings stay recognisable behind them.",
    maxPersonen: 3,
    geschiktVoorSpreken: true,
  },
  close: {
    label: "Close-up",
    uitleg: "Het gezicht vult een groot deel van het beeld. Voor emotie.",
    regie:
      "CLOSE-UP on the face: head and shoulders fill most of the frame, the background soft and out of focus. " +
      "The emotion in the eyes and mouth is the subject of this shot.",
    maxPersonen: 1,
    geschiktVoorSpreken: true,
  },
  "extreme-close": {
    label: "Heel dichtbij",
    uitleg: "Alleen de ogen of de snuit. Voor een schrik of een grap.",
    regie:
      "EXTREME CLOSE-UP: the face fills the entire frame edge to edge — mostly eyes and mouth, the top of the " +
      "head and the chin may be cropped. Background almost invisible. Use the whole frame for one big feeling.",
    maxPersonen: 1,
    geschiktVoorSpreken: true,
  },
  "van-achteren": {
    label: "Van achteren",
    uitleg: "Over de schouder mee kijken naar wat het personage ziet.",
    regie:
      "FROM BEHIND, over the shoulder: we see the character from the back, small in the lower part of the frame, " +
      "looking out at what is in front of them. What they are looking at is the real subject of the shot. " +
      "Their face is not visible.",
    maxPersonen: 2,
    geschiktVoorSpreken: false,
  },
  laag: {
    label: "Van onderaf",
    uitleg: "De camera kijkt omhoog. Maakt iemand groot of dreigend.",
    regie:
      "LOW ANGLE, camera near the ground looking UP at the subject, so it towers over the viewer against the " +
      "sky or ceiling. Makes the subject feel big, proud or threatening.",
    maxPersonen: 2,
    geschiktVoorSpreken: true,
  },
  hoog: {
    label: "Van bovenaf",
    uitleg: "De camera kijkt neer. Maakt iemand klein of eenzaam.",
    regie:
      "HIGH ANGLE, camera well above the subject looking DOWN, with the ground filling most of the frame. " +
      "Makes the subject feel small, lost or alone.",
    maxPersonen: 2,
    geschiktVoorSpreken: false,
  },
  detail: {
    label: "Detail",
    uitleg: "Alleen een voorwerp of een hand. Voor een klein moment dat telt.",
    regie:
      "DETAIL INSERT: a tight shot of one object, hand or small piece of the scene — no faces. " +
      "Whatever the story just mentioned is the only thing in frame, filling it.",
    maxPersonen: 1,
    geschiktVoorSpreken: false,
  },
};

export function kaderRegie(kader: Kader | null | undefined): string {
  return DEF[kader ?? STANDAARD_KADER]?.regie ?? DEF[STANDAARD_KADER].regie;
}

export function kaderLabel(kader: Kader | null | undefined): string {
  return DEF[kader ?? STANDAARD_KADER]?.label ?? DEF[STANDAARD_KADER].label;
}

export function kaderUitleg(kader: Kader | null | undefined): string {
  return DEF[kader ?? STANDAARD_KADER]?.uitleg ?? DEF[STANDAARD_KADER].uitleg;
}

export function isKader(waarde: unknown): waarde is Kader {
  return typeof waarde === "string" && (KADERS as readonly string[]).includes(waarde);
}

/**
 * Past dit kader bij dit shot, of moet het wijken?
 *
 * Twee dingen kunnen niet: een gezicht dat het hele beeld vult met drie
 * personages erin, en een zichtbaar pratende mond in een totaalbeeld waarin
 * iemand twintig pixels groot is. Vroeg of laat kiest een taalmodel er toch een,
 * en dan krijg je een beeld waarop niemand ziet wie er praat.
 */
export function kaderPast(kader: Kader, aantalPersonen: number, iemandPraat: boolean): boolean {
  const def = DEF[kader];
  if (!def) return false;
  if (aantalPersonen > def.maxPersonen) return false;
  if (iemandPraat && !def.geschiktVoorSpreken) return false;
  return true;
}

/**
 * Het dichtstbijzijnde kader dat wél kan. Nooit `null` terug: een shot zonder
 * kader valt terug op het oude gedrag en dan is de afwisseling weg.
 */
export function passendKader(gevraagd: Kader | null | undefined, aantalPersonen: number, iemandPraat: boolean): Kader {
  const wens = gevraagd && isKader(gevraagd) ? gevraagd : STANDAARD_KADER;
  if (kaderPast(wens, aantalPersonen, iemandPraat)) return wens;
  // Volgorde van uitwijken: eerst iets dat er visueel op lijkt, dan de veilige medium.
  const uitwijk: Record<Kader, Kader[]> = {
    totaal: ["medium", "laag"],
    medium: ["close", "totaal"],
    close: ["medium", "extreme-close"],
    "extreme-close": ["close", "medium"],
    "van-achteren": ["medium", "totaal"],
    laag: ["medium", "close"],
    hoog: ["totaal", "medium"],
    detail: ["close", "medium"],
  };
  for (const k of uitwijk[wens] ?? []) {
    if (kaderPast(k, aantalPersonen, iemandPraat)) return k;
  }
  return "medium";
}

/**
 * Twee keer hetzelfde kader achter elkaar leest als één lang shot: precies de
 * eentonigheid die we wegwerken. Deze functie kiest voor shot `index` een kader
 * dat afwijkt van het vorige, en laat de wens van de regisseur voorgaan zolang
 * die niet herhaalt.
 */
export function zonderHerhaling(
  gevraagd: Kader | null | undefined,
  vorige: Kader | null | undefined,
  aantalPersonen: number,
  iemandPraat: boolean,
): Kader {
  const gekozen = passendKader(gevraagd, aantalPersonen, iemandPraat);
  if (gekozen !== vorige) return gekozen;
  // Herhaling: pak het eerste alternatief dat past en anders is.
  const rij: Kader[] = iemandPraat
    ? ["medium", "close", "extreme-close", "laag"]
    : ["totaal", "van-achteren", "hoog", "detail", "medium", "close"];
  for (const k of rij) {
    if (k !== vorige && kaderPast(k, aantalPersonen, iemandPraat)) return k;
  }
  return gekozen;
}

/** De kaderlijst voor in een prompt: naam plus wanneer je hem gebruikt. */
export function kaderKeuzelijst(): string {
  return KADERS.map((k) => `- "${k}" (${DEF[k].label}): ${DEF[k].uitleg}`).join("\n");
}
