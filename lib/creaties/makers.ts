// DE MAKERS — wat de nieuwe app kan maken, en wat dat kost.
//
// Elke knop in de nieuwe app ("maak een beeld", "maak er video van", straks de effecten)
// is een maker: welk model bij fal, hoe de invoer eruitziet, hoeveel credits, en waar het
// resultaat in het antwoord staat. De wachtrij (lib/creaties/wachtrij.ts) is voor alle
// makers hetzelfde; een nieuwe knop is dus een nieuw item hier, geen nieuwe route.
//
// Client-veilig (geen server-imports): het maakscherm rekent er de prijs vooraf mee uit.

import { CREDIT_COSTS } from "@/lib/credit-costs";
import { VIDEO_MODELLEN, videoModel, isVideoModel, STANDAARD_VIDEO_MODEL } from "@/lib/video-modellen";
import type { CreatieSoort } from "./types";

export const FORMATEN = ["1:1", "9:16", "16:9"] as const;
export type Formaat = (typeof FORMATEN)[number];

export interface BeeldInvoer {
  prompt: string;
  formaat: Formaat;
  kwaliteit: "standaard" | "pro";
}

export interface VideoInvoer {
  bronUrl: string;
  /** Wat er moet bewegen; leeg = rustige, natuurlijke beweging. */
  prompt: string;
  model: string;
}

/** Wat een maker naar de wachtrij stuurt. */
export interface Opdracht {
  soort: CreatieSoort;
  endpoint: string;
  falInvoer: Record<string, unknown>;
  credits: number;
  prompt: string;
  /** Opgeschoonde invoer: zo gaat hij de database in, en zo start "Nog eens" hem weer. */
  invoer: Record<string, unknown>;
}

export type MakerId = "beeld" | "beeld-naar-video";

// Zonder bewegingsopdracht maakte Seedance van een stilstaand beeld soms een wilde
// camerarit; een rustige standaard geeft bij de meeste beelden het mooiste resultaat.
const STANDAARD_BEWEGING = "Subtle, natural motion. Gentle camera movement. Keep the subject and style consistent.";

const MAX_PROMPT = 2000;

function tekst(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Leest en controleert de invoer van een maker. Gooit met een Nederlandse melding als er
 * iets niet klopt; die gaat zo naar het scherm.
 */
export function maakOpdracht(maker: string, ruw: Record<string, unknown>): Opdracht {
  if (maker === "beeld") {
    const prompt = tekst(ruw.prompt).slice(0, MAX_PROMPT);
    if (!prompt) throw new Error("Schrijf eerst wat je wilt zien.");
    const formaat: Formaat = (FORMATEN as readonly string[]).includes(ruw.formaat as string)
      ? (ruw.formaat as Formaat)
      : "1:1";
    const kwaliteit = ruw.kwaliteit === "pro" ? "pro" : "standaard";
    const invoer: BeeldInvoer = { prompt, formaat, kwaliteit };
    return {
      soort: "beeld",
      endpoint: kwaliteit === "pro" ? "fal-ai/nano-banana-pro" : "fal-ai/nano-banana",
      falInvoer: {
        prompt,
        aspect_ratio: formaat,
        num_images: 1,
        output_format: "jpeg",
        ...(kwaliteit === "pro" ? { resolution: "2K" } : {}),
      },
      credits: beeldCredits(kwaliteit),
      prompt,
      invoer: { ...invoer },
    };
  }

  if (maker === "beeld-naar-video") {
    const bronUrl = tekst(ruw.bronUrl);
    if (!/^https:\/\//.test(bronUrl)) throw new Error("Kies eerst een beeld om video van te maken.");
    const modelId = isVideoModel(ruw.model as string) ? (ruw.model as string) : STANDAARD_VIDEO_MODEL;
    const model = videoModel(modelId);
    const prompt = tekst(ruw.prompt).slice(0, MAX_PROMPT);
    const invoer: VideoInvoer = { bronUrl, prompt, model: model.id };
    return {
      soort: "video",
      endpoint: model.slug,
      falInvoer: model.invoer({ image_url: bronUrl, prompt: prompt || STANDAARD_BEWEGING }),
      credits: model.credits,
      prompt,
      invoer: { ...invoer },
    };
  }

  throw new Error("Onbekende maker.");
}

export function beeldCredits(kwaliteit: "standaard" | "pro"): number {
  return kwaliteit === "pro" ? CREDIT_COSTS.IMAGE_GENERATION_PRO : CREDIT_COSTS.IMAGE_GENERATION;
}

/** Waar de url van het resultaat in het fal-antwoord staat. */
export function resultaatUrl(soort: CreatieSoort, data: unknown): string | null {
  const d = data as { images?: { url?: string }[]; video?: { url?: string }; audio?: { url?: string } };
  if (soort === "beeld") return d?.images?.[0]?.url ?? null;
  if (soort === "video") return d?.video?.url ?? null;
  return d?.audio?.url ?? null;
}

/** Leesbare naam van het model, voor in de bibliotheek. */
export function modelNaam(endpoint: string | null | undefined): string {
  if (!endpoint) return "Onbekend";
  if (endpoint === "fal-ai/nano-banana") return "Nano Banana";
  if (endpoint === "fal-ai/nano-banana-pro") return "Nano Banana Pro";
  return VIDEO_MODELLEN.find((m) => m.slug === endpoint)?.naam ?? endpoint;
}
