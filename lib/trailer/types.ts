// TRAILERSTUDIO — een filmtrailer van 1-1,5 minuut, gemonteerd volgens de regels van een
// genre (lib/trailer/regels/<genre>.md, gemeten uit echte trailers). Client-veilig.
//
// Hoe het loopt: titel + verhaal + personages → AI schrijft de trailer uit volgens het
// regelboek (tijdlijn van shots, zwart, tekstkaarten, stemmen) → portret per personage
// (zodat ze in elk shot hetzelfde blijven) → filmbeelden → clips van 5 s, waaruit de
// montage meerdere korte shots knipt → stemmen → montage. Zie lib/trailer/regie.ts.

import { CREDIT_COSTS } from "@/lib/credit-costs";
import { videoModel } from "@/lib/video-modellen";

export const GENRES = [{ id: "fantasy", naam: "Fantasy", icoon: "🐉", uitleg: "Magie, oude rijken, draken en een held tegen het duister." }] as const;
export type GenreId = (typeof GENRES)[number]["id"];

export const TRAILER_LENGTES = [
  { sec: 60, naam: "1 minuut", clips: 10 },
  { sec: 90, naam: "1,5 minuut", clips: 14 },
] as const;
export type TrailerLengte = (typeof TRAILER_LENGTES)[number]["sec"];

/** Kling 2.5: de beste beweging van mensen, en het houdt gezichten en kostuums het best vast. */
export const TRAILER_VIDEOMODEL = "kling-2-5";
/** Een clip is 5 s; de montage knipt er meerdere shots uit. */
export const CLIP_SEC = 5;

export interface Personage {
  naam: string;
  /** Wie het is, in gewoon Nederlands (voor de klant). */
  rol: string;
  /** Engels, voor het portret en elk shot: gezicht, haar, leeftijd, kostuum. */
  uiterlijk: string;
  geslacht: "man" | "vrouw";
}

/**
 * Een wezen of voorwerp dat vaker terugkomt (de draak, het zwaard). Krijgt net als een
 * personage een eigen voorbeeldbeeld: in de proeftrailer had de draak zonder voorbeeld in
 * elk shot een ander uiterlijk (oranje oog, zwarte draak, blauwe kop in een zonnig bos).
 */
export interface Wezen {
  naam: string;
  /** Engels: vorm, kleur, schubben/materiaal, grootte. */
  uiterlijk: string;
}

export interface Clip {
  /** Engels: wat we zien (setting, compositie, licht). */
  beeld: string;
  /** Engels: wat er in 5 seconden beweegt. */
  beweging: string;
  /** Namen van de personages én wezens die in beeld zijn (moeten bestaan in het plan). */
  personages: string[];
  /** Nederlands, voor de klant. */
  uitleg: string;
}

export type Deel = "opening" | "wereld" | "escalatie" | "adem" | "klap" | "titel";

export type Element =
  | {
      soort: "shot";
      deel: Deel;
      clip: number;
      van: number;
      duur: number;
      regel?: Regel;
      /**
       * Hoe vaak deze clip al eerder in beeld was. Een herhaald shot krijgt in de montage een
       * andere uitsnede (ingezoomd, ander deel van het beeld), zodat het niet als hetzelfde
       * shot herkend wordt; in de proef zag je zes keer letterlijk een eerder shot terug.
       */
      herhaling?: number;
    }
  | { soort: "zwart"; deel: Deel; duur: number; stil?: boolean; regel?: Regel }
  | { soort: "tekst"; deel: Deel; tekst: string; duur: number; regel?: Regel }
  | { soort: "titel"; deel: Deel; duur: number; regel?: Regel };

/** Een gesproken zin die begint bij het element waar hij aan hangt, en daarna gewoon doorloopt. */
export interface Regel {
  /** "verteller" of de naam van een personage. */
  wie: string;
  tekst: string;
}

export interface TrailerPlan {
  titel: string;
  personages: Personage[];
  /** Ontbreekt bij plannen van vóór 22-10-2026. */
  wezens?: Wezen[];
  clips: Clip[];
  tijdlijn: Element[];
}

export function tijdlijnDuur(t: Element[]): number {
  return t.reduce((s, e) => s + e.duur, 0);
}

export function aantalRegels(p: TrailerPlan): number {
  return p.tijdlijn.filter((e) => e.regel?.tekst).length;
}

/** Prijs: voorbeeldbeeld per personage en wezen, per clip een filmbeeld + beweging, per zin de stem. */
export function trailerCredits(p: Pick<TrailerPlan, "personages" | "clips" | "tijdlijn" | "wezens">): number {
  const perClip = CREDIT_COSTS.IMAGE_GENERATION_PRO + videoModel(TRAILER_VIDEOMODEL).credits;
  return (
    (p.personages.length + (p.wezens?.length ?? 0)) * CREDIT_COSTS.IMAGE_GENERATION_PRO +
    p.clips.length * perClip +
    p.tijdlijn.filter((e) => e.regel?.tekst).length * CREDIT_COSTS.VOICE
  );
}

export function geschatteTrailerCredits(sec: TrailerLengte, personages: number): number {
  const clips = TRAILER_LENGTES.find((l) => l.sec === sec)!.clips;
  return trailerCredits({
    personages: Array.from({ length: personages }) as Personage[],
    clips: Array.from({ length: clips }) as Clip[],
    tijdlijn: Array.from({ length: Math.round(sec / 6) }, () => ({ soort: "zwart", deel: "wereld", duur: 1, regel: { wie: "", tekst: "x" } }) as Element),
  });
}

export type TrailerStap = "personages" | "beelden" | "clips" | "monteren";

export const TRAILER_STAP_LABEL: Record<TrailerStap, string> = {
  personages: "Stap 1 van 4: personages tekenen…",
  beelden: "Stap 2 van 4: filmbeelden maken…",
  clips: "Stap 3 van 4: beelden laten bewegen en stemmen…",
  monteren: "Stap 4 van 4: monteren…",
};
