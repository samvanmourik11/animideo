// TRENDS VAN HIGGSFIELD — Sam (25-10-2026): "geen random virals, maar virals gemaakt met
// bijvoorbeeld Higgsfield; achterhaal hoe ze gemaakt zijn, wij hebben via fal ook alle
// modellen. Zo kunnen mensen echt eerst de trend zien en dan zelf ook doen."
//
// Twee soorten:
//   genjutsu — "beweging overnemen": Higgsfield geeft de originele video waar de beweging uit
//              komt. Dat is onze methode 'beweging' (Kling Motion Control via fal), één op één.
//   viral    — een effect op één foto (Vanish, Melting, Clones …). Hoe Higgsfield dat doet,
//              houden ze verborgen. Claude bekijkt daarom beelden uit hun voorbeeldvideo en
//              schrijft ons eigen recept met de modellen die wij via fal hebben.
//
// Higgsfield heeft geen openbare lijst die onze server kan ophalen (hun site laadt alles in de
// browser); de lijst komt via de Higgsfield-koppeling van Claude Code en gaat hier naar binnen.

import Anthropic from "@anthropic-ai/sdk";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadNaarOpslag } from "@/lib/creaties/wachtrij";
import { verwerkClip } from "./clip";
import { METHODE_INFO, leesOpdracht, leesVelden } from "./types";

const MODEL = "claude-opus-5-5";

export interface HiggsfieldTrend {
  id: string;
  soort: "genjutsu" | "viral";
  naam: string;
  beschrijving: string;
  /** Het resultaat zoals Higgsfield het laat zien. */
  voorbeeld: string;
  /** Alleen bij genjutsu: de originele video waar de beweging uit komt. */
  bronvideo?: string;
  /** Plek in de trending-lijst (0 = bovenaan). */
  plek: number;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    geschikt: { type: "boolean", description: "Kunnen we dit met onze modellen goed namaken, en is het netjes genoeg voor een zakelijke app?" },
    waarom_niet: { type: "string" },
    titel: { type: "string", description: "Korte, pakkende Nederlandse naam." },
    uitleg: { type: "string", description: "Voor de klant, Nederlands, 1 zin: wat je krijgt." },
    icoon: { type: "string" },
    methode: { type: "string", enum: ["beweging", "video-effect", "foto-video"] },
    fotoLabel: { type: "string", description: "Wat voor foto de klant aanlevert, bv. 'Een foto van jezelf, van top tot teen'." },
    tekstveld: {
      type: "object",
      additionalProperties: false,
      properties: { label: { type: "string" }, placeholder: { type: "string" }, verplicht: { type: "boolean" } },
      required: ["label", "placeholder", "verplicht"],
    },
    scenePrompt: { type: "string", description: "Engels, Nano Banana Pro; leeg als niet nodig." },
    bewegingPrompt: { type: "string", description: "Engels, voor Kling." },
    gezicht: { type: "boolean" },
    hoe_gemaakt: { type: "string", description: "Voor Sam: hoe Higgsfield dit waarschijnlijk maakt (welk soort model/stappen) en hoe wij het namaken met fal." },
  },
  required: ["geschikt", "waarom_niet", "titel", "uitleg", "icoon", "methode", "fotoLabel", "tekstveld", "scenePrompt", "bewegingPrompt", "gezicht", "hoe_gemaakt"],
};

async function ffmpeg(args: string[]): Promise<string> {
  const ff = (await import("ffmpeg-static")).default as unknown as string;
  const { execFile } = await import("node:child_process");
  return new Promise((ok, fout) =>
    execFile(ff, ["-hide_banner", "-y", ...args], { maxBuffer: 1 << 24, timeout: 120000 }, (e, _o, err) => (e ? fout(new Error(String(err).slice(-300))) : ok(String(err)))),
  );
}

/** Zes beelden verspreid over de video, zodat Claude het verloop van het effect ziet. */
async function beeldenUit(video: string): Promise<Buffer[]> {
  const map = await mkdtemp(path.join(tmpdir(), "hf-"));
  try {
    await ffmpeg(["-i", video, "-vf", "fps=1.2,scale=480:-2", "-frames:v", "8", "-q:v", "4", path.join(map, "b%02d.jpg")]);
    const namen = (await readdir(map)).filter((n) => n.endsWith(".jpg")).sort();
    return Promise.all(namen.map((n) => readFile(path.join(map, n))));
  } finally {
    await rm(map, { recursive: true, force: true });
  }
}

async function kopie(url: string, ext: string, mime: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Ophalen mislukt (HTTP ${res.status})`);
  return uploadNaarOpslag("trends", Buffer.from(await res.arrayBuffer()), ext, mime);
}

async function recept(h: HiggsfieldTrend, beelden: Buffer[]) {
  const content: Anthropic.ContentBlockParam[] = [
    ...beelden.map((b) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: b.toString("base64") } })),
    {
      type: "text",
      text: `Higgsfield-trend "${h.naam}" (${h.soort === "genjutsu" ? "Genjutsu: beweging uit een bestaande video overnemen op de foto van de gebruiker" : "Viral-effect: één foto van de gebruiker wordt deze video"}).
Beschrijving van Higgsfield: ${h.beschrijving || "(geen)"}
Hierboven: beelden uit hun voorbeeldvideo, op volgorde.`,
    },
  ];
  const m = await new Anthropic().messages
    .stream({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: `Je zet trending Higgsfield-presets om naar recepten voor de Trends-studio van Animideo (Nederlandse AI-app voor makers en bedrijven). Wij hebben via fal:
- "beweging": Kling 2.6 Motion Control — de persoon van de klantfoto doet exact de beweging uit de originele video na (houding, dans, actie), met het geluid van de video. Optioneel eerst een scenePrompt (Nano Banana Pro) die de klant in het decor/de kleding van de trend zet.
- "video-effect": Kling 2.5 maakt van de klantfoto een video van 5 s met bewegingPrompt.
- "foto-video": eerst scenePrompt (Nano Banana Pro bewerkt de klantfoto), dan Kling 2.5 met bewegingPrompt.
Bij Genjutsu kies je altijd "beweging" (de originele video krijgen we mee). Kijk goed naar de beelden: wat gebeurt er, welk decor, welke kleding hoort bij de trend? Schrijf de Kling-opdracht als een vakman: wat beweegt, in welke volgorde, camera, tempo. Video's vanuit een stilstaande foto kunnen slecht dingen toevoegen die er niet zijn; beschrijf het effect daarom expliciet en concreet.
Regels: de klant is de ster, maak hem nooit tot een bekend persoon; geen logo's of merknamen in de opdrachten; niets seksueels, gevaarlijks of politieks. Niet geschikt (te expliciet, alleen voor een bepaald product, niet na te maken)? Zet geschikt op false.`,
      messages: [{ role: "user", content }],
    })
    .finalMessage();
  return JSON.parse(m.content.map((b) => (b.type === "text" ? b.text : "")).join("") || "{}");
}

/** Welke Higgsfield-ids hebben we al (ook afgewezen), zodat we niets dubbel inlezen. */
export async function bekendeHiggsfieldIds(): Promise<Set<string>> {
  const { data } = await createServiceClient().from("trends").select("bron_links").eq("bron", "higgsfield").limit(1000);
  const ids = (data ?? []).flatMap((t) => (t.bron_links as { url: string }[]).map((l) => l.url.match(/#hf-([0-9a-f-]{36})/)?.[1]));
  return new Set(ids.filter((x): x is string => !!x));
}

/** Leest één Higgsfield-trend in als voorstel. Geeft de titel terug, of waarom niet. */
export async function importeer(h: HiggsfieldTrend): Promise<string> {
  const beelden = await beeldenUit(h.voorbeeld);
  const r = await recept(h, beelden);
  if (!r.geschikt) return `overgeslagen (${r.waarom_niet})`;
  const methode = h.soort === "genjutsu" ? "beweging" : ["video-effect", "foto-video"].includes(r.methode) ? r.methode : "video-effect";
  const voorbeeld_url = await kopie(h.voorbeeld, "mp4", "video/mp4");
  const clip = h.bronvideo ? await verwerkClip(h.bronvideo) : null;
  const rij = {
    titel: String(r.titel).slice(0, 80),
    uitleg: String(r.uitleg).slice(0, 300),
    waarom_viral: `Staat op plek ${h.plek + 1} van ${h.soort === "genjutsu" ? "Genjutsu trending" : "de Viral-effecten"} op Higgsfield (${h.naam}).`,
    origineel: String(r.hoe_gemaakt).slice(0, 600),
    bron_links: [{ url: `https://higgsfield.ai/ai/video?model=genjutsu#hf-${h.id}`, titel: `Higgsfield · ${h.naam}` }],
    icoon: String(r.icoon || "🔥").slice(0, 8),
    methode,
    velden: leesVelden({ fotos: [{ label: r.fotoLabel || "Een foto van jezelf" }], tekst: r.tekstveld?.label ? r.tekstveld : null }),
    opdracht: leesOpdracht({ scenePrompt: r.scenePrompt, bewegingPrompt: r.bewegingPrompt, formaat: "9:16" }),
    gezicht: r.gezicht !== false,
    // Bovenaan de trending-lijst = heetst.
    hotness: Math.max(5, 10 - Math.floor(h.plek / 3)),
    voorbeeld_url,
    voorbeeld_soort: "video",
    ...(clip ?? {}),
    status: "voorstel",
    bron: "higgsfield",
  };
  if (!METHODE_INFO[rij.methode as keyof typeof METHODE_INFO]) throw new Error("Onbekende methode");
  const { error } = await createServiceClient().from("trends").insert(rij);
  if (error) throw new Error(error.message);
  return rij.titel;
}
