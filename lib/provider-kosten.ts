import { AsyncLocalStorage } from "node:async_hooks";
import { createServiceClient } from "@/lib/supabase/service";

// Logboek van wat elke fal-aanroep ons kost (tabel provider_kosten, migratie 044).
//
// Waarom: credits zeggen wat een klant betaalt, niet wat wij inkopen, en de
// interne accounts schrijven helemaal niets af. In de week van 25-09-2026 ging er
// zo ~€500 aan fal-opwaarderingen doorheen zonder dat iemand kon zien waaraan.
//
// Hoe: lib/fal.ts stuurt elke fal.subscribe en fal.queue.submit hierlangs. WIE de
// aanroep deed, weten we doordat deductCredits() aan het begin van elke betaalde
// stap de gebruiker in een AsyncLocalStorage zet; alles wat daarna in hetzelfde
// verzoek gebeurt, erft die. Een aanroep zonder voorafgaande afschrijving komt
// zonder gebruiker in het logboek — dan zie je die gaten tenminste.

type KostenContext = { userId: string; actie: string | null };
const context = new AsyncLocalStorage<KostenContext>();

/**
 * Zet de gebruiker voor de rest van dit verzoek. Synchroon aanroepen vóór de
 * eerste await, anders erft de aanroeper het niet.
 */
export function zetKostenContext(userId: string, actie?: string | null): void {
  context.enterWith({ userId, actie: actie ?? null });
}

// Tarieven in dollars, naar de fal-prijzen per model (stand 02-10-2026). Zijn ze
// niet bekend, dan schatten we STANDAARD en zetten dat in de details, zodat een
// onbekend model opvalt in plaats van stil als gratis te tellen.
const PER_STUK: Record<string, number> = {
  "fal-ai/nano-banana": 0.039,
  "fal-ai/nano-banana/edit": 0.039,
  "fal-ai/nano-banana-pro": 0.15,
  "fal-ai/nano-banana-pro/edit": 0.15,
  "fal-ai/flux-pro/kontext": 0.04,
  "fal-ai/flux-pro/v1/fill": 0.05,
  "fal-ai/clarity-upscaler": 0.04,
  "fal-ai/codeformer": 0.002,
  "fal-ai/iclight-v2": 0.04,
  "fal-ai/birefnet": 0.002,
  "fal-ai/florence-2-large/ocr-with-region": 0.002,
  "fal-ai/florence-2-large/caption-to-phrase-grounding": 0.002,
};

// Video: per seconde (bij 720p). De duur staat in de invoer; zonder duur 5 s.
const PER_SECONDE: Record<string, number> = {
  "fal-ai/bytedance/seedance/v1/lite/image-to-video": 0.036,
  "fal-ai/bytedance/seedance/v1/lite/text-to-video": 0.036,
  "fal-ai/bytedance/seedance/v1/pro/image-to-video": 0.124,
  "fal-ai/minimax/hailuo-02/standard/image-to-video": 0.045,
  "fal-ai/kling-video/v2.5-turbo/pro/image-to-video": 0.07,
  // Pratend personage: de duur volgt uit de audio, die kennen we bij het indienen
  // niet. 5 s is de gangbare dialoogregel; langere regels kosten dus meer dan hier.
  "fal-ai/kling-video/ai-avatar/v2/standard": 0.0562,
};

// ElevenLabs v3 via fal: per 1.000 tekens.
const PER_1000_TEKENS: Record<string, number> = {
  "fal-ai/elevenlabs/tts/eleven-v3": 0.1,
};

const STANDAARD = 0.05;

function getal(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Geschatte kosten van één aanroep, plus of het een gok was. */
export function schatKosten(model: string, input: Record<string, unknown> | undefined): { usd: number; geschat: boolean } {
  const aantal = getal(input?.num_images) ?? 1;
  if (model in PER_STUK) return { usd: PER_STUK[model] * aantal, geschat: false };
  if (model in PER_SECONDE) {
    const duur = getal(input?.duration) ?? 5;
    return { usd: PER_SECONDE[model] * duur, geschat: getal(input?.duration) === null };
  }
  if (model in PER_1000_TEKENS) {
    const tekens = typeof input?.text === "string" ? input.text.length : 500;
    return { usd: (PER_1000_TEKENS[model] * Math.max(tekens, 1)) / 1000, geschat: false };
  }
  return { usd: STANDAARD, geschat: true };
}

const emailCache = new Map<string, string | null>();

async function emailVan(userId: string): Promise<string | null> {
  if (emailCache.has(userId)) return emailCache.get(userId) ?? null;
  const { data } = await createServiceClient().from("profiles").select("email").eq("id", userId).maybeSingle();
  const email = (data?.email as string | undefined) ?? null;
  emailCache.set(userId, email);
  return email;
}

/**
 * Schrijf één aanroep weg. Wacht nergens op en gooit nooit: een haperend
 * logboek mag geen generatie laten mislukken.
 */
export function logFalAanroep(model: string, input: Record<string, unknown> | undefined): void {
  const ctx = context.getStore();
  const { usd, geschat } = schatKosten(model, input);
  void (async () => {
    try {
      const email = ctx ? await emailVan(ctx.userId) : null;
      const { error } = await createServiceClient().from("provider_kosten").insert({
        user_id: ctx?.userId ?? null,
        email,
        provider: "fal",
        model,
        kosten_usd: usd,
        actie: ctx?.actie ?? null,
        details: geschat ? { geschat: true } : null,
      });
      if (error) console.warn("[provider-kosten] wegschrijven mislukt:", error.message);
    } catch (e) {
      console.warn("[provider-kosten] wegschrijven mislukt:", e);
    }
  })();
}
