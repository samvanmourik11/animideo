// UGC-STUDIO — AI-creators die over je product of dienst praten, zoals een echte klant
// op TikTok of Instagram. Client-veilig: het maakscherm rekent hier de prijs mee uit.
//
// Hoe het loopt: product of dienst → creator kiezen → AI schrijft een UGC-script (haak,
// ervaring, oproep) in stukjes → per stukje een selfie-beeld van de creator (met je
// product) + de stem → lipsync (of een B-roll-clip van het product) → montage met
// meelopende ondertitels. Eén item in de bibliotheek (lib/ugc/regie.ts).

import { CREDIT_COSTS, INKOOP_USD, creditsVoorInkoop } from "@/lib/credit-costs";
import { videoModel } from "@/lib/video-modellen";
import { lipsyncCredits } from "@/lib/lipsync";

export interface Creator {
  id: string;
  naam: string;
  /** Eén regel voor de klant: "28, enthousiast, houdt van koken". */
  omschrijving: string;
  portretUrl: string;
  /** ElevenLabs-stem (voice-id of naam), zie UGC_STEMMEN. */
  stem: string;
  /** Hoe deze creator praat; gaat mee naar het script. */
  persona: string;
  /** true = door de klant zelf gemaakt (een creatie met maker 'ugc-creator'). */
  eigen?: boolean;
}

/** De Nederlandse volwassen stemmen die bij een creator passen. */
export const UGC_STEMMEN: { id: string; naam: string; omschrijving: string; geslacht: "man" | "vrouw" }[] = [
  { id: "kZQ3IGqYUStQ8u1Y62s6", naam: "Lieke", omschrijving: "levendig, social-media", geslacht: "vrouw" },
  { id: "7qdUFMklKPaaAVMsBTBt", naam: "Roos", omschrijving: "helder en zelfverzekerd", geslacht: "vrouw" },
  { id: "6e6TrJGLhrDGMKOy5x2i", naam: "Noa", omschrijving: "fris en jong", geslacht: "vrouw" },
  { id: "qpYcCnnbKrqp5HBM19ou", naam: "Mia", omschrijving: "vriendelijk en rustig", geslacht: "vrouw" },
  { id: "XCOm4Hr4NoqIsKeVFU2y", naam: "Linda", omschrijving: "warm en professioneel", geslacht: "vrouw" },
  { id: "46eAUFOjYHnAbq9XpWMc", naam: "Anne", omschrijving: "vriendelijk en zorgzaam", geslacht: "vrouw" },
  { id: "tfweP7lGJyLeNV9dH1Rm", naam: "Marianne", omschrijving: "warme oudere stem", geslacht: "vrouw" },
  { id: "rbqBOMK4BPTMGvIB7N8w", naam: "Hugo", omschrijving: "enthousiast en verkopend", geslacht: "man" },
  { id: "SFlhmoT9q6x81D3fl3dp", naam: "Daan", omschrijving: "energiek en jong", geslacht: "man" },
  { id: "YWWzyiP9IlB03CVK6QXN", naam: "Niels", omschrijving: "casual, alledaags", geslacht: "man" },
  { id: "MkRWZTk4OBui6Jb2lgK0", naam: "Ruben", omschrijving: "jong en ontspannen", geslacht: "man" },
  { id: "yGnXd97Wft6RDkIaLXiR", naam: "Pepijn", omschrijving: "rustig en zakelijk", geslacht: "man" },
  { id: "2GJZCZIWrWiGFDntCFaz", naam: "Bram", omschrijving: "diep en betrouwbaar", geslacht: "man" },
];

export function isUgcStem(id: unknown): id is string {
  return UGC_STEMMEN.some((s) => s.id === id);
}

export const UGC_LENGTES = [
  { sec: 15, naam: "15 sec", uitleg: "Kort en krachtig, voor ads", stukjes: 3 },
  { sec: 30, naam: "30 sec", uitleg: "Ervaring + voordelen", stukjes: 5 },
  { sec: 45, naam: "45 sec", uitleg: "Uitleg over een dienst", stukjes: 7 },
] as const;
export type UgcLengte = (typeof UGC_LENGTES)[number]["sec"];

/** Een stukje van het script: de creator praat in beeld, of het product in beeld terwijl de stem doorloopt. */
export interface UgcStukje {
  soort: "praat" | "broll";
  /** Wat er gezegd wordt (Nederlands, spreektaal). */
  tekst: string;
  /** Wat we zien, in gewoon Nederlands: dit leest de klant. */
  uitleg: string;
  /** Wat we zien, in het Engels: voor het beeldmodel. */
  beeld: string;
}

export interface UgcScript {
  stukjes: UgcStukje[];
}

/** Hoe snel de stemmen ongeveer praten. Gebruikt voor de prijs en de lengte vooraf. */
export const WOORDEN_PER_SEC = 2.4;

export function geschatteSec(tekst: string): number {
  const woorden = tekst.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1.5, woorden / WOORDEN_PER_SEC + 0.3);
}

/** Het videomodel van een B-roll-shot (product in beweging, zonder praten). */
export const UGC_BROLL_MODEL = "kling-2-5";

/** Wat één stukje kost: beeld + stem + lipsync (naar lengte) of een B-roll-clip. */
export function stukjeCredits(s: Pick<UgcStukje, "soort" | "tekst">): number {
  // De stem naar lengte: een zin van een paar woorden kost bij ElevenLabs een fractie van een cent.
  const basis = CREDIT_COSTS.IMAGE_GENERATION_PRO + creditsVoorInkoop((s.tekst.length / 1000) * INKOOP_USD.stemPer1000);
  return basis + (s.soort === "broll" ? videoModel(UGC_BROLL_MODEL).credits : lipsyncCredits(geschatteSec(s.tekst)));
}

export function ugcCredits(script: UgcScript): number {
  return script.stukjes.reduce((som, s) => som + stukjeCredits(s), 0);
}

/** Ruwe schatting vóór er een script is, voor op de knop. */
export function geschatteUgcCredits(sec: UgcLengte, broll: boolean): number {
  const stukjes = UGC_LENGTES.find((l) => l.sec === sec)!.stukjes;
  const brolls = broll ? Math.floor(stukjes / 3) : 0;
  const perPraat = Math.round(sec / stukjes) || 5;
  const praat = { soort: "praat" as const, tekst: "woord ".repeat(Math.round(perPraat * WOORDEN_PER_SEC)) };
  const b = { soort: "broll" as const, tekst: "" };
  return (stukjes - brolls) * stukjeCredits(praat) + brolls * stukjeCredits(b);
}

export type UgcStap = "voorbereiden" | "video" | "monteren";

export const UGC_STAP_LABEL: Record<UgcStap, string> = {
  voorbereiden: "Stap 1 van 3: beelden en stem…",
  video: "Stap 2 van 3: de creator gaat praten…",
  monteren: "Stap 3 van 3: ondertitels en montage…",
};
