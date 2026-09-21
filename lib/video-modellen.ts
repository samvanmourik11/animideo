// DE BEWEEGMODELLEN — welk model een stilstaand beeld tot leven brengt.
//
// De tool draaide altijd op één model (Seedance Lite). Werkt een beeld niet — een
// personage dat vervormt, een camera die niets doet, een beweging die niet klopt — dan
// was er niets anders te proberen dan nóg een keer hetzelfde. Redacteuren liepen daarop
// vast (Sam, 21-09-2026). Elk model heeft zijn eigen karakter, dus een ander model is
// vaak de snelste oplossing.
//
// Credits: ~1 credit ≈ $0,09 inkoop (zie credit-costs.ts). De prijzen hieronder zijn per
// clip van 5 seconden, opgezocht bij fal op 21-09-2026.

export interface VideoModel {
  /** Wat er in de database en in de statuscontrole staat. */
  id: string;
  /** Het model bij fal. */
  slug: string;
  naam: string;
  /** Eén zin: waar dit model goed in is, in gewone taal. */
  waarvoor: string;
  credits: number;
  /** Wat de clip bij de leverancier kost, voor onszelf. */
  inkoop: string;
  /** Wat er aan resolutie/duur mee moet; per model anders opgebouwd. */
  invoer: (basis: { image_url: string; prompt: string }) => Record<string, unknown>;
}

export const VIDEO_MODELLEN: VideoModel[] = [
  {
    id: "seedance-lite",
    slug: "fal-ai/bytedance/seedance/v1/lite/image-to-video",
    naam: "Seedance Lite",
    waarvoor: "De standaard: rustige, natuurgetrouwe beweging. Het goedkoopst en meestal genoeg.",
    credits: 2,
    inkoop: "$0,18",
    invoer: (b) => ({ ...b, duration: "5", resolution: "720p" }),
  },
  {
    id: "hailuo-02",
    slug: "fal-ai/minimax/hailuo-02/standard/image-to-video",
    naam: "Hailuo 02",
    waarvoor: "Sterk in echte natuurkunde: vallen, springen, stromend water. Andere look dan Seedance.",
    credits: 3,
    inkoop: "$0,27",
    // Hailuo rekent per seconde en kent 6 en 10 seconden; 6 is de goedkoopste stap.
    invoer: (b) => ({ ...b, duration: "6", resolution: "768P", prompt_optimizer: true }),
  },
  {
    id: "kling-2-5",
    slug: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
    naam: "Kling 2.5",
    waarvoor: "De beste beweging van mensen en dieren: soepel lopen, draaien en gebaren.",
    credits: 4,
    inkoop: "$0,35",
    invoer: (b) => ({ ...b, duration: "5" }),
  },
  {
    id: "seedance-pro",
    slug: "fal-ai/bytedance/seedance/v1/pro/image-to-video",
    naam: "Seedance Pro",
    waarvoor: "Dezelfde stijl als Lite, maar scherper en in full-HD. De duurste van de vier.",
    credits: 8,
    inkoop: "$0,62",
    invoer: (b) => ({ ...b, duration: "5", resolution: "1080p" }),
  },
];

export const STANDAARD_VIDEO_MODEL = "seedance-lite";

export function videoModel(id?: string | null): VideoModel {
  return VIDEO_MODELLEN.find((m) => m.id === id) ?? VIDEO_MODELLEN[0];
}

/** Kennen we dit model? Anders valt de aanroeper terug op de standaard. */
export function isVideoModel(id?: string | null): boolean {
  return !!id && VIDEO_MODELLEN.some((m) => m.id === id);
}
