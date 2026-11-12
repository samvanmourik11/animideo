// LANGE VIDEO'S: een video van meer dan een minuut wordt in hoofdstukken gemaakt. Elk
// hoofdstuk is een eigen korte video (eigen code, eigen pagina), getekend door een eigen
// gesprek met Claude; daarna worden ze op het beeld af aan elkaar gezet onder één stem.
//
// Waarom zo: de code van tien minuten animatie past niet in één antwoord, hoofdstukken
// kunnen tegelijk worden getekend (tien minuten video kost dan niet tien keer zo veel
// wachttijd), en als er één mislukt hoeft alleen dat ene opnieuw.
//
// Alleen op de server. Een korte video is één hoofdstuk en loopt door dezelfde code.

import type { WhisperWord } from "@/lib/openai";
import type { PaginaInvoer } from "./pagina";
import { FPS, proef } from "./render";
import { hoofdstukken, type MotionPlan } from "./types";

/** Alles voor de pagina behalve de code, het script en het hoofdstuk: voor elke pagina gelijk. */
export type PaginaBasis = Omit<PaginaInvoer, "code" | "script" | "deel" | "woorden">;

export interface Deel {
  /** De scenes van dit hoofdstuk: plan.scenes[van] tot plan.scenes[tot - 1]. */
  van: number;
  tot: number;
  /** Waar dit hoofdstuk in de hele video begint (s). */
  start: number;
  /** Hoeveel beelden het duurt; bij het laatste hoofdstuk bepaalt de pagina dat zelf. */
  beelden?: number;
}

/** Het script zoals de kern het leest: per scene wat de stem zegt, 'eind' als laatste. */
export function scriptVan(plan: MotionPlan): [string, string][] {
  return [...plan.scenes.map((s, k): [string, string] => [`s${k + 1}`, s.tekst]), ["eind", plan.eind.tekst]];
}

// ElevenLabs neemt per opname een beperkte lap tekst aan, en een hele lange opname gaat
// naar het eind toe slordiger klinken. Dus per blok van een paar hoofdstukken, geknipt op
// een hoofdstukwissel: daar valt toch al een adempauze.
const MAX_TEKENS_PER_OPNAME = 2600;

/** De tekst van de stem, verdeeld over zo weinig mogelijk opnames. Een korte video is er één. */
export function stemBlokken(plan: MotionPlan): string[] {
  const hs = hoofdstukken(plan);
  const teksten = hs.map((h, i) =>
    [...plan.scenes.slice(h.van, h.tot).map((s) => s.tekst), ...(i === hs.length - 1 ? [plan.eind.tekst] : [])].join(" "),
  );
  const uit: string[] = [];
  for (const t of teksten) {
    const laatste = uit[uit.length - 1];
    if (laatste !== undefined && laatste.length + 1 + t.length <= MAX_TEKENS_PER_OPNAME) uit[uit.length - 1] = `${laatste} ${t}`;
    else uit.push(t);
  }
  return uit;
}

/**
 * Legt de hoofdstukken op de stem: waar begint elk, en hoeveel beelden duurt het. De
 * begintijden van de scenes komen uit de kern zelf (een lege video met het hele script),
 * zodat hier niet een tweede keer wordt uitgerekend wat de kern al doet.
 */
export async function verdeel(basis: PaginaBasis, plan: MotionPlan, woorden: WhisperWord[]): Promise<Deel[]> {
  const hs = hoofdstukken(plan);
  if (hs.length === 1) return [{ ...hs[0], start: 0 }];
  const leeg = await proef({ ...basis, woorden, script: scriptVan(plan), code: "window.VIDEO = { bouw() {}, teken() {} };" });
  if (leeg.scenes.length !== plan.scenes.length + 1) throw new Error("De scenes konden niet op de stem worden gelegd.");
  const start = hs.map((h, i) => (i === 0 ? 0 : leeg.scenes[h.van][1]));
  for (let i = 1; i < start.length; i++) {
    // Een scene die niet in de stem is teruggevonden, krijgt van de kern een gok als tijd;
    // met een hoofdstuk dat vóór het vorige begint valt niets te maken.
    if (start[i] <= start[i - 1] + 2) throw new Error(`Hoofdstuk ${i + 1} kon niet op de stem worden gelegd. Probeer het opnieuw.`);
  }
  // Op hele beelden knippen: de hoofdstukken samen zijn dan precies zo lang als de stem.
  const grens = start.map((s) => Math.round(s * FPS));
  return hs.map((h, i) => ({ ...h, start: grens[i] / FPS, beelden: i + 1 < hs.length ? grens[i + 1] - grens[i] : undefined }));
}

export interface DeelWerk {
  pagina: Omit<PaginaInvoer, "code">;
  /** Het plan van alleen dit hoofdstuk; de eindkaart telt alleen in het laatste mee. */
  plan: MotionPlan;
  /** Waar dit hoofdstuk staat in het geheel, voor de opdracht aan de tekenaar. */
  plek?: { nummer: number; aantal: number; laatste: boolean; hiervoor: string; hierna: string };
}

/** De pagina en het plan van één hoofdstuk: eigen woordtijden vanaf 0, eigen scenes s1, s2, ... */
export function deelWerk(basis: PaginaBasis, plan: MotionPlan, woorden: WhisperWord[], delen: Deel[], k: number): DeelWerk {
  if (delen.length === 1) return { pagina: { ...basis, woorden, script: scriptVan(plan) }, plan };
  const d = delen[k];
  const laatste = k === delen.length - 1;
  const eind = laatste ? Infinity : delen[k + 1].start;
  const scenes = plan.scenes.slice(d.van, d.tot);
  const script: [string, string][] = scenes.map((s, i): [string, string] => [`s${i + 1}`, s.tekst]);
  if (laatste) script.push(["eind", plan.eind.tekst]);
  const kort = (i: number) => {
    const h = delen[i];
    return h ? plan.scenes.slice(h.van, h.tot).map((s) => s.beeld).join(" ").slice(0, 400) : "";
  };
  return {
    pagina: {
      ...basis,
      // 0,05 s speling, net als de kern bij het zoeken van een woord.
      woorden: woorden.filter((w) => w.start >= d.start - 0.05 && w.start < eind - 0.05).map((w) => ({ ...w, start: +(w.start - d.start).toFixed(3), end: +(w.end - d.start).toFixed(3) })),
      script,
      deel: { voor: k > 0, na: !laatste, einde: d.beelden ? d.beelden / FPS : undefined },
    },
    plan: { titel: plan.titel, scenes, eind: plan.eind },
    plek: { nummer: k + 1, aantal: delen.length, laatste, hiervoor: kort(k - 1), hierna: kort(k + 1) },
  };
}
