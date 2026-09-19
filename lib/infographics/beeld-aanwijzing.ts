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
import { isKader, type Kader } from "./verhaal-kaders";

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
  required: ["begrepen", "instructie", "klein", "opDeGrond", "controle", "kader"],
  properties: {
    begrepen: { type: "string" },
    instructie: { type: "string" },
    klein: { type: "boolean" },
    opDeGrond: { type: "string" },
    controle: { type: "string" },
    kader: { type: "string" },
  },
} as const;

/**
 * De controlevraag: waaraan zie je dat de aanwijzing is uitgevoerd?
 *
 * Zonder deze vraag zei de app "aangepast" en was er niets veranderd — het grootste
 * ergernispunt. Een vraag naar wat er te ZIEN is ("is the goal in the left third?")
 * beantwoordt het kijkmodel betrouwbaar; "is de aanpassing gelukt?" beantwoordt het
 * altijd met ja (gemeten, zie dialogue-verify).
 */
export function leesControle(ruw: unknown): string | null {
  const tekst = typeof ruw === "string" ? ruw.trim().replace(/\s+/g, " ") : "";
  return tekst.length >= 10 && tekst.length <= 300 ? tekst : null;
}

/**
 * Het ding dat op de grond moet komen te staan, uit het antwoord; null als dat niet
 * gevraagd is. Kort houden: het gaat als zoekterm naar het aanwijsmodel.
 */
export function leesOpDeGrond(ruw: unknown): string | null {
  const tekst = typeof ruw === "string" ? ruw.trim().replace(/\s+/g, " ") : "";
  return tekst.length >= 3 && tekst.length <= 60 ? tekst : null;
}

/**
 * Een gevraagd camerastandpunt uit het antwoord: null als de aanwijzing niets over de
 * camera zegt.
 *
 * "Leo moet groter in beeld, dichterbij de camera" ging als losse zin naar de tekenaar
 * en leverde een nauwelijks grotere Leo op (gemeten 19-09-2026): het kader van het shot
 * bleef "medium" en dat won. Zo'n aanwijzing hoort het kader zelf te veranderen.
 */
export function leesKader(ruw: unknown): Kader | null {
  return isKader(ruw) ? ruw : null;
}

export const AANWIJZING_SYSTEEM = `Je helpt iemand één beeld uit het storyboard van een animatievideo te corrigeren. Je krijgt het DOELBEELD, de andere beelden van dezelfde scène, het laatste shot van de scène ervoor, het eerste van de scène erna en het castblad. De gebruiker schrijft in gewone taal wat er anders moet. Hij verwijst vaak naar andere beelden ("zoals op de andere foto's", "zoals in shot 1") of naar een plek in het beeld ("het rechter poppetje"). Kijk naar die beelden om te bepalen wat hij bedoelt, en wie.

Antwoord met JSON:
- "begrepen": één korte Nederlandse zin over wat er verandert, met de naam van het personage of het ding als dat kan.
- "instructie": in het ENGELS, voor een tekenaar die ALLEEN het doelbeeld ziet. Zeg wat er verandert en beschrijf precies hoe het er daarna uitziet: vorm, grootte, kleur, textuur, plek in het beeld. Verwijs nooit naar "the other images", "the reference" of "shot 1": beschrijf wat daar te zien is.
- "klein": true ALLEEN als er iets verandert aan hoe iets of iemand ERUITZIET, op dezelfde plek in het beeld: een kleur, een kledingstuk, een pet, een kapsel, een gezichtsuitdrukking, de lucht, licht. false zodra er iets VERPLAATST, GROTER of KLEINER moet, of als er iemand of iets bij moet komen of weg moet. Een bewerking kan dat namelijk niet: gevraagd om het doel naar links bleef het doel staan, en gevraagd om er een schildpad bij te zetten kwam er een tweede schildpad naast de eerste (gemeten 19-09-2026).
- "controle": in het ENGELS, één vraag waarmee iemand die ALLEEN het nieuwe beeld ziet kan controleren of de aanwijzing is uitgevoerd. Vraag naar wat er te ZIEN is, niet of de aanpassing gelukt is: "Is the soccer goal positioned in the left half of the image?", "Are the lion's eyes open, with visible pupils?", "Is the turtle holding the whistle in one of his hands?". Drie regels, want een te strenge vraag keurt goed werk af (gemeten 19-09-2026):
  1. Vraag naar ÉÉN ding. Nooit twee eisen in één vraag ("... and is the V-sign visible?").
  2. Vraag niet meer dan de gebruiker vroeg. Zei hij "in zijn hand", vraag dan niet naar de RECHTERhand; zei hij "groter in beeld", vraag dan of het personage minstens de halve beeldhoogte vult, niet of het "most of the image" vult. Alles wat jij er zelf bij verzint, keurt straks een beeld af dat de gebruiker prima vindt.
  3. Het moet te beantwoorden zijn met alleen het nieuwe beeld: nooit "meer dan eerst" of "anders dan op het vorige beeld".
  Ga uit van de woorden van de gebruiker: gaat het over het doel, vraag dan naar het doel en niet naar Leo.
- "kader": alleen als de gebruiker vraagt om DICHTERBIJ of VERDER WEG, om iemand groter of kleiner in beeld, of om meer of minder van de omgeving. Kies dan het standpunt dat daarbij hoort: "extreme-close" (alleen het gezicht), "close" (hoofd en schouders), "medium" (halverwege), "totaal" (de hele plek), "detail" (één voorwerp groot in beeld). Anders een lege tekst.

- "opDeGrond": vraagt de gebruiker dat een voorwerp op de grond of vloer komt te staan of doorloopt tot de grond (een deur die halverwege de muur zweeft, een lantaarnpaal die in de lucht hangt)? Geef dan in het Engels kort welk ding, zoals het in het beeld te zien is: "the wooden door". Anders een lege tekst.

HOUD HET ONDERWERP VAN DE GEBRUIKER VAST. Gaat de aanwijzing over een voorwerp, dan gaat de instructie over dat voorwerp; gaat hij over een personage, dan over dat personage. "Het doel moet links in beeld staan" werd "Move Leo to the left side" — het doel bleef staan waar het stond en de gebruiker kreeg precies niet wat hij vroeg (gemeten 19-09-2026).

DOE PRECIES WAT DE GEBRUIKER VRAAGT, NIETS ANDERS. Wat het shot hoort te laten zien en wat er gezegd wordt is alleen achtergrond: haal daar nooit zelf een wijziging uit. "Lily en Tyrell moeten eruitzien zoals in de rest van scène 4" werd eerst "Lilly moet aandachtig naar de klaproos kijken", omdat dat bij het shot stond. Vraagt de gebruiker dat iemand of iets eruitziet "zoals op de andere beelden", kijk dan op die beelden en beschrijf in de instructie precies hoe die personen of dingen er dáár uitzien — gezicht en ogen, haar, lichaamsbouw en verhoudingen, kleding, schoenen — en wat er in het doelbeeld anders is. Gaat de aanwijzing over personages, beschrijf dan de personages en niet de omgeving.`;

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

/**
 * Gaat deze aanwijzing over de INDELING van het beeld?
 *
 * Verplaatsen, groter of kleiner maken, iemand erbij of eraf: dat kan een bewerking van
 * een bestaand plaatje niet. Gemeten op 19-09-2026: "het doel moet links staan" liet het
 * doel staan waar het stond, en "zet Coco erbij" leverde een tweede schildpad op naast de
 * schildpad die er al stond. Zulke aanwijzingen gaan naar het opnieuw tekenen, ook als het
 * model ze klein noemt.
 */
const INDELING = [
  // Nederlands
  /\b(verplaats|verschuif|schuif|zet .*\b(links|rechts|achter|voor|naast|midden)\b|naar (links|rechts|voren|achteren)|links|rechts|midden|verder weg|dichterbij|inzoom|uitzoom)\b/i,
  /\b(groter|kleiner|vergroot|verklein|hoger|lager|langer|korter)\b/i,
  // Engels (de instructie die het model teruggeeft)
  /\b(move|shift|reposition|swap|place .* (left|right|behind|next to)|to the (left|right)|closer|further|zoom)\b/i,
  /\b(bigger|larger|smaller|taller|shorter|resize|scale)\b/i,
];

/**
 * Erbij zetten of weghalen — alleen te herkennen aan wat de GEBRUIKER schrijft.
 *
 * Deze stond eerst ook op de Engelse instructie, en die gebruikt "add" voor het
 * kleinste detail: "maak de lucht bewolkt" werd "Add several fluffy white clouds" en
 * ging daardoor naar het opnieuw tekenen. Het beeld kwam terug met een ander kader,
 * andere houdingen en een andere achtergrond, terwijl de gebruiker alleen wolken vroeg
 * (gemeten 19-09-2026). Een bewerking doet dat prima.
 */
const ERBIJ_WEG =
  /\b((erbij|bij)\s*(zetten|tekenen)?|toevoegen|weghalen|verwijder(en)?|eruit|zonder)\b|\bhaal\b[^.]*\bweg\b|\b(mag|moet)\s+weg\b|\b(add|insert|remove|delete|erase|without)\b/i;

export function isIndelingsAanwijzing(gebruiker?: string | null, ...rest: (string | null | undefined)[]): boolean {
  const alles = [gebruiker, ...rest].filter(Boolean).join(" ");
  return INDELING.some((p) => p.test(alles)) || ERBIJ_WEG.test(gebruiker ?? "");
}

/**
 * De instructie voor een herkansing: wat er nog niet klopt staat er nu bij.
 *
 * Zonder deze zin tekende het model bij een tweede poging precies dezelfde fout —
 * dat zagen we eerder ook bij de beeldcontrole in dialogue-line.
 */
export function scherpereInstructie(instructie: string, vraag: string, waarom: string): string {
  return (
    `${instructie} ` +
    "The previous attempt did NOT do this" +
    (waarom ? ` (what was seen: ${waarom})` : "") +
    `. This change is the whole point of this picture: ${vraag} — the answer must be yes. ` +
    "Keep everything else exactly as it was."
  );
}
