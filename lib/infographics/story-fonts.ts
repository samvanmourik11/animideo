// Curated set of brand-safe fonts for the storytelling-infographic. Elke keuze is
// als statische bold-TTF gebundeld in lib/export/ (zodat de video-export met resvg
// exact hetzelfde rendert als de browser-preview). De preview laadt dezelfde
// families via Google Fonts (STORY_FONTS_CSS_HREF). De `family` moet exact
// overeenkomen met de interne fontnaam van het TTF-bestand.

export interface StoryFont {
  id: string;      // opgeslagen waarde (== family)
  label: string;   // in de dropdown
  family: string;  // SVG font-family + interne TTF-naam
  ttf: string;     // bestandsnaam in lib/export/
  note?: string;   // korte stijlhint in de UI
}

export const STORY_FONTS: StoryFont[] = [
  { id: "Inter", label: "Inter", family: "Inter", ttf: "Inter-Bold.ttf", note: "clean, neutraal" },
  { id: "Poppins", label: "Poppins", family: "Poppins", ttf: "Poppins-Bold.ttf", note: "modern, rond" },
  { id: "Lato", label: "Lato", family: "Lato", ttf: "Lato-Bold.ttf", note: "vriendelijk, zakelijk" },
  { id: "Arvo", label: "Arvo", family: "Arvo", ttf: "Arvo-Bold.ttf", note: "slab-serif, stevig" },
  { id: "Anton", label: "Anton", family: "Anton", ttf: "Anton-Regular.ttf", note: "vet, impact" },
];

export const DEFAULT_STORY_FONT = "Inter";

// Volledige TTF-lijst voor resvg (`fontFiles`), zodat alle keuzes in de export
// beschikbaar zijn. Paden worden in de route t.o.v. lib/export/ opgebouwd.
export const STORY_FONT_FILES = STORY_FONTS.map((f) => f.ttf);

// Geldige family teruggeven (val terug op Inter bij onbekende/lege waarde).
export function resolveStoryFont(family?: string | null): string {
  const hit = STORY_FONTS.find((f) => f.family === family);
  return hit ? hit.family : DEFAULT_STORY_FONT;
}

// font-family-stack voor de SVG-tekst (browser-preview + resvg).
export function storyFontStack(family?: string | null): string {
  return `${resolveStoryFont(family)}, system-ui, sans-serif`;
}

// Mapt een uit een website afgeleide fontnaam ("Montserrat, sans-serif",
// "Playfair Display", ...) naar de dichtstbijzijnde gebundelde keuze. Zonder
// treffer: Inter. Serif-achtige namen → Arvo, display/condensed → Anton.
export function nearestStoryFont(name?: string | null): string {
  if (!name) return DEFAULT_STORY_FONT;
  const n = name.toLowerCase();
  const direct = STORY_FONTS.find((f) => n.includes(f.family.toLowerCase()));
  if (direct) return direct.family;
  if (/(anton|bebas|oswald|condensed|impact|display|heavy|black)/.test(n)) return "Anton";
  if (/(serif|georgia|times|playfair|merriweather|lora|garamond|slab|roboto slab)/.test(n)) return "Arvo";
  if (/(poppins|montserrat|nunito|circular|geometric|futura)/.test(n)) return "Poppins";
  if (/(lato|open ?sans|source|helvetica|arial|work ?sans)/.test(n)) return "Lato";
  return DEFAULT_STORY_FONT;
}

// Google-Fonts stylesheet voor de browser-preview (dezelfde families als de TTF's).
export const STORY_FONTS_CSS_HREF =
  "https://fonts.googleapis.com/css2?family=Anton&family=Arvo:wght@700&family=Inter:wght@600;800&family=Lato:wght@700;900&family=Poppins:wght@600;700;800&display=swap";
