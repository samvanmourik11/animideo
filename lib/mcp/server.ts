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
import { getCredits } from "@/lib/credits";
import { betalerVan } from "@/lib/team/team";
import { BETAALDE_TOOLS, GRATIS_TOOLS, TOOLS, bereidVoor, gratis, voerUit } from "@/lib/regisseur/tools";
import { FILM_BETAALD, FILM_GRATIS } from "@/lib/film/tools";
import { regieboekTekst } from "@/lib/regisseur/regieboek";
import { BIBLIOTHEEK } from "@/lib/stem/bibliotheek";
import { STUDIO_HTML, STUDIO_URI } from "./studio-html";

// 2026-07-28 werkt zonder "handdruk" (initialize): elk verzoek draagt zijn versie en de
// mogelijkheden van het programma in params._meta, en server/discover vertelt wat wij kunnen.
// De Claude-app probeert die eerst; de oudere versies blijven werken voor andere programma's.
export const NIEUW = "2026-07-28";
export const PROTOCOL_VERSIES = [NIEUW, "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "animideo", title: "Animideo", version: "1.1.0" };

// Wat het chatscherm van de Regisseur zelf afhandelt, of wat aan een Regisseur-project vastzit.
const NIET = new Set(["vraag_keuze", "wacht_op", ...FILM_BETAALD, ...FILM_GRATIS]);

interface McpTool { name: string; description: string; inputSchema: Record<string, unknown>; _meta?: Record<string, unknown> }

// Gereedschappen met een eigen scherm in de Claude-app (MCP Apps): kiezen, prijs + Start,
// galerij. Programma's die dat niet kennen, negeren _meta en gebruiken gewoon de tekst.
const MET_SCHERM = new Set(["zoek_stemmen", "ugc_creators", "mijn_werk", "status"]);
// Beide vormen: de huidige (_meta.ui.resourceUri) en de oudere platte sleutel, die sommige
// programma's nog lezen.
const SCHERM = { ui: { resourceUri: STUDIO_URI }, "ui/resourceUri": STUDIO_URI };
// Waar plaatjes en stemvoorbeelden vandaan komen: onze opslag, ElevenLabs, Google (voorbeelden), fal.
const SCHERM_CSP = { resourceDomains: ["https://*.supabase.co", "https://api.us.elevenlabs.io", "https://storage.googleapis.com", "https://*.fal.media"], connectDomains: [] as string[] };

export function mcpTools(): McpTool[] {
  const lijst: McpTool[] = TOOLS.filter((t) => !NIET.has(t.name)).map((t) => {
    const schema = structuredClone(t.input_schema) as { properties?: Record<string, unknown>; required?: string[] };
    if (BETAALDE_TOOLS.has(t.name)) {
      schema.properties = {
        ...schema.properties,
        akkoord_credits: { type: "integer", description: "Laat leeg om eerst de prijs te horen. Pas na akkoord van de gebruiker: het aantal credits dat je terugkreeg." },
      };
    }
    const scherm = BETAALDE_TOOLS.has(t.name) || MET_SCHERM.has(t.name);
    return {
      name: t.name,
      description: `${t.description}${BETAALDE_TOOLS.has(t.name) ? " Kost credits: roep eerst aan zonder akkoord_credits voor de prijs; de gebruiker ziet dan een kaart met een Start-knop." : ""}`,
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
    { name: "saldo", description: "Hoeveel credits de gebruiker nog heeft (gratis).", inputSchema: { type: "object", properties: {} } },
  );
  return lijst;
}

export async function instructies(): Promise<string> {
  return `Animideo is een Nederlandse app om met AI beelden en video's te maken. Met deze gereedschappen werk je in de bibliotheek en met de credits van de gebruiker.

Zo maak je mooie video's:
- Gaat het om een bedrijf: kijk eerst met lees_huisstijl en gebruik kleuren, toon en logo.
- Verhaal eerst: schrijf het script (per scène wat je ziet en hoort) en laat de gebruiker het goedkeuren. Reclame/uitleg: hook (direct tegen de kijker) → merk als antwoord → hoe het werkt → wat het oplevert → merknaam en website. Een verhaal: begin, probleem, tegenslag, omslag in beeld, slot.
- Storyboard: bij 3+ scènes eerst per scène een schets (maak_beeld, kwaliteit 'standaard'), laat ze zien, pas na akkoord eindbeelden ('pro', met de schets als voorbeeld) en clips (maak_video). Monteer met monteer (voice-over: zoek_stemmen).
- Kant-en-klaar: maak_reclame, maak_ugc_video, maak_trailer. Social media: social_kanalen en maak_contentkalender.
- Elke betaalde stap: eerst zonder akkoord_credits aanroepen, de prijs aan de gebruiker noemen, na zijn ja opnieuw met akkoord_credits. Volg met status tot het klaar is.
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

async function status(userId: string, ruw: unknown): Promise<{ content: Inhoud[]; structuredContent: Record<string, unknown> }> {
  const ids = (Array.isArray(ruw) ? ruw : []).map(String).slice(0, 12);
  const { data } = await createServiceClient().from("creaties").select("*").eq("user_id", userId).in("id", ids);
  const lijst = await verversLopende((data ?? []) as Creatie[]);
  const inhoud: Inhoud[] = [
    {
      type: "text",
      text: ids
        .map((id) => {
          const c = lijst.find((x) => x.id === id);
          if (!c) return `${id}: niet gevonden`;
          return c.status === "klaar" ? `${id}: klaar (${c.soort}) ${c.url}` : c.status === "mislukt" ? `${id}: mislukt — ${c.foutmelding ?? "onbekend"}` : `${id}: bezig`;
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

function galerijItem(c: Pick<Creatie, "id" | "status" | "soort" | "url" | "prompt" | "foutmelding">) {
  return { id: c.id, status: c.status, soort: c.soort, url: c.status === "klaar" ? c.url : null, prompt: c.prompt ?? "", fout: c.status === "mislukt" ? c.foutmelding : null };
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

export async function roepAan(userId: string, naam: string, args: Record<string, unknown>): Promise<{ content: Inhoud[]; isError?: boolean; structuredContent?: Record<string, unknown> }> {
  const tekst = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError } : {}) });
  try {
    if (naam === "status") return await status(userId, args.creatie_ids);
    if (naam === "saldo") return tekst(`Saldo: ${await getCredits(await betalerVan(userId), { service: true })} credits.`);
    if (NIET.has(naam)) return tekst(`Onbekend gereedschap: ${naam}`, true);
    const { akkoord_credits, ...input } = args;
    const blok = { type: "tool_use", id: `mcp_${Date.now()}`, name: naam, input } as unknown as Anthropic.Beta.BetaToolUseBlock;
    if (GRATIS_TOOLS.has(naam)) {
      const t = await gratis(userId, blok);
      const scherm = schermBij(naam, t, input);
      return { ...tekst(t), ...(scherm ? { structuredContent: scherm } : {}) };
    }
    if (!BETAALDE_TOOLS.has(naam)) return tekst(`Onbekend gereedschap: ${naam}`, true);
    const stap = await bereidVoor(userId, blok);
    if (Number(akkoord_credits) < stap.credits || akkoord_credits === undefined) {
      return {
        ...tekst(`Dit kost ${stap.credits} ${stap.credits === 1 ? "credit" : "credits"}: ${stap.omschrijving}. De gebruiker ziet een kaart met een Start-knop; zegt hij in de chat ja, roep ${naam} dan opnieuw aan met dezelfde invoer en akkoord_credits: ${stap.credits}. Heeft hij al op Start geklikt, dan hoor je dat en start je niets opnieuw.`),
        structuredContent: { weergave: "prijs", tool: naam, arguments: input, credits: stap.credits, omschrijving: stap.omschrijving, saldo: await getCredits(await betalerVan(userId), { service: true }).catch(() => undefined) },
      };
    }
    const id = await voerUit(userId, stap);
    return {
      ...tekst(`Gestart: creatie ${id} (${stap.credits} credits). Volg het met status.`),
      structuredContent: { weergave: "galerij", titel: stap.omschrijving, items: [{ id, status: "bezig" }], creatie_id: id },
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

export async function verwerk(userId: string, v: Verzoek): Promise<Record<string, unknown> | null> {
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
        instructions: await instructies(),
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
      return antwoord({ tools: mcpTools(), ...(nieuw ? bewaar : {}) });
    case "tools/call": {
      const naam = String(v.params?.name ?? "");
      const args = (v.params?.arguments ?? {}) as Record<string, unknown>;
      return antwoord(await roepAan(userId, naam, args));
    }
    default:
      return fout(-32601, `Onbekende methode: ${v.method}`);
  }
}
