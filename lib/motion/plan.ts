// Het script van een motion graphics-video: scenes met wat de stem zegt en wat er te zien
// is. Alleen op de server. Gratis voor de klant (kost ons een paar cent), zodat hij net zo
// vaak een nieuw script kan laten schrijven als hij wil vóór hij betaalt.

import Anthropic from "@anthropic-ai/sdk";
import { MAX_SCENES, maxWoorden, type MotionLengte, type MotionPlan } from "./types";

const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
export function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("De Claude-sleutel (ANTHROPIC_API_KEY) ontbreekt nog.");
  return (client ??= new Anthropic());
}

function schoon(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function telWoorden(plan: MotionPlan): number {
  return [...plan.scenes.map((s) => s.tekst), plan.eind.tekst].join(" ").split(/\s+/).filter(Boolean).length;
}

/** Controleert wat Claude (of de klant) als plan aanlevert. Gooit bij een onbruikbaar plan. */
export function controleerPlan(ruw: unknown, lengte: MotionLengte): MotionPlan {
  const p = (ruw ?? {}) as { titel?: unknown; scenes?: unknown; eind?: unknown };
  const scenes = (Array.isArray(p.scenes) ? p.scenes : [])
    .slice(0, MAX_SCENES)
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return { tekst: schoon(o.tekst, 500), beeld: schoon(o.beeld, 600), kop: schoon(o.kop, 32) };
    })
    .filter((s) => s.tekst);
  if (scenes.length < 2) throw new Error("Het script is niet compleet. Laat een nieuw script schrijven.");
  const e = (p.eind ?? {}) as Record<string, unknown>;
  const eind = {
    tekst: schoon(e.tekst, 300),
    regel1: schoon(e.regel1, 34),
    regel2: schoon(e.regel2, 34),
    knop: schoon(e.knop, 30),
  };
  if (!eind.tekst) throw new Error("De slotzin ontbreekt. Vul in wat de stem aan het eind zegt.");
  const plan: MotionPlan = { titel: schoon(p.titel, 80), scenes, eind };
  // Een kwart speling: de klant mag zinnen aanpassen zonder meteen een foutmelding te krijgen.
  const max = Math.round(maxWoorden(lengte) * 1.25);
  if (telWoorden(plan) > max) {
    throw new Error(`De tekst is te lang voor ±${lengte} seconden. Houd het onder de ${max} woorden, of kies een langere video.`);
  }
  return plan;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titel", "scenes", "eind"],
  properties: {
    titel: { type: "string" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tekst", "beeld", "kop"],
        properties: { tekst: { type: "string" }, beeld: { type: "string" }, kop: { type: "string" } },
      },
    },
    eind: {
      type: "object",
      additionalProperties: false,
      required: ["tekst", "regel1", "regel2", "knop"],
      properties: { tekst: { type: "string" }, regel1: { type: "string" }, regel2: { type: "string" }, knop: { type: "string" } },
    },
  },
} as const;

export interface PlanVraag {
  onderwerp: string;
  bedrijf: string;
  lengte: MotionLengte;
  staand: boolean;
}

export async function schrijfPlan(v: PlanVraag): Promise<MotionPlan> {
  const woorden = maxWoorden(v.lengte);
  const aantal = v.lengte <= 30 ? "3 of 4" : v.lengte <= 45 ? "4 of 5" : "5 of 6";
  const antwoord = await claude()
    .beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      // Weigert het model iets op een beleidsgrond, dan neemt een passend model het over.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: `Je schrijft het script voor een korte Nederlandse uitlegvideo in motion graphics: strakke, platte animatie met vormen, iconen, grafieken, getallen en tekst in beeld. Geen gefilmde beelden, geen realistische personen.

Opbouw (onze vaste formule):
1. Haak: een herkenbare vraag of situatie van de kijker, in één of twee zinnen.
2. Het probleem of de kernvraag, concreet gemaakt.
3. De uitleg of oplossing, stap voor stap. Eén gedachte per scene.
4. Wat het de kijker oplevert.
Daarna de eindkaart, apart: één of twee zinnen met een duidelijke uitnodiging waarin de bedrijfsnaam letterlijk voorkomt.

Regels:
- ${aantal} scenes, plus de eindkaart. Samen hooguit ${woorden} woorden gesproken tekst (dat is ±${v.lengte} seconden).
- "tekst": wat de stem zegt. Gewone spreektaal, korte zinnen, je-vorm, geen jargon en geen opsommingstekens. Getallen voluit geschreven zoals je ze uitspreekt, behalve jaartallen en bedragen.
- "beeld": wat er te zien is, in gewoon Nederlands, zodat de klant het begrijpt en een animator het kan tekenen. Kies iets dat het verhaal écht uitlegt: een grafiek die oploopt, een stroom van A naar B, een vergelijking links/rechts, een teller, een tijdlijn, een schema met stappen. Noem per scene de twee tot vier elementen die op de sleutelwoorden van de stem verschijnen. Geen losse plaatjes die alleen de tekst herhalen.
- "kop": een korte titel voor rechtsboven in beeld, bijvoorbeeld "01  Het probleem" (hooguit 24 tekens). Leeg bij de eerste scene.
- Neem feiten, bedragen en claims van de klant letterlijk over; verzin er geen bij.
- eind.regel1 en eind.regel2: twee korte regels tekst boven het logo (elk hooguit 28 tekens) die samen een zin vormen die letterlijk zo in eind.tekst staat, bijvoorbeeld "Benieuwd wat het" / "jou oplevert?". eind.knop: de uitnodiging op de knop, hooguit 24 tekens.
- "titel": een korte werktitel voor in de bibliotheek.${v.staand ? "\n- De video is staand (voor telefoons): houd de beelden eenvoudig, één ding tegelijk in beeld." : ""}`,
      messages: [
        {
          role: "user",
          content: `Bedrijf: ${v.bedrijf}\n\nWaar de video over moet gaan (onderwerp, of een bestaand script van de klant):\n${v.onderwerp}`,
        },
      ],
    })
    .finalMessage();
  if (antwoord.stop_reason === "refusal") throw new Error("Over dit onderwerp kunnen we geen script schrijven. Probeer het anders te omschrijven.");
  const tekst = antwoord.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
  let ruw: unknown;
  try {
    ruw = JSON.parse(tekst);
  } catch {
    throw new Error("Het script kwam niet goed terug. Probeer het opnieuw.");
  }
  return controleerPlan(ruw, v.lengte);
}
