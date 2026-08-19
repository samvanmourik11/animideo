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

// Alle tarieven hieronder zijn op 2026-08-14 geverifieerd tegen de fal-modelpagina's.
// De CREDIT-waarden zelf zijn daarbij NIET aangepast: dat is een prijsbeslissing, geen
// correctie. Wat wél veranderde zijn de comments, want drie ervan klopten niet meer
// (Seedance Lite afgevoerd, ElevenLabs rekent per teken, ondertiteling gaat lokaal).
export const CREDIT_COSTS = {
  SCRIPT_GENERATION: 0,     // GRATIS — GPT-4o tekst: script, analyses, spec, AI-regisseur (~$0,02-0,04)
  IMAGE_GENERATION: 1,      // Nano Banana (niet-Pro): beeld genereren/bewerken/karakter ($0,0398)
  IMAGE_GENERATION_PRO: 2,  // Nano Banana Pro 1K/2K ($0,15; 4K kost het dubbele: $0,30) — was 4
  ENHANCE: 1,               // CodeFormer gezichtsherstel $0,0021/MP — maar IC-Light v2 belichting
                            // kost $0,10/MP en gaat daarmee OVER de credit heen (1 credit ≈ $0,09).
  SUBTITLES: 1,             // Ondertiteling wordt LOKAAL ingebrand met ffmpeg (app/api/studio/
                            // subtitles) — geen VEED, geen API-kosten. Dit tarief dekt niets.
  VOICE: 1,                 // ElevenLabs v3: $0,10 per 1.000 TEKENS, niet per aanroep. Een volledige
                            // voice-over benadert $0,10; een losse dialoogregel (~55 tekens) kost
                            // ~$0,006 — daar is 1 credit ruim voor. (Was 2 credits.)
  UPSCALE: 1,               // Clarity upscaler ($0,03/MP)
  INPAINT: 1,               // Flux Pro v1 Fill inpainting ($0,05/MP; Kontext kost $0,055/MP)
  VIDEO_GENERATION: 2,      // LET OP: fal-ai/bytedance/seedance/v1/lite/* is bij fal AFGEVOERD en
                            // wordt doorgestuurd naar Seedance 1.0 Pro Fast. Tarief is nu resolutie-
                            // afhankelijk: (b×h×fps×sec)/1024 tokens à $1,00/M — 720p/5s = $0,108,
                            // 1080p/5s = $0,243. Onze routes vragen 720p, dus goedkoper dan de
                            // eerder begrote $0,18. (Was 5 credits.)
  LIPSYNC: 3,               // Kling AI Avatar Standard v2: $0,0562/s → een clip van 5s = $0,281.
                            // Het goedkoopste beeld+audio-avatarmodel op fal; alternatieven beginnen
                            // bij $0,115/s (Pro), $0,16/s (Omnihuman), $0,20/s (Infinitalk). Echt
                            // goedkoper kan alleen via een ANDERE opzet: één herbruikbare bewegende
                            // clip per personage + een mond-only pass (sync-lipsync 1.9, $0,70/min
                            // → ~$0,047 per regel van 4s). (Was 7 credits.)
  SYNC: 0,                  // GRATIS — Whisper word-timestamps voor autosync (~$0,01)
  CHAT: 0,                  // GRATIS — AI-buddy chat-beurt (GPT-4o tekst + tool-calls, ~$0,02-0,04)
} as const;

/** Label voor in de UI: "· 3 cr." of "· gratis". */
export function creditLabel(cost: number): string {
  return cost <= 0 ? "gratis" : `${cost} cr.`;
}
