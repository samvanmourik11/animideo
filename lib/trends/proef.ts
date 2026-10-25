// DE PROEF — voordat Sam een trend te zien krijgt, maken we hem zelf na met een verzonnen
// testpersoon, en kijkt Claude of het resultaat klopt met het origineel (Sam, 25-10-2026: "doe
// eerst zelf een test om te kijken of het goed is; liever 1 goed dan 10 slecht").
//
//   proef    — de test loopt (een gewone trend-creatie op Sams account: kost geen credits,
//              wel echte fal-kosten, en Sam ziet de tests terug in zijn bibliotheek)
//   goed     → 'voorstel', met ons eigen resultaat als voorbeeld op de tegel, mail naar Sam
//   niet goed → Claude past het recept één keer aan en we testen opnieuw; daarna 'afgewezen'
//
// Een video duurt tot een kwartier; daarom loopt dit via een cron die elke 10 minuten kijkt.

import Anthropic from "@anthropic-ai/sdk";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServiceClient } from "@/lib/supabase/service";
import { ADMIN_ACCOUNTS } from "@/lib/studio/access";
import type { Creatie } from "@/lib/creaties/types";
import { haalTrend, startTrend, verversTrend } from "./regie";
import { METHODE_INFO, leesOpdracht, voorbeeldTekst, type Trend, type TrendOpdracht } from "./types";

const MODEL = "claude-opus-5-5";
const AFZENDER = "Animideo <noreply@jouwanimatievideo.nl>";
export const MAX_POGINGEN = 2;
/** Zo veel proeven tegelijk; meer kost geld zonder dat Sam erom vroeg. */
export const MAX_PROEVEN_PER_DAG = 3;

/** Door AI verzonnen testpersonen (25-10-2026), van top tot teen, neutrale achtergrond. */
export const TESTPERSONEN = {
  man: "https://suuskaaobsbttahqcoct.supabase.co/storage/v1/object/public/scene-assets/trends/creaties/8c9fd628-adf6-4561-84b8-9961daae4d5b.jpg",
  vrouw: "https://suuskaaobsbttahqcoct.supabase.co/storage/v1/object/public/scene-assets/trends/creaties/247b3ee7-de30-4511-9a17-803aa23b08a5.jpg",
};

/** Op wiens account de proeven lopen: Sams (onbeperkt, en hij mag voorstellen maken). */
const PROEF_GEBRUIKER = process.env.TREND_PROEF_GEBRUIKER ?? "e5f6f9ae-1bd7-424f-adc0-037b6fe9600d";

export interface Poging {
  creatieId: string;
  gestart: string;
  oordeel?: "goed" | "niet goed" | "mislukt";
  score?: number;
  opmerking?: string;
}

export interface Proef {
  pogingen: Poging[];
}

function proefVan(t: { proef?: unknown }): Proef {
  const p = t.proef as Proef | undefined;
  return { pogingen: Array.isArray(p?.pogingen) ? p!.pogingen : [] };
}

/** Start een (nieuwe) proef van deze trend. De trend moet op 'proef' staan. */
export async function startProef(trendId: string): Promise<Poging> {
  const t = await haalTrend(trendId);
  if (!t) throw new Error("Trend bestaat niet");
  const fotos = t.velden.fotos.map((_, i) => (i % 2 === 0 ? TESTPERSONEN.vrouw : TESTPERSONEN.man));
  const c = await startTrend(PROEF_GEBRUIKER, { trendId, fotos, tekst: voorbeeldTekst(t), toestemming: true }, null, { zonderSessie: true });
  const poging: Poging = { creatieId: c.id, gestart: new Date().toISOString() };
  const proef = proefVan(t);
  await createServiceClient().from("trends").update({ proef: { pogingen: [...proef.pogingen, poging] }, updated_at: new Date().toISOString() }).eq("id", trendId);
  return poging;
}

async function ffmpeg(args: string[]) {
  const ff = (await import("ffmpeg-static")).default as unknown as string;
  const { execFile } = await import("node:child_process");
  await new Promise<void>((ok, fout) => execFile(ff, ["-hide_banner", "-y", ...args], { timeout: 120000 }, (e, _o, err) => (e ? fout(new Error(String(err).slice(-300))) : ok())));
}

/** Beelden uit een video (of het beeld zelf), klein genoeg om Claude te laten kijken. */
export async function beelden(url: string, aantal: number, duur = 12): Promise<Buffer[]> {
  const map = await mkdtemp(path.join(tmpdir(), "proef-"));
  try {
    const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(url);
    await ffmpeg(["-i", url, ...(isVideo ? ["-vf", `fps=${aantal}/${Math.max(1, Math.round(duur))},scale=400:-2`, "-frames:v", String(aantal)] : ["-vf", "scale=600:-2", "-frames:v", "1"]), "-q:v", "4", path.join(map, "b%02d.jpg")]);
    const namen = (await readdir(map)).filter((n) => n.endsWith(".jpg")).sort();
    return Promise.all(namen.map((n) => readFile(path.join(map, n))));
  } finally {
    await rm(map, { recursive: true, force: true });
  }
}

const OORDEEL = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "integer", description: "1-10: hoe goed lijkt ons resultaat op de trend, en is het netjes genoeg om aan klanten te laten zien?" },
    wat_goed: { type: "string" },
    wat_mis: { type: "string", description: "Concreet: glitches, verkeerde persoon, effect ontbreekt, rare handen …" },
    verbeterd: {
      type: "object",
      additionalProperties: false,
      description: "Een aangepast recept dat de fouten zou moeten oplossen. Leeg laten (lege strings) als het al goed is.",
      properties: { scenePrompt: { type: "string" }, bewegingPrompt: { type: "string" } },
      required: ["scenePrompt", "bewegingPrompt"],
    },
  },
  required: ["score", "wat_goed", "wat_mis", "verbeterd"],
};

/** Waar we het origineel van kennen: de trendvideo, de video die Sam plakte, het Higgsfield-voorbeeld, of een TikTok-omslag. */
function referentie(t: Trend): string | null {
  return t.voorbeeldclip ?? t.opdracht.referentie ?? (t.bron === "higgsfield" ? t.voorbeeld_url : null) ?? t.bron_links.find((l) => l.beeld)?.beeld ?? null;
}

async function beoordeel(t: Trend, resultaat: string) {
  const ref = referentie(t);
  const [refBeelden, uitBeelden, testfoto] = await Promise.all([ref ? beelden(ref, 6) : Promise.resolve([]), beelden(resultaat, 8), beelden(TESTPERSONEN.vrouw, 1)]);
  const blok = (b: Buffer) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: b.toString("base64") } });
  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: `De trend "${t.titel}": ${t.uitleg}\nHoe het origineel gemaakt is: ${t.origineel ?? "?"}\nOnze methode: ${METHODE_INFO[t.methode].naam}. Ons recept: ${JSON.stringify(t.opdracht)}` },
    ...(refBeelden.length ? [{ type: "text" as const, text: "Het origineel (beelden op volgorde):" }, ...refBeelden.map(blok)] : []),
    { type: "text", text: "De testpersoon die we gebruikten:" },
    ...testfoto.map(blok),
    { type: "text", text: "Ons resultaat (beelden op volgorde):" },
    ...uitBeelden.map(blok),
  ];
  const m = await new Anthropic().messages
    .stream({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "medium", format: { type: "json_schema", schema: OORDEEL } },
      system: `Je bent de strenge eindredacteur van de Trends-studio van Animideo. We maakten een virale AI-trend na met een testpersoon. Beoordeel eerlijk of een klant hier blij van wordt: herken je de trend, is de testpersoon herkenbaar dezelfde persoon, zijn er glitches (springend decor, verdwijnende voorwerpen, vervormde handen/gezichten, flikkering), en ziet het er verzorgd uit? 7 of hoger = goed genoeg om aan Sam voor te stellen. Lager: zeg concreet wat er mis is en schrijf een verbeterd recept (Engels) dat die fouten voorkomt.`,
      messages: [{ role: "user", content }],
    })
    .finalMessage();
  return JSON.parse(m.content.map((b) => (b.type === "text" ? b.text : "")).join("") || "{}") as {
    score: number;
    wat_goed: string;
    wat_mis: string;
    verbeterd: { scenePrompt: string; bewegingPrompt: string };
  };
}

async function werkBij(id: string, wijziging: Record<string, unknown>) {
  await createServiceClient().from("trends").update({ ...wijziging, updated_at: new Date().toISOString() }).eq("id", id);
}

/** Kijkt naar alle lopende proeven en zet ze een stap verder. Voor de cron. */
export async function verwerkProeven(): Promise<string[]> {
  const db = createServiceClient();
  const { data } = await db.from("trends").select("*").eq("status", "proef").limit(10);
  const log: string[] = [];
  for (const t of (data ?? []) as (Trend & { proef: Proef })[]) {
    try {
      log.push(`${t.titel}: ${await verwerkEen(t)}`);
    } catch (e) {
      log.push(`${t.titel}: fout ${String(e).slice(0, 200)}`);
    }
  }
  return log;
}

async function verwerkEen(t: Trend & { proef: Proef }): Promise<string> {
  const proef = proefVan(t);
  const laatste = proef.pogingen.at(-1);
  if (!laatste) {
    await startProef(t.id);
    return "proef gestart";
  }
  if (laatste.oordeel) return "wacht";
  const { data } = await createServiceClient().from("creaties").select("*").eq("id", laatste.creatieId).maybeSingle();
  if (!data) return "creatie kwijt";
  const c = await verversTrend(data as Creatie);
  if (c.status === "bezig") return "bezig";

  let poging: Poging;
  if (c.status === "mislukt" || !c.url) {
    poging = { ...laatste, oordeel: "mislukt", opmerking: c.foutmelding ?? "geen resultaat" };
  } else {
    const o = await beoordeel(t, c.url);
    const goed = o.score >= 7;
    poging = { ...laatste, oordeel: goed ? "goed" : "niet goed", score: o.score, opmerking: goed ? o.wat_goed : o.wat_mis };
    if (goed) {
      await werkBij(t.id, {
        status: "voorstel",
        proef: { pogingen: [...proef.pogingen.slice(0, -1), poging] },
        voorbeeld_url: c.url,
        voorbeeld_soort: c.soort === "video" ? "video" : "beeld",
      });
      await mailSam(t, poging);
      return `goed (${o.score}/10) → voorstel`;
    }
    if (proef.pogingen.length < MAX_POGINGEN && (o.verbeterd.scenePrompt || o.verbeterd.bewegingPrompt)) {
      const opdracht: TrendOpdracht = leesOpdracht({
        ...t.opdracht,
        ...(o.verbeterd.scenePrompt ? { scenePrompt: o.verbeterd.scenePrompt } : {}),
        ...(o.verbeterd.bewegingPrompt ? { bewegingPrompt: o.verbeterd.bewegingPrompt } : {}),
      });
      await werkBij(t.id, { opdracht, proef: { pogingen: [...proef.pogingen.slice(0, -1), poging] } });
      await startProef(t.id);
      return `niet goed (${o.score}/10), recept aangepast, nieuwe proef`;
    }
  }
  const pogingen = [...proef.pogingen.slice(0, -1), poging];
  if (poging.oordeel === "mislukt" && proef.pogingen.length < MAX_POGINGEN) {
    await werkBij(t.id, { proef: { pogingen } });
    await startProef(t.id);
    return "mislukt, opnieuw";
  }
  await werkBij(t.id, { status: "afgewezen", proef: { pogingen }, waarom_viral: `${t.waarom_viral ?? ""}\n\n❌ Proef niet goed genoeg: ${poging.opmerking ?? ""}`.trim() });
  return `afgewezen na ${pogingen.length} proef${pogingen.length === 1 ? "" : "fen"}`;
}

/** Hoeveel proeven er vandaag al gestart zijn (het dagplafond). */
export async function proevenVandaag(): Promise<number> {
  const sinds = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await createServiceClient().from("creaties").select("id", { count: "exact", head: true }).eq("maker", "trend").eq("user_id", PROEF_GEBRUIKER).gte("created_at", sinds).contains("invoer", { fotos: [TESTPERSONEN.vrouw] });
  return count ?? 0;
}

const BASIS = (process.env.NEXT_PUBLIC_APP_URL ?? "https://ai.jouwanimatievideo.nl").replace(/\/$/, "");

async function mailSam(t: Trend, p: Poging) {
  const tekst = `Nieuwe trend, door mij getest (${p.score}/10): ${t.icoon} ${t.titel}\n\n${t.uitleg}\n\nHoe het gemaakt is: ${t.origineel ?? ""}\n\nUit de test: ${p.opmerking ?? ""}\n\nBekijk het testresultaat en zet hem live: ${BASIS}/studios/trends/${t.id}`;
  await mailBeheer(`🔥 Getest en klaar om te keuren: ${t.titel}`, tekst);
}

/** Een mail aan Sam over de trends (ook als iets in de achtergrond misging). */
export async function mailBeheer(onderwerp: string, tekst: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: AFZENDER, to: [...ADMIN_ACCOUNTS], subject: onderwerp, text: `${tekst}\n\n${BASIS}/admin/trends` }),
  });
  if (!res.ok) console.error("[trends] mail mislukt:", res.status);
}
