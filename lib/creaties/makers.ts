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
import { portretPrompt } from "@/lib/ugc/creators";
import { isUgcStem } from "@/lib/ugc/types";
import { EIGEN, KLOON_CREDITS, voiceOverCredits } from "@/lib/stem/types";
import { LIPSYNC_MODEL, LIPSYNC_MAX_SEC, lipsyncCredits } from "@/lib/lipsync";

export const FORMATEN = ["1:1", "9:16", "16:9"] as const;
export type Formaat = (typeof FORMATEN)[number];

export interface BeeldInvoer {
  prompt: string;
  formaat: Formaat;
  kwaliteit: "standaard" | "pro";
  /** Eigen foto als voorbeeld (persoon, product, stijl). Leeg = vrij tekenen. */
  referentieUrl?: string;
  /** Meerdere voorbeelden tegelijk (de Regisseur: personage + product in één shot). */
  referentieUrls?: string[];
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

export type MakerId =
  | "beeld"
  | "beeld-naar-video"
  | "tekst-naar-video"
  | "bewerk"
  | "upscale"
  | "achtergrond-weg"
  | "gezicht"
  | "belichting"
  | "ugc-creator"
  | "voice-over"
  | "stem-kloon"
  | "pratende-foto";

/** De bewerkknoppen onder een beeld, in de volgorde waarin ze op het scherm staan. */
export const BEWERKINGEN: { maker: MakerId; label: string; icoon: string; uitleg: string; credits: number }[] = [
  { maker: "upscale", label: "Scherper", icoon: "🔍", uitleg: "Twee keer zo groot en scherper", credits: CREDIT_COSTS.UPSCALE },
  { maker: "achtergrond-weg", label: "Achtergrond weg", icoon: "✂️", uitleg: "Alleen het onderwerp, doorzichtige achtergrond", credits: CREDIT_COSTS.ENHANCE },
  { maker: "gezicht", label: "Gezicht verbeteren", icoon: "🙂", uitleg: "Scherpere, natuurlijke gezichten", credits: CREDIT_COSTS.ENHANCE },
  { maker: "belichting", label: "Ander licht", icoon: "💡", uitleg: "Licht van links, rechts, boven of onder", credits: CREDIT_COSTS.ENHANCE },
];

export const LICHTRICHTINGEN = [
  { id: "Left", label: "Van links" },
  { id: "Right", label: "Van rechts" },
  { id: "Top", label: "Van boven" },
  { id: "Bottom", label: "Van onder" },
] as const;

// Zonder bewegingsopdracht maakte Seedance van een stilstaand beeld soms een wilde
// camerarit; een rustige standaard geeft bij de meeste beelden het mooiste resultaat.
const STANDAARD_BEWEGING = "Subtle, natural motion. Gentle camera movement. Keep the subject and style consistent.";

const MAX_PROMPT = 2000;

function tekst(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function formaatUit(v: unknown, standaard: Formaat = "1:1"): Formaat {
  return (FORMATEN as readonly string[]).includes(v as string) ? (v as Formaat) : standaard;
}

function bron(ruw: Record<string, unknown>): string {
  const url = tekst(ruw.bronUrl);
  if (!/^https:\/\//.test(url)) throw new Error("Kies eerst een beeld.");
  return url;
}

/**
 * Leest en controleert de invoer van een maker. Gooit met een Nederlandse melding als er
 * iets niet klopt; die gaat zo naar het scherm.
 */
export function maakOpdracht(maker: string, ruw: Record<string, unknown>): Opdracht {
  if (maker === "beeld") {
    const prompt = tekst(ruw.prompt).slice(0, MAX_PROMPT);
    if (!prompt) throw new Error("Schrijf eerst wat je wilt zien.");
    const formaat = formaatUit(ruw.formaat);
    const kwaliteit = ruw.kwaliteit === "pro" ? "pro" : "standaard";
    const ref = tekst(ruw.referentieUrl);
    const referentieUrl = /^https:\/\//.test(ref) ? ref : "";
    const extra = (Array.isArray(ruw.referentieUrls) ? ruw.referentieUrls : []).map(tekst).filter((u) => /^https:\/\//.test(u));
    const refs = [...new Set([referentieUrl, ...extra].filter(Boolean))].slice(0, 4);
    const invoer: BeeldInvoer = { prompt, formaat, kwaliteit, ...(referentieUrl ? { referentieUrl } : {}), ...(extra.length ? { referentieUrls: refs } : {}) };
    // Met een eigen foto erbij gaat het via de bewerk-variant: die neemt het voorbeeld
    // mee (dezelfde persoon, hetzelfde product), de gewone variant kan dat niet.
    const basis = kwaliteit === "pro" ? "fal-ai/nano-banana-pro" : "fal-ai/nano-banana";
    return {
      soort: "beeld",
      endpoint: refs.length ? `${basis}/edit` : basis,
      falInvoer: {
        prompt,
        aspect_ratio: formaat,
        num_images: 1,
        output_format: "jpeg",
        ...(kwaliteit === "pro" ? { resolution: "2K" } : {}),
        ...(refs.length ? { image_urls: refs } : {}),
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
    const invoer: VideoInvoer & { formaat?: Formaat } = {
      bronUrl,
      prompt,
      model: model.id,
      ...(ruw.formaat ? { formaat: formaatUit(ruw.formaat) } : {}),
    };
    return {
      soort: "video",
      endpoint: model.slug,
      falInvoer: model.invoer({ image_url: bronUrl, prompt: prompt || STANDAARD_BEWEGING }),
      credits: model.credits,
      prompt,
      invoer: { ...invoer },
    };
  }

  if (maker === "tekst-naar-video") {
    const prompt = tekst(ruw.prompt).slice(0, MAX_PROMPT);
    if (!prompt) throw new Error("Schrijf eerst wat er in de video moet gebeuren.");
    const formaat = formaatUit(ruw.formaat, "16:9");
    return {
      soort: "video",
      endpoint: "fal-ai/bytedance/seedance/v1/lite/text-to-video",
      // Maxims testronde: een gevraagd bord kreeg een spelfout en er verscheen een tweede bord
      // met onzinletters. Geen extra tekst vragen helpt tegen dat tweede bord.
      falInvoer: { prompt: `${prompt}\n\nNo signs, captions or text other than what is described above.`, aspect_ratio: formaat, duration: "5", resolution: "720p" },
      credits: CREDIT_COSTS.VIDEO_GENERATION,
      prompt,
      invoer: { prompt, formaat },
    };
  }

  // De bewerkingen hieronder werken op een bestaand beeld. Het formaat van het bronbeeld
  // gaat mee in de invoer, zodat de tegel in de bibliotheek de goede vorm houdt.
  if (maker === "bewerk") {
    const bronUrl = bron(ruw);
    const prompt = tekst(ruw.prompt).slice(0, MAX_PROMPT);
    if (!prompt) throw new Error("Schrijf eerst wat er anders moet.");
    const kwaliteit = ruw.kwaliteit === "pro" ? "pro" : "standaard";
    const formaat = formaatUit(ruw.formaat);
    return {
      soort: "beeld",
      endpoint: kwaliteit === "pro" ? "fal-ai/nano-banana-pro/edit" : "fal-ai/nano-banana/edit",
      falInvoer: {
        // Zonder deze zin tekende het model bij een kleine wijziging soms een heel nieuw beeld.
        prompt: `${prompt}. Keep everything else in the image exactly the same: composition, people, style and colors.`,
        image_urls: [bronUrl],
        num_images: 1,
        output_format: "jpeg",
      },
      credits: beeldCredits(kwaliteit),
      prompt,
      invoer: { bronUrl, prompt, kwaliteit, formaat },
    };
  }

  if (maker === "upscale") {
    const bronUrl = bron(ruw);
    const formaat = formaatUit(ruw.formaat);
    return {
      soort: "beeld",
      endpoint: "fal-ai/clarity-upscaler",
      falInvoer: {
        image_url: bronUrl,
        upscale_factor: 2,
        creativity: 0.35,
        resemblance: 1.5,
        prompt: "masterpiece, best quality, highres",
      },
      credits: CREDIT_COSTS.UPSCALE,
      prompt: "Scherper gemaakt",
      invoer: { bronUrl, formaat },
    };
  }

  if (maker === "achtergrond-weg") {
    const bronUrl = bron(ruw);
    const formaat = formaatUit(ruw.formaat);
    return {
      soort: "beeld",
      endpoint: "fal-ai/birefnet",
      falInvoer: { image_url: bronUrl },
      credits: CREDIT_COSTS.ENHANCE,
      prompt: "Achtergrond verwijderd",
      invoer: { bronUrl, formaat },
    };
  }

  if (maker === "gezicht") {
    const bronUrl = bron(ruw);
    const formaat = formaatUit(ruw.formaat);
    return {
      soort: "beeld",
      endpoint: "fal-ai/codeformer",
      falInvoer: { image_url: bronUrl, fidelity: 0.7, upscale_factor: 1, face_upscale: true },
      credits: CREDIT_COSTS.ENHANCE,
      prompt: "Gezicht verbeterd",
      invoer: { bronUrl, formaat },
    };
  }

  if (maker === "belichting") {
    const bronUrl = bron(ruw);
    const formaat = formaatUit(ruw.formaat);
    const richting = LICHTRICHTINGEN.some((r) => r.id === ruw.richting) ? (ruw.richting as string) : "Left";
    const label = LICHTRICHTINGEN.find((r) => r.id === richting)!.label.toLowerCase();
    return {
      soort: "beeld",
      endpoint: "fal-ai/iclight-v2",
      falInvoer: {
        image_url: bronUrl,
        prompt: "same image, same style, natural consistent lighting",
        initial_latent: richting,
        // Zonder vaste maat maakt IC-Light er een vierkant van en trekt hij het beeld scheef.
        image_size: formaat === "9:16" ? "portrait_16_9" : formaat === "16:9" ? "landscape_16_9" : "square_hd",
        num_images: 1,
        output_format: "jpeg",
      },
      credits: CREDIT_COSTS.ENHANCE,
      prompt: `Licht ${label}`,
      invoer: { bronUrl, formaat, richting },
    };
  }

  // Een eigen UGC-creator: een portret uit een beschrijving, met een vaste stem erbij.
  if (maker === "ugc-creator") {
    const naam = tekst(ruw.naam).slice(0, 30);
    const beschrijving = tekst(ruw.beschrijving).slice(0, 300);
    if (!naam) throw new Error("Geef je creator een naam.");
    if (beschrijving.length < 10) throw new Error("Beschrijf je creator iets uitgebreider (leeftijd, uiterlijk, kleding).");
    if (!isUgcStem(ruw.stem)) throw new Error("Kies een stem.");
    return {
      soort: "beeld",
      endpoint: "fal-ai/nano-banana-pro",
      falInvoer: {
        // Regels vooraf: altijd een verzonnen persoon, nooit een bekend gezicht.
        prompt: portretPrompt(`a fictional AI-generated person (not resembling any real celebrity or public figure): ${beschrijving}`),
        aspect_ratio: "9:16",
        num_images: 1,
        output_format: "jpeg",
        resolution: "2K",
      },
      credits: CREDIT_COSTS.IMAGE_GENERATION_PRO,
      prompt: `Creator: ${naam}`,
      invoer: { naam, beschrijving, stem: ruw.stem, formaat: "9:16" },
    };
  }

  // Voice-over: een bibliotheekstem (ElevenLabs via fal) of een eigen stem (MiniMax). Een
  // eigen stem heeft de wachtrij al opgezocht (minimaxVoiceId), nooit uit de browser.
  if (maker === "voice-over") {
    const tekstIn = tekst(ruw.tekst).slice(0, 5000);
    if (!tekstIn) throw new Error("Typ eerst wat er gezegd moet worden.");
    const stemId = tekst(ruw.stemId);
    if (!stemId) throw new Error("Kies eerst een stem.");
    const snelheid = Math.min(1.5, Math.max(0.7, Number(ruw.snelheid) || 1));
    const naam = tekst(ruw.stemNaam).slice(0, 40);
    // Elke taalcode die ElevenLabs kent (de stemkiezer biedt alleen de gecontroleerde talen aan).
    const taal = /^[a-z]{2,3}$/.test(String(ruw.taal)) ? String(ruw.taal) : "nl";
    const invoer = { tekst: tekstIn, stemId, stemNaam: naam, snelheid, taal };
    const prompt = `${naam ? `${naam}: ` : ""}${tekstIn.slice(0, 140)}`;
    if (stemId.startsWith(EIGEN)) {
      const voiceId = tekst(ruw.minimaxVoiceId);
      if (!voiceId) throw new Error("Deze eigen stem is niet (meer) beschikbaar.");
      return {
        soort: "audio",
        endpoint: "fal-ai/minimax/speech-02-hd",
        falInvoer: { text: tekstIn, voice_setting: { voice_id: voiceId, speed: snelheid }, language_boost: ({ nl: "Dutch", en: "English", de: "German", fr: "French", es: "Spanish" } as Record<string, string>)[taal] ?? "auto", output_format: "url" },
        credits: voiceOverCredits(tekstIn),
        prompt,
        invoer,
      };
    }
    return {
      soort: "audio",
      endpoint: "fal-ai/elevenlabs/tts/eleven-v3",
      falInvoer: { text: tekstIn, voice: stemId, language_code: taal, stability: 0.5, similarity_boost: 0.75, speed: snelheid },
      credits: voiceOverCredits(tekstIn),
      prompt,
      invoer,
    };
  }

  // Je eigen stem trainen. De gebruiker bevestigt dat het zijn eigen stem is (of dat hij
  // toestemming heeft): regels vooraf, geen controle achteraf.
  if (maker === "stem-kloon") {
    const naam = tekst(ruw.naam).slice(0, 40);
    const audioUrl = tekst(ruw.audioUrl);
    if (!naam) throw new Error("Geef je stem een naam.");
    if (!/^https:\/\//.test(audioUrl)) throw new Error("Neem eerst iets op of upload een opname.");
    if (ruw.toestemming !== true) throw new Error("Bevestig eerst dat dit je eigen stem is, of dat je toestemming hebt.");
    return {
      soort: "audio",
      endpoint: "fal-ai/minimax/voice-clone",
      falInvoer: {
        audio_url: audioUrl,
        noise_reduction: true,
        need_volume_normalization: true,
        model: "speech-02-hd",
        text: "Hallo! Dit is mijn eigen stem, gemaakt met Animideo. Klinkt goed, toch?",
      },
      credits: KLOON_CREDITS,
      prompt: `Eigen stem: ${naam}`,
      invoer: { naam, audioUrl, toestemming: true },
    };
  }

  // Pratende foto: foto + geluid → lipsync. De duur van het geluid heeft de wachtrij al
  // gemeten (de prijs hangt ervan af); de browser mag die niet opgeven.
  if (maker === "pratende-foto") {
    const fotoUrl = tekst(ruw.fotoUrl);
    const audioUrl = tekst(ruw.audioUrl);
    if (!/^https:\/\//.test(fotoUrl)) throw new Error("Kies eerst een foto.");
    if (!/^https:\/\//.test(audioUrl)) throw new Error("Kies eerst een voice-over of opname.");
    if (ruw.toestemming !== true) throw new Error("Bevestig eerst dat je toestemming hebt van wie er op de foto staat.");
    const sec = Number(ruw.audioSec);
    if (!(sec > 0)) throw new Error("De lengte van het geluid kon niet worden bepaald.");
    if (sec > LIPSYNC_MAX_SEC) throw new Error(`Het geluid is te lang: maximaal ${LIPSYNC_MAX_SEC} seconden.`);
    const aanwijzing = tekst(ruw.aanwijzing).slice(0, 300);
    return {
      soort: "video",
      endpoint: LIPSYNC_MODEL,
      falInvoer: { image_url: fotoUrl, audio_url: audioUrl, ...(aanwijzing ? { prompt: aanwijzing } : {}) },
      credits: lipsyncCredits(sec),
      prompt: `Pratende foto (${Math.round(sec)} s)`,
      invoer: { fotoUrl, audioUrl, audioSec: sec, toestemming: true, formaat: tekst(ruw.formaat) || "9:16", ...(aanwijzing ? { aanwijzing } : {}) },
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
  // De meeste beeldmodellen geven een lijst, de bewerkmodellen (upscale, achtergrond) één beeld.
  if (soort === "beeld") return d?.images?.[0]?.url ?? (d as { image?: { url?: string } })?.image?.url ?? null;
  if (soort === "video") return d?.video?.url ?? null;
  return d?.audio?.url ?? null;
}

/** Leesbare naam van het model, voor in de bibliotheek. */
export function modelNaam(endpoint: string | null | undefined): string {
  if (!endpoint) return "Onbekend";
  if (endpoint === "fal-ai/nano-banana") return "Nano Banana";
  if (endpoint === "fal-ai/nano-banana-pro") return "Nano Banana Pro";
  const namen: Record<string, string> = {
    "fal-ai/nano-banana/edit": "Nano Banana (bewerken)",
    "fal-ai/nano-banana-pro/edit": "Nano Banana Pro (bewerken)",
    "fal-ai/clarity-upscaler": "Clarity Upscaler",
    "fal-ai/birefnet": "BiRefNet",
    "fal-ai/codeformer": "CodeFormer",
    "fal-ai/iclight-v2": "IC-Light",
    "fal-ai/bytedance/seedance/v1/lite/text-to-video": "Seedance Lite (tekst)",
    reclame: "Link → reclame",
    ugc: "UGC-studio",
    trailer: "Trailerstudio",
    montage: "Montage (Regisseur)",
    trend: "Trends-studio",
    "fal-ai/elevenlabs/tts/eleven-v3": "ElevenLabs v3",
    "fal-ai/minimax/speech-02-hd": "Eigen stem (MiniMax)",
    "fal-ai/minimax/voice-clone": "Stem trainen (MiniMax)",
    "fal-ai/kling-video/ai-avatar/v2/standard": "Kling Avatar (lipsync)",
  };
  if (namen[endpoint]) return namen[endpoint];
  return VIDEO_MODELLEN.find((m) => m.slug === endpoint)?.naam ?? endpoint;
}
