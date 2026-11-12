// Het script van een motion graphics-video: scenes met wat de stem zegt en wat er te zien
// is. Alleen op de server. Gratis voor de klant (kost ons een paar cent), zodat hij net zo
// vaak een nieuw script kan laten schrijven als hij wil vóór hij betaalt.

import Anthropic from "@anthropic-ai/sdk";
import { beeldBlokken } from "./beelden";
import { MOTION_LENGTES, duurTekst, maxScenes, maxWoorden, type MotionBeeld, type MotionLengte, type MotionPlan, type MotionSoort } from "./types";

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
    .slice(0, maxScenes(lengte))
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
    throw new Error(`De tekst is te lang voor ${duurTekst(lengte)}. Houd het onder de ${max} woorden, of kies een langere video.`);
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
  /** De klant levert een kant-en-klaar script aan: de gesproken tekst blijft letterlijk staan. */
  eigenScript?: boolean;
  /** Schrijfstijl en wat er niet in mag, uit de huisstijl. */
  toon?: string;
  nietDoen?: string;
  /** Voorbeelden en foto's van de klant, elk met een doel. */
  beelden?: MotionBeeld[];
  /** De taal van de stem en van de tekst in beeld. Standaard Nederlands. */
  taal?: "nl" | "en";
  /** Wat voor video het is; standaard een bedrijfsvideo. */
  soort?: MotionSoort;
}

const kaal = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Staat elke gesproken zin van het plan letterlijk in het script van de klant? Geeft de
 * scenes terug waar dat niet zo is (nummers vanaf 1; 0 is de eindkaart). Leestekens en
 * hoofdletters tellen niet mee.
 */
export function afwijkingen(plan: MotionPlan, bron: string): number[] {
  const b = ` ${kaal(bron)} `;
  const mis: number[] = [];
  plan.scenes.forEach((s, i) => {
    if (!b.includes(` ${kaal(s.tekst)} `)) mis.push(i + 1);
  });
  if (!b.includes(` ${kaal(plan.eind.tekst)} `)) mis.push(0);
  return mis;
}

/** De kortste lengte waar een tekst van zoveel woorden in past; null als hij voor alles te lang is. */
export function lengteVoorWoorden(woorden: number): MotionLengte | null {
  return MOTION_LENGTES.find((l) => woorden <= Math.round(maxWoorden(l.sec) * 1.25))?.sec ?? null;
}

export interface PlanUitkomst {
  plan: MotionPlan;
  /** Bij een eigen script: de scenes waar de tekst toch afwijkt van wat de klant aanleverde. */
  afwijkend: number[];
}

function systeem(v: PlanVraag, aantal: string, woorden: number): string {
  const huis = [
    v.toon ? `- Schrijfstijl van dit bedrijf (houd je hieraan): ${v.toon}` : "",
    v.nietDoen ? `- Wat er van dit bedrijf niet in mag: ${v.nietDoen}` : "",
    v.beelden?.length
      ? `- De klant gaf voorbeelden mee (f1, f2, ...), elk met een doel. Verwerk ze in "beeld" op de plek waar ze het verhaal helpen, en noem ze bij hun nummer: "onze bestelbus (voorbeeld f1) rijdt het beeld in". Een voorbeeld met het doel "Neem deze stijl over" noem je niet per scene; dat geldt voor de hele video.`
      : "",
    v.taal === "en"
      ? `- Dit is een Engelstalige video, geen Nederlandse: schrijf "tekst", "kop", de eindkaart en "titel" in vlot, natuurlijk Engels. "beeld" schrijf je in het Nederlands, maar woorden die in beeld komen te staan zet je er in het Engels in.`
      : "",
    v.staand ? "- De video is staand (voor telefoons): houd de beelden eenvoudig, één ding tegelijk in beeld." : "",
  ]
    .filter(Boolean)
    .join("\n");
  const beeld = `"beeld": wat er te zien is, in gewoon Nederlands, zodat de klant het begrijpt en een animator het kan tekenen. Kies iets dat het verhaal écht uitlegt: een grafiek die oploopt, een stroom van A naar B, een vergelijking links/rechts, een teller, een tijdlijn, een schema met stappen. Noem per scene de twee tot vier elementen die op de sleutelwoorden van de stem verschijnen. Geen losse plaatjes die alleen de tekst herhalen.`;
  const slot = `- "kop": een korte titel voor rechtsboven in beeld, bijvoorbeeld "01  Het probleem" (hooguit 24 tekens). Leeg bij de eerste scene.
- eind.regel1 en eind.regel2: twee korte regels tekst boven het logo (elk hooguit 28 tekens) die samen een zin vormen die letterlijk zo in eind.tekst staat, bijvoorbeeld "Benieuwd wat het" / "jou oplevert?". eind.knop: de uitnodiging op de knop, hooguit 24 tekens.
- "titel": een korte werktitel voor in de bibliotheek.${huis ? `\n${huis}` : ""}`;

  if (v.eigenScript) {
    return `Je krijgt het kant-en-klare script van een klant voor een korte Nederlandse uitlegvideo in motion graphics: strakke, platte animatie met vormen, iconen, grafieken, getallen en tekst in beeld. Geen gefilmde beelden. Jij verdeelt het script in scenes en bedenkt het beeld erbij. Aan de tekst zelf verander je niets.

Regels:
- "tekst": wat de stem zegt, LETTERLIJK overgenomen uit het script van de klant. Geen woord erbij, eraf of anders; ook geen zinnen omdraaien of samenvoegen. Alle gesproken tekst van de klant komt in de video, in dezelfde volgorde.
- Staan er in het script ook aanwijzingen die niet worden uitgesproken (scenenummers, kopjes als "Voice-over" of "Beeld", regieaanwijzingen, tijdcodes), dan horen die niet in "tekst". Beeldaanwijzingen van de klant gebruik je wel: die vormen de basis van "beeld" voor die scene.
- Verdeel in scenes op de plekken waar een nieuwe gedachte begint: ongeveer één scene per 8 tot 12 seconden spreektijd (20 tot 30 woorden), één gedachte per scene. Een lang script krijgt dus veel scenes; sla niets over.
- De laatste één of twee zinnen van het script (de afsluiting of oproep) worden de eindkaart: zet die in eind.tekst, niet in een scene.
- ${beeld}
${slot}`;
  }

  const soort = v.soort ?? "bedrijf";
  const afzender = v.bedrijf.trim();
  const slotkaart = afzender
    ? `Daarna de eindkaart, apart: één of twee zinnen met een duidelijke uitnodiging waarin de naam "${afzender}" letterlijk voorkomt.`
    : `Daarna de eindkaart, apart: één of twee zinnen die het verhaal afsluiten of de kijker iets meegeven. Er is geen afzender: noem geen bedrijf of kanaal. eind.knop is een korte slotzin van twee tot vier woorden.`;
  const opbouw: Record<MotionSoort, string> = {
    bedrijf: `Opbouw (onze vaste formule):
1. Haak: een herkenbare vraag of situatie van de kijker, in één of twee zinnen.
2. Het probleem of de kernvraag, concreet gemaakt.
3. De uitleg of oplossing, stap voor stap. Eén gedachte per scene.
4. Wat het de kijker oplevert.`,
    verhaal: `Dit is geen bedrijfsvideo maar een verhaal: geschiedenis, een documentaire, een opkomst en ondergang. Opbouw:
1. Haak: begin midden in het verhaal, met het meest verrassende of spannende moment of feit. Geen inleiding.
2. De opbouw: wie of wat, waar en wanneer, en wat er op het spel staat.
3. De wendingen, in de volgorde waarin ze het verhaal dragen. Elke scene laat één gebeurtenis zien en eindigt zo dat je de volgende wilt horen.
4. De afloop, en een slotzin die terugslaat op de haak.
Vertel het als een verteller, niet als een opsomming: concrete beelden, jaartallen en getallen waar ze het verhaal sterker maken.`,
    uitleg: `Dit is geen bedrijfsvideo maar een uitleg of les. Opbouw:
1. Haak: een vraag die de kijker zichzelf wel eens stelt, of een feit dat verbaast.
2. Het idee in één zin, zo eenvoudig mogelijk.
3. De uitleg, stap voor stap van eenvoudig naar ingewikkeld. Eén stap per scene, elk met een beeld dat het idee laat zien (een vergelijking uit het dagelijks leven werkt goed).
4. Een korte samenvatting: wat weet de kijker nu.`,
    vrij: `De opbouw volgt uit wat de klant vraagt (een aankondiging, een bedankje, een verhaal voor kinderen, een quiz, een persoonlijke boodschap). Begin altijd met iets dat de aandacht pakt en houd één gedachte per scene.`,
  };
  const feiten =
    soort === "bedrijf"
      ? "- Neem feiten, bedragen en claims van de klant letterlijk over; verzin er geen bij."
      : "- Feiten die de klant aanlevert neem je letterlijk over. Vul zelf alleen feiten aan (jaartallen, namen, getallen) waar je zeker van bent; twijfel je, houd het dan algemeen of laat het weg. Verzin geen citaten.";
  const aanspreek = soort === "bedrijf" ? "je-vorm, " : "";

  return `Je schrijft het script voor een korte Nederlandse ${soort === "bedrijf" ? "uitlegvideo" : "video"} in motion graphics: strakke, platte animatie met vormen, iconen, grafieken, getallen en tekst in beeld. Geen gefilmde beelden, geen realistische personen.

${opbouw[soort]}
${slotkaart}
${v.lengte > 60 ? `
Dit is een lange video (${duurTekst(v.lengte)}). Houd de kijker vast: deel stap 2 en 3 op in herkenbare onderdelen die elk een eigen vraag beantwoorden, kondig in de tweede scene kort aan wat er komt, wissel uitleg af met een voorbeeld of een rekensom, en vat vlak voor de eindkaart in één scene samen. Scenes van één onderdeel krijgen dezelfde "kop". Elke scene blijft kort: 20 tot 30 woorden.
` : ""}
Regels:
- ${aantal} scenes, plus de eindkaart. Samen ${Math.round(woorden * 0.85)} tot ${woorden} woorden gesproken tekst (dat is ${duurTekst(v.lengte)}); de klant betaalt voor die lengte, dus blijf er niet ruim onder.
- "tekst": wat de stem zegt. Gewone spreektaal, korte zinnen, ${aanspreek}geen jargon en geen opsommingstekens. Getallen voluit geschreven zoals je ze uitspreekt, behalve jaartallen en bedragen.
- ${beeld}
${feiten}
${slot}`;
}

export async function schrijfPlan(v: PlanVraag): Promise<PlanUitkomst> {
  const woorden = maxWoorden(v.lengte);
  // Boven de minuut: een scene per ±10 seconden.
  const aantal = v.lengte <= 30 ? "3 of 4" : v.lengte <= 45 ? "4 of 5" : v.lengte <= 60 ? "5 of 6" : `${Math.round(v.lengte / 11)} tot ${Math.round(v.lengte / 9)}`;
  const voorbeelden = v.beelden?.length ? await beeldBlokken(v.beelden, false) : [];
  const antwoord = await claude()
    .beta.messages.stream({
      model: MODEL,
      // Een script van tien minuten is ±70 scenes: ruim boven wat een kort script nodig heeft.
      max_tokens: v.lengte > 60 ? 48000 : 16000,
      // "low": het script is een kort stuk tekst; op "medium" wachtte de klant er bijna
      // twee minuten op (gemeten 11-11-2026).
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      // Weigert het model iets op een beleidsgrond, dan neemt een passend model het over.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: systeem(v, aantal, woorden),
      messages: [
        {
          role: "user",
          content: [
            ...voorbeelden,
            {
              type: "text",
              text: v.eigenScript
                ? `${v.bedrijf ? `Afzender: ${v.bedrijf}\n\n` : ""}Het script van de klant:\n${v.onderwerp}`
                : `${v.bedrijf ? `Afzender: ${v.bedrijf}\n\n` : ""}Waar de video over moet gaan (onderwerp, of een bestaand script van de klant):\n${v.onderwerp}`,
            },
          ],
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
  const plan = controleerPlan(ruw, v.lengte);
  return { plan, afwijkend: v.eigenScript ? afwijkingen(plan, v.onderwerp) : [] };
}
