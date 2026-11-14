// VIDEO AANPASSEN NA OPLEVERING (Sam, 14-11-2026: "in de video punten aanklikken, zodat jij
// weet welk moment en welke plek; die feedback wordt doorgegeven en de video wordt daarop
// aangepast, en je ziet vooraf wat het kost").
//
// Werkt voor de motion-studio en de docu-studio: van elke video staan de code per hoofdstuk,
// de woordtijden en de stem bewaard. Een aanpassing is een nieuwe rij in de bibliotheek
// (de oude blijft staan) die alleen de hoofdstukken met een punt opnieuw laat schrijven:
//
//   1. per punt het beeld op dat moment, met een genummerde stip op de aangeklikte plek, en
//      wat daar in de code staat (tekst, vorm) — zo hoeft niemand te raden wat er bedoeld is
//   2. motion: Claude geeft alleen de stukken code terug die anders moeten (zelfde
//      zoek-en-vervang als de controlerondes), kijkt daarna naar het nieuwe beeld en
//      verbetert nog één keer als het niet gelukt is
//      docu: Claude past de keuzes van de vaste docu-beelden aan (sjabloon, tekst, getallen)
//   3. de video opnieuw maken (in de browser van de klant, of op de server), met dezelfde stem
//
// Wat de verteller zegt verandert niet: dat zou een nieuwe stem en nieuwe tijden vragen.
// Alleen op de server.

import Anthropic from "@anthropic-ai/sdk";
import { claude } from "./plan";
import { WIJZIG_UITLEG, codeUit, kosten, pasToe, systeem, wijzigingenUit } from "./animatie";
import { ernstig, momenten, proef, type Moment } from "./render";
import type { PaginaInvoer } from "./pagina";
import type { MotionPlan, MotionTaal } from "./types";
import type { Deel } from "./lang";
import { SJABLONEN, leesLib, systeem as docuSysteem, type Shot } from "@/lib/docu/sjablonen";
import { creditsVoorInkoop } from "@/lib/credit-costs";

/** Het model dat de aanpassing maakt: begrijpt feedback en beeld beter dan het kleinste. */
const MODEL = "claude-sonnet-5-5";
export const MAX_PUNTEN = 8;

export interface AanpasPunt {
  /** Tijdstip in de hele video (s). */
  t: number;
  /** Waar geklikt is: 0 = links/boven, 1 = rechts/onder. */
  x: number;
  y: number;
  tekst: string;
}

export interface Aanpassing {
  /** De video waar deze aanpassing van is gemaakt. */
  van: string;
  punten: AanpasPunt[];
}

/** Leest de punten van het scherm. Gooit met een melding voor de klant. */
export function leesPunten(ruw: unknown): AanpasPunt[] {
  if (!Array.isArray(ruw) || !ruw.length) throw new Error("Klik eerst in de video op wat er anders moet.");
  if (ruw.length > MAX_PUNTEN) throw new Error(`Hooguit ${MAX_PUNTEN} punten per keer.`);
  const getal = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : NaN);
  return ruw.map((p, i) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const punt = { t: getal(o.t, 0, 3600), x: getal(o.x, 0, 1), y: getal(o.y, 0, 1), tekst: typeof o.tekst === "string" ? o.tekst.replace(/\s+/g, " ").trim().slice(0, 600) : "" };
    if ([punt.t, punt.x, punt.y].some(Number.isNaN)) throw new Error(`Punt ${i + 1} is niet goed doorgekomen. Klik hem opnieuw aan.`);
    if (!punt.tekst) throw new Error(`Schrijf bij punt ${i + 1} wat er anders moet.`);
    return punt;
  });
}

/** Per hoofdstuk de punten die erin vallen, met de tijd binnen dat hoofdstuk en hun nummer. */
export function puntenPerDeel(delen: Deel[], punten: AanpasPunt[]): Map<number, (AanpasPunt & { nr: number })[]> {
  const uit = new Map<number, (AanpasPunt & { nr: number })[]>();
  punten.forEach((p, i) => {
    let k = 0;
    delen.forEach((d, j) => { if (p.t >= d.start) k = j; });
    uit.set(k, [...(uit.get(k) ?? []), { ...p, t: +(p.t - delen[k].start).toFixed(2), nr: i + 1 }]);
  });
  return uit;
}

// ── Prijs ──
// Gemeten 14-11-2026: een motion-hoofdstuk (code lezen + aanpassen + één keer terugkijken,
// Sonnet) $0,07 in 22 s; een docu-hoofdstuk (alleen keuzes) $0,013 in 8 s. Met speling
// voor een herkansing en grotere wensen. Het maken van de video zelf gebeurt in de browser
// van de klant en kost ons niets.
const USD_VAST = 0.02;
const USD_PER_HOOFDSTUK = { motion: 0.15, docu: 0.03 };

export function aanpasCredits(maker: string, hoofdstukken: number): number {
  const per = maker === "docu" ? USD_PER_HOOFDSTUK.docu : USD_PER_HOOFDSTUK.motion;
  return creditsVoorInkoop(USD_VAST + per * Math.max(1, hoofdstukken));
}

// ── Eén hoofdstuk aanpassen ──

export interface HoofdstukAanpassing {
  pagina: Omit<PaginaInvoer, "code">;
  plan: MotionPlan;
  code: string;
  punten: (AanpasPunt & { nr: number })[];
  docu: boolean;
  taal: MotionTaal;
}

type Blok = Anthropic.Beta.BetaContentBlockParam;
type Bericht = Anthropic.Beta.BetaMessageParam;
const alleTekst = (m: Anthropic.Beta.BetaMessage) => m.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n");
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** De punten als beelden met uitleg, voor Claude. */
function puntBlokken(punten: HoofdstukAanpassing["punten"], ms: Moment[], plan: MotionPlan): Blok[] {
  const blokken: Blok[] = [];
  punten.forEach((p, i) => {
    const m = ms[i];
    const scene = m.scene === "eind" ? "de eindkaart" : `scene ${m.scene}`;
    const n = Number(m.scene.slice(1));
    const zegt = m.scene === "eind" ? plan.eind.tekst : plan.scenes[n - 1]?.tekst ?? "";
    blokken.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: m.jpg.toString("base64") } });
    blokken.push({
      type: "text",
      text: `PUNT ${p.nr} (de rode cirkel met ${p.nr} hierboven): t = ${p.t.toFixed(1)} s, in ${scene}. Geklikt op ${pct(p.x)} van links en ${pct(p.y)} van boven.
${m.wat.length ? `Op die plek staat: ${m.wat.join("; ")}.` : "Op die plek staat alleen de achtergrond."}
De verteller zegt in deze scene: "${zegt}"
FEEDBACK VAN DE KLANT: ${p.tekst}`,
    });
  });
  return blokken;
}

const REGELS = `- Verander alleen wat de klant vraagt, en wat daardoor ook moet meeveranderen (bijvoorbeeld een tekst die langer wordt en dan ergens anders over zou vallen). Al het andere blijft precies zoals het is.
- Wat de verteller zegt en de tijden van de stem liggen vast. Vraagt de klant om andere gesproken tekst, doe dan alleen wat in beeld kan (bijvoorbeeld de tekst in beeld) en laat de rest.
- De rode cirkel en het nummer zitten alleen in deze beelden, niet in de video.
- Bedoelt de klant iets wat net op een ander moment of een andere plek staat dan waar hij klikte, pas dan dat aan: hij klikt in een lopende video.`;

async function vraag(berichten: Bericht[], sys: string, o: { effort: "low" | "medium"; schema?: Record<string, unknown> }): Promise<{ m: Anthropic.Beta.BetaMessage; usd: number }> {
  const m = await claude()
    .beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
      messages: berichten,
      output_config: { effort: o.effort, ...(o.schema ? { format: { type: "json_schema" as const, schema: o.schema } } : {}) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    })
    .finalMessage();
  if (m.stop_reason === "refusal") throw new Error("Deze aanpassing kunnen we niet maken. Probeer het anders te omschrijven.");
  return { m, usd: kosten(MODEL, m.usage) };
}

/** Past de code van één hoofdstuk aan op de punten. Gooit als het niet lukt zonder de video stuk te maken. */
export async function pasHoofdstukAan(v: HoofdstukAanpassing): Promise<{ code: string; usd: number }> {
  const ms = await momenten({ ...v.pagina, code: v.code }, v.punten);
  return v.docu ? pasDocuAan(v, ms) : pasCodeAan(v, ms);
}

async function pasCodeAan(v: HoofdstukAanpassing, ms: Moment[]): Promise<{ code: string; usd: number }> {
  const sys = `${await systeem()}

## Deze opdracht: een bestaande video aanpassen

De video is al af en de klant heeft hem bekeken. Hij heeft in de video op plekken geklikt en per plek opgeschreven wat er anders moet. Jij krijgt de code van dit hoofdstuk, per punt het beeld op dat moment (met een rode cirkel waar hij klikte) en zijn feedback.

${REGELS}`;
  let usd = 0;
  const script = v.pagina.script.map(([id, t]) => `${id}: ${t}`).join("\n");
  const berichten: Bericht[] = [
    {
      role: "user",
      content: [
        { type: "text", text: `De scenes van dit hoofdstuk (wat de verteller zegt):\n${script}\n\nDe code zoals hij nu is:\n\n\`\`\`js\n${v.code}\n\`\`\`` },
        ...puntBlokken(v.punten, ms, v.plan),
        { type: "text", text: `Verwerk de feedback van alle punten. ${WIJZIG_UITLEG}`, cache_control: { type: "ephemeral" } },
      ],
    },
  ];

  // Antwoord → toepassen; wat niet past, één keer opnieuw vragen.
  async function ronde(code: string): Promise<string> {
    const a = await vraag(berichten, sys, { effort: "medium" });
    usd += a.usd;
    let tekst = alleTekst(a.m);
    const heel = codeUit(tekst);
    if (heel) return heel;
    let ws = wijzigingenUit(tekst);
    let uit = pasToe(code, ws);
    berichten.push({ role: "assistant", content: a.m.content });
    if (uit.mis.length || !ws.length) {
      berichten.push({
        role: "user",
        content: ws.length
          ? `Deze blokken konden niet worden toegepast (de andere wel):\n${uit.mis.map((m) => `- ${m}`).join("\n")}\n\nGeef alleen deze blokken opnieuw, met onder ZOEK tekst die letterlijk en precies één keer in de code staat.`
          : `Er kwamen geen bruikbare blokken terug. ${WIJZIG_UITLEG}`,
      });
      const b = await vraag(berichten, sys, { effort: "medium" });
      usd += b.usd;
      tekst = alleTekst(b.m);
      ws = wijzigingenUit(tekst);
      uit = pasToe(uit.code, ws);
      berichten.push({ role: "assistant", content: b.m.content });
    }
    return uit.code;
  }

  let code = await ronde(v.code);
  if (code === v.code) throw new Error("De aanpassing kon niet in de animatie worden verwerkt. Probeer het iets anders te omschrijven.");
  let p = await proef({ ...v.pagina, code });
  let kapot = p.fouten.filter(ernstig);

  // Eén keer terugkijken: kapotte code herstellen, of zien of de feedback echt verwerkt is.
  const na = kapot.length || !p.beelden.length ? null : await momenten({ ...v.pagina, code }, v.punten);
  berichten.push({
    role: "user",
    content: na
      ? [
          { type: "text", text: "Zo ziet het er nu uit op dezelfde momenten:" },
          ...na.flatMap((m, i): Blok[] => [
            { type: "text", text: `Punt ${v.punten[i].nr}:` },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: m.jpg.toString("base64") } },
          ]),
          {
            type: "text",
            text: `Is de feedback van elk punt goed verwerkt, en staat er niets over elkaar heen of buiten beeld? Antwoord dan alleen met GOED. Zo niet: ${WIJZIG_UITLEG}`,
          },
        ]
      : [{ type: "text", text: `De code werkt niet meer:\n${(kapot.length ? kapot : p.fouten).slice(0, 8).map((f) => `- ${f}`).join("\n")}\n\nHerstel dit. ${WIJZIG_UITLEG}` }],
  });
  const goed = na ? code : null;
  const a = await vraag(berichten, sys, { effort: "medium" });
  usd += a.usd;
  const tekst = alleTekst(a.m);
  const ws = wijzigingenUit(tekst);
  if (ws.length) {
    const nieuw = pasToe(code, ws).code;
    if (nieuw !== code) {
      const p2 = await proef({ ...v.pagina, code: nieuw });
      const kapot2 = p2.fouten.filter(ernstig);
      // Een verbetering die iets stukmaakt, mag de werkende versie niet verdringen.
      if (!kapot2.length && p2.beelden.length) { code = nieuw; p = p2; kapot = []; }
      else if (!goed) kapot = kapot2.length ? kapot2 : ["geen beeld"];
    }
  }
  if (kapot.length || !p.beelden.length) {
    if (goed) code = goed;
    else throw new Error(`De aanpassing maakte de animatie stuk: ${kapot[0] ?? "geen beeld"}`);
  }
  return { code, usd };
}

// ── Docu: de keuzes van de vaste beelden aanpassen ──

const SPEC = /\nwindow\.VIDEO = docuVideo\(([\s\S]*)\);\s*$/;

const DOCU_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scenes"],
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "sjabloon", "kop", "sub", "getal", "voor", "na", "stempel", "items", "woorden"],
        properties: {
          id: { type: "string" },
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

async function pasDocuAan(v: HoofdstukAanpassing, ms: Moment[]): Promise<{ code: string; usd: number }> {
  const m = v.code.match(SPEC);
  if (!m) throw new Error("Deze docu kan niet worden aangepast.");
  const spec = JSON.parse(m[1]) as { scenes: Shot[] };
  const sys = `${docuSysteem(v.taal)}

## Deze opdracht: een bestaande docu aanpassen

De video is al af. De klant heeft in de video op plekken geklikt en per plek opgeschreven wat er anders moet. Je krijgt de huidige keuzes per scene (JSON), per punt het beeld op dat moment (met een rode cirkel waar hij klikte) en zijn feedback. Geef ALLEEN de scenes terug die anders moeten, compleet (alle velden), met hun id.

${REGELS}
- Foto's: een scene met een archieffoto mag "foto" blijven of een ander beeld worden als de klant de foto weg wil. Een nieuwe of andere foto kiezen kan niet; zeg dat niet, doe dan het beste wat met de andere beelden kan.
- Ook nu: getallen, data en namen in beeld moeten letterlijk in de tekst van de verteller van die scene staan.`;
  const huidig = spec.scenes.map((s) => {
    const { foto, vermelding, ...rest } = s;
    void vermelding;
    return { ...rest, ...(foto ? { heeftFoto: true } : {}) };
  });
  const script = v.pagina.script.map(([id, t]) => `${id}: ${t}`).join("\n");
  const a = await vraag(
    [
      {
        role: "user",
        content: [
          { type: "text", text: `Wat de verteller zegt per scene:\n${script}\n\nDe huidige keuzes per scene:\n${JSON.stringify(huidig, null, 1)}` },
          ...puntBlokken(v.punten, ms, v.plan),
          { type: "text", text: "Geef de scenes terug die anders moeten." },
        ],
      },
    ],
    sys,
    { effort: "low", schema: DOCU_SCHEMA as unknown as Record<string, unknown> },
  );
  const j = JSON.parse(alleTekst(a.m)) as { scenes: (Omit<Shot, "foto" | "vermelding">)[] };
  const kort = (t: unknown, n: number) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  let veranderd = 0;
  for (const n of j.scenes ?? []) {
    const i = spec.scenes.findIndex((s) => s.id === n.id);
    if (i < 0) continue;
    const oud = spec.scenes[i];
    // Een foto blijft alleen waar er al een was; het model kan er geen bij verzinnen.
    const sjabloon = n.sjabloon === "foto" ? (oud.foto ? "foto" : oud.sjabloon) : SJABLONEN.includes(n.sjabloon) ? n.sjabloon : oud.sjabloon;
    spec.scenes[i] = {
      id: oud.id,
      sjabloon,
      kop: kort(n.kop, 60),
      sub: kort(n.sub, 90),
      getal: kort(n.getal, 20),
      voor: kort(n.voor, 6),
      na: kort(n.na, 16),
      stempel: kort(n.stempel, 18),
      items: (n.items ?? []).slice(0, 8).map((x) => ({ a: kort(x.a, 40), b: kort(x.b, 60) })),
      woorden: (n.woorden ?? []).slice(0, 10).map((w) => kort(w, 30)),
      ...(sjabloon === "foto" && oud.foto ? { foto: oud.foto, vermelding: oud.vermelding } : {}),
    };
    veranderd++;
  }
  if (!veranderd) throw new Error("De aanpassing kon niet in de docu worden verwerkt. Probeer het iets anders te omschrijven.");
  // Met de sjablonen zoals ze nu zijn: reparaties aan de sjablonen komen zo ook in oudere docu's.
  const code = `${await leesLib()}\nwindow.VIDEO = docuVideo(${JSON.stringify(spec)});\n`;
  const p = await proef({ ...v.pagina, code });
  const kapot = p.fouten.filter(ernstig);
  if (kapot.length || !p.beelden.length) throw new Error(`De aanpassing maakte de docu stuk: ${kapot[0] ?? "geen beeld"}`);
  return { code, usd: a.usd };
}
