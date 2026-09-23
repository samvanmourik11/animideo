// Een aangeleverd script in scenes knippen, zonder model.
//
// Wie zijn eigen script meebrengt wil precies díe woorden terughoren — net als
// in de dialoogtool, waar de letterlijke zinnen deterministisch worden
// teruggezet (zie lib/infographics/verhaallijn.ts). Een LLM die "even knipt"
// herschrijft in de praktijk altijd iets: een komma, een samentrekking, een
// getal. Daarom doet dit bestand het met vaste regels, en bewaakt
// `isLetterlijk()` achteraf dat er geen woord is verdwenen of veranderd.
//
// De regel: een alinea is een scene. Is die te lang voor één beeld, dan wordt
// hij op een zinseinde gesplitst; is hij te kort, dan gaat hij bij de buur.

/** Spreektempo en scene-lengte gelijk aan generate-story (daar één bron van waarheid). */
const WOORDEN_PER_SEC = 2.6;
const SECONDEN_PER_SCENE = 6;

/** Zoveel woorden past er comfortabel onder één beeld (~6 seconden spreken). */
export const WOORDEN_PER_SCENE = Math.round(WOORDEN_PER_SEC * SECONDEN_PER_SCENE); // 16

/**
 * Grenzen. `MAX_SCENES` volgt de pijplijn: generate-story maakt er nooit meer
 * dan 20, en elke scene kost een credit voor zijn beeld.
 */
export const MAX_SCENES = 20;
const MIN_WOORDEN = 5;

export interface KnipOpties {
  /** Richtlengte per scene in woorden. Default: ~6 seconden spreken. */
  woordenPerScene?: number;
  /** Harde bovengrens op het aantal scenes. */
  maxScenes?: number;
}

const woorden = (t: string) => t.split(/\s+/).filter(Boolean);
const telWoorden = (t: string) => woorden(t).length;

/**
 * Afkortingen waar een punt géén zinseinde is. Zonder deze lijst knipt "bijv."
 * of "dhr." middenin een zin, en dan staat er een scene van twee woorden.
 */
const AFKORTINGEN = new Set([
  "bijv", "bv", "o.a", "oa", "enz", "etc", "dhr", "mevr", "mw", "dr", "prof", "ing", "ir",
  "nr", "blz", "pag", "t.o.v", "d.w.z", "a.u.b", "z.o.z", "jl", "ca", "incl", "excl", "max", "min",
]);

/**
 * Eindigt dit stuk tekst op een echt zinseinde? Een punt telt niet als hij bij
 * een afkorting hoort, bij een getal ("In 1602." hoort wel, "1.500" niet) of bij
 * een losse initiaal ("J. Cruijff").
 */
function isZinseinde(stuk: string): boolean {
  const kaal = stuk.replace(/["'”’)\]]+$/, "");
  if (!/[.!?…]$/.test(kaal)) return false;
  if (/[!?…]$/.test(kaal)) return true;
  const laatste = kaal.slice(0, -1).split(/\s+/).pop() ?? "";
  if (AFKORTINGEN.has(laatste.toLowerCase())) return false;
  // Eén hoofdletter = initiaal; cijfer + punt = opsomming of duizendtal.
  if (/^[A-Z]$/.test(laatste)) return false;
  if (/^\d+$/.test(laatste) && laatste.length <= 2) return false;
  return true;
}

/** Een alinea in zinnen, met de leestekens eraan vast. */
export function splitsInZinnen(alinea: string): string[] {
  const stukken = alinea.split(/\s+/).filter(Boolean);
  const zinnen: string[] = [];
  let huidig: string[] = [];
  for (const stuk of stukken) {
    huidig.push(stuk);
    if (isZinseinde(stuk)) {
      zinnen.push(huidig.join(" "));
      huidig = [];
    }
  }
  if (huidig.length) zinnen.push(huidig.join(" "));
  return zinnen;
}

/** Zinnen samenvoegen tot groepjes van ongeveer `richtlengte` woorden. */
function groepeerZinnen(zinnen: string[], richtlengte: number): string[] {
  const groepen: string[] = [];
  let huidig: string[] = [];
  let aantal = 0;
  for (const zin of zinnen) {
    const n = telWoorden(zin);
    // Vol genoeg én deze zin maakt het te lang? Dan begint hier een nieuwe scene.
    if (aantal >= MIN_WOORDEN && aantal + n > richtlengte * 1.4) {
      groepen.push(huidig.join(" "));
      huidig = [];
      aantal = 0;
    }
    huidig.push(zin);
    aantal += n;
  }
  if (huidig.length) groepen.push(huidig.join(" "));
  return groepen;
}

/** Te korte stukjes bij de buur zetten, zodat geen scene op drie woorden staat. */
function voegKorteSamen(stukken: string[]): string[] {
  const uit: string[] = [];
  for (const stuk of stukken) {
    if (uit.length && telWoorden(stuk) < MIN_WOORDEN) {
      uit[uit.length - 1] = `${uit[uit.length - 1]} ${stuk}`;
      continue;
    }
    uit.push(stuk);
  }
  // Staat het eerste stukje er nog steeds te kaal bij, dan hoort het bij de tweede.
  if (uit.length > 1 && telWoorden(uit[0]) < MIN_WOORDEN) {
    uit[1] = `${uit[0]} ${uit[1]}`;
    uit.shift();
  }
  return uit;
}

/**
 * Terugbrengen tot `maxScenes` door steeds het kortste buurpaar samen te voegen.
 * Een script van 60 alinea's wordt zo 20 scenes in plaats van dat het afbreekt.
 */
function beperkTot(stukken: string[], maxScenes: number): string[] {
  const uit = [...stukken];
  while (uit.length > maxScenes) {
    let besteIndex = 0;
    let besteSom = Infinity;
    for (let i = 0; i < uit.length - 1; i++) {
      const som = telWoorden(uit[i]) + telWoorden(uit[i + 1]);
      if (som < besteSom) {
        besteSom = som;
        besteIndex = i;
      }
    }
    uit.splice(besteIndex, 2, `${uit[besteIndex]} ${uit[besteIndex + 1]}`);
  }
  return uit;
}

/**
 * Knipt een aangeleverd script in scene-teksten. De uitvoer bevat exact dezelfde
 * woorden in dezelfde volgorde als de invoer; alleen witruimte wordt genormaliseerd.
 */
export function knipScriptInScenes(script: string, opties: KnipOpties = {}): string[] {
  const richtlengte = Math.max(MIN_WOORDEN, opties.woordenPerScene ?? WOORDEN_PER_SCENE);
  const maxScenes = Math.max(1, opties.maxScenes ?? MAX_SCENES);

  const schoon = script.replace(/\r\n?/g, "\n").trim();
  if (!schoon) return [];

  const alineas = schoon
    .split(/\n\s*\n+/)
    .map((a) => a.split(/\s+/).filter(Boolean).join(" "))
    .filter(Boolean);

  const stukken: string[] = [];
  for (const alinea of alineas) {
    if (telWoorden(alinea) <= richtlengte * 1.4) {
      stukken.push(alinea);
      continue;
    }
    stukken.push(...groepeerZinnen(splitsInZinnen(alinea), richtlengte));
  }

  return beperkTot(voegKorteSamen(stukken), maxScenes);
}

/**
 * Staan er precies dezelfde woorden in de scenes als in het script? Dit is de
 * belofte aan de gebruiker ("jouw tekst blijft letterlijk"), dus de route
 * controleert het voor hij iets genereert.
 */
export function isLetterlijk(script: string, scenes: string[]): boolean {
  return woorden(script).join(" ") === woorden(scenes.join(" ")).join(" ");
}

/** Geschatte speelduur van een script in seconden, op spreektempo. */
export function geschatteDuur(script: string): number {
  return Math.round(telWoorden(script) / WOORDEN_PER_SEC);
}
