// ── Aanwijzen wat er in beeld staat ──────────────────────────────────────────
//
// Het verschil tussen een vormgever en een gokautomaat is dat de vormgever
// precies weet waar iets staat. Een taalmodel dat naar een frame kijkt schat
// coördinaten er faliekant naast (onze eerste tests zetten een appel onder een
// bureau en een afdekking boven een bordje). Een detectiemodel geeft exacte
// kaders.
//
// Twee soorten:
//   - tekst zoeken (OCR met kader) → voor spelfouten in AI-beelden;
//   - een voorwerp zoeken op omschrijving → voor "het bord", "de beker".
//
// De kaders komen terug als fracties van het beeld (0..1), zodat de rest van de
// editor er niets van hoeft te weten.

import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

const OCR_MODEL = "fal-ai/florence-2-large/ocr-with-region";
const GROND_MODEL = "fal-ai/florence-2-large/caption-to-phrase-grounding";

export interface Kader {
  /** Midden van het kader, als fractie van het beeld. */
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
  label: string;
}

interface RuwKader {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

/** Florence geeft pixels ten opzichte van het originele beeld; wij willen fracties. */
function naarFracties(ruw: RuwKader, breedte: number, hoogte: number): Kader {
  return {
    x: (ruw.x + ruw.w / 2) / breedte,
    y: (ruw.y + ruw.h / 2) / hoogte,
    breedte: ruw.w / breedte,
    hoogte: ruw.h / hoogte,
    label: (ruw.label ?? "").replace(/<\/?s>/g, "").trim(),
  };
}

/** Alle tekst in beeld, met het kader eromheen. */
export async function zoekTekst(beeldUrl: string, breedte: number, hoogte: number): Promise<Kader[]> {
  try {
    const res = await fal.subscribe(OCR_MODEL, { input: { image_url: beeldUrl } as never });
    const boxen = (res.data as { results?: { quad_boxes?: RuwKader[] } }).results?.quad_boxes ?? [];
    return boxen.map((b) => naarFracties(b, breedte, hoogte)).filter((k) => k.label.length > 0);
  } catch {
    return [];
  }
}

/** Waar staat het voorwerp dat je omschrijft? */
export async function zoekVoorwerp(
  beeldUrl: string,
  omschrijving: string,
  breedte: number,
  hoogte: number
): Promise<Kader[]> {
  try {
    const res = await fal.subscribe(GROND_MODEL, {
      input: { image_url: beeldUrl, text_input: omschrijving } as never,
    });
    const boxen = (res.data as { results?: { bboxes?: RuwKader[] } }).results?.bboxes ?? [];
    return boxen.map((b) => naarFracties(b, breedte, hoogte));
  } catch {
    return [];
  }
}

/**
 * Welke gevonden tekst lijkt het meest op wat de klant noemt?
 *
 * OCR leest een spelfout letterlijk ("TE KOOOP"), en de klant typt meestal iets
 * wat er dichtbij ligt. Daarom vergelijken we soepel: hoofdletters weg, spaties
 * weg, en dan kijken wie de meeste letters deelt.
 */
export function besteTreffer(kaders: Kader[], gezocht: string): Kader | null {
  const schoon = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
  const naald = schoon(gezocht);
  if (!naald || kaders.length === 0) return null;

  let beste: Kader | null = null;
  let besteScore = 0;
  for (const k of kaders) {
    const kandidaat = schoon(k.label);
    if (!kandidaat) continue;
    let score = 0;
    if (kandidaat === naald) score = 1;
    else if (kandidaat.includes(naald) || naald.includes(kandidaat)) score = 0.85;
    else {
      // Overlap in letters: genoeg om "TE KOOOP" aan "TE KOOP" te koppelen.
      const gedeeld = [...new Set(naald)].filter((c) => kandidaat.includes(c)).length;
      score = gedeeld / Math.max(naald.length, kandidaat.length);
    }
    if (score > besteScore) {
      besteScore = score;
      beste = k;
    }
  }
  return besteScore >= 0.5 ? beste : null;
}
