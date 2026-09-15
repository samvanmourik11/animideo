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

/**
 * CAMERABEWEGING — wat de camera DOET tijdens het shot.
 *
 * Het kader zegt waar de camera staat; dit zegt wat hij vervolgens doet. Tot nu
 * toe stond er in de bewegings-opdracht letterlijk "Static locked camera", en dat
 * is precies wat je kreeg: de bank, de kussens en de lamp stonden in elke frame
 * op exact dezelfde pixels en alleen de kinderen schuifelden wat.
 *
 * In het Lelijke Eendje beweegt de camera bijna altijd. Gemeten over veertig
 * seconden: de beeldverandering van frame op frame is daar ongeveer drie keer zo
 * groot als bij ons (mediaan 3,0 tegen 1,07). In één shot draait de camera om een
 * vos heen — je ziet de bomen achter hem wegschuiven.
 */
export const BEWEGINGEN = [
  "stil",
  "inzoomen",
  "uitzoomen",
  "meedraaien",
  "meelopen",
  "kantelen",
] as const;
export type Beweging = (typeof BEWEGINGEN)[number];

interface BewegingDef {
  label: string;
  regie: string;
}

const BEW: Record<Beweging, BewegingDef> = {
  stil: {
    label: "Stil",
    regie:
      "The camera holds still. Only the characters move. Use this sparingly — a locked camera makes an " +
      "animated shot look like a photograph with a wobble.",
  },
  inzoomen: {
    label: "Langzaam inzoomen",
    regie:
      "The camera pushes in SLOWLY and continuously towards the subject for the whole clip, growing a little " +
      "closer with every second. A steady, deliberate dolly-in — never a snap zoom.",
  },
  uitzoomen: {
    label: "Langzaam uitzoomen",
    regie:
      "The camera pulls back SLOWLY and continuously for the whole clip, revealing more of the location around " +
      "the subject with every second. A steady dolly-out — never a snap zoom.",
  },
  // Een kwartcirkel om iemand heen of een lange rit opzij laat een deel van de plek
  // zien dat niet in het storyboardbeeld stond, en dat verzint het videomodel dan.
  // Klein houden: genoeg voor diepte, te weinig om iets nieuws te onthullen.
  meedraaien: {
    label: "Om het onderwerp heen",
    regie:
      "The camera ARCS a little around the subject for the whole clip — only a few degrees — so the background " +
      "shifts gently sideways behind them and you see them from a slightly different angle. The subject stays " +
      "roughly centred. Nothing new comes into view: everything stays what the first frame already shows.",
  },
  meelopen: {
    label: "Meebewegen",
    regie:
      "The camera glides a short way sideways for the whole clip — a slow, smooth tracking move that makes the " +
      "foreground pass a little faster than the background, so the place feels three-dimensional. It stays within " +
      "what the first frame already shows: nothing new comes into view at the edges.",
  },
  kantelen: {
    label: "Kantelen",
    regie:
      "The camera tilts slowly and continuously — drifting up to reveal what is above, or down to settle on " +
      "the subject — over the whole clip.",
  },
};

export function bewegingRegie(b: Beweging | null | undefined): string {
  return BEW[b ?? "inzoomen"]?.regie ?? BEW.inzoomen.regie;
}

export function bewegingLabel(b: Beweging | null | undefined): string {
  return BEW[b ?? "inzoomen"]?.label ?? BEW.inzoomen.label;
}

export function isBeweging(waarde: unknown): waarde is Beweging {
  return typeof waarde === "string" && (BEWEGINGEN as readonly string[]).includes(waarde);
}

/**
 * De beweging die bij dit kader hoort, met afwisseling over de shots heen.
 *
 * Bewust afgeleid en niet gevraagd: een regisseur die per shot ook nog een
 * camerabeweging moet kiezen, kiest meestal hetzelfde. Deze koppeling geeft elk
 * kader een handvol bewegingen die er echt bij passen — je zoomt in op een
 * gezicht, je draait om iemand heen, je onthult een plek door uit te zoomen — en
 * `index` laat ze rouleren zodat twee opeenvolgende shots niet hetzelfde doen.
 */
export function bewegingVoorKader(kader: Kader | null | undefined, index = 0): Beweging {
  // Uitzoomen en kantelen staan er niet meer tussen. Het beeld per shot ligt sinds
  // het storyboard per zin vast, en die twee bewegingen laten per definitie iets
  // zien dat NIET in dat beeld stond: meer plek, of wat erboven zit. Dat moest het
  // videomodel dan verzinnen — precies wat het storyboard moet voorkomen.
  const opties: Record<Kader, Beweging[]> = {
    totaal: ["inzoomen", "meelopen"],
    medium: ["inzoomen", "meedraaien", "meelopen"],
    // Op een gezicht werkt inzoomen het sterkst; eromheen draaien geeft leven.
    close: ["inzoomen", "meedraaien"],
    "extreme-close": ["inzoomen", "stil"],
    // Meekijken over een schouder vraagt om vooruit bewegen.
    "van-achteren": ["inzoomen", "meelopen"],
    laag: ["inzoomen", "meedraaien"],
    hoog: ["inzoomen", "meelopen"],
    detail: ["inzoomen", "stil"],
  };
  const rij = opties[kader ?? STANDAARD_KADER] ?? opties[STANDAARD_KADER];
  return rij[((index % rij.length) + rij.length) % rij.length];
}
