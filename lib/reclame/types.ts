// LINK → RECLAME — wat de klant ziet en kiest. Client-veilig: het maakscherm rekent er
// de prijs mee uit. Het echte werk (pagina lezen, script, regie, montage) staat in de
// andere bestanden in deze map, alleen op de server.
//
// Hoe het loopt: link plakken → wij lezen de productpagina → AI schrijft drie shots met
// voice-over → klant past aan en klikt Maak → drie reclamebeelden met het échte product
// → die worden clips → Hugo spreekt de tekst in → montage met muziek, tekst in beeld en
// een eindkaart in de merkkleur. Eén item in de bibliotheek dat vanzelf door de stappen
// loopt (lib/reclame/regie.ts).

import { CREDIT_COSTS } from "@/lib/credit-costs";
import { videoModel } from "@/lib/video-modellen";

/** Wat we van de productpagina halen; de klant kan alles nog aanpassen. */
export interface Product {
  naam: string;
  merk: string;
  /** Eén of twee zinnen: wat is het, voor wie. */
  omschrijving: string;
  /** Drie korte voordelen, in gewone taal. */
  voordelen: string[];
  /** Zoals hij op de site staat ("€ 49,95"), of leeg. */
  prijs: string;
  /** Merkkleur als #rrggbb, voor de tekstbalkjes en de eindkaart. */
  kleur: string;
  /** Het domein voor op de eindkaart ("koffiebar.nl"). */
  website: string;
  /** Gevonden productfoto's, beste eerst. */
  fotos: string[];
}

export interface Shot {
  /** Wat er te zien is, in gewoon Nederlands: dit leest de klant. */
  uitleg: string;
  /** Wat er in beeld moet komen (Engels, voor het beeldmodel). */
  beeld: string;
  /** Wat er beweegt (Engels, voor het videomodel). */
  beweging: string;
  /** Tekst in beeld, Nederlands, kort. */
  tekst: string;
}

export interface Plan {
  shots: Shot[];
  /** Wat Hugo zegt, Nederlands, ±15 seconden. */
  voiceover: string;
  /** De grote regel op de eindkaart, bv. "Nu met 20% korting". */
  eindtekst: string;
}

export const STIJLEN = [
  { id: "strak", naam: "Strak & premium", uitleg: "Studio, zacht licht, rustige camera. Voor mooie producten.", icoon: "💎" },
  { id: "lifestyle", naam: "In het echte leven", uitleg: "Je product in gebruik, in een herkenbare Nederlandse omgeving.", icoon: "🏡" },
  { id: "speels", naam: "Vrolijk & social", uitleg: "Felle kleuren, snelle beweging. Voor Instagram en TikTok.", icoon: "🎉" },
] as const;
export type StijlId = (typeof STIJLEN)[number]["id"];

export function isStijl(v: unknown): v is StijlId {
  return STIJLEN.some((s) => s.id === v);
}

export const RECLAME_FORMATEN = [
  { id: "9:16", naam: "Staand", uitleg: "Reels, TikTok, Stories" },
  { id: "1:1", naam: "Vierkant", uitleg: "Feed van Instagram en Facebook" },
  { id: "16:9", naam: "Liggend", uitleg: "YouTube, website" },
] as const;
export type ReclameFormaat = (typeof RECLAME_FORMATEN)[number]["id"];

export const AANTAL_SHOTS = 3;

/**
 * Het videomodel van de shots. Kling 2.5 beweegt het mooist en houdt het product het
 * best intact (~$0,35 per clip). Seedance Lite is de helft goedkoper maar vervormde
 * etiketten en logo's vaker — en daar draait een reclame om.
 */
export const RECLAME_VIDEOMODEL = "kling-2-5";

/** Prijs van één reclame: drie Pro-beelden, drie clips en de voice-over. */
export const RECLAME_CREDITS =
  AANTAL_SHOTS * CREDIT_COSTS.IMAGE_GENERATION_PRO +
  AANTAL_SHOTS * videoModel(RECLAME_VIDEOMODEL).credits +
  CREDIT_COSTS.VOICE;

/** Hoe ver een reclame is; voor de tegel in de bibliotheek. */
export type ReclameStap = "beelden" | "clips" | "monteren";

export const STAP_LABEL: Record<ReclameStap, string> = {
  beelden: "Stap 1 van 3: beelden maken…",
  clips: "Stap 2 van 3: beelden tot leven brengen…",
  monteren: "Stap 3 van 3: stem, muziek en montage…",
};
