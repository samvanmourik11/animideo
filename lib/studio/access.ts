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

/**
 * Interne accounts die élke tool mogen zien, ook de tools die uit het menu zijn
 * gehaald (AI Wizard, foto's, upload, text-to-video, playground).
 *
 * Bewust los van canUseStudio: die kan met STUDIO_OPEN_TO_ALL in één klap voor
 * iedereen open, en dan zouden deze tools ongewild meeliften.
 */
export const ADMIN_ACCOUNTS = new Set<string>([
  "sam@jouwanimatievideo.nl",
]);

export function isAdminAccount(email: string | null | undefined): boolean {
  return !!email && ADMIN_ACCOUNTS.has(email.toLowerCase());
}

/**
 * De dialoogtool, met de voorwerpenbibliotheek die erbij hoort.
 *
 * Eerst live voor alleen Sam, om hem op productie te testen; klopt dat, dan zet je
 * DIALOOG_OPEN_TO_ALL op true (en deploy). Een eigen schakelaar, zodat de tool los
 * van Creator Studio en de interne tools opengaat. Geldt in het menu, op de pagina's
 * én in de API-routes: wie het adres kent, komt er zonder toegang ook niet in.
 */
export const DIALOOG_OPEN_TO_ALL = false;

export function canUseDialoog(email: string | null | undefined): boolean {
  if (DIALOOG_OPEN_TO_ALL) return true;
  return isAdminAccount(email);
}
