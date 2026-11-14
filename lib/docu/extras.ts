// HET YOUTUBE-PAKKET naast een docu: titels, beschrijving (met hoofdstuktijden, bronnen en
// fotovermelding), een thumbnail en het script voor de Short. Alleen op de server.
//
// De thumbnail is in code gemaakt, niet met een beeldmodel: de beste archieffoto, een donker
// verloop en een korte kop in grote letters met één woord in de accentkleur. Dat is de vorm
// van echte documentaire-thumbnails, en hij kost niets.

import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { launchBrowser } from "@/lib/browser";
import { claude, controleerPlan } from "@/lib/motion/plan";
import { kosten } from "@/lib/motion/animatie";
import { maxWoorden, taalNaam, type MotionPlan, type MotionTaal } from "@/lib/motion/types";
import { fotoCredit, type DocuFeit, type DocuFoto } from "./types";

const MODEL = "claude-opus-5-5";

const tekstUit = (m: Anthropic.Beta.BetaMessage) => m.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");

/** "1:05" of "12:30": zo leest YouTube een hoofdstuktijd. */
function tijd(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * De hoofdstukken: waar de kop van de scenes wisselt. YouTube toont ze alleen als het eerste
 * op 0:00 staat, er minstens drie zijn en elk minstens tien seconden duurt.
 */
export function hoofdstukRegels(plan: MotionPlan, starts: number[], taal: MotionTaal): string[] {
  const regels: { t: number; titel: string }[] = [{ t: 0, titel: "Intro" }];
  let vorige = "";
  plan.scenes.forEach((s, i) => {
    const kop = s.kop.replace(/^\d+\s*[·.:-]?\s*/, "").trim();
    if (!kop || s.kop === vorige) return;
    vorige = s.kop;
    const t = starts[i] ?? 0;
    if (t - regels[regels.length - 1].t < 10) {
      if (regels.length > 1) regels[regels.length - 1].titel = kop;
      return;
    }
    regels.push({ t, titel: kop });
  });
  return regels.length >= 3 ? regels.map((r) => `${tijd(r.t)} ${r.titel}`) : [];
}

export interface Pakket {
  titels: string[];
  beschrijving: string;
  /** De kop op de thumbnail (2 tot 4 woorden) en het woord daarin dat in de accentkleur komt. */
  thumbKop: string;
  thumbAccent: string;
  /** De foto voor de thumbnail (id), of leeg. */
  thumbFoto: string;
  usd: number;
}

const PAKKET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titels", "intro", "tags", "thumbKop", "thumbAccent", "thumbFoto"],
  properties: {
    titels: { type: "array", items: { type: "string" } },
    intro: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    thumbKop: { type: "string" },
    thumbAccent: { type: "string" },
    thumbFoto: { type: "string" },
  },
} as const;

/** De vaste kopjes in de YouTube-beschrijving en de knop van de Short, per taal. */
const KOPJES: Record<MotionTaal, { hoofdstukken: string; bronnen: string; fotos: string; heleVideo: string }> = {
  nl: { hoofdstukken: "Hoofdstukken", bronnen: "Bronnen", fotos: "Foto's", heleVideo: "Hele video" },
  en: { hoofdstukken: "Chapters", bronnen: "Sources", fotos: "Photos", heleVideo: "Full video" },
  de: { hoofdstukken: "Kapitel", bronnen: "Quellen", fotos: "Fotos", heleVideo: "Ganzes Video" },
  fr: { hoofdstukken: "Chapitres", bronnen: "Sources", fotos: "Photos", heleVideo: "Vidéo complète" },
  es: { hoofdstukken: "Capítulos", bronnen: "Fuentes", fotos: "Fotos", heleVideo: "Vídeo completo" },
  it: { hoofdstukken: "Capitoli", bronnen: "Fonti", fotos: "Foto", heleVideo: "Video completo" },
  pt: { hoofdstukken: "Capítulos", bronnen: "Fontes", fotos: "Fotos", heleVideo: "Vídeo completo" },
};

export async function maakPakket(v: { plan: MotionPlan; feiten: DocuFeit[]; fotos: DocuFoto[]; starts: number[]; taal: MotionTaal; kanaal: string }): Promise<Pakket> {
  const w = KOPJES[v.taal];
  const m = await claude()
    .beta.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: "low", format: { type: "json_schema", schema: PAKKET_SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: `Je maakt het YouTube-pakket bij een faceless documentaire${v.kanaal ? ` van het kanaal ${v.kanaal}` : ""}. Alles in het ${taalNaam(v.taal)}, behalve waar anders staat.
- titels: drie titelvoorstellen van hooguit 60 tekens. Nieuwsgierig makend maar waar: geen belofte die de video niet waarmaakt, geen hoofdletters-geschreeuw. De eerste is je favoriet.
- intro: de eerste alinea van de beschrijving, twee tot drie zinnen. De eerste zin moet ook los (in de zoekresultaten) prikkelen. Geen hashtags, geen emoji.
- tags: vijf tot tien zoektermen.
- thumbKop: twee tot vier woorden voor op de thumbnail, in hoofdletters, die de titel aanvullen in plaats van herhalen ("THE €1 BILLION HOLE", "HOE HET MISGING"). thumbAccent: het ene woord daaruit dat in de rode accentkleur komt.
- thumbFoto: het id van de foto die het sterkst werkt als thumbnail (herkenbaar onderwerp, ook klein nog leesbaar), of leeg als er geen foto's zijn.
Gebruik alleen wat in het script staat.`,
      messages: [
        {
          role: "user",
          content: `Werktitel: ${v.plan.titel}\n\nScript:\n${v.plan.scenes.map((s) => s.tekst).join(" ")}\n\nFoto's:\n${v.fotos.map((f) => `${f.id}: ${f.wat}`).join("\n") || "(geen)"}`,
        },
      ],
    })
    .finalMessage();
  const j = JSON.parse(tekstUit(m)) as { titels: string[]; intro: string; tags: string[]; thumbKop: string; thumbAccent: string; thumbFoto: string };

  const hs = hoofdstukRegels(v.plan, v.starts, v.taal);
  const bronnen = [...new Map(v.feiten.map((f) => [f.url, f])).values()];
  const delen = [
    j.intro.trim(),
    hs.length ? `${w.hoofdstukken}\n${hs.join("\n")}` : "",
    bronnen.length ? `${w.bronnen}\n${bronnen.map((f) => `- ${f.bron}: ${f.url}`).join("\n")}` : "",
    v.fotos.length ? `${w.fotos}\n${v.fotos.map((f) => `- ${fotoCredit(f, v.taal)} (${f.bron})`).join("\n")}` : "",
    j.tags.length ? j.tags.slice(0, 10).map((t) => `#${t.replace(/[^\p{L}\p{N}]+/gu, "")}`).filter((t) => t.length > 1).join(" ") : "",
  ];
  return {
    titels: j.titels.map((t) => t.trim()).filter(Boolean).slice(0, 3),
    beschrijving: delen.filter(Boolean).join("\n\n"),
    thumbKop: j.thumbKop.trim().slice(0, 40),
    thumbAccent: j.thumbAccent.trim(),
    thumbFoto: v.fotos.some((f) => f.id === j.thumbFoto) ? j.thumbFoto : (v.fotos[0]?.id ?? ""),
    usd: kosten(MODEL, m.usage),
  };
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** De thumbnail (1280 x 720, jpg): foto, donker verloop, kop met één accentwoord, kanaalnaam. */
export async function maakThumbnail(v: { foto: Buffer | null; kop: string; accent: string; kanaal: string; kleur: string }): Promise<Buffer> {
  const fotoSrc = v.foto ? `data:image/jpeg;base64,${(await sharp(v.foto).resize(1280, 720, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer()).toString("base64")}` : "";
  const woorden = v.kop.toUpperCase().split(/\s+/).filter(Boolean);
  const accent = v.accent.toUpperCase();
  const kop = woorden.map((w) => (w.replace(/[^\p{L}\p{N}€$£%]/gu, "") === accent.replace(/[^\p{L}\p{N}€$£%]/gu, "") ? `<span class="a">${esc(w)}</span>` : esc(w))).join(" ");
  // Lange koppen kleiner, zodat ze altijd op twee of drie regels passen.
  const maat = v.kop.length > 22 ? 104 : v.kop.length > 14 ? 124 : 144;
  const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1280px;height:720px;overflow:hidden;background:#0f0f10;position:relative}
.f{position:absolute;inset:0;background:${fotoSrc ? `url(${fotoSrc}) center/cover` : "#1a1a1c"};filter:contrast(1.08) saturate(.85)}
.v{position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,10,11,.94) 0%,rgba(10,10,11,.78) 38%,rgba(10,10,11,.15) 72%,rgba(10,10,11,0) 100%)}
.k{position:absolute;left:64px;top:50%;transform:translateY(-50%);width:780px;font:${maat}px/0.98 'Archivo Black',sans-serif;color:#f3efe6;text-transform:uppercase;letter-spacing:-1px;-webkit-text-stroke:3px #0f0f10;paint-order:stroke fill;text-shadow:0 6px 24px rgba(0,0,0,.6)}
.a{color:${v.kleur}}
.c{position:absolute;left:64px;bottom:52px;font:600 26px 'IBM Plex Mono',monospace;color:#f3efe6;letter-spacing:4px;text-transform:uppercase;border-left:8px solid ${v.kleur};padding-left:16px}
.l{position:absolute;right:0;bottom:0;width:240px;height:10px;background:${v.kleur}}
</style></head><body><div class="f"></div><div class="v"></div><div class="k">${kop}</div>${v.kanaal ? `<div class="c">${esc(v.kanaal)}</div>` : ""}<div class="l"></div></body></html>`;
  const browser = await launchBrowser();
  try {
    const pagina = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await pagina.setContent(html, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await pagina.evaluate("document.fonts.ready").catch(() => {});
    return await pagina.screenshot({ type: "jpeg", quality: 90 });
  } finally {
    await browser.close().catch(() => {});
  }
}

const SHORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titel", "scenes", "eind", "fotos"],
  properties: {
    titel: { type: "string" },
    scenes: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["tekst", "beeld", "kop"], properties: { tekst: { type: "string" }, beeld: { type: "string" }, kop: { type: "string" } } },
    },
    eind: {
      type: "object",
      additionalProperties: false,
      required: ["tekst", "regel1", "regel2", "knop"],
      properties: { tekst: { type: "string" }, regel1: { type: "string" }, regel2: { type: "string" }, knop: { type: "string" } },
    },
    fotos: { type: "array", items: { type: "string" } },
  },
} as const;

/**
 * Het script voor de Short (staand, ±45 s): de sterkste haak uit de docu, één wending, en een
 * verwijzing naar de hele video. Alleen feiten die al in het (gecontroleerde) docu-script staan.
 */
export async function schrijfShort(v: { plan: MotionPlan; fotos: DocuFoto[]; taal: MotionTaal; kanaal: string }): Promise<{ plan: MotionPlan; fotos: string[]; usd: number }> {
  const lengte = 45;
  const m = await claude()
    .beta.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SHORT_SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: `Je maakt van een documentaire-script een YouTube Short van ±45 seconden (staand), in het ${taalNaam(v.taal)}.
- Vier of vijf scenes, samen ${Math.round(maxWoorden(lengte) * 0.85)} tot ${maxWoorden(lengte)} woorden. De eerste zin is de haak: het meest verrassende feit of moment, zonder aanloop.
- Gebruik ALLEEN feiten die letterlijk in het script staan: het script is al op feiten gecontroleerd, alles daarbuiten niet.
- "beeld" in het Nederlands: eenvoudig, één ding tegelijk in beeld (het is staand). Een foto uit de lijst mag ("foto f3 vult het beeld"); zet de gebruikte id's in "fotos" (hooguit vier).
- "kop": leeg.
- Eind: de kijker naar de hele video sturen${v.kanaal ? ` op ${v.kanaal}` : ""}. eind.regel1 en eind.regel2 vormen samen een zin die letterlijk in eind.tekst staat (elk hooguit 28 tekens). eind.knop: "${KOPJES[v.taal].heleVideo}" of iets van die lengte.
- "titel": de titel van de Short, hooguit 60 tekens.`,
      messages: [
        {
          role: "user",
          content: `Het script:\n${v.plan.scenes.map((s, i) => `${i + 1}. ${s.tekst}`).join("\n")}\n\nFoto's:\n${v.fotos.map((f) => `${f.id}: ${f.wat}`).join("\n") || "(geen)"}`,
        },
      ],
    })
    .finalMessage();
  const j = JSON.parse(tekstUit(m)) as { titel: string; scenes: MotionPlan["scenes"]; eind: MotionPlan["eind"]; fotos: string[] };
  const plan = controleerPlan({ titel: j.titel, scenes: j.scenes, eind: j.eind }, lengte);
  return { plan, fotos: j.fotos.filter((id) => v.fotos.some((f) => f.id === id)).slice(0, 4), usd: kosten(MODEL, m.usage) };
}
