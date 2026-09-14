// BEELDREGIE — wat de camera in elk shot ziet, vastgelegd vóór er één beeld
// getekend wordt.
//
// Drie dingen gingen mis in de storyboards van Tyrell en Lilly in het bos:
//
//  1. Zeven scènes op een wandeling door het bos waren zeven keer hetzelfde
//     bospad. De schrijfstap mag maar twee à drie plekken gebruiken en moet een
//     plek die terugkomt letterlijk hetzelfde omschrijven. Dat helpt tegen een
//     video die als losse plaatjes aanvoelt, maar een wandeling werd zo één beeld.
//  2. Tyrell zei "deze bloem heet een bosanemoon", en er stond nergens een bloem.
//     Het beeld per regel kreeg alleen de emotie mee, niet de zin, dus moest het
//     videomodel de bloem zelf verzinnen — of liet het hem weg.
//  3. Elk beeld wordt los getekend vanaf tekst, en "a lush green forest" liet het
//     model per beeld kiezen: herfstbladeren, een zonnig park, een boom op een
//     witte achtergrond, reuzenbloemen, een kleibos. Daarom beschrijft de regie
//     per gebied één keer de wereld, en die gaat letterlijk mee naar elk beeld.
//
// Deze stap draait vlak voor het storyboard, zodat hij ook werkt voor draaiboeken
// die al bestonden en voor beide schrijfroutes (verzinnen en volgen).

import {
  isActie, sceneCast, kaleSetting, bruikbareRegel, VERTELLER_ID,
  type DialogueScene, type DialogueSpec,
} from "./dialogue-schema";
import { kaderLabel } from "./verhaal-kaders";
import { lichtLabel } from "./verhaal-licht";

export interface RegieRegel { index: number; beeld: string }
export interface RegieScene { index: number; gebied: string; plek: string; regels: RegieRegel[] }
export interface RegieGebied { naam: string; wereld: string }
export interface Beeldregie { gebieden: RegieGebied[]; scenes: RegieScene[] }

export const BEELDREGIE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["gebieden", "scenes"],
  properties: {
    gebieden: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["naam", "wereld"],
        properties: {
          naam: { type: "string" },
          wereld: { type: "string" },
        },
      },
    },
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
const MAX_WERELD_TEKENS = 700;

const gebiedSleutel = (naam?: string | null) => (naam ?? "").trim().toLowerCase();

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

/**
 * Moet de beeldregie nog (een deel van) dit draaiboek doen?
 *
 * Een scène zonder wereld telt mee: storyboards van vóór de wereldbeschrijving
 * krijgen die zo alsnog, zonder dat hun plekken of beelden veranderen. Een lege
 * wereld (de regie gaf er geen) telt niet, anders draait de regie eindeloos.
 */
export function regieNodig(spec: Pick<DialogueSpec, "scenes">): boolean {
  return spec.scenes.some(
    (s) =>
      !s.geregisseerd ||
      s.wereld == null ||
      s.lines.some((l) => bruikbareRegel(l) && !(l.beeld ?? "").trim()),
  );
}

/**
 * Scènes die van de regie exact dezelfde plek kregen, per groep (scène-indexen).
 *
 * In een nieuw draaiboek van zes bosscènes gaf de regie alle zes "a lush forest
 * with tall green trees and a carpet of ferns": het draaiboek noemde overal
 * dezelfde plek, en de opdracht om plekken in één gebied hetzelfde te laten
 * beginnen deed de rest. Een vastliggende plek telt niet mee, die verandert niet.
 */
export function dubbelePlekken(spec: Pick<DialogueSpec, "scenes">, regie: Beeldregie): number[][] {
  const groepen = new Map<string, number[]>();
  for (const r of regie.scenes) {
    const scene = spec.scenes[r.index];
    if (!scene || plekVast(scene) || !r.plek) continue;
    const sleutel = kaleSetting(r.plek);
    groepen.set(sleutel, [...(groepen.get(sleutel) ?? []), r.index]);
  }
  return [...groepen.values()].filter((g) => g.length > 1);
}

/** De herkansing als scènes dezelfde plek kregen. */
export function dubbelePlekVraag(groepen: number[][]): string {
  const lijst = groepen.map((g) => `SCÈNE ${g.join(", ")}`).join("; ");
  return (
    `Deze scènes kregen exact dezelfde plek: ${lijst}. Geef elke scène een eigen plekje binnen het gebied, met een ` +
    `eigen herkenbaar kenmerk. Alleen als het verhaal echt op precies dezelfde plek blijft (ze zitten nog aan dezelfde ` +
    `tafel), mag de plek gelijk blijven. Geef de volledige beeldregie opnieuw als JSON.`
  );
}

/** Het antwoord van het model, zonder aan te nemen dat het klopt. */
export function leesRegie(ruw: unknown): Beeldregie {
  const bron = ruw as { scenes?: unknown; gebieden?: unknown } | null;
  const gebieden = Array.isArray(bron?.gebieden) ? bron.gebieden : [];
  const scenes = Array.isArray(bron?.scenes) ? bron.scenes : [];
  return {
    gebieden: gebieden.flatMap((g): RegieGebied[] => {
      const x = g as Partial<RegieGebied> | null;
      return typeof x?.naam === "string" && x.naam.trim() && typeof x.wereld === "string" && x.wereld.trim()
        ? [{ naam: x.naam.trim(), wereld: x.wereld.trim().slice(0, MAX_WERELD_TEKENS) }]
        : [];
    }),
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
 * Wat er al staat blijft staan: een plek die vastligt (zie plekVast), een wereld
 * die al beschreven is en een beeld per regel dat al beschreven is. Zo kan de regie
 * opnieuw draaien voor één gewijzigde zin zonder de rest van het storyboard
 * ongeldig te maken.
 */
export function pasRegieToe(spec: DialogueSpec, regie: Beeldregie): DialogueSpec {
  const wereldVan = new Map(regie.gebieden.map((g) => [gebiedSleutel(g.naam), g.wereld]));
  const scenes = spec.scenes.map((scene, si) => {
    const r = regie.scenes.find((x) => x.index === si);
    if (!r) return scene;
    const gebied = r.gebied || scene.gebied || null;
    return {
      ...scene,
      setting: !plekVast(scene) && r.plek ? r.plek : scene.setting,
      gebied,
      // Leeg in plaats van null als de regie geen wereld gaf: dan is hij wél langs
      // geweest, en draait hij niet bij elke klik opnieuw.
      wereld: (scene.wereld ?? "").trim() || wereldVan.get(gebiedSleutel(gebied)) || "",
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

const SYSTEEM = `Je bent de beeldregisseur van een getekende animatievideo. Het verhaal en de zinnen liggen vast. Jij legt vast wat de camera in elk shot ZIET, zodat de tekenaar alles vooraf tekent en de animatie daarna niets meer hoeft te verzinnen. Elk beeld wordt los getekend, alleen vanuit jouw beschrijving: wat jij niet vastlegt, verzint de tekenaar per beeld anders.

PER GEBIED
- "gebieden": één item per gebiedsnaam die je bij de scènes gebruikt.
- "wereld": in het ENGELS, drie of vier zinnen: hoe dit gebied er in ELK beeld uitziet, zodat elk los getekend beeld dezelfde wereld toont. Beschrijf de soort bomen of gebouwen (vorm, stam, bladeren, materialen), de bodem, de planten en bloemen, het seizoen en de kleuren. Concreet en natuurgetrouw. Geen personages, geen licht, weer of tijdstip.
- Staat een gebied onder "GEBIEDEN DIE AL VASTLIGGEN", neem die wereld dan letterlijk over.
- Geen fantasie tenzij het verhaal erom vraagt: geen reuzenbloemen, geen gloeiende planten, geen paddenstoelen of dieren die het verhaal niet noemt.

PER SCÈNE
- "gebied": een korte Engelse naam in kleine letters voor de grotere plek waar de scène speelt, bijvoorbeeld "forest", "grandma's house", "city harbour". Scènes in hetzelfde gebied krijgen EXACT dezelfde gebiedsnaam.
- "plek": een ENGELSE beschrijving van precies het plekje binnen dat gebied waar deze scène speelt, in één of twee zinnen. Alleen de plek: geen personages, geen handelingen, geen licht, weer of tijdstip (dat ligt elders vast).
  - De "huidige plek" komt uit het draaiboek en is vaak voor alle scènes hetzelfde. Neem die dan NIET over: juist dat los jij op.
  - Trekken de personages door een groter gebied (een wandeling door het bos, een tocht door de stad), dan krijgt elke scène een EIGEN plekje met een eigen herkenbaar kenmerk: een smal bospad tussen hoge bomen, een zonnige open plek vol bloemen, de voet van een grote oude eik, een beekje met stenen. Twee scènes krijgen nooit dezelfde plek, tenzij het verhaal echt op precies dezelfde plek blijft.
  - Blijven de personages op precies dezelfde plek (ze zitten nog aan dezelfde tafel), neem de plek van de vorige scène dan LETTERLIJK over.
  - Begin elke plek met wat DIT plekje eigen maakt. Hoe het hele gebied eruitziet staat al in de wereld.
  - Waar de personages in deze scène naar kijken of over praten en wat vast bij de plek hoort (de bloemen die ze bekijken, de grote boom), staat in de plek. Dan wordt het meteen in het beeld van de plek getekend.
  - Verzin geen ander gebied dan de huidige plek aangeeft. Het bos blijft het bos, oma's huis blijft oma's huis.
  - Staat er "(VAST)" achter een scène, dan ligt de plek al vast: neem de huidige plek letterlijk over.

PER REGEL
- "beeld": in het ENGELS, één of twee zinnen: wat je in dit shot ziet, passend bij het camerakader.
  - Noemt, toont, bekijkt of wijst iemand in de zin iets aan (een bloem, een kaart, een dier, een voorwerp), dan is dat ding in dit shot duidelijk te zien. Voorbeeld: Tyrell zegt "Deze bloem heet een bosanemoon" → "Tyrell crouches next to a small white wood anemone growing among green leaves on the forest floor, pointing at it."
  - Wees concreet: noem het echte ding ("a white wood anemone", "an old oak with a hollow in its trunk"), nooit "a special plant" of "something interesting".
  - Beschrijf houding, wat ze vasthouden en waar ze naar kijken. Wie er praat hoef je niet te zeggen, dat regelen wij.
  - Gebruik alleen de personages die bij de scène "in beeld" staan. Geen andere mensen en geen dieren die niet in het verhaal zitten.
  - Close-up of heel dichtbij: het gezicht, en eventueel het ding in de hand of vlak ernaast. Detail: alleen het ding, of een hand ermee, zonder gezichten.
  - Wat pas later in de scène ontdekt wordt, is in eerdere shots nog niet te zien. Wat er eenmaal is, blijft er: een geplukte bloem blijft in de hand.
  - Geen tekst, letters, borden of namen in beeld. Geen licht, weer of tijdstip.
  - Bij een actiebeeld staat er al een beschrijving. Houd je daaraan en vul alleen aan wat nodig is om het volledig te kunnen tekenen.
  - Een vast voorwerp uit de lijst noem je bij zijn naam, zodat het er in elk beeld hetzelfde uitziet.

Geef een antwoord voor ELK gebied, ELKE scène en ELKE regel die hieronder staat, met hun index.`;

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
  // Een wereld die al beschreven is, hoort voor nieuwe scènes in dat gebied gelijk
  // te blijven; anders kreeg een toegevoegde scène een ander bos dan de rest.
  const vasteWerelden = new Map<string, string>();
  for (const s of spec.scenes) {
    const w = (s.wereld ?? "").trim();
    if (s.gebied && w && !vasteWerelden.has(gebiedSleutel(s.gebied))) vasteWerelden.set(gebiedSleutel(s.gebied), w);
  }
  const werelden = [...vasteWerelden].map(([g, w]) => `- ${g}: ${w}`).join("\n");

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
        s.gebied ? `  gebied: ${s.gebied}` : null,
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
    (werelden ? `GEBIEDEN DIE AL VASTLIGGEN:\n${werelden}\n\n` : "") +
    (spec.illustrationBrief ? `BRIEFING VAN DE KLANT: ${spec.illustrationBrief}\n\n` : "") +
    `DRAAIBOEK:\n${scenes}\n\n` +
    `Geef nu de beeldregie als JSON.`;

  return { systeem: SYSTEEM, vraag };
}
