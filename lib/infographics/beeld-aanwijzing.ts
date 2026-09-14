// EEN AANWIJZING OP ÉÉN BEELD, MET DE REST VAN HET STORYBOARD ERBIJ.
//
// "Het kapsel van het rechter poppetje moet hetzelfde zijn als de andere foto's van
// scène 6" ging als losse tekst naar de beeldmaker. Die zag die andere foto's niet,
// wist niet wie "het rechter poppetje" was, en tekende het hele shot opnieuw. Nu kijkt
// eerst een model mét de andere beelden wat er bedoeld wordt, en schrijft het een
// correctie die zonder die beelden te volgen is. Een kleine correctie wordt een
// bewerking van alleen dat beeld: in een proef kreeg Lilly haar volle afro terug en
// bleef de rest, ook de zachte look, gelijk.

import type { DialogueSpec } from "./dialogue-schema";

export interface ContextBeeld {
  label: string;
  url: string;
}

/** Meer beelden maakt de vraag duurder en het antwoord niet beter. */
const MAX_CONTEXT = 8;

const isUrl = (u?: string | null): u is string => typeof u === "string" && /^https?:\/\//.test(u);

/**
 * De beelden waar een aanwijzing naar kan verwijzen: de plek en de andere shots van
 * deze scène, het laatste shot van de scène ervoor, het eerste van de scène erna, en
 * het castblad. Het doelbeeld zelf zit er niet in; dat gaat apart mee.
 */
export function aanwijzingContext(
  spec: Pick<DialogueSpec, "scenes" | "castSheetUrl">,
  si: number,
  li: number,
): ContextBeeld[] {
  const scene = spec.scenes[si];
  if (!scene) return [];
  const uit: ContextBeeld[] = [];
  const zet = (label: string, url?: string | null) => {
    if (isUrl(url)) uit.push({ label, url });
  };

  zet(`het beeld van de plek van scène ${si + 1}`, scene.twoShotUrl);
  scene.lines.forEach((l, j) => {
    if (j !== li) zet(`scène ${si + 1}, shot ${j + 1}`, l.shotImageUrl);
  });

  const vorige = spec.scenes[si - 1];
  if (vorige) {
    const j = vorige.lines.map((l) => l.shotImageUrl).findLastIndex(isUrl);
    if (j >= 0) zet(`scène ${si}, shot ${j + 1} (het laatste shot van de scène ervoor)`, vorige.lines[j].shotImageUrl);
  }
  const volgende = spec.scenes[si + 1];
  if (volgende) {
    const j = volgende.lines.findIndex((l) => isUrl(l.shotImageUrl));
    if (j >= 0) zet(`scène ${si + 2}, shot ${j + 1} (het eerste shot van de scène erna)`, volgende.lines[j].shotImageUrl);
  }

  zet("het castblad: zo horen de personages eruit te zien", spec.castSheetUrl);
  return uit.slice(0, MAX_CONTEXT);
}

export const AANWIJZING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["begrepen", "instructie", "klein"],
  properties: {
    begrepen: { type: "string" },
    instructie: { type: "string" },
    klein: { type: "boolean" },
  },
} as const;

export const AANWIJZING_SYSTEEM = `Je helpt iemand één beeld uit het storyboard van een animatievideo te corrigeren. Je krijgt het DOELBEELD, de andere beelden van dezelfde scène, het laatste shot van de scène ervoor, het eerste van de scène erna en het castblad. De gebruiker schrijft in gewone taal wat er anders moet. Hij verwijst vaak naar andere beelden ("zoals op de andere foto's", "zoals in shot 1") of naar een plek in het beeld ("het rechter poppetje"). Kijk naar die beelden om te bepalen wat hij bedoelt, en wie.

Antwoord met JSON:
- "begrepen": één korte Nederlandse zin over wat er verandert, met de naam van het personage of het ding als dat kan.
- "instructie": in het ENGELS, voor een tekenaar die ALLEEN het doelbeeld ziet. Zeg wat er verandert en beschrijf precies hoe het er daarna uitziet: vorm, grootte, kleur, textuur, plek in het beeld. Verwijs nooit naar "the other images", "the reference" of "shot 1": beschrijf wat daar te zien is.
- "klein": true als alleen iets binnen het beeld verandert en de rest precies zo moet blijven (een kapsel, een kleur, een voorwerp erbij of eraf, een gezichtsuitdrukking). false als het beeld grotendeels anders moet (een ander camerastandpunt, een andere plek, andere houdingen van iedereen).`;

/** De tekst die bij de beelden hoort: de aanwijzing, wie er meespeelt en wat dit shot is. */
export function aanwijzingVraag(
  spec: Pick<DialogueSpec, "scenes" | "cast">,
  si: number,
  li: number,
  aanwijzing: string,
): string {
  const regel = spec.scenes[si]?.lines[li];
  const personages = spec.cast
    .map((c) => `- ${c.name}: ${[c.appearance, c.kleding].filter(Boolean).join(" ")}`.trim())
    .join("\n");
  const zin = (regel?.text ?? "").trim();
  return (
    `DE AANWIJZING VAN DE GEBRUIKER voor het DOELBEELD (scène ${si + 1}, shot ${li + 1}): "${aanwijzing.trim()}"\n\n` +
    `PERSONAGES:\n${personages || "- (onbekend)"}\n\n` +
    (regel?.beeld ? `WAT DIT SHOT HOORT TE LATEN ZIEN: ${regel.beeld}\n` : "") +
    (zin ? `WAT ER GEZEGD WORDT: "${zin}"\n` : "")
  );
}
