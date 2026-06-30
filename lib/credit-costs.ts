// Credit-tarieven — client-veilig (geen server-imports), zodat zowel server-
// routes als client-componenten (bv. een kosten-preview) ze kunnen gebruiken.
// Bedragen tussen haakjes zijn de echte providerkosten per call.

export const CREDIT_COSTS = {
  SCRIPT_GENERATION: 1,     // GPT-4o tekst: script, analyses, infographic-spec, AI-regisseur (~$0,02-0,04)
  IMAGE_GENERATION: 1,      // Nano Banana (niet-Pro): beeld genereren/bewerken/karakter (~$0,039)
  IMAGE_GENERATION_PRO: 4,  // Nano Banana Pro 2K (~$0,15) — evenredig duurder
  ENHANCE: 1,               // CodeFormer gezichtsherstel / IC-Light belichting (~$0,002-0,04)
  SUBTITLES: 1,             // VEED burned-in ondertiteling (~$0,05-0,10/video)
  VOICE: 2,                 // ElevenLabs v3 voice-over (~$0,10)
  UPSCALE: 1,               // Clarity upscaler (~$0,04)
  INPAINT: 1,               // Flux Pro Fill inpainting (~$0,05)
  VIDEO_GENERATION: 5,      // Seedance Lite 5s 720p (~$0,18) — beeldbeweging draait altijd op Lite
  MUSIC: 1,                 // CassetteAI muziekbed (~$0,02/min)
  SYNC: 1,                  // Whisper word-timestamps voor autosync (~$0,01)
  CHAT: 1,                  // AI-buddy chat-beurt (GPT-4o tekst + tool-calls, ~$0,02-0,04)
} as const;
