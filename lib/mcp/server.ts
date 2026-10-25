// DE MCP-SERVER — Animideo als gereedschapskist voor Claude Code, Cursor en andere
// MCP-programma's (Sam, 24-10-2026: "dan kun je mensen echt leren mooie video's te maken").
// Dezelfde gereedschappen als de Regisseur, met dezelfde credits en dezelfde bibliotheek;
// alleen het gesprek zelf voert het programma van de klant.
//
// Bewust zonder SDK: de MCP-route is "stateless" JSON-RPC over HTTP (POST in, JSON uit).
// Wat de Regisseur met knoppen in de chat doet (vraag_keuze, bevestigen, wacht_op), doet
// het programma van de klant zelf; daarvoor in de plaats:
//   - betaalde stappen geven eerst de prijs terug en lopen pas met akkoord_credits;
//   - 'status' laat zien wat klaar is, met kleine voorbeeldplaatjes om te beoordelen.

import type Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { createServiceClient } from "@/lib/supabase/service";
import { verversLopende } from "@/lib/creaties/wachtrij";
import type { Creatie } from "@/lib/creaties/types";
import { modelNaam } from "@/lib/creaties/makers";
import { getCredits } from "@/lib/credits";
import { betalerVan } from "@/lib/team/team";
import { BETAALDE_TOOLS, GRATIS_TOOLS, TOOLS, bereidVoor, gratis, voerUit } from "@/lib/regisseur/tools";
import { FILM_BETAALD, FILM_GRATIS } from "@/lib/film/tools";
import { regieboekTekst } from "@/lib/regisseur/regieboek";
import { BIBLIOTHEEK } from "@/lib/stem/bibliotheek";
import { STUDIO_HTML, STUDIO_URI } from "./studio-html";
import { gebruik, keurGoed, prijslijst, stelVoor } from "./budget";
import { antwoord as regieAntwoord, samenvatting, stand as regieStand, stuurBericht } from "./regisseur";
import { RECEPTEN } from "@/lib/creaties/recepten";
import { voorbeeld as appVoorbeeld } from "@/lib/creaties/voorbeelden";

// 2026-07-28 werkt zonder "handdruk" (initialize): elk verzoek draagt zijn versie en de
// mogelijkheden van het programma in params._meta, en server/discover vertelt wat wij kunnen.
// De Claude-app probeert die eerst; de oudere versies blijven werken voor andere programma's.
export const NIEUW = "2026-07-28";
export const PROTOCOL_VERSIES = [NIEUW, "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "animideo", title: "Animideo", version: "1.1.0" };

// Wat het chatscherm van de Regisseur zelf afhandelt, of wat aan een Regisseur-project vastzit.
const NIET = new Set(["vraag_keuze", ...FILM_BETAALD, ...FILM_GRATIS]);
// De Regisseur heeft zijn eigen wacht_op (pauzeert het gesprek); hier vervangen door een
// gereedschap dat zelf wacht, zoals Higgsfields "Wait For Generation Jobs".
const VERVANGEN = new Set(["wacht_op"]);

interface McpTool { name: string; description: string; inputSchema: Record<string, unknown>; _meta?: Record<string, unknown> }

// Gereedschappen met een eigen scherm in de Claude-app (MCP Apps): kiezen, prijs + Start,
// galerij. Programma's die dat niet kennen, negeren _meta en gebruiken gewoon de tekst.
// Bewust weinig schermen (Sam, 24-10-2026: "voelt als een overvloed"): de resultaten van een
// ronde samen (wacht_op/status), de aanraders voor een stem, creators, en de kalender.
const MET_SCHERM = new Set(["ugc_creators", "mijn_werk", "status", "maak_contentkalender"]);
// Beide vormen: de huidige (_meta.ui.resourceUri) en de oudere platte sleutel, die sommige
// programma's nog lezen.
const SCHERM = { ui: { resourceUri: STUDIO_URI }, "ui/resourceUri": STUDIO_URI };
// Waar plaatjes en stemvoorbeelden vandaan komen: onze opslag, ElevenLabs, Google (voorbeelden), fal.
const SCHERM_CSP = { resourceDomains: ["https://*.supabase.co", "https://api.us.elevenlabs.io", "https://storage.googleapis.com", "https://*.fal.media"], connectDomains: [] as string[] };

// In de Claude-app (die onze schermen toont) praat de klant met onze Regisseur zelf; de
// losse gereedschappen blijven voor programma's zonder schermen (Claude Code e.d.).
const REGISSEUR_TOOLS: McpTool[] = [
  {
    name: "regisseur",
    description:
      "Praat met de Regisseur van Animideo: hij maakt beelden, video's, voice-overs, reclames, UGC-video's, films en contentkalenders voor de gebruiker, met zijn credits. Geef elke wens of reactie van de gebruiker letterlijk door (bericht), met het project_id van het lopende project; zonder project_id begin je een nieuw project. De gebruiker ziet de Regisseur in het Animideo-scherm en beantwoordt daar zijn vragen.",
    inputSchema: { type: "object", properties: { bericht: { type: "string" }, project_id: { type: "string" } }, required: ["bericht"] },
    _meta: SCHERM,
  },
  {
    name: "regisseur_stand",
    description: "Bekijk de stand van een Regisseur-project (gratis): wat hij zei, of hij een vraag stelt of akkoord vraagt, en wat er klaar is.",
    inputSchema: { type: "object", properties: { project_id: { type: "string" } }, required: ["project_id"] },
    _meta: SCHERM,
  },
  {
    name: "regisseur_antwoord",
    description: "Antwoord op een keuze of bevestiging in het Animideo-scherm (alleen voor het scherm zelf).",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string" }, actie: { type: "string", enum: ["antwoord", "bevestig", "automatisch"] }, tekst: { type: "string" }, waarde: { type: "string" }, ja: { type: "boolean" } },
      required: ["project_id", "actie"],
    },
    _meta: { ...SCHERM, ui: { ...SCHERM.ui, visibility: ["app"] } },
  },
  { name: "saldo", description: "Hoeveel credits de gebruiker nog heeft (gratis).", inputSchema: { type: "object", properties: {} } },
];

/** Kan dit programma onze schermen tonen? (De nieuwe versie zegt het bij elk verzoek.) */
export function kanSchermen(v: { params?: Record<string, unknown> }): boolean {
  const meta = (v.params?._meta ?? {}) as Record<string, unknown>;
  const caps = (meta["io.modelcontextprotocol/clientCapabilities"] ?? {}) as { extensions?: Record<string, unknown> };
  return !!caps.extensions?.["io.modelcontextprotocol/ui"];
}

// De Regisseur-als-gereedschap (REGISSEUR_TOOLS) staat bewust uit: Sam wilde dat het in de
// Claude-app voelt als praten met Claude, zoals bij Higgsfield (24-10-2026). Claude praat zelf,
// met onze werkwijze en het regieboek als handleiding; elk resultaat krijgt een kaartje.
export function mcpTools(_schermen = false): McpTool[] {
  const lijst: McpTool[] = TOOLS.filter((t) => !NIET.has(t.name) && !VERVANGEN.has(t.name)).map((t) => {
    const schema = structuredClone(t.input_schema) as { properties?: Record<string, unknown>; required?: string[] };
    if (BETAALDE_TOOLS.has(t.name)) {
      schema.properties = {
        ...schema.properties,
        budget_id: { type: "string", description: "Het goedgekeurde budget van dit project (stel_budget_voor + akkoord). Dan start de stap meteen, zonder nieuwe vraag." },
        akkoord_credits: { type: "integer", description: "Alleen voor een losse stap buiten een budget: na akkoord van de gebruiker het aantal credits dat je terugkreeg." },
      };
    }
    const scherm = MET_SCHERM.has(t.name);
    return {
      name: t.name,
      description: `${t.description}${BETAALDE_TOOLS.has(t.name) ? " Kost credits: geef budget_id mee (na één akkoord op het projectbudget). Zonder budget krijg je eerst de prijs terug." : ""}`,
      inputSchema: schema,
      ...(scherm ? { _meta: SCHERM } : {}),
    };
  });
  lijst.push(
    {
      name: "status",
      description: "Bekijk de stand van creaties (gratis): bezig, klaar (met adres) of mislukt. Klare beelden krijg je als klein plaatje te zien om te beoordelen. Beelden duren ~20 s, video's 1-3 min, een montage ~1 min.",
      inputSchema: { type: "object", properties: { creatie_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 } }, required: ["creatie_ids"] },
      _meta: SCHERM,
    },
    {
      name: "wacht_op",
      description: "Wacht tot creaties klaar zijn (gratis) en laat ze zien. Wacht hoogstens ~50 s; is er nog iets bezig, roep het dan nog eens aan. Gebruik dit na elke gestarte stap in plaats van de gebruiker te laten wachten of terugkomen. Beelden ~20 s, video's 1-3 min, een montage ~1 min.",
      inputSchema: { type: "object", properties: { creatie_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 } }, required: ["creatie_ids"] },
      _meta: SCHERM,
    },
    { name: "saldo", description: "Hoeveel credits de gebruiker nog heeft (gratis).", inputSchema: { type: "object", properties: {} } },
    {
      name: "stel_budget_voor",
      description: `Stel het budget voor een heel projectje voor (gratis): schat alle betaalde stappen (bijv. 4 schetsen, 4 eindbeelden, 4 clips, voice-over, montage) met hun credits. De gebruiker ziet een kaart en geeft één keer akkoord; daarna geef je bij elke betaalde stap budget_id mee en vraag je niet meer per stap. Neem een kleine marge voor een overgedane stap. Prijzen: ${prijslijst()}.`,
      inputSchema: {
        type: "object",
        properties: {
          omschrijving: { type: "string", description: "Wat er gemaakt wordt, kort." },
          posten: { type: "array", items: { type: "object", properties: { wat: { type: "string" }, credits: { type: "integer", minimum: 0 } }, required: ["wat", "credits"] }, minItems: 1 },
        },
        required: ["omschrijving", "posten"],
      },
      _meta: SCHERM,
    },
    {
      name: "keur_budget_goed",
      description: "Zet een voorgesteld budget aan. Alleen als de gebruiker er uitdrukkelijk ja op zei (of op Akkoord klikte in de kaart, dan doet de kaart dit zelf).",
      inputSchema: { type: "object", properties: { budget_id: { type: "string" } }, required: ["budget_id"] },
    },
    {
      name: "toon_stemmen",
      description: "Laat je 3-5 aanraders voor een stem horen (gratis), elk met één zin waarom hij past. De gebruiker luistert en kiest in het scherm; wacht op zijn keuze. Zoek ze eerst met zoek_stemmen.",
      inputSchema: {
        type: "object",
        properties: { stemmen: { type: "array", minItems: 2, maxItems: 5, items: { type: "object", properties: { id: { type: "string" }, waarom: { type: "string" } }, required: ["id", "waarom"] } } },
        required: ["stemmen"],
      },
      _meta: SCHERM,
    },
    {
      name: "toon_storyboard",
      description: "Laat schetsen ter goedkeuring zien als storyboard (gratis): de beelden op volgorde met per scène een bijschrift, en de knoppen Goedkeuren / Aanpassen.",
      inputSchema: {
        type: "object",
        properties: { beeld_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 }, bijschriften: { type: "array", items: { type: "string" } } },
        required: ["beeld_ids"],
      },
      _meta: SCHERM,
    },
    {
      name: "apps_en_effecten",
      description: "Laat de kant-en-klare apps en effecten van Animideo zien met voorbeeldbeelden (gratis), zodat de gebruiker er een kan kiezen. Gebruik daarna gebruik_app.",
      inputSchema: { type: "object", properties: { soort: { type: "string", enum: ["alles", "beeld", "video"] } } },
      _meta: SCHERM,
    },
  );
  return lijst;
}

const REGISSEUR_INSTRUCTIES = `Animideo is een Nederlandse app om met AI beelden en video's te maken. Het werk doet de Regisseur van Animideo; jij bent het doorgeefluik.

- Geef elke wens en elke reactie van de gebruiker letterlijk door met het gereedschap regisseur (met het project_id van het lopende project). Vat niet samen, kies niet zelf en maak geen eigen plan: de Regisseur stelt zelf zijn vragen, schrijft het script, laat een storyboard zien en vraagt één keer akkoord voor de credits.
- De gebruiker ziet de Regisseur in het Animideo-scherm en klikt daar zijn keuzes en Start. Zeg na een aanroep hooguit één korte zin (bijv. "De Regisseur gaat aan de slag, je ziet hem hierboven"); herhaal niet wat in het scherm staat.
- Zegt de gebruiker in de chat "ja" of "akkoord" terwijl de Regisseur akkoord vraagt, geef dat dan ook gewoon door.
- Wil je weten hoe het ervoor staat, gebruik regisseur_stand.`;

export async function instructies(_schermen = false): Promise<string> {
  return `Animideo is een Nederlandse app om met AI beelden en video's te maken. Met deze gereedschappen werk je in de bibliotheek en met de credits van de gebruiker.

Zo werk je (net als de Regisseur van Animideo): het is een GESPREK, geen lopende band.
- Praat zelf met de gebruiker, kort en in het Nederlands. Vragen stel je gewoon in de chat; vraag niet meer dan nodig.
- Werk in rondes en STOP na elke ronde voor de reactie van de gebruiker (beëindig je beurt met één korte vraag). Nooit alles in één keer achter elkaar maken, ook niet met een goedgekeurd budget:
  1. Plan: kort het script per scène + stel_budget_voor. Stop.
  2. Beelden (het storyboard): alle scènebeelden tegelijk starten, wacht_op, dan in één zin vragen of ze goed zijn of wat anders moet. Stop.
  3. Beweging: na zijn ja de clips starten, wacht_op, kort laten zien. Stop als er iets te kiezen valt.
  4. Stem: zoek_stemmen, kies er zelf 3-5 die passen, toon_stemmen. Stop tot hij kiest.
  5. Montage: monteer, wacht_op, het eindresultaat met één zin. Klaar.
- Na het starten van stappen in een ronde: meteen wacht_op (die laat de resultaten samen zien). Zeg nooit dat de gebruiker later moet terugkomen of "check" moet sturen.
- Geen opsomming van alle mogelijkheden; doe één voorstel en vraag of het goed is.
- Vraagt de gebruiker om een aantal scènes of een eigen opbouw, bouw het dan zelf met maak_beeld, maak_video en monteer, precies zoals gevraagd. maak_reclame (3 shots, kant-en-klaar vanaf een productpagina) alleen als iemand gewoon een snelle productreclame wil.

Zo maak je mooie video's:
- Gaat het om een bedrijf: kijk eerst met lees_huisstijl en gebruik kleuren, toon en logo.
- Verhaal eerst: schrijf het script (per scène wat je ziet en hoort) en laat de gebruiker het goedkeuren. Reclame/uitleg: hook (direct tegen de kijker) → merk als antwoord → hoe het werkt → wat het oplevert → merknaam en website. Een verhaal: begin, probleem, tegenslag, omslag in beeld, slot.
- Storyboard: bij 3+ scènes eerst per scène een schets (maak_beeld, kwaliteit 'standaard'), laat ze zien, pas na akkoord eindbeelden ('pro', met de schets als voorbeeld) en clips (maak_video). Monteer met monteer (voice-over: zoek_stemmen).
- Kant-en-klaar: maak_reclame, maak_ugc_video, maak_trailer. Social media: social_kanalen en maak_contentkalender.
- Credits: vraag niet per stap. Maak bij een project eerst het plan, schat het met stel_budget_voor (alle stappen, kleine marge) en laat de gebruiker één keer akkoord geven. Daarna voer je de stappen uit met budget_id, zonder opnieuw te vragen; alleen als het budget op is, stel je een nieuw voor. Een enkele losse stap mag ook zonder budget (dan eerst de prijs). Volg met status tot het klaar is.
- Laat schetsen zien met toon_storyboard, apps met apps_en_effecten.
- Prijzen: ${prijslijst()}.
- Geen echte bestaande personen, geen merken van anderen, niets misleidends.

${await regieboekTekst()}`;
}

type Inhoud = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

async function voorbeeld(url: string): Promise<Inhoud | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await sharp(Buffer.from(await res.arrayBuffer())).resize(512, 512, { fit: "inside" }).jpeg({ quality: 70 }).toBuffer();
    return { type: "image", data: buf.toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

async function status(userId: string, ruw: unknown, wachtMs = 0): Promise<{ content: Inhoud[]; structuredContent: Record<string, unknown> }> {
  const ids = (Array.isArray(ruw) ? ruw : []).map(String).slice(0, 12);
  const tot = Date.now() + wachtMs;
  let lijst: Creatie[] = [];
  for (;;) {
    const { data } = await createServiceClient().from("creaties").select("*").eq("user_id", userId).in("id", ids);
    lijst = await verversLopende((data ?? []) as Creatie[]);
    if (!lijst.some((c) => c.status === "bezig") || Date.now() + 4000 > tot) break;
    await new Promise((ok) => setTimeout(ok, 4000));
  }
  const inhoud: Inhoud[] = [
    {
      type: "text",
      text: ids
        .map((id) => {
          const c = lijst.find((x) => x.id === id);
          if (!c) return `${id}: niet gevonden`;
          return c.status === "klaar" ? `${id}: klaar (${c.soort}) ${c.url}` : c.status === "mislukt" ? `${id}: mislukt — ${c.foutmelding ?? "onbekend"}` : `${id}: nog bezig${wachtMs ? " (roep wacht_op nog eens aan)" : ""}`;
        })
        .join("\n"),
    },
  ];
  for (const c of lijst.filter((x) => x.status === "klaar" && x.soort === "beeld" && x.url).slice(0, 6)) {
    const v = await voorbeeld(c.url!);
    if (v) inhoud.push({ type: "text", text: `Beeld ${c.id}:` }, v);
  }
  const items = ids.map((id) => lijst.find((x) => x.id === id)).filter(Boolean).map((c) => galerijItem(c!));
  return { content: inhoud, structuredContent: { weergave: "galerij", titel: "Stand", items } };
}

function galerijItem(c: Pick<Creatie, "id" | "status" | "soort" | "url" | "prompt" | "foutmelding"> & Partial<Pick<Creatie, "fal_endpoint" | "invoer" | "maker">>) {
  const invoer = (c.invoer ?? {}) as { formaat?: string; kwaliteit?: string };
  return {
    id: c.id, status: c.status, soort: c.soort, url: c.status === "klaar" ? c.url : null, prompt: c.prompt ?? "", fout: c.status === "mislukt" ? c.foutmelding : null,
    model: c.fal_endpoint ? modelNaam(c.fal_endpoint) : c.maker && c.maker !== "beeld" ? c.maker : null, formaat: invoer.formaat ?? null, kwaliteit: invoer.kwaliteit ?? null,
  };
}

/** Een kaartje "bezig" met alvast de goede vorm en details, tot het resultaat er is. */
function bezigItem(id: string, stap: { maker: string; invoer: Record<string, unknown>; omschrijving: string }) {
  const i = stap.invoer as { formaat?: string; kwaliteit?: string; prompt?: string };
  const soort = stap.maker === "beeld" ? "beeld" : stap.maker === "voice-over" ? "audio" : /video|montage|reclame|ugc|trailer|film/.test(stap.maker) ? "video" : "beeld";
  return { id, status: "bezig", soort, prompt: String(i.prompt ?? stap.omschrijving), formaat: i.formaat ?? null, kwaliteit: i.kwaliteit ?? null, model: null };
}

/** De contentkalender die maak_contentkalender net opzette, als overzicht met link. */
async function kalenderScherm(userId: string, tekst: string, basis: string): Promise<Record<string, unknown> | undefined> {
  const id = tekst.match(/\/studios\/social\/([0-9a-f-]{36})/)?.[1];
  if (!id) return undefined;
  const db = createServiceClient();
  const { data: k } = await db.from("content_kalenders").select("titel").eq("id", id).eq("user_id", userId).maybeSingle();
  const { data: posts } = await db.from("content_posts").select("gepland_op, platforms, soort, idee").eq("kalender_id", id).order("gepland_op");
  return { weergave: "kalender", titel: k?.titel ?? "Contentkalender", link: `${basis}/studios/social/${id}`, posts: posts ?? [] };
}

/** Het scherm bij een gratis gereedschap, als dat er een heeft. */
function schermBij(naam: string, tekst: string, input: Record<string, unknown>): Record<string, unknown> | undefined {
  try {
    if (naam === "zoek_stemmen") {
      const lijst = JSON.parse(tekst) as { id: string; naam: string; typering?: string; accent?: string }[];
      const waarom = new Map(((input.aanraders ?? []) as { id: string; waarom: string }[]).map((x) => [x.id, x.waarom]));
      return { weergave: "stemmen", stemmen: lijst.map((x) => ({ ...x, voorbeeld: BIBLIOTHEEK.find((b) => b.id === x.id)?.voorbeeld ?? null, waarom: waarom.get(x.id) })) };
    }
    if (naam === "ugc_creators") return { weergave: "creators", creators: JSON.parse(tekst) };
    if (naam === "mijn_werk") {
      const lijst = JSON.parse(tekst) as { id: string; soort: string; url?: string; prompt?: string; status?: string }[];
      return { weergave: "galerij", titel: "Je werk", items: lijst.map((c) => ({ id: c.id, status: c.status ?? "klaar", soort: c.soort, url: c.url ?? null, prompt: c.prompt ?? "" })) };
    }
  } catch {
    // Geen geldige lijst: dan alleen de tekst.
  }
  return undefined;
}

export async function roepAan(userId: string, naam: string, args: Record<string, unknown>, basis = "https://ai.animideo.com"): Promise<{ content: Inhoud[]; isError?: boolean; structuredContent?: Record<string, unknown> }> {
  const tekst = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError } : {}) });
  try {
    if (naam === "status") return await status(userId, args.creatie_ids);
    if (naam === "wacht_op") return await status(userId, args.creatie_ids, 50_000);
    if (naam === "saldo") return tekst(`Saldo: ${await getCredits(await betalerVan(userId), { service: true })} credits.`);
    if (naam === "regisseur" || naam === "regisseur_stand" || naam === "regisseur_antwoord") {
      const id =
        naam === "regisseur" ? await stuurBericht(userId, String(args.bericht ?? ""), args.project_id)
        : naam === "regisseur_antwoord" ? (await regieAntwoord(userId, args.project_id, args), String(args.project_id))
        : String(args.project_id);
      const s = await regieStand(userId, id);
      return { ...tekst(samenvatting(s)), structuredContent: s };
    }
    if (NIET.has(naam)) return tekst(`Onbekend gereedschap: ${naam}`, true);
    if (naam === "stel_budget_voor") {
      const b = await stelVoor(userId, args.omschrijving, args.posten);
      const saldo = await getCredits(await betalerVan(userId), { service: true }).catch(() => undefined);
      return {
        ...tekst(`Budget voorgesteld: ${b.totaal} credits (budget_id ${b.id}). De gebruiker ziet een kaart met Akkoord; wacht op zijn akkoord (klik of ja in de chat; bij ja roep je keur_budget_goed aan). Daarna elke betaalde stap met budget_id ${b.id}.`),
        structuredContent: { weergave: "budget", budget_id: b.id, omschrijving: String(args.omschrijving ?? ""), posten: b.posten, totaal: b.totaal, saldo },
      };
    }
    if (naam === "keur_budget_goed") {
      const b = await keurGoed(userId, args.budget_id);
      return tekst(`Akkoord: budget ${b.id} van ${b.totaal} credits staat aan (24 uur geldig). Geef budget_id ${b.id} mee bij elke betaalde stap.`);
    }
    if (naam === "toon_stemmen") {
      const lijst = (Array.isArray(args.stemmen) ? args.stemmen : []).slice(0, 5) as { id?: string; waarom?: string }[];
      const stemmen = lijst.map((x) => BIBLIOTHEEK.find((b) => b.id === x.id) && { ...BIBLIOTHEEK.find((b) => b.id === x.id)!, waarom: String(x.waarom ?? "") }).filter(Boolean) as (typeof BIBLIOTHEEK[number] & { waarom: string })[];
      if (!stemmen.length) return tekst("Onbekende stem-ids; zoek ze eerst met zoek_stemmen.", true);
      return {
        ...tekst(`${stemmen.length} stemmen staan in beeld om te beluisteren: ${stemmen.map((x) => `${x.naam} (${x.id})`).join(", ")}. Wacht tot de gebruiker er een kiest.`),
        structuredContent: { weergave: "stemmen", stemmen: stemmen.map((x) => ({ id: x.id, naam: x.naam, typering: x.typering, accent: x.accent, voorbeeld: x.voorbeeld, waarom: x.waarom })) },
      };
    }
    if (naam === "toon_storyboard") {
      const ids = (Array.isArray(args.beeld_ids) ? args.beeld_ids : []).map(String).slice(0, 12);
      const { data } = await createServiceClient().from("creaties").select("id, url, status").eq("user_id", userId).in("id", ids);
      const bijschriften = (Array.isArray(args.bijschriften) ? args.bijschriften : []).map(String);
      const scenes = ids.map((id, i) => ({ id, url: (data ?? []).find((c) => c.id === id && c.status === "klaar")?.url ?? null, tekst: bijschriften[i] ?? "" }));
      return { ...tekst(`Storyboard van ${scenes.length} scènes staat in beeld; wacht op Goedkeuren of Aanpassen.`), structuredContent: { weergave: "storyboard", scenes } };
    }
    if (naam === "apps_en_effecten") {
      const soort = args.soort === "beeld" || args.soort === "video" ? args.soort : null;
      const apps = RECEPTEN.filter((r) => r.groep !== "branche" && (!soort || r.soort === soort)).map((r) => {
        const v = appVoorbeeld(r.id);
        return { id: r.id, naam: r.naam, uitleg: r.uitleg, icoon: r.icoon, soort: r.soort, credits: r.credits, foto: r.zonderFoto ? null : r.fotoLabel, voorbeeld: v?.resultaat ?? null, voorbeeldSoort: v?.soort ?? null };
      });
      return { ...tekst(apps.map((a) => `${a.id}: ${a.naam} (${a.soort}, ${a.credits} cr) — ${a.uitleg}`).join("\n")), structuredContent: { weergave: "apps", apps } };
    }
    const { akkoord_credits, budget_id, ...input } = args;
    const blok = { type: "tool_use", id: `mcp_${Date.now()}`, name: naam, input } as unknown as Anthropic.Beta.BetaToolUseBlock;
    if (GRATIS_TOOLS.has(naam)) {
      const t = await gratis(userId, blok);
      const scherm = naam === "maak_contentkalender" ? await kalenderScherm(userId, t, basis) : schermBij(naam, t, input);
      return { ...tekst(t), ...(scherm ? { structuredContent: scherm } : {}) };
    }
    if (!BETAALDE_TOOLS.has(naam)) return tekst(`Onbekend gereedschap: ${naam}`, true);
    const stap = await bereidVoor(userId, blok);
    // Binnen een goedgekeurd projectbudget: meteen starten, niets vragen.
    const rest = budget_id ? await gebruik(userId, budget_id, stap.credits) : null;
    if (rest !== null) {
      const id = await voerUit(userId, stap);
      return {
        ...tekst(`Gestart binnen het budget: creatie ${id} (${stap.credits} credits; nog ${Math.max(0, rest)} over). Volg het met status.`),
        structuredContent: { weergave: "galerij", titel: stap.omschrijving, items: [bezigItem(id, stap)], creatie_id: id },
      };
    }
    if (Number(akkoord_credits) < stap.credits || akkoord_credits === undefined) {
      return {
        ...tekst(`${budget_id ? "Het budget is op, verlopen of nog niet goedgekeurd. " : ""}Dit kost ${stap.credits} ${stap.credits === 1 ? "credit" : "credits"}: ${stap.omschrijving}. Hoort dit bij een groter project, stel dan liever één budget voor (stel_budget_voor). De gebruiker ziet een kaart met een Start-knop; zegt hij in de chat ja, roep ${naam} dan opnieuw aan met dezelfde invoer en akkoord_credits: ${stap.credits}. Heeft hij al op Start geklikt, dan hoor je dat en start je niets opnieuw.`),
        structuredContent: { weergave: "prijs", tool: naam, arguments: input, credits: stap.credits, omschrijving: stap.omschrijving, saldo: await getCredits(await betalerVan(userId), { service: true }).catch(() => undefined) },
      };
    }
    const id = await voerUit(userId, stap);
    return {
      ...tekst(`Gestart: creatie ${id} (${stap.credits} credits). Volg het met status.`),
      structuredContent: { weergave: "galerij", titel: stap.omschrijving, items: [bezigItem(id, stap)], creatie_id: id },
    };
  } catch (e) {
    return tekst(e instanceof Error ? e.message : String(e), true);
  }
}

// ── JSON-RPC ─────────────────────────────────────────────────────────────

interface Verzoek { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

/** Welke versie dit verzoek spreekt (nieuw: in params._meta; oud: afgesproken bij initialize). */
export function versieVan(v: Verzoek): string | null {
  const meta = (v.params?._meta ?? {}) as Record<string, unknown>;
  const ver = meta["io.modelcontextprotocol/protocolVersion"];
  return typeof ver === "string" ? ver : null;
}

export async function verwerk(userId: string, v: Verzoek, basis?: string): Promise<Record<string, unknown> | null> {
  const nieuw = versieVan(v) !== null;
  // In de nieuwe versie zegt elk resultaat expliciet dat het af is (geen vervolgvraag).
  const antwoord = (result: unknown) => ({ jsonrpc: "2.0", id: v.id ?? null, result: nieuw ? { resultType: "complete", ...(result as object) } : result });
  const fout = (code: number, message: string) => ({ jsonrpc: "2.0", id: v.id ?? null, error: { code, message } });
  // Meldingen (zonder id) krijgen geen antwoord.
  if (v.id === undefined || v.id === null) return null;
  if (nieuw && !PROTOCOL_VERSIES.includes(versieVan(v)!)) {
    return { jsonrpc: "2.0", id: v.id ?? null, error: { code: -32602, message: "Unsupported protocol version", data: { supported: PROTOCOL_VERSIES } } };
  }
  const bewaar = { ttlMs: 5 * 60 * 1000, cacheScope: "private" };
  switch (v.method) {
    case "server/discover":
      return antwoord({
        supportedVersions: PROTOCOL_VERSIES,
        capabilities: { tools: { listChanged: false }, resources: {}, extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } },
        instructions: await instructies(kanSchermen(v)),
        _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
        ...bewaar,
      });
    case "initialize": {
      const gevraagd = String(v.params?.protocolVersion ?? "");
      return antwoord({
        // De oude handdruk: nooit de nieuwe versie (die kent geen initialize).
        protocolVersion: PROTOCOL_VERSIES.includes(gevraagd) && gevraagd !== NIEUW ? gevraagd : "2025-06-18",
        // Ook hier melden dat we schermen hebben: de Claude-app verbindt via deze handdruk
        // (2025-11-25) en haalde zonder deze regel nooit ons scherm op.
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } },
        serverInfo: SERVER_INFO,
        instructions: await instructies(),
      });
    }
    case "ping":
      return antwoord({});
    case "resources/list":
      return antwoord({ resources: [{ uri: STUDIO_URI, name: "Animideo-studio", description: "Kiezen, prijs + Start en resultaten van Animideo", mimeType: "text/html;profile=mcp-app" }], ...(nieuw ? bewaar : {}) });
    case "resources/read": {
      if (v.params?.uri !== STUDIO_URI) return fout(-32002, "Onbekende resource.");
      return antwoord({ contents: [{ uri: STUDIO_URI, mimeType: "text/html;profile=mcp-app", text: STUDIO_HTML, _meta: { ui: { csp: SCHERM_CSP, prefersBorder: true } } }], ...(nieuw ? bewaar : {}) });
    }
    case "tools/list":
      return antwoord({ tools: mcpTools(kanSchermen(v)), ...(nieuw ? bewaar : {}) });
    case "tools/call": {
      const naam = String(v.params?.name ?? "");
      const args = (v.params?.arguments ?? {}) as Record<string, unknown>;
      return antwoord(await roepAan(userId, naam, args, basis));
    }
    default:
      return fout(-32601, `Onbekende methode: ${v.method}`);
  }
}
