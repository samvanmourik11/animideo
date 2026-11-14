// DOCU-SJABLONEN, de serverkant: per hoofdstuk kiest een goedkoop model per scene een vast
// beeld (public/motion/docu.js) en vult de tekst en getallen in; de code van het hoofdstuk is
// daarna gewoon die bibliotheek plus één regel met de keuzes.
//
// Waarom (Sam, 14-11-2026: "hoe krijgen we dit goedkoper?", koos voor vaste sjablonen en
// fotoscenes in vaste code): Claude die elke scene zelf tekent kostte ±$4,50 per tien
// minuten docu. Zo kost een hoofdstuk een paar cent.
//
// Alleen getallen en namen die in de (al gecontroleerde) gesproken tekst van de scene
// staan, mogen in beeld: anders zou een teller iets kunnen tonen wat de feitencontrole nooit
// heeft gezien. Alleen op de server.

import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { claude } from "@/lib/motion/plan";
import { kosten } from "@/lib/motion/animatie";
import { proef, ernstig } from "@/lib/motion/render";
import type { PaginaInvoer } from "@/lib/motion/pagina";
import type { MotionPlan } from "@/lib/motion/types";

const MODEL = "claude-sonnet-5-5";

export const SJABLONEN = ["foto", "datum", "teller", "tijdlijn", "dossier", "vergelijk", "citaat", "grafiek", "plek", "titel", "lijst"] as const;
type Sjabloon = (typeof SJABLONEN)[number];

export interface Shot {
  id: string;
  sjabloon: Sjabloon;
  kop: string;
  sub: string;
  getal: string;
  voor: string;
  na: string;
  stempel: string;
  items: { a: string; b: string }[];
  woorden: string[];
  foto?: string;
  vermelding?: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scenes"],
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sjabloon", "kop", "sub", "getal", "voor", "na", "stempel", "items", "woorden"],
        properties: {
          sjabloon: { type: "string", enum: [...SJABLONEN] },
          kop: { type: "string" },
          sub: { type: "string" },
          getal: { type: "string" },
          voor: { type: "string" },
          na: { type: "string" },
          stempel: { type: "string" },
          items: { type: "array", items: { type: "object", additionalProperties: false, required: ["a", "b"], properties: { a: { type: "string" }, b: { type: "string" } } } },
          woorden: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

function systeem(taal: "nl" | "en"): string {
  return `Je bent beeldredacteur van een YouTube-documentaire in de stijl van een nieuwsarchief (inktzwart, papierwit, één rode kleur). Je krijgt de scenes van één hoofdstuk: wat de verteller zegt en wat er volgens het script te zien is. Kies per scene één vast beeld en vul het in. Alle tekst in beeld ${taal === "en" ? "in het Engels" : "in het Nederlands"}.

De vaste beelden (velden die niet bij een beeld horen laat je leeg):
- foto: een archieffoto vult het beeld. ALLEEN als de scene al een archieffoto (f1, f2, ...) heeft; dan is "foto" verplicht. kop: kort, groot over de foto (een jaartal, een naam, hooguit 4 woorden). sub: één korte regel eronder.
- datum: een datum of jaartal vult het beeld. kop: de datum ("16 FEB 2016"). sub: wat er toen gebeurde, kort. stempel: optioneel één of twee woorden die er schuin overheen klappen ("FAILLIET", "SOLD").
- teller: een getal dat oploopt. getal: alleen het getal ("355", "1800", "3.5"). voor/na: wat ervoor en erachter staat ("€" en " MILJOEN", of "" en "+"). kop: klein label erboven. sub: één regel eronder. stempel: optioneel.
- tijdlijn: 2 tot 6 momenten. items: a = jaartal of datum (kort), b = wat er gebeurde (hooguit 6 woorden). kop: klein label erboven.
- dossier: een persoon of partij. kop: de naam. sub: de rol en jaren. items: 1 tot 4 regels (a = kort label, b = de waarde). stempel: optioneel.
- vergelijk: twee dingen tegenover elkaar. items: precies 2, a = label, b = waarde (het rechter in rood: zet daar het contrast). sub: één regel eronder.
- citaat: een uitspraak die letterlijk in de tekst van de verteller staat als citaat. kop: de uitspraak. sub: wie en wanneer.
- grafiek: staven. items: 2 tot 8, a = label (jaar), b = waarde als getal met eenheid ("-42M", "62"). De laatste staaf is rood. kop: wat er gemeten wordt.
- plek: een plaats. kop: de naam. sub: kort wat daar is.
- titel: een korte, grote uitspraak (hooguit 8 woorden) die de scene samenvat, een vraag of een wending. sub: optioneel.
- lijst: 2 tot 5 namen of punten die achter elkaar komen. items: a = de naam of het punt, b = optioneel kort detail. kop: klein label erboven.

Regels:
- Getallen, bedragen, data en namen in beeld moeten letterlijk in de tekst van de verteller van DIE scene staan. Niets uit de beeldbeschrijving of je eigen kennis dat de verteller niet zegt.
- Wissel af: niet twee keer achter elkaar hetzelfde beeld, behalve foto.
- Beeldtekst is kort: een kop hooguit ±24 tekens, een sub hooguit ±60.
- woorden: per element dat verschijnt (eerst de kop, dan de sub of de items in volgorde, dan de stempel) één woord uit de tekst van de verteller waarop het moet verschijnen, letterlijk zoals hij het zegt. Liever een paar goede woorden dan veel.`;
}

export interface HoofdstukVraag {
  plan: MotionPlan;
  /** De foto's die in dit hoofdstuk mogen: id → wat erop staat en de vermelding. */
  fotos: Record<string, { wat: string; vermelding: string }>;
  taal: "nl" | "en";
  /** Of dit hoofdstuk de eindkaart heeft. */
  eind: boolean;
}

/** De archieffoto die de docu-regie aan een scene heeft gegeven ("Archieffoto f3 (...)"). */
const fotoVan = (beeld: string) => beeld.match(/^Archieffoto (f\d+)\b/)?.[1] ?? null;

export async function kiesShots(v: HoofdstukVraag): Promise<{ shots: Shot[]; usd: number }> {
  const scenes = v.plan.scenes.map((s, i) => {
    const f = fotoVan(s.beeld);
    const foto = f && v.fotos[f] ? `\nArchieffoto ${f}: ${v.fotos[f].wat}` : "";
    return `Scene ${i + 1}\nVerteller: ${s.tekst}\nScript: ${s.beeld.replace(/^Archieffoto f\d+ \([^)]*\), beeldvullend\. Vermelding linksonder: "[^"]*"\.\s*/, "")}${foto}`;
  });
  const m = await claude()
    .beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: systeem(v.taal),
      messages: [{ role: "user", content: `${scenes.join("\n\n")}\n\nGeef precies ${v.plan.scenes.length} scenes terug, in deze volgorde.` }],
    })
    .finalMessage();
  const j = JSON.parse(m.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("")) as { scenes: Omit<Shot, "id">[] };
  const kort = (t: unknown, n: number) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const shots = v.plan.scenes.map((s, i): Shot => {
    const r = j.scenes[i] ?? { sjabloon: "titel", kop: s.kop || "", sub: "", getal: "", voor: "", na: "", stempel: "", items: [], woorden: [] };
    const f = fotoVan(s.beeld);
    const heeftFoto = !!(f && v.fotos[f]);
    // Een foto hoort waar de regie hem heeft neergezet, en nergens anders: het model kiest
    // geen foto's en kan er dus ook geen verzinnen.
    const sjabloon: Sjabloon = heeftFoto ? "foto" : r.sjabloon === "foto" || !SJABLONEN.includes(r.sjabloon) ? "titel" : r.sjabloon;
    return {
      id: `s${i + 1}`,
      sjabloon,
      kop: kort(r.kop, 60),
      sub: kort(r.sub, 90),
      getal: kort(r.getal, 20),
      voor: kort(r.voor, 6),
      na: kort(r.na, 16),
      stempel: kort(r.stempel, 18),
      items: (r.items ?? []).slice(0, 8).map((x) => ({ a: kort(x.a, 40), b: kort(x.b, 60) })),
      woorden: (r.woorden ?? []).slice(0, 10).map((w) => kort(w, 30)),
      ...(heeftFoto ? { foto: f!, vermelding: v.fotos[f!].vermelding } : {}),
    };
  });
  return { shots, usd: kosten(MODEL, m.usage) };
}

let libCache: string | null = null;
async function leesLib(): Promise<string> {
  if (libCache && process.env.NODE_ENV === "production") return libCache;
  return (libCache = await readFile(path.join(process.cwd(), "public", "motion", "docu.js"), "utf8"));
}

/** De code van een hoofdstuk: de sjablonen plus de keuzes. */
export async function docuCode(shots: Shot[], plan: MotionPlan, taal: "nl" | "en", eind: boolean): Promise<string> {
  const hfd: Record<string, string> = {};
  plan.scenes.forEach((s, i) => { if (s.kop) hfd[`s${i + 1}`] = s.kop; });
  const spec = { scenes: shots, hfd, taal, ...(eind ? { eind: { regel1: plan.eind.regel1, regel2: plan.eind.regel2, knop: plan.eind.knop } } : {}) };
  return `${await leesLib()}\nwindow.VIDEO = docuVideo(${JSON.stringify(spec)});\n`;
}

/**
 * Een hoofdstuk "tekenen" met de sjablonen: keuzes laten maken, code samenstellen en één
 * proef draaien om kapotte code te vangen. Zelfde vorm als tekenAnimatie in de motion-studio.
 */
export async function tekenDocuHoofdstuk(v: HoofdstukVraag & { pagina: Omit<PaginaInvoer, "code"> }): Promise<{ code: string; gebruik: { usd: number; rondes: number; sec: number }; rest: string[]; einde: number }> {
  const begin = Date.now();
  const { shots, usd } = await kiesShots(v);
  const code = await docuCode(shots, v.plan, v.taal, v.eind);
  const p = await proef({ ...v.pagina, code });
  const kapot = p.fouten.filter(ernstig);
  if (kapot.length || !p.beelden.length) throw new Error(`De docu-beelden konden niet worden gemaakt: ${kapot[0] ?? "geen beeld"}`);
  return { code, gebruik: { usd, rondes: 1, sec: Math.round((Date.now() - begin) / 1000) }, rest: p.fouten, einde: p.einde };
}
