// BEELDREGIE — wat de camera in elk shot ziet, vastgelegd vóór er één beeld
// getekend wordt.
//
// Twee dingen gingen mis in het storyboard van Tyrell en Lilly in het bos:
//
//  1. Zeven scènes op een wandeling door het bos waren zeven keer hetzelfde
//     bospad. De schrijfstap mag maar twee à drie plekken gebruiken en moet een
//     plek die terugkomt letterlijk hetzelfde omschrijven. Dat helpt tegen een
//     video die als losse plaatjes aanvoelt, maar een wandeling werd zo één beeld.
//  2. Tyrell zei "deze bloem heet een bosanemoon", en er stond nergens een bloem.
//     Het beeld per regel kreeg alleen de emotie mee, niet de zin, dus moest het
//     videomodel de bloem zelf verzinnen — of liet het hem weg.
//
// Deze stap lost allebei op één plek op: elke scène een eigen plekje binnen
// hetzelfde gebied, en per regel wat je ziet. Hij draait vlak voor het
// storyboard, zodat hij ook werkt voor draaiboeken die al bestonden en voor
// beide schrijfroutes (verzinnen en volgen).

import {
  isActie, sceneCast, kaleSetting, bruikbareRegel, VERTELLER_ID,
  type DialogueScene, type DialogueSpec,
} from "./dialogue-schema";
import { kaderLabel } from "./verhaal-kaders";
import { STANDAARD_LICHT, lichtLabel } from "./verhaal-licht";

export interface RegieRegel { index: number; beeld: string }
export interface RegieScene { index: number; gebied: string; plek: string; regels: RegieRegel[] }
export interface Beeldregie { scenes: RegieScene[] }

export const BEELDREGIE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scenes"],
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "gebied", "plek", "regels"],
        properties: {
          index: { type: "integer" },
          gebied: { type: "string" },
          plek: { type: "string" },
          regels: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["index", "beeld"],
              properties: {
                index: { type: "integer" },
                beeld: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Een beschrijving die langer is, verdringt de vaste regels achteraan de beeldprompt. */
const MAX_BEELD_TEKENS = 400;

/**
 * Ligt de plek van deze scène al vast?
 *
 * Een getekend basisbeeld bestaat al, en een scène die al eens geregisseerd is kan
 * daarna door de gebruiker zelf een andere plek gekregen hebben. In beide gevallen
 * mag de beeldregie de omschrijving niet meer omgooien.
 */
export function plekVast(scene: Pick<DialogueScene, "twoShotUrl" | "geregisseerd">): boolean {
  return !!scene.twoShotUrl || !!scene.geregisseerd;
}

/** Moet de beeldregie nog (een deel van) dit draaiboek doen? */
export function regieNodig(spec: Pick<DialogueSpec, "scenes">): boolean {
  return spec.scenes.some(
    (s) => !s.geregisseerd || s.lines.some((l) => bruikbareRegel(l) && !(l.beeld ?? "").trim()),
  );
}

const gebiedSleutel = (gebied?: string | null) => (gebied ?? "").trim().toLowerCase();

/**
 * Een eerder basisbeeld uit hetzelfde gebied, met hetzelfde licht, maar van een
 * ándere plek. Gaat mee als voorbeeld voor licht en kleur.
 *
 * Alle zeven bosscènes stonden op "Daglicht", en toch had scène 4 warme
 * zonnestralen door de nevel en ander gebladerte dan de rest: elk basisbeeld werd
 * los getekend en koos zijn eigen zon. Een beeld van exact dezelfde plek gaat al
 * mee als locatiereferentie, dus dat telt hier niet.
 */
export function sfeerAnker(scenes: DialogueScene[], si: number): string | null {
  const scene = scenes[si];
  if (!scene) return null;
  const gebied = gebiedSleutel(scene.gebied);
  if (!gebied) return null;
  const licht = scene.licht ?? STANDAARD_LICHT;
  const plek = kaleSetting(scene.setting);
  const bron = scenes.find(
    (s, i) =>
      i !== si &&
      !!s.twoShotUrl &&
      gebiedSleutel(s.gebied) === gebied &&
      (s.licht ?? STANDAARD_LICHT) === licht &&
      kaleSetting(s.setting) !== plek,
  );
  return bron?.twoShotUrl ?? null;
}

/** Het antwoord van het model, zonder aan te nemen dat het klopt. */
export function leesRegie(ruw: unknown): Beeldregie {
  const scenes = (ruw as { scenes?: unknown } | null)?.scenes;
  if (!Array.isArray(scenes)) return { scenes: [] };
  return {
    scenes: scenes.flatMap((s): RegieScene[] => {
      const x = s as Partial<RegieScene> | null;
      if (typeof x?.index !== "number") return [];
      const regels = Array.isArray(x.regels) ? x.regels : [];
      return [{
        index: x.index,
        gebied: typeof x.gebied === "string" ? x.gebied.trim() : "",
        plek: typeof x.plek === "string" ? x.plek.trim() : "",
        regels: regels.flatMap((r): RegieRegel[] =>
          typeof r?.index === "number" && typeof r?.beeld === "string" && r.beeld.trim()
            ? [{ index: r.index, beeld: r.beeld.trim().slice(0, MAX_BEELD_TEKENS) }]
            : [],
        ),
      }];
    }),
  };
}

/**
 * De uitkomst van de beeldregie in het draaiboek zetten.
 *
 * Wat er al staat blijft staan: een plek die vastligt (zie plekVast) en een beeld
 * per regel dat al beschreven is. Zo kan de regie opnieuw draaien voor één
 * gewijzigde zin zonder de rest van het storyboard ongeldig te maken.
 */
export function pasRegieToe(spec: DialogueSpec, regie: Beeldregie): DialogueSpec {
  const scenes = spec.scenes.map((scene, si) => {
    const r = regie.scenes.find((x) => x.index === si);
    if (!r) return scene;
    return {
      ...scene,
      setting: !plekVast(scene) && r.plek ? r.plek : scene.setting,
      gebied: r.gebied || scene.gebied || null,
      geregisseerd: true,
      lines: scene.lines.map((l, li) => {
        if ((l.beeld ?? "").trim()) return l;
        const beeld = r.regels.find((x) => x.index === li)?.beeld;
        return beeld ? { ...l, beeld } : l;
      }),
    };
  });
  return { ...spec, scenes };
}

const SYSTEEM = `Je bent de beeldregisseur van een getekende animatievideo. Het verhaal en de zinnen liggen vast. Jij legt vast wat de camera in elk shot ZIET, zodat de tekenaar alles vooraf tekent en de animatie daarna niets meer hoeft te verzinnen.

PER SCÈNE
- "gebied": een korte Engelse naam in kleine letters voor de grotere plek waar de scène speelt, bijvoorbeeld "forest", "grandma's house", "city harbour". Scènes in hetzelfde gebied krijgen EXACT dezelfde gebiedsnaam.
- "plek": een ENGELSE beschrijving van precies het plekje binnen dat gebied waar deze scène speelt, in één of twee zinnen. Alleen de plek: geen personages, geen handelingen, geen licht, weer of tijdstip (dat ligt elders vast).
  - Trekken de personages door een groter gebied (een wandeling door het bos, een tocht door de stad), dan krijgt elke scène een EIGEN plekje met een eigen herkenbaar kenmerk: een bospad tussen hoge bomen, een open plek vol bloemen, de voet van een grote oude eik, een beekje met stenen. Twee scènes achter elkaar krijgen nooit dezelfde plek, tenzij het verhaal daar echt blijft.
  - Blijven de personages op dezelfde plek (ze zitten nog aan dezelfde tafel), neem de plek van de vorige scène dan LETTERLIJK over.
  - Plekken in hetzelfde gebied moeten herkenbaar hetzelfde gebied zijn. Begin ze daarom met dezelfde korte omschrijving van het gebied (zelfde soort bomen, zelfde huis, zelfde kleuren) en beschrijf daarna wat dit plekje eigen maakt.
  - Waar de personages in deze scène naar kijken of over praten en wat vast bij de plek hoort (de bloemen die ze bekijken, de grote boom), staat in de plek. Dan wordt het meteen in het basisbeeld getekend.
  - Verzin geen ander gebied dan de huidige plek aangeeft. Het bos blijft het bos, oma's huis blijft oma's huis.
  - Staat er "(VAST)" achter een scène, dan ligt de plek al vast: neem de huidige plek letterlijk over.

PER REGEL
- "beeld": in het ENGELS, één of twee zinnen: wat je in dit shot ziet, passend bij het camerakader.
  - Noemt, toont, bekijkt of wijst iemand in de zin iets aan (een bloem, een kaart, een dier, een voorwerp), dan is dat ding in dit shot duidelijk te zien. Voorbeeld: Tyrell zegt "Deze bloem heet een bosanemoon" → "Tyrell crouches next to a small white wood anemone growing among green leaves on the forest floor, pointing at it."
  - Beschrijf houding, wat ze vasthouden en waar ze naar kijken. Wie er praat hoef je niet te zeggen, dat regelen wij.
  - Gebruik alleen de personages die bij de scène "in beeld" staan. Geen andere mensen en geen dieren die niet in het verhaal zitten.
  - Close-up of heel dichtbij: het gezicht, en eventueel het ding in de hand of vlak ernaast. Detail: alleen het ding, of een hand ermee, zonder gezichten.
  - Wat pas later in de scène ontdekt wordt, is in eerdere shots nog niet te zien. Wat er eenmaal is, blijft er: een geplukte bloem blijft in de hand.
  - Geen tekst, letters, borden of namen in beeld. Geen licht, weer of tijdstip.
  - Bij een actiebeeld staat er al een beschrijving. Houd je daaraan en vul alleen aan wat nodig is om het volledig te kunnen tekenen.
  - Een vast voorwerp uit de lijst noem je bij zijn naam, zodat het er in elk beeld hetzelfde uitziet.

Geef een antwoord voor ELKE scène en ELKE regel die hieronder staat, met hun index.`;

/** De vraag aan het model: het hele draaiboek, zodat het de plekken tegen elkaar kan afwegen. */
export function regiePrompt(spec: DialogueSpec): { systeem: string; vraag: string } {
  const naam = (id: string) =>
    id === VERTELLER_ID ? "de verteller" : spec.cast.find((c) => c.id === id)?.name ?? "iemand";

  const personages = spec.cast
    .map((c) => `- ${c.name}${c.leeftijd ? ` (${c.leeftijd})` : ""}${c.role ? `, ${c.role}` : ""}`)
    .join("\n");
  const voorwerpen = (spec.voorwerpen ?? [])
    .filter((v) => v.naam.trim())
    .map((v) => `- ${v.naam.trim()}: ${v.uiterlijk.trim()}`)
    .join("\n");

  const scenes = spec.scenes
    .map((s, si) => {
      const deel = s.deel ? spec.verhaallijn?.[s.deel - 1]?.wat : null;
      const inBeeld = sceneCast(s, spec.cast, spec.verhaallijn).map((c) => c.name).join(", ");
      const regels = s.lines
        .map((l, li) => {
          if (!bruikbareRegel(l)) return null;
          const kader = kaderLabel(l.kader);
          if (isActie(l)) {
            const stem = (l.text ?? "").trim() ? ` — daaroverheen zegt ${naam(l.characterId)}: "${l.text.trim()}"` : "";
            return `  REGEL ${li} · actiebeeld · ${kader}: ${(l.actie ?? "").trim()}${stem}`;
          }
          return `  REGEL ${li} · ${kader} · ${naam(l.characterId)} zegt: "${l.text.trim()}"`;
        })
        .filter(Boolean)
        .join("\n");
      return [
        `SCÈNE ${si}${plekVast(s) ? " (VAST)" : ""}`,
        deel ? `  in het verhaal: ${deel}` : null,
        `  huidige plek: ${s.setting}`,
        `  licht: ${lichtLabel(s.licht)}`,
        `  in beeld: ${inBeeld || "niemand"}`,
        regels,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  const vraag =
    `TITEL: ${spec.title}\n\n` +
    `PERSONAGES:\n${personages || "- (geen)"}\n\n` +
    (voorwerpen ? `VASTE VOORWERPEN:\n${voorwerpen}\n\n` : "") +
    `DRAAIBOEK:\n${scenes}\n\n` +
    `Geef nu de beeldregie als JSON.`;

  return { systeem: SYSTEEM, vraag };
}
