// Credit-tarieven — client-veilig (geen server-imports), zodat zowel server-
// routes als client-componenten (bv. een kosten-preview) ze kunnen gebruiken.
// Bedragen tussen haakjes zijn de echte providerkosten per call.
//
// Herijkt op 2026-08-04 op basis van het werkelijke gebruik: de mediane betalende
// klant verbruikte ~45-90 van zijn 500 credits per maand en niemand raakte de
// bundel aan, terwijl de API-kosten van álle klanten samen ~2% van de omzet zijn.
// Daarom fors omlaag, met de goedkope tussenstappen helemaal gratis: die kostten
// een fractie van een cent maar maakten elke klik "duur" in beleving.
// Richtprijs na deze herijking: ~1 credit ≈ $0,09 inkoop.
// Opnieuw herijkt op 25-10-2026: zie de prijsregel hieronder.

// ── Prijsregel (Sam, 25-10-2026) ─────────────────────────────────────────
// Elke actie kost zoveel credits dat we er óók bij het grootste abonnement (de goedkoopste
// credit) minstens 40% op verdienen. Gerekend zonder btw (de abonnementsprijzen zijn incl.
// 21% btw) en met een voorzichtige dollarkoers (fal rekent in dollars; $1 ≈ €0,88 in
// oktober 2026). Nieuwe actie of nieuwe providerprijs? Zet de inkoop in INKOOP_USD en laat
// creditsVoorInkoop() het rekenwerk doen; niet met de hand afronden.
// De uitleg voor Sam (kosten tegenover opbrengsten) staat in de PDF van 25-10-2026.

/** Credits per maand per abonnement. */
export const PLAN_CREDITS: Record<string, number> = {
  free: 100,
  starter: 500,
  pro: 1500,
  // Was 5.000: dan bracht een credit bij Agency maar €0,041 op en verloor elke video geld.
  agency: 4000,
};

/** Abonnementsprijzen per maand, incl. btw. */
export const PLAN_PRIJS_EUR: Record<string, number> = { starter: 49, pro: 99, agency: 249 };

export const BTW = 0.21;
export const EUR_PER_USD = 0.9;
export const MARGE = 0.4;

/** Wat een credit ons minimaal oplevert (excl. btw): bij het abonnement met de goedkoopste credit. */
export const LAAGSTE_CREDIT_EUR = Math.min(
  ...Object.entries(PLAN_PRIJS_EUR).map(([plan, prijs]) => prijs / (1 + BTW) / PLAN_CREDITS[plan]),
);

/** Credits voor een actie die ons `usd` dollar kost: minstens 40% marge, ook bij Agency. */
export function creditsVoorInkoop(usd: number): number {
  return usd <= 0 ? 0 : Math.max(1, Math.ceil((usd * EUR_PER_USD) / (1 - MARGE) / LAAGSTE_CREDIT_EUR - 1e-9));
}

/** Echte providerkosten per actie (fal-tarieven, oktober 2026). */
export const INKOOP_USD = {
  beeld: 0.039, // Nano Banana (niet-Pro), één beeld
  beeldPro: 0.15, // Nano Banana Pro 2K
  // Storytelling-scene: 2 tot 6 Nano Banana-aanroepen (tekenen, opschonen, tekst controleren,
  // keuren, bij afkeur nog eens), gemiddeld ~3.
  storyScene: 0.12,
  verbeteren: 0.02, // CodeFormer / BiRefNet ~$0,002-0,01, IC-Light ~$0,04
  ondertitels: 0.1, // VEED burned-in
  stemPer1000: 0.1, // ElevenLabs v3 via fal, per 1.000 tekens
  upscale: 0.04, // Clarity
  inpaint: 0.05, // Flux Pro Fill
  lipsyncPerSec: 0.056, // Kling AI Avatar v2 Standard
  beweging16PerSec: 0.08, // Wan 2.2 Animate Replace, per seconde op 16 beelden/s
  stemKlonen: 1.5, // MiniMax voice-clone
} as const;

export const CREDIT_COSTS = {
  SCRIPT_GENERATION: 0,     // GRATIS — tekst: script, analyses, spec, AI-regisseur (~$0,02-0,04)
  // Uitzondering op de regel: 1 credit blijft 1 credit (de regel zou 2 geven; marge bij
  // Agency ~32%, bij Starter ~57%). Een gewoon beeld is de instap: dat moet goedkoop voelen.
  IMAGE_GENERATION: 1,
  STORY_SCENE_IMAGE: creditsVoorInkoop(INKOOP_USD.storyScene),
  IMAGE_GENERATION_PRO: creditsVoorInkoop(INKOOP_USD.beeldPro),
  ENHANCE: creditsVoorInkoop(INKOOP_USD.verbeteren),
  SUBTITLES: creditsVoorInkoop(INKOOP_USD.ondertitels),
  VOICE: creditsVoorInkoop(INKOOP_USD.stemPer1000), // per 1.000 tekens
  UPSCALE: creditsVoorInkoop(INKOOP_USD.upscale),
  INPAINT: creditsVoorInkoop(INKOOP_USD.inpaint),
  VIDEO_GENERATION: creditsVoorInkoop(0.18), // Seedance Lite 5 s 720p
  LIPSYNC: creditsVoorInkoop(INKOOP_USD.lipsyncPerSec * 5), // per 5 seconden pratend personage
  SYNC: 0,                  // GRATIS — Whisper word-timestamps voor autosync (~$0,01)
  CHAT: 0,                  // GRATIS — AI-buddy chat-beurt (~$0,02-0,04)
} as const;

// ── Losse credits (Sam, 25-10-2026: "net als Higgsfield") ────────────────────
// Alleen voor wie een abonnement heeft. Per credit duurder dan een abonnement, zodat
// upgraden aantrekkelijk blijft. Ze blijven staan: de maandelijkse aanvulling telt op.
export const CREDIT_PAKKETTEN = [
  { id: "p100", credits: 100, prijs: 12 },
  { id: "p500", credits: 500, prijs: 55 },
  { id: "p1500", credits: 1500, prijs: 149 },
] as const;
export type PakketId = (typeof CREDIT_PAKKETTEN)[number]["id"];

/** Label voor in de UI: "· 3 cr." of "· gratis". */
export function creditLabel(cost: number): string {
  return cost <= 0 ? "gratis" : `${cost} cr.`;
}
