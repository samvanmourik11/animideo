// De gereedschappen van de Regisseur: wat Claude in de app mag doen. Elk gereedschap is
// een bestaande maker (beeld, video, apps, montage) of iets gratis (een pagina lezen, je
// werk bekijken). Drie zijn bijzonder, die pauzeren het gesprek: een vraag met knoppen,
// stappen die credits kosten (eerst bevestigen) en wachten tot creaties klaar zijn.
// Alleen op de server.

import type Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { maakOpdracht, FORMATEN } from "@/lib/creaties/makers";
import { receptOpdracht } from "@/lib/creaties/recepten-opdrachten";
import { RECEPTEN, recept } from "@/lib/creaties/recepten";
import { VIDEO_MODELLEN, STANDAARD_VIDEO_MODEL } from "@/lib/video-modellen";
import { MUSIC_CATEGORIES } from "@/lib/music/library";
import { UGC_STEMMEN } from "@/lib/ugc/types";
import { startCreatie } from "@/lib/creaties/wachtrij";
import { leesProductpagina } from "@/lib/reclame/pagina";
import { montageCredits, leesMontage } from "./montage";

type Tool = Anthropic.Beta.BetaTool;

export const BETAALDE_TOOLS = new Set(["maak_beeld", "maak_video", "gebruik_app", "monteer"]);

// De lijst apps staat in de omschrijving van het gereedschap. Die verandert alleen als we
// apps toevoegen, dus de cache van het verzoek blijft gewoon geldig.
const APPS_LIJST = RECEPTEN.map((r) => `${r.id} (${r.naam}${r.soort === "video" ? ", video" : ""}${r.zonderFoto ? ", zonder foto" : ""}${r.tekst?.verplicht ? ", tekst verplicht" : ""})`).join("; ");

export const TOOLS: Tool[] = [
  {
    name: "vraag_keuze",
    description:
      "Stel de gebruiker één vraag met 2-5 klikbare antwoorden (de gebruiker kan ook zelf iets typen). Gebruik dit voor echte keuzes (stijl, richting, welke versie) in plaats van in je tekst te vragen. Het gesprek pauzeert tot er antwoord is.",
    input_schema: {
      type: "object",
      properties: {
        vraag: { type: "string", description: "De vraag, kort, in het Nederlands." },
        opties: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5, description: "Korte antwoorden." },
      },
      required: ["vraag", "opties"],
    },
  },
  {
    name: "lees_webpagina",
    description: "Lees een productpagina of website (gratis): naam, omschrijving, voordelen, prijs, merkkleur en foto-adressen. Gebruik de foto-adressen als voorbeelden in maak_beeld.",
    input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
  {
    name: "mijn_werk",
    description: "Bekijk het recente werk van de gebruiker in de bibliotheek (gratis): id, soort, wat het is en het adres. Gebruik ids om naar bestaande beelden te verwijzen.",
    input_schema: {
      type: "object",
      properties: { soort: { type: "string", enum: ["beeld", "video"] }, aantal: { type: "integer", minimum: 1, maximum: 30 } },
    },
  },
  {
    name: "maak_beeld",
    description:
      "Maak een beeld (kost credits). Geef voorbeelden (creatie-ids of https-adressen) mee om personages, gezichten of producten in elk beeld gelijk te houden; maximaal 4. Kwaliteit 'pro' voor eindbeelden met mensen of tekst, 'standaard' voor snelle schetsen. Schrijf de prompt in het Engels.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        formaat: { type: "string", enum: [...FORMATEN] },
        kwaliteit: { type: "string", enum: ["standaard", "pro"] },
        voorbeelden: { type: "array", items: { type: "string" }, maxItems: 4 },
      },
      required: ["prompt", "formaat", "kwaliteit"],
    },
  },
  {
    name: "maak_video",
    description: `Laat een bestaand beeld 5 seconden bewegen (kost credits). Beschrijf de beweging in het Engels. Modellen: ${VIDEO_MODELLEN.map((m) => `${m.id} (${m.waarvoor} ${m.credits} cr.)`).join("; ")}. Standaard ${STANDAARD_VIDEO_MODEL}.`,
    input_schema: {
      type: "object",
      properties: { beeld_id: { type: "string" }, beweging: { type: "string" }, model: { type: "string", enum: VIDEO_MODELLEN.map((m) => m.id) } },
      required: ["beeld_id", "beweging"],
    },
  },
  {
    name: "gebruik_app",
    description: `Gebruik een kant-en-klare app of effect van Animideo op een foto (kost credits). Beschikbaar: ${APPS_LIJST}.`,
    input_schema: {
      type: "object",
      properties: { app_id: { type: "string" }, foto_id: { type: "string", description: "Creatie-id of https-adres van de foto." }, tekst: { type: "string" }, formaat: { type: "string", enum: [...FORMATEN] } },
      required: ["app_id"],
    },
  },
  {
    name: "monteer",
    description: `Zet klare clips en/of beelden achter elkaar tot één video, met optioneel titelkaart, eindkaart, Nederlandse voice-over en muziek. Voice-over kost 1 credit. Stemmen: ${UGC_STEMMEN.map((s) => `${s.naam} (${s.geslacht}, ${s.omschrijving})`).join("; ")}; zonder stem een diepe verteller. Muziek: ${MUSIC_CATEGORIES.map((c) => c.id).join(", ")}.`,
    input_schema: {
      type: "object",
      properties: {
        clip_ids: { type: "array", items: { type: "string" }, minItems: 1 },
        titel: { type: "string" },
        eindtekst: { type: "string" },
        voiceover: { type: "string", description: "Wat de stem zegt, Nederlands." },
        stem: { type: "string" },
        muziek: { type: "string", enum: MUSIC_CATEGORIES.map((c) => c.id) },
      },
      required: ["clip_ids"],
    },
  },
  {
    name: "wacht_op",
    description: "Wacht tot creaties klaar zijn (beelden duren ~20 s, video's 1-3 min, een montage ~1 min). Je krijgt daarna de resultaten te zien, beelden ook als plaatje, zodat je ze kunt beoordelen. Gebruik dit na het starten van stappen waarop je wilt verder bouwen.",
    input_schema: { type: "object", properties: { creatie_ids: { type: "array", items: { type: "string" }, minItems: 1 } }, required: ["creatie_ids"] },
  },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Een creatie-id of een https-adres → een adres. Alleen eigen creaties. */
async function naarUrl(userId: string, ref: unknown): Promise<string> {
  const r = String(ref ?? "").trim();
  if (/^https:\/\//.test(r)) return r;
  if (!UUID.test(r)) throw new Error(`Onbekende verwijzing: ${r || "(leeg)"}`);
  const { data } = await createServiceClient().from("creaties").select("url, status").eq("id", r).eq("user_id", userId).maybeSingle();
  if (!data?.url || data.status !== "klaar") throw new Error(`Creatie ${r} is er niet of nog niet klaar.`);
  return data.url;
}

async function formaatVan(userId: string, ref: unknown): Promise<string | undefined> {
  if (!UUID.test(String(ref ?? ""))) return undefined;
  const { data } = await createServiceClient().from("creaties").select("invoer").eq("id", String(ref)).eq("user_id", userId).maybeSingle();
  return (data?.invoer as { formaat?: string } | undefined)?.formaat;
}

export interface Stap {
  toolUseId: string;
  naam: string;
  input: Record<string, unknown>;
  /** Wat de maker krijgt (al opgelost: ids naar adressen). */
  maker: string;
  invoer: Record<string, unknown>;
  credits: number;
  omschrijving: string;
}

/**
 * Zet een betaalde tool-aanroep om in een stap: controleren, prijs uitrekenen, ids naar
 * adressen. Gooit met een melding die als foutresultaat terug naar Claude gaat.
 */
export async function bereidVoor(userId: string, blok: Anthropic.Beta.BetaToolUseBlock): Promise<Stap> {
  const i = (blok.input ?? {}) as Record<string, unknown>;
  const basis = { toolUseId: blok.id, naam: blok.name, input: i };
  if (blok.name === "maak_beeld") {
    const voorbeelden = await Promise.all((Array.isArray(i.voorbeelden) ? i.voorbeelden : []).slice(0, 4).map((v) => naarUrl(userId, v)));
    const invoer = { prompt: i.prompt, formaat: i.formaat, kwaliteit: i.kwaliteit, referentieUrls: voorbeelden };
    const o = maakOpdracht("beeld", invoer);
    return { ...basis, maker: "beeld", invoer, credits: o.credits, omschrijving: `Beeld${voorbeelden.length ? ` met ${voorbeelden.length} voorbeeld(en)` : ""}: ${String(i.prompt).slice(0, 90)}` };
  }
  if (blok.name === "maak_video") {
    const invoer = { bronUrl: await naarUrl(userId, i.beeld_id), prompt: i.beweging, model: i.model ?? STANDAARD_VIDEO_MODEL, formaat: await formaatVan(userId, i.beeld_id) };
    const o = maakOpdracht("beeld-naar-video", invoer);
    return { ...basis, maker: "beeld-naar-video", invoer, credits: o.credits, omschrijving: `Video: ${String(i.beweging).slice(0, 90)}` };
  }
  if (blok.name === "gebruik_app") {
    const r = recept(i.app_id);
    if (!r) throw new Error(`Onbekende app: ${String(i.app_id)}`);
    const invoer = {
      receptId: r.id,
      ...(r.zonderFoto ? {} : { fotoUrl: await naarUrl(userId, i.foto_id) }),
      tekst: i.tekst ?? "",
      formaat: i.formaat ?? (await formaatVan(userId, i.foto_id)) ?? r.zonderFoto?.formaat,
      // De Regisseur gebruikt alleen door AI bedachte personen of foto's die de gebruiker zelf aanleverde.
      toestemming: true,
    };
    const o = receptOpdracht(invoer);
    return { ...basis, maker: "recept", invoer, credits: o.credits, omschrijving: `${r.icoon} ${r.naam}${i.tekst ? `: ${String(i.tekst).slice(0, 60)}` : ""}` };
  }
  if (blok.name === "monteer") {
    const invoer = { clipIds: i.clip_ids, titel: i.titel, eindtekst: i.eindtekst, voiceover: i.voiceover, stem: i.stem, muziek: i.muziek };
    const m = leesMontage(invoer);
    return { ...basis, maker: "montage", invoer, credits: montageCredits(m), omschrijving: `Montage van ${m.clipIds.length} stukken${m.titel ? ` — "${m.titel}"` : ""}${m.voiceover ? " met voice-over" : ""}` };
  }
  throw new Error(`Onbekend gereedschap: ${blok.name}`);
}

/** Voert een stap uit: de creatie start in de wachtrij. Geeft het id terug. */
export async function voerUit(userId: string, s: Stap): Promise<string> {
  const c = await startCreatie(userId, s.maker, s.invoer);
  if (c.status === "mislukt") throw new Error(c.foutmelding ?? "Mislukt bij het insturen.");
  return c.id;
}

/** De gratis gereedschappen, meteen uitgevoerd. */
export async function gratis(userId: string, blok: Anthropic.Beta.BetaToolUseBlock): Promise<string> {
  const i = (blok.input ?? {}) as Record<string, unknown>;
  if (blok.name === "lees_webpagina") {
    const p = await leesProductpagina(String(i.url ?? ""));
    return JSON.stringify({ ...p, fotos: p.fotos.slice(0, 6) });
  }
  if (blok.name === "mijn_werk") {
    let q = createServiceClient()
      .from("creaties")
      .select("id, soort, maker, prompt, url, created_at")
      .eq("user_id", userId)
      .eq("status", "klaar")
      .order("created_at", { ascending: false })
      .limit(Math.min(30, Number(i.aantal) || 15));
    if (i.soort === "beeld" || i.soort === "video") q = q.eq("soort", i.soort);
    const { data } = await q;
    return JSON.stringify(data ?? []);
  }
  throw new Error(`Onbekend gereedschap: ${blok.name}`);
}
