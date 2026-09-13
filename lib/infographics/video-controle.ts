import {
  VERTELLER_ID,
  heeftStem,
  regelKlaar,
  sceneCast,
  type DialogueLine,
  type DialogueSpec,
} from "./dialogue-schema";
import { CREDIT_COSTS } from "../credit-costs";
import { kaalTekst, vertellerBeeld, vertellerZinnenBijVerteller } from "./verhaallijn";

// DE VIDEOCONTROLE — een video naast zijn eigen verhaal leggen en de fouten eruit halen.
//
// Aanleiding: "Tyrell, Lilly en de Wonderwagen" (13-09-2026). De video was goed, maar
// wie hem naast het draaiboek legde zag in acht scènes iemand ontbreken, oma die van
// kant wisselde, een Wonderwagen die vier keer anders was, tekst op de muur van een
// fort en een vertellerzin in de mond van Tyrell. Dat vond een mens door elk shot te
// bekijken. Deze module doet het werk dat daar geen AI voor nodig heeft, en zet de
// uitslag om in herstelacties die met één klik uitgevoerd kunnen worden.
//
// Het beeld zelf bekijken gebeurt in /api/infographics/dialogue-controle; hier staat
// alles wat puur is en dus te testen.

export type FoutSoort =
  | "wie-in-beeld"
  | "uiterlijk"
  | "tekst-in-beeld"
  | "plek"
  | "voorwerp"
  | "lichaam"
  | "wie-praat"
  | "spreker"
  | "verteller"
  | "zin"
  | "verhaal";

export const FOUT_LABEL: Record<FoutSoort, string> = {
  "wie-in-beeld": "Wie er in beeld is",
  uiterlijk: "Uiterlijk",
  "tekst-in-beeld": "Tekst in beeld",
  plek: "Plek",
  voorwerp: "Voorwerp",
  lichaam: "Beeldfout",
  "wie-praat": "Wie er praat",
  spreker: "Verkeerde spreker",
  verteller: "Vertellerzin",
  zin: "Zin ontbreekt",
  verhaal: "Verhaal",
};

/** Wat er gebeurt als je op "Herstel" drukt. */
export type Herstel =
  /** Het bronbeeld en de beweging van één shot opnieuw, met een correctie. De stem blijft. */
  | { type: "shot"; instructie: string }
  /** Het scènebeeld opnieuw met een aanwijzing, en daarmee alle shots van die scène. */
  | { type: "scene"; aanwijzing: string }
  /** Iemand anders laat deze zin zeggen (ook: de verteller). Stem, beeld en beweging opnieuw. */
  | { type: "spreker"; characterId: string }
  /** Een regel invoegen ná regel `na` (−1 = vooraan). */
  | { type: "regel-erbij"; na: number; regel: DialogueLine };

export interface ControleFout {
  id: string;
  soort: FoutSoort;
  /** Index van de scène. */
  scene: number;
  /** Index van de regel, of null als het de hele scène betreft. */
  regel: number | null;
  /** Voor de maker, in gewone taal. */
  wat: string;
  herstel: Herstel;
  hersteld?: boolean;
  genegeerd?: boolean;
}

export interface VideoControleUitslag {
  /** Vingerafdruk van de video op het moment van controleren. Zie versieVan. */
  versie: string;
  gecontroleerdOp: string;
  shotsBekeken: number;
  fouten: ControleFout[];
}

const kort = (t: string, max = 90) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

/**
 * Een vingerafdruk van wat er in de video zit: elk beeld, elke clip, elke zin en wie
 * hem zegt.
 *
 * Controleren is gratis, maar één keer per versie. Zonder dit kon iemand eindeloos op
 * de knop drukken, en elke controle bekijkt tientallen beelden. Verandert er iets aan
 * de video, dan verandert de vingerafdruk en mag er opnieuw gecontroleerd worden.
 */
export function versieVan(spec: DialogueSpec): string {
  const tekst = spec.scenes
    .flatMap((s) => [
      s.twoShotUrl ?? "",
      ...s.lines.map((l) => [l.characterId, l.text, l.actie ?? "", l.shotImageUrl ?? "", l.videoUrl ?? ""].join("|")),
    ])
    .join("\n");
  let h = 5381;
  for (let i = 0; i < tekst.length; i++) h = ((h * 33) ^ tekst.charCodeAt(i)) >>> 0;
  return `${spec.scenes.length}-${h.toString(36)}`;
}

/**
 * De fouten die je in het draaiboek kunt vinden zonder naar een beeld te kijken.
 *
 * - een letterlijke zin uit het verhaal van de gebruiker die iemand anders zegt, of die
 *   nergens staat
 * - een zin in de derde persoon in de mond van een personage ("De kinderen keken...")
 * - een shot waarbij al tijdens het maken twijfel was of de juiste mond beweegt
 */
export function controleerDraaiboek(spec: DialogueSpec): ControleFout[] {
  const uit: ControleFout[] = [];
  const naam = (id: string) =>
    id === VERTELLER_ID ? "de verteller" : spec.cast.find((c) => c.id === id)?.name ?? "iemand";

  (spec.verhaallijn ?? []).forEach((d, i) => {
    const vanDeel = spec.scenes.map((s, si) => ({ s, si })).filter(({ s }) => s.deel === i + 1);
    for (const c of d.citaten ?? []) {
      const spreker = spec.cast.find((k) => k.characterId === c.wie);
      const doel = kaalTekst(c.tekst);
      if (!spreker || !doel) continue;
      const past = (t: string) => (doel.length >= 8 ? kaalTekst(t).includes(doel) : kaalTekst(t) === doel);

      let gevonden: { si: number; li: number; l: DialogueLine } | null = null;
      let doorVerteller = false;
      for (let si = 0; si < spec.scenes.length && !gevonden; si++) {
        const lines = spec.scenes[si].lines;
        for (let li = 0; li < lines.length; li++) {
          if (!past(lines[li].text)) continue;
          // "'Wat voor geheim?' vroeg Tyrell" mag de verteller best vertellen.
          if (lines[li].characterId === VERTELLER_ID) { doorVerteller = true; continue; }
          gevonden = { si, li, l: lines[li] };
          break;
        }
      }

      if (gevonden) {
        if (gevonden.l.characterId !== spreker.id) {
          uit.push({
            id: "", soort: "spreker", scene: gevonden.si, regel: gevonden.li,
            wat: `"${kort(c.tekst, 60)}" hoort ${spreker.name} te zeggen, maar ${naam(gevonden.l.characterId)} zegt het.`,
            herstel: { type: "spreker", characterId: spreker.id },
          });
        }
      } else if (!doorVerteller && vanDeel.length) {
        const laatste = vanDeel[vanDeel.length - 1];
        uit.push({
          id: "", soort: "zin", scene: laatste.si, regel: null,
          wat: `Deze zin uit je verhaal ontbreekt: ${spreker.name}: "${kort(c.tekst, 60)}"`,
          herstel: {
            type: "regel-erbij",
            na: laatste.s.lines.length - 1,
            regel: { kind: "dialoog", characterId: spreker.id, kader: null, text: c.tekst, emotion: "neutraal" },
          },
        });
      }
    }
  });

  const omgezet = vertellerZinnenBijVerteller(spec.scenes, spec.cast);
  spec.scenes.forEach((s, si) =>
    s.lines.forEach((l, li) => {
      if (l.characterId !== VERTELLER_ID && omgezet[si]?.lines[li]?.characterId === VERTELLER_ID) {
        uit.push({
          id: "", soort: "verteller", scene: si, regel: li,
          wat: `${naam(l.characterId)} zegt een zin die van de verteller is: "${kort(l.text, 60)}"`,
          herstel: { type: "spreker", characterId: VERTELLER_ID },
        });
      }
      if (l.sprekerZeker === false && l.videoUrl && l.characterId !== VERTELLER_ID) {
        const wie = naam(l.characterId);
        uit.push({
          id: "", soort: "wie-praat", scene: si, regel: li,
          wat: `Niet zeker of ${wie} echt praat in dit shot — misschien beweegt de verkeerde mond.`,
          herstel: {
            type: "shot",
            instructie: `${wie} is the one speaking in this shot: only ${wie}'s mouth is open, everyone else keeps their mouth closed.`,
          },
        });
      }
    }),
  );

  return uit;
}

const SHOT_SOORTEN: FoutSoort[] = ["wie-in-beeld", "uiterlijk", "tekst-in-beeld", "plek", "voorwerp", "lichaam"];

/** Het antwoord van de beeldcontrole voor één shot, omgezet in fouten. Onzin valt weg. */
export function leesShotOordeel(ruw: unknown, scene: number, regel: number): ControleFout[] {
  const lijst = ruw && typeof ruw === "object" && Array.isArray((ruw as { fouten?: unknown }).fouten)
    ? (ruw as { fouten: unknown[] }).fouten
    : [];
  return lijst
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      soort: String(f.soort ?? "") as FoutSoort,
      wat: String(f.wat ?? "").trim(),
      instructie: String(f.instructie ?? "").trim(),
    }))
    .filter((f) => SHOT_SOORTEN.includes(f.soort) && f.wat && f.instructie)
    // Binnen of buiten hetzelfde gebouw is geen fout. Dat staat in de opdracht, en
    // toch meldde de controle "binnen in de basiliek, terwijl het buiten hoort" —
    // terwijl de kinderen de basiliek juist bezochten.
    .filter((f) => !(f.soort === "plek" && /\bbinnen\b/i.test(f.wat) && /\bbuiten\b/i.test(f.wat)))
    .slice(0, 4)
    .map((f) => ({ id: "", soort: f.soort, scene, regel, wat: f.wat, herstel: { type: "shot", instructie: f.instructie } }));
}

/**
 * Het antwoord van de verhaalcontrole, omgezet in fouten: een moment uit de verhaallijn
 * dat nergens te zien of te horen is, hersteld met een actiebeeld dat het laat zien.
 */
export function leesVerhaalOordeel(ruw: unknown, spec: DialogueSpec): ControleFout[] {
  const lijst = ruw && typeof ruw === "object" && Array.isArray((ruw as { fouten?: unknown }).fouten)
    ? (ruw as { fouten: unknown[] }).fouten
    : [];
  const uit: ControleFout[] = [];
  for (const f of lijst.filter((x): x is Record<string, unknown> => !!x && typeof x === "object").slice(0, 5)) {
    const deel = Number(f.deel);
    const wat = String(f.wat ?? "").trim();
    const actie = String(f.actie ?? "").trim();
    const si = spec.scenes.findIndex((s) => s.deel === deel);
    if (si < 0 || !wat || !actie) continue;
    const scene = spec.scenes[si];
    const inBeeld = sceneCast(scene, spec.cast, spec.verhaallijn)[0]?.id ?? spec.cast[0]?.id ?? "";
    // Na de vertellerzin die het moment opent, anders vooraan.
    const na = scene.lines[0]?.characterId === VERTELLER_ID ? 0 : -1;
    uit.push({
      id: "", soort: "verhaal", scene: si, regel: null, wat,
      herstel: {
        type: "regel-erbij", na,
        regel: { kind: "actie", characterId: inBeeld, kader: "totaal", text: "", emotion: "", actie, seconden: 4 },
      },
    });
  }
  return uit;
}

/**
 * Ontbreekt iemand in meerdere shots van dezelfde scène, dan zit de fout in het
 * scènebeeld: elk shot is daar een bewerking van. Shot voor shot herstellen zou dan
 * dezelfde fout steeds opnieuw laten tekenen. Eén herstel van de scène is goedkoper
 * en het werkt.
 *
 * Close-ups en detailopnames tellen daarbij niet mee. Wie er in een close-up staat
 * zegt niets over het scènebeeld, en in de eerste proef werden twee close-ups
 * gebundeld tot één scèneherstel met tegenstrijdige aanwijzingen ("alleen Tyrell"
 * en "alleen Lilly").
 */
export function bundelPerScene(fouten: ControleFout[], spec?: DialogueSpec): ControleFout[] {
  const isDichtbij = (f: ControleFout) => {
    const kader = f.regel !== null ? spec?.scenes[f.scene]?.lines[f.regel]?.kader : null;
    return kader === "close" || kader === "extreme-close" || kader === "detail";
  };
  const perScene = new Map<number, ControleFout[]>();
  for (const f of fouten) {
    if (f.soort === "wie-in-beeld" && f.regel !== null && !isDichtbij(f)) {
      perScene.set(f.scene, [...(perScene.get(f.scene) ?? []), f]);
    }
  }
  const gebundeld = (f: ControleFout) =>
    f.soort === "wie-in-beeld" && f.regel !== null && !isDichtbij(f) && (perScene.get(f.scene)?.length ?? 0) >= 2;

  const uit = fouten.filter((f) => !gebundeld(f));
  for (const [scene, groep] of perScene) {
    if (groep.length < 2) continue;
    const instructies = [...new Set(groep.map((f) => (f.herstel.type === "shot" ? f.herstel.instructie : "")))].filter(Boolean);
    uit.push({
      id: "", soort: "wie-in-beeld", scene, regel: null,
      wat: `In ${groep.length} shots van deze scène klopt niet wie er in beeld is. ${groep[0].wat}`,
      herstel: { type: "scene", aanwijzing: instructies.slice(0, 3).join(" ") },
    });
  }
  return uit;
}

/** Vaste volgorde (op scène en regel) en een id per fout. */
export function nummerFouten(fouten: ControleFout[]): ControleFout[] {
  return [...fouten]
    .sort((a, b) => a.scene - b.scene || (a.regel ?? -1) - (b.regel ?? -1))
    .map((f, i) => ({ ...f, id: `${f.soort}-${f.scene}-${f.regel ?? "s"}-${i}` }));
}

const LEEG_BEELD = { shotImageUrl: null, videoUrl: null, mouthStart: null, sprekerZeker: null, beeldWaarschuwingen: null };
const LEEG_ALLES = { ...LEEG_BEELD, audioUrl: null, audioDuration: null };

/**
 * Past herstelacties toe op het draaiboek. Maakt zelf niets: het zet alleen klaar wat
 * opnieuw moet, zodat "Verder maken" precies dat maakt en niets anders.
 *
 * Eerst alles wat bestaande regels verandert, daarna het invoegen van nieuwe regels,
 * van achter naar voren. De regelnummers van fouten die blijven openstaan schuiven
 * mee, zodat hun herstelknop daarna nog steeds de goede regel raakt.
 */
export function pasHerstelToe(spec: DialogueSpec, fouten: ControleFout[]): DialogueSpec {
  const nieuw: DialogueSpec = structuredClone(spec);

  for (const f of fouten) {
    const scene = nieuw.scenes[f.scene];
    if (!scene) continue;
    const h = f.herstel;
    if (h.type === "scene") {
      scene.beeldAanwijzing = [scene.beeldAanwijzing, h.aanwijzing].filter((x) => (x ?? "").trim()).join(" ");
      scene.twoShotUrl = null;
      scene.lines = scene.lines.map((l) => ({ ...l, ...LEEG_BEELD }));
    } else if (h.type === "shot" && f.regel !== null && scene.lines[f.regel]) {
      scene.lines[f.regel] = { ...scene.lines[f.regel], ...LEEG_BEELD, beeldAanwijzing: h.instructie };
    } else if (h.type === "spreker" && f.regel !== null && scene.lines[f.regel]) {
      const l = scene.lines[f.regel];
      const regel: DialogueLine = { ...l, ...LEEG_ALLES, characterId: h.characterId };
      if (h.characterId === VERTELLER_ID) {
        regel.kind = "actie";
        regel.kader = "totaal";
        regel.actie = (l.actie ?? "").trim() || vertellerBeeld(l.text, scene.setting);
        regel.seconden = l.seconden ?? 4;
      }
      scene.lines[f.regel] = regel;
    }
  }

  const toegepast = new Set(fouten.map((f) => f.id));
  const overig = nieuw.controle?.fouten.filter((f) => !toegepast.has(f.id)) ?? [];

  fouten
    .filter((f) => f.herstel.type === "regel-erbij")
    .sort((a, b) => b.scene - a.scene || (b.herstel as { na: number }).na - (a.herstel as { na: number }).na)
    .forEach((f) => {
      const h = f.herstel;
      const scene = nieuw.scenes[f.scene];
      if (h.type !== "regel-erbij" || !scene) return;
      const plek = Math.max(0, Math.min(h.na + 1, scene.lines.length));
      scene.lines.splice(plek, 0, { ...h.regel });
      for (const o of overig) {
        if (o.scene !== f.scene) continue;
        if (o.regel !== null && o.regel >= plek) o.regel += 1;
        if (o.herstel.type === "regel-erbij" && o.herstel.na >= plek) o.herstel.na += 1;
      }
    });

  if (nieuw.controle) {
    nieuw.controle = {
      ...nieuw.controle,
      fouten: nieuw.controle.fouten.map((f) => (toegepast.has(f.id) ? { ...f, hersteld: true } : f)),
    };
  }
  return nieuw;
}

/** Credits voor alles wat in dit draaiboek nog gemaakt moet worden. */
export function openstaandeKosten(spec: DialogueSpec): number {
  const beelden = spec.scenes.filter((s) => !s.twoShotUrl).length * CREDIT_COSTS.IMAGE_GENERATION;
  const regels = spec.scenes
    .flatMap((s) => s.lines)
    .filter((l) => !regelKlaar(l))
    .reduce(
      (a, l) => a + CREDIT_COSTS.IMAGE_GENERATION + CREDIT_COSTS.VIDEO_GENERATION + (heeftStem(l) && !l.audioUrl ? CREDIT_COSTS.VOICE : 0),
      0,
    );
  return beelden + regels;
}

/**
 * Wat herstellen kost: het verschil in wat er nog gemaakt moet worden, vóór en na.
 * Zo telt een shot dat door twee fouten opnieuw moet maar één keer mee.
 */
export function herstelKosten(spec: DialogueSpec, fouten: ControleFout[]): number {
  return Math.max(0, openstaandeKosten(pasHerstelToe(spec, fouten)) - openstaandeKosten(spec));
}

/** Wat de herstelknop doet, in één zin. */
export function herstelUitleg(spec: DialogueSpec, f: ControleFout): string {
  const h = f.herstel;
  switch (h.type) {
    case "shot":
      return "Maakt dit shot opnieuw met een correctie. De stem blijft.";
    case "scene":
      return `Maakt het scènebeeld opnieuw, en daarmee de ${spec.scenes[f.scene]?.lines.length ?? 0} shots van deze scène.`;
    case "spreker":
      return h.characterId === VERTELLER_ID
        ? "Laat de verteller deze zin zeggen."
        : `Laat ${spec.cast.find((c) => c.id === h.characterId)?.name ?? "de juiste persoon"} deze zin zeggen.`;
    case "regel-erbij":
      return f.soort === "verhaal" ? "Voegt een shot toe dat dit laat zien." : "Zet de zin erin, bij de juiste persoon.";
  }
}
