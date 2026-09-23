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
  return !!email && (STUDIO_ALLOWED.has(email.toLowerCase()) || isTeamAccount(email));
}

/**
 * Interne accounts die ook de tools mogen zien die nog niet af zijn.
 *
 * Bewust los van canUseStudio: die kan met STUDIO_OPEN_TO_ALL in één klap voor
 * iedereen open, en dan zou een half afgebouwde tool ongewild meeliften. Nu in
 * gebruik voor de Overheidsstijl in de storytelling-tool: die tekent zijn scenes
 * zelf uit een assetbibliotheek, en die bibliotheek is nog te klein om klanten
 * mee te laten werken.
 */
export const ADMIN_ACCOUNTS = new Set<string>([
  "sam@jouwanimatievideo.nl",
]);

export function isAdminAccount(email: string | null | undefined): boolean {
  return !!email && ADMIN_ACCOUNTS.has(email.toLowerCase());
}

/**
 * De redacteuren: onze eigen mensen die met alle tools werken, maar géén beheerders zijn.
 *
 * Bewust een eigen lijst naast ADMIN_ACCOUNTS. Ze mogen alles wat Sam in de tools mag —
 * ook wat nog niet voor klanten open staat — maar het beheerdashboard met de abonnementen
 * hangt aan het is_admin-vinkje in de database, en dat staat bij hen uit.
 */
export const TEAM_ACCOUNTS = new Set<string>([
  "isa@jouwanimatievideo.nl",
  "jay@jouwanimatievideo.nl",
  "casper@jouwanimatievideo.nl",
]);

/** Iemand van ons: een beheerder of een redacteur. Hiermee staan de tools open. */
export function isTeamAccount(email: string | null | undefined): boolean {
  return !!email && (ADMIN_ACCOUNTS.has(email.toLowerCase()) || TEAM_ACCOUNTS.has(email.toLowerCase()));
}

/**
 * De dialoogtool, met de voorwerpenbibliotheek die erbij hoort.
 *
 * Eerst live voor alleen Sam, om hem op productie te testen. Sams test klopte
 * (15-09-2026): sindsdien open voor iedereen. Een eigen schakelaar, zodat de tool los
 * van Creator Studio en de interne tools open en dicht kan. Geldt in het menu, op de
 * pagina's én in de API-routes.
 */
export const DIALOOG_OPEN_TO_ALL = true;

export function canUseDialoog(email: string | null | undefined): boolean {
  if (DIALOOG_OPEN_TO_ALL) return true;
  return isTeamAccount(email);
}

/**
 * De realistische stijl in de storytelling-tool: levensechte mensen en
 * omgevingen in plaats van een tekening. De stijl bestaat al langer als
 * referentiepack ("Realistic Animation", zie lib/style-packs.ts), maar staat
 * niet in het stijlmenu van de storytelling-tool.
 *
 * Bewust per account: dit is beeld dat op echte beelden lijkt, en dat willen we
 * eerst bij één klant zien werken voor het voor iedereen open gaat. Miranda
 * meldde zich op 23-09-2026 aan om juist zulke explainers te maken.
 *
 * Openzetten voor iedereen: verplaats de stijl naar de gewone lijst in
 * lib/infographics/story-style.ts (haal `beperkt` weg).
 */
export const REALISTISCHE_STIJL_ACCOUNTS = new Set<string>([
  "mirandavand247@gmail.com",
]);

export function magRealistischeStijl(email: string | null | undefined): boolean {
  return !!email && (REALISTISCHE_STIJL_ACCOUNTS.has(email.toLowerCase()) || isTeamAccount(email));
}
