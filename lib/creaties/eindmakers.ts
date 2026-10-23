// Welke creaties een "eindresultaat" zijn: de grote, afgemonteerde video's. Daarop vragen
// we feedback (zie lib/creaties/feedback.ts). Los bestand, zodat ook het scherm het weet.

export const EINDMAKERS = new Set(["montage", "reclame", "ugc", "trailer", "film", "film-scene", "storytelling", "dialoog"]);

export function magFeedback(c: { maker: string; status: string }): boolean {
  return c.status === "klaar" && EINDMAKERS.has(c.maker);
}
