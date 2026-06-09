// Toegang tot de nieuwe video-editor. Tijdens de bouw is de editor volledig
// verborgen voor normale gebruikers: alleen de accounts hieronder kunnen erbij,
// via de directe URL /editor. Zo raakt het bouwproces de actieve gebruikers
// op geen enkele manier. Bij de gefaseerde uitrol (Fase 7) breiden we dit uit
// naar een beta-opt-in en uiteindelijk algemene beschikbaarheid.

const EDITOR_ALLOWLIST = new Set([
  "sam@jouwanimatievideo.nl",
  "alyssa@jouwanimatievideo.nl",
  "nohaila@jouwanimatievideo.nl",
]);

/** Mag dit e-mailadres de nieuwe editor zien? */
export function canUseEditor(email: string | null | undefined): boolean {
  if (!email) return false;
  return EDITOR_ALLOWLIST.has(email.toLowerCase());
}
