// Tijdelijke toegangsbeperking voor de Creator Studio. Bij de eerste live-gang
// is de Studio alleen bruikbaar voor interne account(s), zodat we in productie
// kunnen verifiëren dat alles werkt vóór we het voor elk account openzetten.
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
