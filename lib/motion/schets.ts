// Gratis schetsbeelden per scene vóór betalen (public/motion/schets.js). De server maakt de
// pagina; de browser van de klant tekent de beelden (components/motion/Schetsen.tsx).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { paginaHtml } from "./pagina";
import { formaatMaat, motionFont, type MotionFormaat, type MotionPlan } from "./types";
import type { WhisperWord } from "@/lib/openai";

const WPS = 2.1;
const D = 0.3;

const ICONEN: [RegExp, string][] = [
  [/\b(probleem|fout|sloop|failliet|gevaar|crisis|ramp|protest|lelijk|gehaat|monster|boos)/i, "uitroep"],
  [/\b(radio|antenne|zend|signaal|podcast|stem|praat|zegt|spreek)/i, "spraak"],
  [/\b(euro|geld|prijs|kost|bedrag|omzet|winst|betal|salaris|loon|budget|€)/i, "euro"],
  [/\b(grafiek|groei|stijg|daal|cijfer|procent|%|resultaat|statistiek)/i, "grafiek"],
  [/\b(klok|tijd|uur|minuut|minuten|snel|wacht)/i, "klok"],
  [/\b(agenda|afspraak|datum|kalender|dag|week|maand|jaar|\d{4})/i, "kalender"],
  [/\b(telefoon|bel|app\b|mobiel)/i, "telefoon"],
  [/\b(laptop|computer|website|online|software|scherm|digitaal)/i, "laptop"],
  [/\b(team|mensen|klanten|medewerkers|collega|publiek|bezoekers|miljoen)/i, "team"],
  [/\b(huis|woning|thuis|wonen)/i, "huis"],
  [/\b(gebouw|toren|fabriek|kantoor|stad|bedrijf|winkelcentrum)/i, "gebouw"],
  [/\b(winkel|kopen|bestel|product)/i, "winkelwagen"],
  [/\b(veilig|beveilig|bescherm|risico|verzeker)/i, "schild"],
  [/\b(idee|oplossing|slim|uitvinding|plan)/i, "lamp"],
  [/\b(mail|bericht|brief|post)/i, "mail"],
  [/\b(wereld|land|internationaal|europa|reis)/i, "wereld"],
  [/\b(raket|lancering|start|ruimte|maan)/i, "raket"],
  [/\b(zorg|hart|liefde|gezond)/i, "hart"],
  [/\b(vraag|waarom|hoe|wat als)/i, "vraag"],
  [/\b(probleem|fout|sloop|failliet|gevaar|crisis|ramp|protest)/i, "uitroep"],
  [/\b(document|contract|dossier|papier|formulier)/i, "doc"],
  [/\b(goed|klaar|gelukt|zeker|opgelost)/i, "vink"],
];

/** Woorden tussen aanhalingstekens in "Wat je ziet": die komen in beeld te staan. */
function geciteerd(beeld: string): string[] {
  const uit = [...beeld.matchAll(/['"‘’“”«]([^'"‘’“”»]{1,28})['"‘’“”»]/g)].map((m) => m[1].trim()).filter((t) => t && !/^s\b/.test(t));
  return [...new Set(uit)];
}

export function schetsSpec(plan: MotionPlan) {
  return plan.scenes.map((s, i) => {
    const labels = geciteerd(s.beeld);
    const getal = labels.find((l) => /^[€$]?\s?[\d.,]+\s?(%|jaar|km|m)?$/.test(l)) ?? (s.tekst.match(/\b\d{4}\b|\b\d+[.,]?\d*\s?%/)?.[0] ?? null);
    // Een woord tussen aanhalingstekens dat ook gesproken wordt, is vaak het moment waarop iets
    // verschijnt ("op 'gesloopt' slaat een stempel..."); wat níet gesproken wordt, staat in beeld.
    const woorden = new Set(s.tekst.toLowerCase().split(/[^\p{L}\p{N}]+/u));
    const gesproken = (l: string) => l.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).every((w) => woorden.has(w));
    const rest = labels.filter((l) => l !== getal).sort((a, b) => Number(gesproken(a)) - Number(gesproken(b)));
    if (!rest.length && s.kop) rest.push(s.kop);
    const tekst = `${s.beeld} ${s.tekst}`;
    const icoon = ICONEN.find(([re]) => re.test(tekst))?.[1] ?? "ster";
    return { id: `s${i + 1}`, kop: s.kop, labels: rest.slice(0, 2), getal, icoon };
  });
}

/** Nep-woordtijden (2,1 woorden per seconde) zodat de scenes hun plek krijgen zonder stem. */
function nepWoorden(plan: MotionPlan): { woorden: WhisperWord[]; tijden: number[] } {
  const woorden: WhisperWord[] = [];
  const tijden: number[] = [];
  let t = 0;
  for (const s of [...plan.scenes.map((x) => x.tekst), plan.eind.tekst]) {
    const ws = s.split(/\s+/).filter(Boolean);
    const begin = t;
    for (const w of ws) {
      woorden.push({ word: w, start: +t.toFixed(2), end: +(t + 0.4).toFixed(2) });
      t += 1 / WPS;
    }
    tijden.push(D + (begin + t) / 2);
    t += 0.3;
  }
  return { woorden, tijden: tijden.slice(0, plan.scenes.length) };
}

let lib: string | null = null;

export async function schetsPagina(o: { plan: MotionPlan; formaat: MotionFormaat; stijl: string; kleur: string; kleur2: string; font: string; bedrijf: string; website: string }) {
  lib ??= await readFile(path.join(process.cwd(), "public", "motion", "schets.js"), "utf8");
  const { w, h } = formaatMaat(o.formaat);
  const { woorden, tijden } = nepWoorden(o.plan);
  const scenes = schetsSpec(o.plan);
  const hfd: Record<string, string> = {};
  o.plan.scenes.forEach((s, i) => { if (s.kop) hfd[`s${i + 1}`] = s.kop; });
  const code = `${lib}\nwindow.VIDEO = schetsVideo(${JSON.stringify({ scenes, hfd })});\n`;
  const script: [string, string][] = [...o.plan.scenes.map((s, i) => [`s${i + 1}`, s.tekst] as [string, string]), ["eind", o.plan.eind.tekst]];
  const html = await paginaHtml(
    { w, h, woorden, script, merk: { naam: o.bedrijf, website: o.website, kleur: o.kleur, kleur2: o.kleur2, font: motionFont(o.font), logo: null }, stijl: o.stijl || null, code },
    { browser: true },
  );
  return { html, tijden, w, h };
}
