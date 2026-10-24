// De verborgen kant van een trend: van trend + wat de klant aanleverde naar de opdrachten
// bij fal. Alleen op de server. Puur (geen database), zodat de test hem kan nalopen.

import { videoModel } from "@/lib/video-modellen";
import { LIPSYNC_MODEL } from "@/lib/lipsync";
import { BEWEGING_MODEL, TEKST_VIDEO_MODEL, TREND_VIDEOMODEL, heeftScene, type Trend, type TrendFormaat } from "./types";

export const SCENE_MODEL_MET_FOTO = "fal-ai/nano-banana-pro/edit";
export const SCENE_MODEL_ZONDER_FOTO = "fal-ai/nano-banana-pro";

const ZELFDE_PERSOON =
  "Keep the person's face, identity, age, skin tone and hairstyle exactly recognizable as the person in the reference photo.";

export interface KlantInvoer {
  fotos: string[];
  tekst: string;
}

export interface FalStap {
  endpoint: string;
  invoer: Record<string, unknown>;
}

/**
 * {tekst} in de opdracht wordt wat de klant typte. Staat er geen {tekst} in maar typte de
 * klant wel iets, dan hangt het erachter: anders verdween zijn invulling stilletjes.
 */
export function vulTekst(prompt: string, tekst: string): string {
  const t = tekst.replace(/"/g, "'").trim();
  if (prompt.includes("{tekst}")) return prompt.replaceAll("{tekst}", t);
  return t ? `${prompt} Details from the user: ${t}` : prompt;
}

function formaat(t: Trend): TrendFormaat {
  return t.opdracht.formaat ?? "9:16";
}

/** De eerste stap: het bewerkte beeld (scène). Alleen als de methode er een heeft. */
export function sceneStap(t: Trend, k: KlantInvoer): FalStap | null {
  if (!heeftScene(t.methode, t.opdracht)) return null;
  const basis = vulTekst(t.opdracht.scenePrompt ?? "", k.tekst);
  if (k.fotos.length === 0) {
    return {
      endpoint: SCENE_MODEL_ZONDER_FOTO,
      invoer: { prompt: basis, aspect_ratio: formaat(t), num_images: 1, output_format: "jpeg", resolution: "2K" },
    };
  }
  // De beweging- en playbackmodellen hebben een heel lichaam of een duidelijk gezicht
  // nodig; zonder die zin sneed Nano Banana de persoon soms af of draaide hem weg.
  const lichaam =
    t.methode === "beweging"
      ? " Show the person's full body from head to toe, standing, clearly separated from the background, arms and legs fully visible."
      : t.methode === "pratend"
        ? " The face is clearly visible, facing the camera, mouth closed and relaxed."
        : "";
  return {
    endpoint: SCENE_MODEL_MET_FOTO,
    invoer: {
      prompt: `${basis}${lichaam}${t.gezicht ? ` ${ZELFDE_PERSOON}` : ""}`,
      image_urls: k.fotos,
      aspect_ratio: formaat(t),
      num_images: 1,
      output_format: "jpeg",
      resolution: "2K",
    },
  };
}

/**
 * De tweede (of enige) stap: de video. `beeld` is de scène uit stap 1, of anders de foto
 * van de klant. Null bij een beeldtrend (dan is de scène het eindresultaat).
 */
export function videoStap(t: Trend, k: KlantInvoer, beeld: string | null): FalStap | null {
  const beweging = vulTekst(t.opdracht.bewegingPrompt ?? "", k.tekst);
  switch (t.methode) {
    case "foto":
    case "tekst-foto":
      return null;
    case "foto-video":
    case "video-effect": {
      const model = videoModel(TREND_VIDEOMODEL);
      return { endpoint: model.slug, invoer: model.invoer({ image_url: beeld ?? k.fotos[0], prompt: beweging }) };
    }
    case "tekst-video":
      return { endpoint: TEKST_VIDEO_MODEL, invoer: { prompt: beweging, duration: "5", aspect_ratio: formaat(t) } };
    case "beweging":
      return {
        endpoint: BEWEGING_MODEL,
        invoer: {
          image_url: beeld ?? k.fotos[0],
          video_url: t.voorbeeldclip,
          // 'video': de houding volgt de trendvideo; beter bij snelle, ingewikkelde bewegingen
          // (een dansje, een omhaal) dan de stand van de foto.
          character_orientation: "video",
          // Het geluid van de trend hoort erbij: zonder de muziek herkent niemand hem.
          keep_original_sound: true,
          ...(beweging ? { prompt: beweging } : {}),
        },
      };
    case "pratend":
      return {
        endpoint: LIPSYNC_MODEL,
        invoer: { image_url: beeld ?? k.fotos[0], audio_url: t.geluid, ...(beweging ? { prompt: beweging } : {}) },
      };
  }
}
