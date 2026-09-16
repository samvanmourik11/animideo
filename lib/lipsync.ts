import { CREDIT_COSTS } from "@/lib/credit-costs";

// Gedeeld door de lipsync-route en de knop in de upload-tool (client-veilig: geen imports
// van de server).

export const LIPSYNC_MODEL = "fal-ai/kling-video/ai-avatar/v2/standard";

/** Kling AI Avatar accepteert maximaal 60 seconden geluid. */
export const LIPSYNC_MAX_SEC = 60;

/** CREDIT_COSTS.LIPSYNC per begonnen 5 seconden: Kling rekent per seconde (~$0,056). */
export function lipsyncCredits(seconden: number): number {
  return CREDIT_COSTS.LIPSYNC * Math.max(1, Math.ceil(seconden / 5));
}
