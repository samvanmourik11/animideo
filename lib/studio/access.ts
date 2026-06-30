// Tijdelijke toegangsbeperking voor de nieuwe tools bij de soft-launch: Creator
// Studio, Explainer-video en Infographic zijn voorlopig alleen bruikbaar voor
// interne account(s), zodat we in productie kunnen verifiëren dat alles werkt
// vóór we ze voor elk account openzetten. De al langer live tools (Wizard, Foto,
// T2V, Playground, Storytelling) blijven gewoon voor iedereen beschikbaar.
//
// Openzetten voor iedereen: zet STUDIO_OPEN_TO_ALL op true (en deploy). Een
// account toevoegen: voeg het e-mailadres (lowercase) toe aan STUDIO_ALLOWED.
//
// Pure functie + alleen e-mailadressen → veilig om ook client-side te importeren.

export const STUDIO_OPEN_TO_ALL = false;

export const STUDIO_ALLOWED = new Set<string>([
  "sam@jouwanimatievideo.nl",
]);

export function canUseStudio(email: string | null | undefined): boolean {
  if (STUDIO_OPEN_TO_ALL) return true;
  return !!email && STUDIO_ALLOWED.has(email.toLowerCase());
}
