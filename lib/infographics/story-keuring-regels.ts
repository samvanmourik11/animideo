// De regels achter de beeldkeuring: welke fouten er zijn, hoe zwaar ze wegen en
// wat de tekenaar bij een herkansing te horen krijgt.
//
// Bewust los van story-keuring.ts, dat de vraag aan het model stelt: dit bestand
// bevat alleen rekenwerk en tekst, zodat het te testen is zonder sleutel — zelfde
// splitsing als beeldtelling.ts naast dialogue-verify.ts.

/** Wat er mis kan zijn. De volgorde is de ernst: het eerste weegt het zwaarst. */
export const STORY_FOUTEN = [
  "dubbel",        // hetzelfde personage staat er twee keer in
  "tekst",         // verzonnen tekst, letterbrij of een logo/watermerk
  "gesplitst",     // het beeld is in twee helften of panelen geknipt
  "gezichtloos",   // een personage zonder gezicht: alleen haar en kleding
  "anatomie",      // vergroeide ledematen, mensen die in een object zitten
  "zwevend",       // losse voorwerpen die in de lucht hangen
] as const;
export type StoryFout = (typeof STORY_FOUTEN)[number];

export interface StoryKeuring {
  fouten: StoryFout[];
  /** Wat het model zag, voor de herkansing. */
  uitleg: string;
}

/** Alleen bekende fouten, zonder dubbelen, in volgorde van ernst. */
export function schoonFouten(ruw: unknown): StoryFout[] {
  if (!Array.isArray(ruw)) return [];
  const gezien = new Set(ruw.filter((f): f is StoryFout => (STORY_FOUTEN as readonly string[]).includes(f as string)));
  return STORY_FOUTEN.filter((f) => gezien.has(f));
}

/**
 * Welk beeld is het minst fout? Bij gelijke stand wint het eerste, want dat is de
 * eerste poging en die sluit qua stijl beter aan bij de rest van de video.
 */
export function minstFout<T>(kandidaten: { beeld: T; fouten: StoryFout[] }[]): T {
  let beste = kandidaten[0];
  for (const k of kandidaten.slice(1)) {
    if (ernst(k.fouten) < ernst(beste.fouten)) beste = k;
  }
  return beste.beeld;
}

/** Hoe erg is deze verzameling fouten? Lager is beter. */
export function ernst(fouten: StoryFout[]): number {
  // Een dubbel personage weegt het zwaarst: dat ziet een kijker meteen.
  const gewicht: Record<StoryFout, number> = { dubbel: 8, gezichtloos: 7, gesplitst: 6, anatomie: 4, tekst: 3, zwevend: 1 };
  return fouten.reduce((som, f) => som + gewicht[f], 0);
}

/** De extra regels voor een herkansing: wat er mis was, zo concreet mogelijk. */
export function herkansingRegels(keuring: StoryKeuring, castNamen: string[]): string {
  if (!keuring.fouten.length) return "";
  const namen = castNamen.filter(Boolean).join(", ");
  const regels: Record<StoryFout, string> = {
    dubbel: `The previous attempt drew the same character twice. Each person${namen ? ` (${namen})` : ""} may appear exactly ONCE in the image.`,
    tekst: "The previous attempt contained text, letters, numbers or a brand mark. This image must contain NO text and NO brand marks of any kind, not on signs, packaging, screens or speech bubbles.",
    gezichtloos:
      "The previous attempt drew one or more people without a face — a blank head, or just hair and clothes where a face belongs. Every person must have a clearly drawn face: eyes, eyebrows, nose and mouth, in the same style as the rest of the scene.",
    gesplitst: "The previous attempt was split into panels or halves. This must be ONE single continuous scene filling the whole frame, with no dividing lines, borders or bars.",
    anatomie: "The previous attempt had malformed people (extra or merged limbs, a person stuck inside an object). Draw every person whole and anatomically correct, standing free of the furniture.",
    zwevend: "The previous attempt had objects floating in mid-air. Everything must rest on a surface or be held by someone.",
  };
  return [...keuring.fouten.map((f) => regels[f]), keuring.uitleg ? `What was seen: ${keuring.uitleg}` : ""]
    .filter(Boolean)
    .join(" ");
}
