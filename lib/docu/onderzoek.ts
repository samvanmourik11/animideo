// HET ONDERZOEK van een docu: in drie rondes, elk met een eigen taak.
//
//   1. zoeken      — Opus zoekt op internet en schrijft een verslag: tijdlijn, getallen,
//                    namen, wendingen, elk feit met de url waar het staat.
//   2. script      — Opus maakt van dat verslag het script (zonder internet: alleen wat in
//                    het verslag staat mag erin) plus een feitenlijst met bronnen.
//   3. controle    — Sonnet loopt elke uitspraak in het script na tegen de bronnen en zoekt
//                    zelf opnieuw waar dat nodig is. Wat niet klopt of niet te bevestigen
//                    is, herschrijft hij. Dat gebeurt vanzelf: de klant hoeft niets na te
//                    lopen (Sam, 13-11-2026: "dat doe jij").
//
// Waarom een aparte controle: bij onze eigen Vitesse-video stond zelfs op Wikipedia een
// verkeerde datum (de licentie werd op 10 juli 2025 ingetrokken, niet in juni). Wie het
// script schrijft, leest over zijn eigen fouten heen; een tweede lezer met een andere opdracht
// ("klopt dit, en waar staat het?") vangt ze wel.
//
// Alleen op de server.

import Anthropic from "@anthropic-ai/sdk";
import { claude, controleerPlan } from "@/lib/motion/plan";
import { kosten } from "@/lib/motion/animatie";
import { duurTekst, maxWoorden, taalNaam, type MotionPlan, type MotionTaal } from "@/lib/motion/types";
import type { DocuControle, DocuFeit, DocuLengte, DocuOnderzoek } from "./types";

// Zoeken en nakijken door Sonnet: in de eerste proef (14-11-2026, V&D, 3 minuten) kostte het
// onderzoek met Opus $5,48, vooral door de zoekresultaten die elke ronde opnieuw worden
// meegestuurd. Het script blijft bij Opus: de vertelling bepaalt of een docu werkt.
const ZOEK_MODEL = "claude-sonnet-5-5";
const SCRIPT_MODEL = "claude-opus-5-5";
const CONTROLE_MODEL = "claude-sonnet-5-5";
/** Zoveel tokens mag één gelezen webpagina hooguit kosten. */
const MAX_PAGINA_TOKENS = 12000;
/** Web search kost $10 per 1.000 zoekopdrachten. */
const USD_PER_ZOEKOPDRACHT = 0.01;

type Bericht = Anthropic.Beta.BetaMessageParam;

/** Alleen voor proeven (scripts/docu-eind-tot-eind): elke tussenstap op schijf. */
async function bewaarTussenstap(naam: string, inhoud: string): Promise<void> {
  if (!process.env.DOCU_DEBUG_DIR) return;
  const { writeFile } = await import("node:fs/promises");
  await writeFile(`${process.env.DOCU_DEBUG_DIR}/${naam}`, inhoud).catch(() => {});
}
type Antwoord = Anthropic.Beta.BetaMessage;

export interface OnderzoekVraag {
  onderwerp: string;
  /** Wat de klant er verder over kwijt wil: invalshoek, wat er zeker in moet. */
  wens?: string;
  lengte: DocuLengte;
  taal: MotionTaal;
  /** De naam van het kanaal, voor de eindkaart. Mag leeg. */
  kanaal: string;
}

function tekstUit(m: Antwoord): string {
  return m.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n");
}

function prijs(model: string, m: Antwoord): number {
  const zoek = (m.usage as { server_tool_use?: { web_search_requests?: number } }).server_tool_use?.web_search_requests ?? 0;
  return kosten(model, m.usage) + zoek * USD_PER_ZOEKOPDRACHT;
}

/**
 * Een gesprek met zoeken op internet. Zoeken draait bij Anthropic zelf; bij een lange
 * zoektocht pauzeert het model de beurt (pause_turn) en gaan we door in hetzelfde gesprek.
 */
async function metInternet(model: string, system: string, vraag: string, maxZoek: number, effort: "low" | "medium" | "high"): Promise<{ tekst: string; usd: number }> {
  const berichten: Bericht[] = [{ role: "user", content: vraag }];
  let usd = 0;
  for (let ronde = 0; ronde < 6; ronde++) {
    const m = await claude()
      .beta.messages.stream({
        model,
        max_tokens: 32000,
        output_config: { effort },
        // Na een pauze (pause_turn) gaat het hele gesprek met alle zoekresultaten opnieuw mee;
        // gecachet kost dat een tiende.
        cache_control: { type: "ephemeral" },
        system,
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: maxZoek },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: Math.ceil(maxZoek / 2), max_content_tokens: MAX_PAGINA_TOKENS },
        ],
        messages: berichten,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      })
      .finalMessage();
    usd += prijs(model, m);
    if (m.stop_reason === "refusal") throw new Error("Over dit onderwerp kunnen we geen documentaire maken. Kies een ander onderwerp.");
    if (m.stop_reason !== "pause_turn") return { tekst: tekstUit(m), usd };
    berichten.push({ role: "assistant", content: m.content });
  }
  throw new Error("Het onderzoek bleef maar doorgaan. Probeer het opnieuw.");
}

// ── 1. Zoeken ────────────────────────────────────────────────────────────────

async function zoek(v: OnderzoekVraag): Promise<{ verslag: string; usd: number }> {
  const vandaag = new Date().toISOString().slice(0, 10);
  const system = `Je bent researcher voor een YouTube-documentairekanaal in de stijl van "opkomst en ondergang"-video's (bedrijven, clubs, gebouwen, producten, mensen). Je zoekt uit wat er echt gebeurd is, voor een video van ${duurTekst(v.lengte)}.

Vandaag is het ${vandaag}. Zoek ook naar de laatste stand van zaken: wat in je geheugen zit kan verouderd zijn.

Werkwijze:
- Begin breed (Wikipedia in de taal van het land, grote nieuwsmedia, officiële bronnen), en zoek daarna gericht naar de wendingen, getallen en data die het verhaal dragen.
- Controleer data en getallen in een tweede bron als het kan. Spreken bronnen elkaar tegen, schrijf dat op (welke bron zegt wat), en geef aan welke je het betrouwbaarst vindt en waarom.
- Bronnen in andere talen zijn prima; schrijf het verslag in het Nederlands.
- Zoek ook het menselijke detail: een uitspraak die echt is gedaan (met wie, wanneer, waar gepubliceerd), een moment dat het verhaal draagt, een getal dat verbaast. Verzin niets.

Schrijf een verslag met:
1. De kern in drie zinnen: waarom is dit verhaal de moeite waard?
2. Een tijdlijn: datum, wat er gebeurde, en de url van de bron. Zo volledig als het verhaal vraagt.
3. De hoofdpersonen en partijen: wie, welke rol, wanneer.
4. Getallen (omzet, schulden, bezoekers, banen, bedragen), elk met jaar en bron-url.
5. De wendingen en het meest verrassende moment: kandidaten voor de opening van de video.
6. De huidige stand (${vandaag}).
7. Wat onzeker of omstreden is: noem het, zodat het script het kan vermijden of voorzichtig kan brengen.

Elke bewering in het verslag heeft een url uit je zoekresultaten. Geen url, dan hoort het er niet in.`;
  const vraag = `Onderwerp: ${v.onderwerp}${v.wens ? `\n\nWat de maker er verder over zegt: ${v.wens}` : ""}`;
  const { tekst, usd } = await metInternet(ZOEK_MODEL, system, vraag, 12, "medium");
  if (tekst.trim().length < 400) throw new Error("Het onderzoek leverde te weinig op. Omschrijf het onderwerp wat concreter.");
  return { verslag: tekst, usd };
}

// ── 2. Script ────────────────────────────────────────────────────────────────

const SCRIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titel", "feiten", "scenes", "eind"],
  properties: {
    titel: { type: "string" },
    feiten: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "feit", "bron", "url"],
        properties: { id: { type: "string" }, feit: { type: "string" }, bron: { type: "string" }, url: { type: "string" } },
      },
    },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tekst", "beeld", "kop", "foto", "feiten"],
        properties: {
          tekst: { type: "string" },
          beeld: { type: "string" },
          kop: { type: "string" },
          foto: { type: "string" },
          feiten: { type: "array", items: { type: "string" } },
        },
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

interface RuwScript {
  titel: string;
  feiten: DocuFeit[];
  scenes: { tekst: string; beeld: string; kop: string; foto: string; feiten: string[] }[];
  eind: MotionPlan["eind"];
}

function scriptSysteem(v: OnderzoekVraag): string {
  const woorden = maxWoorden(v.lengte);
  const aantal = `${Math.round(v.lengte / 11)} tot ${Math.round(v.lengte / 8)}`;
  return `Je schrijft het script voor een faceless YouTube-documentaire van ${duurTekst(v.lengte)}, in het ${taalNaam(v.taal)}, in de stijl van "opkomst en ondergang"-docu's. Beeld: geanimeerde motion graphics (kaarten, tijdlijnen, getallen die oplopen, dossiers, stempels, grafieken) afgewisseld met echte archieffoto's die langzaam inzoomen. Geen gefilmde beelden, geen nagemaakte krantenpagina's of logo's.

Je krijgt een onderzoeksverslag met bronnen. Alleen wat daarin staat mag in het script: geen feit, datum, getal, naam of uitspraak erbij uit je eigen geheugen. Wat het verslag onzeker of omstreden noemt, laat je weg of breng je voorzichtig ("volgens de club", "naar verluidt").

Opbouw (onze vaste docu-formule):
1. Koude opening (de eerste 30 tot 40 seconden): begin midden in het verhaal, op het hoogtepunt of het moment dat alles kantelt. Korte, ritmische zinnen. Daarna in één zin de vraag die de video beantwoordt ("Hoe kon dat gebeuren?").
2. Hoofdstukken (bij ${duurTekst(v.lengte)}: ${v.lengte >= 600 ? "vijf tot zeven" : v.lengte >= 300 ? "drie tot vijf" : "twee of drie"}): elk een eigen fase van het verhaal, chronologisch. Elke scene van een hoofdstuk krijgt dezelfde "kop": het nummer en een korte titel, "01  De koepel van Arnhem" (vertaald in de taal van de video) (hooguit 24 tekens). De koude opening heeft een lege kop.
3. Elk hoofdstuk eindigt met een kleine vooruitblik of een vraag die de kijker laat doorkijken.
4. Slot: de huidige stand, en een slotgedachte die terugslaat op de opening.
5. Eindkaart (apart, in "eind"): ${v.kanaal ? `een uitnodiging om te abonneren op ${v.kanaal}, met die naam letterlijk erin. eind.knop: het woord voor "abonneren" in het ${taalNaam(v.taal)}.` : `een korte slotzin zonder kanaalnaam. eind.knop: twee tot vier woorden.`} eind.regel1 en eind.regel2: twee korte regels (elk hooguit 28 tekens) die samen een zin vormen die letterlijk in eind.tekst staat.

Regels:
- ${aantal} scenes plus de eindkaart, samen ${Math.round(woorden * 0.85)} tot ${woorden} woorden gesproken tekst. De klant betaalt voor die lengte: blijf er niet ruim onder.
- "tekst": wat de verteller zegt. Een verteller, geen opsomming: concrete beelden, jaartallen en getallen waar ze het verhaal sterker maken, korte zinnen. Getallen voluit zoals je ze uitspreekt, behalve jaartallen en bedragen. 20 tot 35 woorden per scene, één gedachte per scene.${v.taal !== "nl" ? ` Vlot, natuurlijk ${taalNaam(v.taal)} zoals een moedertaalspreker het zegt, geen vertaalde zinnen.` : ""}
- "beeld" (in het Nederlands, de animator leest het): wat er te zien is. Wissel af: ongeveer de helft van de scenes een archieffoto (dan vult de foto het beeld, met een korte typografische tekst erover: een jaartal, een naam, een getal), de rest motion graphics: een kaart met een punt op de plek, een tijdlijn die doorschuift, een teller die oploopt, een grafiek die zakt, een dossierkaart van een persoon (naam, rol, jaren), een stempel ("FAILLIET", "VERKOCHT"), twee kolommen naast elkaar, een citaat als typografie met naam en jaar eronder. Woorden in beeld in de taal van de video.
- "foto": als de scene een archieffoto heeft, een Engelse zoekterm voor Wikimedia Commons: concreet en vindbaar ("GelreDome Arnhem exterior", "Woolworths store Hull 2008", "Concorde G-BOAC Heathrow"). Liever een gebouw, plek, voorwerp of bekende persoon dan iets abstracts. Anders leeg.
- "feiten": de id's van de feiten uit "feiten" die deze scene gebruikt. Een scene zonder feiten (sfeer, overgang) heeft een lege lijst.
- "feiten" bovenaan: elk feit dat het script gebruikt, kort in het Nederlands ("Licentie ingetrokken door de KNVB op 10 juli 2025"), met de naam van de bron en de url uit het verslag. Id's f1, f2, ... Geen feit zonder url.
- "titel": een YouTube-titel van hooguit 60 tekens, in de taal van de video, die nieuwsgierig maakt zonder te liegen.`;
}

async function schrijf(v: OnderzoekVraag, verslag: string): Promise<{ ruw: RuwScript; usd: number }> {
  const m = await claude()
    .beta.messages.stream({
      model: SCRIPT_MODEL,
      max_tokens: 64000,
      // "medium": het script draagt de hele video (Sam: verhaalvideo's worden afgerekend op
      // de vertelling, niet op de techniek). Het kost een paar cent meer dan "low".
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCRIPT_SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: scriptSysteem(v),
      messages: [{ role: "user", content: `Onderwerp: ${v.onderwerp}${v.wens ? `\nWat de maker er verder over zegt: ${v.wens}` : ""}\n\nHet onderzoeksverslag:\n\n${verslag}` }],
    })
    .finalMessage();
  if (m.stop_reason === "refusal") throw new Error("Over dit onderwerp kunnen we geen documentaire maken. Kies een ander onderwerp.");
  try {
    return { ruw: JSON.parse(tekstUit(m)) as RuwScript, usd: prijs(SCRIPT_MODEL, m) };
  } catch {
    throw new Error(m.stop_reason === "max_tokens" ? "Het script werd te lang. Probeer het opnieuw." : "Het script kwam niet goed terug. Probeer het opnieuw.");
  }
}

// ── 3. Feitencontrole ────────────────────────────────────────────────────────

interface ControleUitkomst {
  gecontroleerd: number;
  verbeteringen: { scene: number; nu: string; reden: string }[];
}

const CONTROLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["gecontroleerd", "verbeteringen"],
  properties: {
    gecontroleerd: { type: "integer" },
    verbeteringen: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["scene", "nu", "reden"],
        properties: { scene: { type: "integer" }, nu: { type: "string" }, reden: { type: "string" } },
      },
    },
  },
} as const;

/**
 * Het verslag van de controle omzetten naar vaste velden. Zoeken op internet en een vaste
 * antwoordvorm gaan niet goed samen in één aanroep: de eerste proef (14-11-2026) gaf een blok
 * dat niet te lezen was, en zo ging zeven minuten onderzoek verloren. Daarom eerst vrij
 * opschrijven, dan in een tweede, kleine aanroep omzetten.
 */
async function alsUitkomst(verslag: string, aantal: number): Promise<{ j: Partial<ControleUitkomst>; usd: number }> {
  const m = await claude()
    .beta.messages.stream({
      model: CONTROLE_MODEL,
      max_tokens: 32000,
      output_config: { effort: "low", format: { type: "json_schema", schema: CONTROLE_SCHEMA } },
      system: `Je zet het verslag van een factchecker om naar vaste velden. Neem alleen verbeteringen over die de factchecker echt voorstelt, met de complete nieuwe tekst van de scene precies zoals hij die geeft (scene 0 = eindkaart, scenes 1 tot ${aantal}). Verzin zelf niets en verander niets aan zijn tekst. "gecontroleerd" is het aantal beweringen dat hij zegt te hebben nagelopen, of je beste telling uit het verslag.`,
      messages: [{ role: "user", content: verslag }],
    })
    .finalMessage();
  return { j: JSON.parse(tekstUit(m)) as Partial<ControleUitkomst>, usd: prijs(CONTROLE_MODEL, m) };
}

async function controleer(v: OnderzoekVraag, ruw: RuwScript): Promise<{ uit: ControleUitkomst; usd: number }> {
  const feiten = new Map(ruw.feiten.map((f) => [f.id, f]));
  const regels = ruw.scenes.map((s, i) => {
    const bij = s.feiten.map((id) => feiten.get(id)).filter(Boolean).map((f) => `   - ${f!.feit} (${f!.bron}: ${f!.url})`).join("\n");
    return `Scene ${i + 1}: ${s.tekst}${bij ? `\n   Bronnen volgens de schrijver:\n${bij}` : ""}`;
  });
  regels.push(`Scene 0 (eindkaart): ${ruw.eind.tekst}`);
  const system = `Je bent eindredacteur en factchecker van een YouTube-documentairekanaal. Je krijgt het script van een documentaire over "${v.onderwerp}", per scene met de bronnen die de schrijver erbij zette. Jouw taak: elke feitelijke bewering nalopen voordat de video wordt gemaakt. Er kijkt na jou niemand meer naar.

Wat je naloopt: data en jaartallen, getallen en bedragen, namen en functies, plaatsen, volgordes ("eerst ... daarna"), oorzaak en gevolg, en uitspraken tussen aanhalingstekens of toegeschreven aan iemand.

Werkwijze:
- Open de bronnen van de schrijver (web_fetch) waar een bewering op leunt, en zoek zelf (web_search) als de bron het niet bevestigt of als er geen bron bij staat. Vandaag is het ${new Date().toISOString().slice(0, 10)}: let op beweringen over "nu" die achterhaald kunnen zijn.
- Klopt een bewering niet: verbeter de zin. Is hij niet te bevestigen: maak de zin voorzichtiger of laat het stuk weg. Is een uitspraak niet letterlijk zo gedaan: maak er een parafrase van zonder aanhalingstekens, of laat hem weg.
- Klopt alles in een scene, dan blijft die scene ongemoeid. Verander niets aan stijl of verhaal: alleen wat feitelijk niet klopt.
- Een verbeterde zin is ongeveer even lang als de oude, in het ${taalNaam(v.taal)}, en past in de vertelling.

Sluit af met:
- hoeveel beweringen je hebt nagelopen;
- per scene die anders moet: het scenenummer (0 = eindkaart), de complete nieuwe tekst van die scene, en kort in het Nederlands wat er niet klopte en wat de bron zegt.
Scenes die kloppen noem je in die afsluiting niet.`;
  const zoek = await metInternet(CONTROLE_MODEL, system, regels.join("\n\n"), 12, "medium");
  await bewaarTussenstap("controle.txt", zoek.tekst);
  try {
    const { j, usd: omzetUsd } = await alsUitkomst(zoek.tekst, ruw.scenes.length);
    const usd = zoek.usd + omzetUsd;
    const verbeteringen = (Array.isArray(j.verbeteringen) ? j.verbeteringen : [])
      .filter((x) => Number.isInteger(x?.scene) && x.scene >= 0 && x.scene <= ruw.scenes.length && typeof x.nu === "string" && x.nu.trim())
      .map((x) => ({ scene: x.scene, nu: x.nu.replace(/\s+/g, " ").trim(), reden: String(x.reden ?? "").slice(0, 400) }));
    return { uit: { gecontroleerd: Math.max(0, Number(j.gecontroleerd) || 0), verbeteringen }, usd };
  } catch (e) {
    console.error("[docu] controle niet te lezen:", e instanceof Error ? e.message : e);
    // Een controle die niet te lezen is, mag niet stil voor "alles klopt" doorgaan.
    throw new Error("De feitencontrole kwam niet goed terug. Probeer het opnieuw.");
  }
}

// ── Alles samen ──────────────────────────────────────────────────────────────

export async function doeOnderzoek(v: OnderzoekVraag, opVoortgang?: (stap: "zoeken" | "script" | "controle") => void): Promise<DocuOnderzoek> {
  opVoortgang?.("zoeken");
  const z = await zoek(v);
  await bewaarTussenstap("verslag.txt", z.verslag);
  opVoortgang?.("script");
  const s = await schrijf(v, z.verslag);
  await bewaarTussenstap("script.json", JSON.stringify(s.ruw, null, 2));
  opVoortgang?.("controle");
  const c = await controleer(v, s.ruw);

  const ruw = s.ruw;
  const verbeterd: DocuControle["verbeterd"] = [];
  for (const x of c.uit.verbeteringen) {
    if (x.scene === 0) {
      verbeterd.push({ scene: 0, was: ruw.eind.tekst, nu: x.nu, reden: x.reden });
      ruw.eind.tekst = x.nu;
      // De twee regels boven de knop moeten letterlijk in de slotzin staan; klopt dat niet
      // meer, dan liever geen regels dan regels die iets anders zeggen dan de stem.
      if (!x.nu.includes(`${ruw.eind.regel1} ${ruw.eind.regel2}`.trim())) ruw.eind.regel1 = ruw.eind.regel2 = "";
    } else if (ruw.scenes[x.scene - 1]) {
      verbeterd.push({ scene: x.scene, was: ruw.scenes[x.scene - 1].tekst, nu: x.nu, reden: x.reden });
      ruw.scenes[x.scene - 1].tekst = x.nu;
    }
  }

  // Dezelfde controle als elk motion-script: lengte, aantal scenes, lege velden.
  const plan = controleerPlan({ titel: ruw.titel, scenes: ruw.scenes, eind: ruw.eind }, v.lengte);
  // controleerPlan laat lege scenes vallen; de zoektermen moeten op dezelfde plek blijven.
  const fotoZoek = ruw.scenes.filter((x) => x.tekst.trim()).slice(0, plan.scenes.length).map((x) => x.foto.trim().slice(0, 80));
  const gebruikt = new Set(ruw.scenes.flatMap((x) => x.feiten));
  const feiten = ruw.feiten
    .filter((f) => gebruikt.has(f.id) && /^https?:\/\//.test(f.url))
    .map((f) => ({ id: f.id, feit: f.feit.slice(0, 300), bron: f.bron.slice(0, 120), url: f.url.slice(0, 500) }));

  return {
    plan,
    feiten,
    controle: { gecontroleerd: c.uit.gecontroleerd, verbeterd },
    fotoZoek,
    usd: z.usd + s.usd + c.usd,
    usdPerStap: { zoeken: z.usd, script: s.usd, controle: c.usd },
  };
}
