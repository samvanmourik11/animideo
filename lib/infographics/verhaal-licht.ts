import type { Kader } from "./verhaal-kaders";

/**
 * LICHT EN SFEER — het verschil tussen een plaatje en een beeld.
 *
 * De tekenstijl zegt HOE er getekend wordt; dit zegt hoe laat het is en wat je
 * moet voelen. Die twee zaten door elkaar: de stijl "Soft 3D" schrijft
 * "gentle soft studio lighting" voor, en studiolicht is per definitie vlak —
 * overal even helder, geen richting, geen schaduw die iets betekent. Elke scène
 * zag er daardoor uit als een speelgoedfoto op een productpagina.
 *
 * Het Lelijke Eendje doet het omgekeerde: een maanverlicht bos waarin een vos
 * uit het donker komt, kaarslicht bij een nest, tegenlicht door een keukenraam,
 * een meer in de schemering. Het licht vertelt daar mee.
 *
 * Dit is bewust losgetrokken van de tekenstijl. Je kunt dezelfde Soft 3D-look
 * houden en er toch een nachtscène in zetten.
 */

export const LICHTSOORTEN = [
  "dag",
  "ochtend",
  "gouden-uur",
  "schemering",
  "nacht",
  "haardvuur",
  "tegenlicht",
  "mistig",
] as const;
export type Lichtsoort = (typeof LICHTSOORTEN)[number];

export const STANDAARD_LICHT: Lichtsoort = "dag";

interface LichtDef {
  label: string;
  uitleg: string;
  regie: string;
}

const DEF: Record<Lichtsoort, LichtDef> = {
  dag: {
    label: "Daglicht",
    uitleg: "Gewoon overdag. Helder, vriendelijk, weinig drama.",
    // "Warm" en verder niets liet het model per beeld zijn eigen zon kiezen: in een
    // reeks bosscènes op daglicht had er één oranje zonnestralen door de nevel en
    // de rest helder middaglicht. Wat daglicht NIET is, staat er nu bij.
    regie:
      "Clear, bright daytime light from one clear direction — the sun or a window — so everything has a soft " +
      "shadow falling the same way. Clean, natural colours as on an ordinary sunny day: no golden or orange " +
      "glow, no visible beams or shafts of light, no haze or mist. Friendly, but never flat: you can see where " +
      "the light comes from.",
  },
  ochtend: {
    label: "Vroege ochtend",
    uitleg: "Koel, zacht licht. Voor een begin.",
    regie:
      "Early morning light: cool, pale and low, slanting in almost horizontally with long soft shadows and a " +
      "faint haze in the air. Quiet and fresh.",
  },
  "gouden-uur": {
    label: "Gouden uur",
    uitleg: "Warm laagstaand zonlicht. Voor een mooi moment.",
    regie:
      "Golden hour: low warm orange sunlight raking across the scene, long shadows, glowing rim light on the " +
      "edges of the characters, dust and light catching in the air. Rich and nostalgic.",
  },
  schemering: {
    label: "Schemering",
    uitleg: "Blauw uur, net na zonsondergang. Voor twijfel of afscheid.",
    regie:
      "Dusk, the blue hour just after sunset: the sky deep blue, the landscape in cool shadow, with a few warm " +
      "lights glowing somewhere in the frame. Melancholy and still.",
  },
  nacht: {
    label: "Nacht",
    uitleg: "Donker met maanlicht. Voor spanning of angst.",
    regie:
      "Night: the scene is genuinely DARK, lit mostly by cool blue moonlight from one side. Deep shadows swallow " +
      "the corners, only the important shapes catch the light, and the background falls away into blackness. " +
      "Tense and mysterious — do not brighten it into daylight.",
  },
  haardvuur: {
    label: "Vuur of kaarslicht",
    uitleg: "Warm licht van één punt. Voor geborgenheid.",
    regie:
      "Lit almost entirely by a warm fire or candle inside the scene: a single orange light source low in the " +
      "frame, flickering warm light on the faces closest to it, everything further away dropping into deep warm " +
      "shadow. Cosy and intimate.",
  },
  tegenlicht: {
    label: "Tegenlicht",
    uitleg: "Licht van achteren. Maakt silhouetten en randlicht.",
    regie:
      "Strong backlight: the light source is BEHIND the characters — a window, a doorway, the sun — so they are " +
      "rimmed with a bright glowing edge and their front is in softer shadow. The air behind them glows.",
  },
  mistig: {
    label: "Mistig",
    uitleg: "Diffuus en zacht. Voor iets dat onduidelijk of eenzaam is.",
    regie:
      "Soft diffuse light through mist or falling snow: the background fades away into pale grey with distance, " +
      "colours are muted, edges soften the further back they are. Quiet and lonely.",
  },
};

export function lichtRegie(l: Lichtsoort | null | undefined): string {
  return DEF[l ?? STANDAARD_LICHT]?.regie ?? DEF[STANDAARD_LICHT].regie;
}

export function lichtLabel(l: Lichtsoort | null | undefined): string {
  return DEF[l ?? STANDAARD_LICHT]?.label ?? DEF[STANDAARD_LICHT].label;
}

export function lichtUitleg(l: Lichtsoort | null | undefined): string {
  return DEF[l ?? STANDAARD_LICHT]?.uitleg ?? DEF[STANDAARD_LICHT].uitleg;
}

export function isLichtsoort(waarde: unknown): waarde is Lichtsoort {
  return typeof waarde === "string" && (LICHTSOORTEN as readonly string[]).includes(waarde);
}

/** De lichtlijst voor in een prompt: naam plus wanneer je hem gebruikt. */
export function lichtKeuzelijst(): string {
  return LICHTSOORTEN.map((l) => `- "${l}" (${DEF[l].label}): ${DEF[l].uitleg}`).join("\n");
}

/**
 * SCHERPTEDIEPTE — hoort bij hoe dichtbij de camera staat, niet bij de sfeer.
 *
 * Bij ons was alles even scherp, van de neus van het personage tot de lamp
 * achterin. Daardoor leest een close-up niet als een close-up: je oog weet niet
 * waar het kijken moet. In de referentie valt de achtergrond bij elk dichtbij
 * shot weg in wazigheid.
 */
export function diepteRegie(kader: Kader | null | undefined): string {
  switch (kader) {
    case "extreme-close":
    case "close":
      // "Alles erachter vervaagt" was niet genoeg: bij een close-up voor de synagoge
      // stonden Tyrell en Lilly ineens in een kamer met een raam. Wazig mag, een
      // andere plek niet.
      return (
        // "Hetzelfde als in het bronbeeld" stond hier, maar een shot wordt nu vanaf
        // de omschrijving getekend: er gaat geen bronbeeld meer mee.
        " DEPTH OF FIELD: shallow. The face is razor sharp and the background is softly blurred, with any lights " +
        "becoming round glowing circles. The background is still the location of this scene — recognisable by " +
        "its colours and shapes, only out of focus. Never replace it with a different location or an indoor room."
      );
    case "detail":
      return (
        " DEPTH OF FIELD: shallow. The object fills the focus and behind it the location of this scene is a soft " +
        "wash of its own colours — never a different location."
      );
    case "medium":
    case "van-achteren":
      return (
        " DEPTH OF FIELD: moderate. The characters are sharp and the background is gently softened, enough to " +
        "separate them from the room without losing where they are."
      );
    default:
      // Totaal, laag, hoog: de plek zelf is het onderwerp en moet leesbaar blijven.
      return " DEPTH OF FIELD: deep — the location stays readable from front to back, with only the far distance softening.";
  }
}

/**
 * De volledige lichtregie voor één beeld: de sfeer plus de scherptediepte.
 *
 * Staat bewust ACHTER de tekenstijl in de prompt. De stijl "Soft 3D" schrijft
 * "gentle soft studio lighting" voor; die zin wint als hij als laatste komt, en
 * dan is elke nachtscène alsnog een helder verlicht speelgoedtafereel.
 */
export function beeldSfeer(licht: Lichtsoort | null | undefined, kader: Kader | null | undefined): string {
  return (
    ` LIGHTING — this overrides any generic or studio lighting mentioned in the drawing style: ${lichtRegie(licht)}` +
    diepteRegie(kader)
  );
}
