import { STORY_VOICES } from "./story-voices";

// Welke ElevenLabs-stem een regel krijgt. Gedeeld door het inspreken per regel en
// het inspreken per stem in één opname, zodat die twee nooit een andere stem kiezen.

// Uit de stemmenlijst zelf opgebouwd. Stond eerst met de hand overgetypt, en liep
// daardoor achter: de Vlaamse stemmen en de kinderstemmen ontbraken erin.
export const TOEGESTANE_STEMMEN = new Set([
  ...STORY_VOICES.map((v) => v.id),
  // De overige vaste ElevenLabs-stemmen, voor oude projecten die er een bewaard hebben.
  "Aria", "Roger", "Laura", "Charlie", "Callum", "River", "Liam",
  "Alice", "Matilda", "Will", "Jessica", "Eric", "Chris", "Brian", "Lily", "Bill", "Rachel",
]);

export const TAALCODE: Record<string, string> = { Nederlands: "nl", Engels: "en", Duits: "de", Frans: "fr", Spaans: "es", Italiaans: "it" };

/** De stem om mee in te spreken. Een eigen stem-id uit de bibliotheek mag ook. */
export function kiesStem(gewenst?: string | null): string {
  const stem = (gewenst ?? "").trim();
  return stem && TOEGESTANE_STEMMEN.has(stem) ? stem : stem || "Charlotte";
}
