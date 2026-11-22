// Kanaalprofielen voor de docu-studio (verbeterplan idee 12): wie een vaste reeks maakt,
// bewaart één keer naam, kleur, taal, verteller, muziek, stijl en ondertitels, en plant de
// volgende afleveringen. Bewaard in de gebruikersgegevens van het account (user_metadata),
// zodat er geen nieuwe tabel nodig is; zo werkt het ook op een andere computer.
import { MOTION_TALEN, isMotionTaal, isMuziekVolume, isOndertitels, type MotionTaal, type MotionOndertitels, type MuziekVolume } from "@/lib/motion/types";

export const DOCU_STIJLEN = [
  { id: "archief", naam: "Archief", uitleg: "Inktzwart, papierwit, één rood", kleuren: ["#111113", "#f3efe6", "#e3342f"] },
  { id: "krant", naam: "Krant", uitleg: "Krantenpapier en zwarte inkt", kleuren: ["#efe8da", "#1a1714", "#b3261e"] },
  { id: "truecrime", naam: "True crime", uitleg: "Nachtblauw en koud licht", kleuren: ["#0a1018", "#e6edf5", "#5ab8ff"] },
] as const;
export type DocuStijl = (typeof DOCU_STIJLEN)[number]["id"];
export const isDocuStijl = (v: unknown): v is DocuStijl => DOCU_STIJLEN.some((s) => s.id === v);

export interface Aflevering {
  onderwerp: string;
  gemaakt?: boolean;
}

export interface KanaalProfiel {
  id: string;
  naam: string;
  kleur: string;
  taal: MotionTaal;
  stem: string;
  muziek: string;
  muziekVolume: MuziekVolume;
  stijl: DocuStijl;
  ondertitels: MotionOndertitels;
  short: boolean;
  reeks: Aflevering[];
}

export const MAX_KANALEN = 10;
export const MAX_AFLEVERINGEN = 30;

const tekst = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** Controleert wat het scherm stuurt (of wat er bewaard staat). Onbruikbare profielen vallen weg. */
export function leesKanalen(ruw: unknown): KanaalProfiel[] {
  if (!Array.isArray(ruw)) return [];
  return ruw.slice(0, MAX_KANALEN).flatMap((k): KanaalProfiel[] => {
    const o = (k ?? {}) as Record<string, unknown>;
    const naam = tekst(o.naam, 40);
    if (!naam) return [];
    return [{
      id: typeof o.id === "string" && /^[a-z0-9-]{4,40}$/i.test(o.id) && o.id !== "undefined" ? o.id : Math.random().toString(36).slice(2, 10),
      naam,
      kleur: /^#[0-9a-f]{6}$/i.test(String(o.kleur)) ? String(o.kleur) : "#e3342f",
      taal: isMotionTaal(o.taal) ? o.taal : MOTION_TALEN[0].id,
      stem: tekst(o.stem, 40),
      muziek: tekst(o.muziek, 60),
      muziekVolume: isMuziekVolume(o.muziekVolume) ? o.muziekVolume : "normaal",
      stijl: isDocuStijl(o.stijl) ? o.stijl : "archief",
      ondertitels: isOndertitels(o.ondertitels) && o.ondertitels !== "woord" ? o.ondertitels : "uit",
      short: o.short !== false,
      reeks: (Array.isArray(o.reeks) ? o.reeks : []).slice(0, MAX_AFLEVERINGEN).flatMap((a) => {
        const x = (a ?? {}) as Record<string, unknown>;
        const onderwerp = tekst(x.onderwerp, 300);
        return onderwerp ? [{ onderwerp, gemaakt: x.gemaakt === true }] : [];
      }),
    }];
  });
}
