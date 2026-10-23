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

export const PROTOCOL_VERSIES = ["2025-06-18", "2025-03-26", "2024-11-05"];

// Wat het chatscherm van de Regisseur zelf afhandelt, of wat aan een Regisseur-project vastzit.
const NIET = new Set(["vraag_keuze", "wacht_op", ...FILM_BETAALD, ...FILM_GRATIS]);

interface McpTool { name: string; description: string; inputSchema: Record<string, unknown> }

export function mcpTools(): McpTool[] {
  const lijst: McpTool[] = TOOLS.filter((t) => !NIET.has(t.name)).map((t) => {
    const schema = structuredClone(t.input_schema) as { properties?: Record<string, unknown>; required?: string[] };
    if (BETAALDE_TOOLS.has(t.name)) {
      schema.properties = {
        ...schema.properties,
        akkoord_credits: { type: "integer", description: "Laat leeg om eerst de prijs te horen. Pas na akkoord van de gebruiker: het aantal credits dat je terugkreeg." },
      };
    }
    return { name: t.name, description: `${t.description}${BETAALDE_TOOLS.has(t.name) ? " Kost credits: roep eerst aan zonder akkoord_credits voor de prijs." : ""}`, inputSchema: schema };
  });
  lijst.push(
    {
      name: "status",
      description: "Bekijk de stand van creaties (gratis): bezig, klaar (met adres) of mislukt. Klare beelden krijg je als klein plaatje te zien om te beoordelen. Beelden duren ~20 s, video's 1-3 min, een montage ~1 min.",
      inputSchema: { type: "object", properties: { creatie_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 } }, required: ["creatie_ids"] },
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

async function status(userId: string, ruw: unknown): Promise<Inhoud[]> {
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
  return inhoud;
}

export async function roepAan(userId: string, naam: string, args: Record<string, unknown>): Promise<{ content: Inhoud[]; isError?: boolean }> {
  const tekst = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError } : {}) });
  try {
    if (naam === "status") return { content: await status(userId, args.creatie_ids) };
    if (naam === "saldo") return tekst(`Saldo: ${await getCredits(await betalerVan(userId), { service: true })} credits.`);
    if (NIET.has(naam)) return tekst(`Onbekend gereedschap: ${naam}`, true);
    const { akkoord_credits, ...input } = args;
    const blok = { type: "tool_use", id: `mcp_${Date.now()}`, name: naam, input } as unknown as Anthropic.Beta.BetaToolUseBlock;
    if (GRATIS_TOOLS.has(naam)) return tekst(await gratis(userId, blok));
    if (!BETAALDE_TOOLS.has(naam)) return tekst(`Onbekend gereedschap: ${naam}`, true);
    const stap = await bereidVoor(userId, blok);
    if (Number(akkoord_credits) < stap.credits || akkoord_credits === undefined) {
      return tekst(`Dit kost ${stap.credits} credits: ${stap.omschrijving}. Noem dat de gebruiker; na zijn akkoord roep je ${naam} opnieuw aan met dezelfde invoer en akkoord_credits: ${stap.credits}.`);
    }
    const id = await voerUit(userId, stap);
    return tekst(`Gestart: creatie ${id} (${stap.credits} credits). Volg het met status.`);
  } catch (e) {
    return tekst(e instanceof Error ? e.message : String(e), true);
  }
}

// ── JSON-RPC ─────────────────────────────────────────────────────────────

interface Verzoek { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

export async function verwerk(userId: string, v: Verzoek): Promise<Record<string, unknown> | null> {
  const antwoord = (result: unknown) => ({ jsonrpc: "2.0", id: v.id ?? null, result });
  const fout = (code: number, message: string) => ({ jsonrpc: "2.0", id: v.id ?? null, error: { code, message } });
  // Meldingen (zonder id) krijgen geen antwoord.
  if (v.id === undefined || v.id === null) return null;
  switch (v.method) {
    case "initialize": {
      const gevraagd = String(v.params?.protocolVersion ?? "");
      return antwoord({
        protocolVersion: PROTOCOL_VERSIES.includes(gevraagd) ? gevraagd : PROTOCOL_VERSIES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "animideo", title: "Animideo", version: "1.0.0" },
        instructions: await instructies(),
      });
    }
    case "ping":
      return antwoord({});
    case "tools/list":
      return antwoord({ tools: mcpTools() });
    case "tools/call": {
      const naam = String(v.params?.name ?? "");
      const args = (v.params?.arguments ?? {}) as Record<string, unknown>;
      return antwoord(await roepAan(userId, naam, args));
    }
    default:
      return fout(-32601, `Onbekende methode: ${v.method}`);
  }
}
