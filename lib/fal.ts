import { fal } from "@fal-ai/client";
import { logFalAanroep } from "@/lib/provider-kosten";

// De fal-client van de hele app, met een kostenlogboek ertussen.
//
// Importeer fal altijd hiervandaan, nooit rechtstreeks uit "@fal-ai/client": dan
// glipt de aanroep langs het logboek en is de rekening weer een raadsel (zie
// lib/provider-kosten.ts). We passen het gedeelde fal-object één keer aan, zodat
// fal.config() en de status-/resultaataanroepen gewoon blijven werken.

type MetInvoer = { input?: Record<string, unknown> } | undefined;

const GEMARKEERD = Symbol.for("animideo.fal.kostenlogboek");
const f = fal as typeof fal & { [GEMARKEERD]?: boolean };

if (!f[GEMARKEERD]) {
  f[GEMARKEERD] = true;

  const subscribe = fal.subscribe.bind(fal);
  fal.subscribe = (async (endpoint: string, options: MetInvoer) => {
    const result = await subscribe(endpoint, options as never);
    // Pas loggen als het gelukt is: een mislukte aanroep rekent fal niet af.
    logFalAanroep(endpoint, options?.input);
    return result;
  }) as typeof fal.subscribe;

  const submit = fal.queue.submit.bind(fal.queue);
  fal.queue.submit = (async (endpoint: string, options: MetInvoer) => {
    const result = await submit(endpoint, options as never);
    logFalAanroep(endpoint, options?.input);
    return result;
  }) as typeof fal.queue.submit;
}

export { fal };
