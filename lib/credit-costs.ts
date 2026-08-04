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

export const CREDIT_COSTS = {
  SCRIPT_GENERATION: 0,     // GRATIS — GPT-4o tekst: script, analyses, spec, AI-regisseur (~$0,02-0,04)
  IMAGE_GENERATION: 1,      // Nano Banana (niet-Pro): beeld genereren/bewerken/karakter (~$0,039)
  IMAGE_GENERATION_PRO: 2,  // Nano Banana Pro 2K (~$0,15) — was 4
  ENHANCE: 1,               // CodeFormer gezichtsherstel / IC-Light belichting (~$0,002-0,04)
  SUBTITLES: 1,             // VEED burned-in ondertiteling (~$0,05-0,10/video)
  VOICE: 1,                 // ElevenLabs v3 voice-over (~$0,10) — was 2
  UPSCALE: 1,               // Clarity upscaler (~$0,04)
  INPAINT: 1,               // Flux Pro Fill inpainting (~$0,05)
  VIDEO_GENERATION: 2,      // Seedance Lite 5s 720p (~$0,18) — was 5, grootste kostenpost voor de klant
  LIPSYNC: 3,               // Kling AI Avatar Standard v2 pratend personage (~5s, ~$0,28) — was 7
  MUSIC: 0,                 // GRATIS — CassetteAI muziekbed (~$0,02/min)
  SYNC: 0,                  // GRATIS — Whisper word-timestamps voor autosync (~$0,01)
  CHAT: 0,                  // GRATIS — AI-buddy chat-beurt (GPT-4o tekst + tool-calls, ~$0,02-0,04)
} as const;

/** Label voor in de UI: "· 3 cr." of "· gratis". */
export function creditLabel(cost: number): string {
  return cost <= 0 ? "gratis" : `${cost} cr.`;
}
