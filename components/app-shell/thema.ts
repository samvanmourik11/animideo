// Licht of donker in de nieuwe app. Bewaard in een cookie (niet alleen in de browser-
// opslag), zodat de server de pagina meteen in het goede thema tekent: anders flitst
// elke pagina eerst donker en springt hij daarna naar licht.

export type Thema = "licht" | "donker";
export const THEMA_COOKIE = "thema";
export const THEMA_ID = "app-thema";

export function leesThema(waarde: string | undefined): Thema {
  return waarde === "licht" ? "licht" : "donker";
}

export function zetThema(thema: Thema) {
  document.cookie = `${THEMA_COOKIE}=${thema}; path=/; max-age=31536000; samesite=lax`;
  document.getElementById(THEMA_ID)?.setAttribute("data-thema", thema);
}

/** De pagina's van de nieuwe app; alles daarbuiten is een oude tool in vaste donkere kleuren. */
export const NIEUWE_PADEN = ["/ontdek", "/maak", "/mijn-werk", "/effecten", "/apps", "/branches", "/team", "/profiel", "/admin/voorpagina", "/studios", "/infographics/story", "/infographics/dialogue", "/stem"];

export function isNieuwePagina(pad: string): boolean {
  return NIEUWE_PADEN.some((p) => pad === p || pad.startsWith(p + "/"));
}
