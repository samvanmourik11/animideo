// DE SPEURTOCHT — elke ochtend zoekt Claude op internet wat er nu viral gaat op TikTok,
// Instagram en YouTube Shorts, en maakt van elke trend die met onze bouwstenen na te maken
// is een voorstel: titel, waarom hij viral is, waar je hem ziet, en de maakmethode met de
// opdracht erbij. Sam zet een voorstel live op /admin/trends (Sam, 24-10-2026: eerst keuren).
//
// Twee rondes: eerst zoeken (met web search, vrije tekst met bronnen), dan uitschrijven in een
// vast formaat. In één ronde gaat dat niet samen: de bronvermelding van web search en een
// vast JSON-formaat bijten elkaar.

import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { ADMIN_ACCOUNTS } from "@/lib/studio/access";
import { METHODES, METHODE_INFO, MAX_CLIP_SEC, isMethode, leesOpdracht, leesVelden, lijktOp } from "./types";
import { vulLinksAan } from "./voorbeelden";
import { voegToe, zoekTikToks } from "./tiktok";

const MODEL = "claude-opus-5-5";
const AFZENDER = "Animideo <noreply@jouwanimatievideo.nl>";
const MAX_VOORSTELLEN = 5;

const BOUWSTENEN = METHODES.map((m) => `- "${m}" — ${METHODE_INFO[m].naam}: ${METHODE_INFO[m].wanneer}`).join("\n");

const REGELS = `Regels voor wat we wel en niet namaken:
- De klant is de ster. Maak NOOIT van de klant een bekend persoon (geen gezicht van Özil, een artiest of politicus); de klant doet het moment zelf na.
- Geen echte logo's of merknamen in de opdrachten (geen clublogo, geen Nike-swoosh): omschrijf het ("a red and white football kit with number 10").
- Niets seksueels, gevaarlijks (challenges waarbij je je kunt bezeren), haatdragends, politieks, of gebaseerd op een ramp, ongeluk of overlijden.
- Alleen trends die nú lopen (de laatste 1-3 weken) of al maanden groot zijn en blijven terugkomen. Geen trends van vorig jaar die voorbij zijn.
- Liefst trends die ook Nederlanders en Nederlandse bedrijven willen maken. Nederlandse trends tellen extra.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    trends: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          titel: { type: "string", description: "Korte, pakkende Nederlandse naam, bv. 'De goal van Özil'." },
          uitleg: { type: "string", description: "Voor de klant, Nederlands, 1 zin: wat je krijgt. Bv. 'Jij maakt die legendarische volley, met de muziek van de trend.'" },
          waarom_viral: { type: "string", description: "Voor Sam: waarom dit nu viral is, hoe groot, sinds wanneer, waar." },
          origineel: { type: "string", description: "Hoe het origineel gemaakt is (echte opname, Kling motion control, ChatGPT-beeld, CapCut-sjabloon …) en hoe wij het namaken." },
          bron_links: { type: "array", items: { type: "object", additionalProperties: false, properties: { url: { type: "string" }, titel: { type: "string" } }, required: ["url", "titel"] }, description: "Concrete video's van de trend eerst (TikTok /video/, YouTube Short, Instagram-reel), dan artikelen met screenshots." },
          icoon: { type: "string", description: "Eén emoji." },
          methode: { type: "string", enum: [...METHODES] },
          fotos: { type: "array", items: { type: "string" }, description: "Per foto die de klant aanlevert een label, bv. 'Een foto van jezelf, van top tot teen'. 0 bij tekst-foto/tekst-video, 1 meestal, max 2." },
          tekstveld: {
            type: "object",
            additionalProperties: false,
            description: "Optioneel invulveld. Laat label leeg als er geen nodig is.",
            properties: { label: { type: "string" }, placeholder: { type: "string" }, verplicht: { type: "boolean" } },
            required: ["label", "placeholder", "verplicht"],
          },
          scenePrompt: { type: "string", description: "Engels, voor Nano Banana Pro: hoe het beeld/de scène eruitziet, met de persoon uit de referentiefoto. {tekst} = het invulveld. Leeg als de methode geen scène heeft." },
          bewegingPrompt: { type: "string", description: "Engels, voor Kling: wat er beweegt en hoe de camera gaat. Leeg bij 'foto'/'tekst-foto'." },
          formaat: { type: "string", enum: ["9:16", "1:1", "16:9"] },
          gezicht: { type: "boolean", description: "Staat er een herkenbaar gezicht van de klant in?" },
          hotness: { type: "integer", description: "1-10: hoe hard het nu gaat." },
          clip_zoeken: { type: "string", description: "Bij 'beweging'/'pratend': welke clip Sam moet downloaden als voorbeeld (welke video, welk fragment, max 15 s). Anders leeg." },
        },
        required: ["titel", "uitleg", "waarom_viral", "origineel", "bron_links", "icoon", "methode", "fotos", "tekstveld", "scenePrompt", "bewegingPrompt", "formaat", "gezicht", "hotness", "clip_zoeken"],
      },
    },
  },
  required: ["trends"],
};

export interface Voorstel {
  titel: string;
  uitleg: string;
  waarom_viral: string;
  origineel: string;
  bron_links: { url: string; titel: string }[];
  icoon: string;
  methode: string;
  fotos: string[];
  tekstveld: { label: string; placeholder: string; verplicht: boolean };
  scenePrompt: string;
  bewegingPrompt: string;
  formaat: string;
  gezicht: boolean;
  hotness: number;
  clip_zoeken: string;
}

function tekstUit(m: Anthropic.Message): string {
  return m.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

/**
 * Ronde 1: zoeken. Web search draait bij Anthropic zelf; bij een lange zoektocht pauzeert
 * Claude de beurt (pause_turn) en gaan we gewoon door met hetzelfde gesprek.
 */
async function zoek(client: Anthropic, opdracht: string, bekend: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opdracht }];
  const system = `Je bent de trendspotter van Animideo, een Nederlandse app waarmee mensen en bedrijven met AI beelden en video's maken. Je zoekt op internet uit wat er NU viral gaat op TikTok, Instagram Reels en YouTube Shorts (in Nederland en wereldwijd) en wat mensen massaal namaken: een goal of dansje dat iedereen nadoet, een AI-effect, een audio-meme, een fototrend.

Zoek breed (trendrapporten, nieuws, TikTok Creative Center, Instagram-trendlijstjes, Nederlandse media) en controleer dat het echt nu loopt. Schrijf per trend op: wat het is, waarom viral, sinds wanneer, hoe het origineel gemaakt is, en links waar je hem ziet (echte url's uit je zoekresultaten, niets verzinnen). Geef per trend minstens één of twee links naar een concrete video van de trend zelf (een TikTok-video met /video/ in het adres, een YouTube Short of een Instagram-reel), niet alleen een overzichtspagina of hashtag: die video laten we klanten zien als voorbeeld. Een artikel met screenshots van de trend is een goede aanvulling.

Onze bouwstenen om iets na te maken:
${BOUWSTENEN}
De trendvideo bij "beweging"/"pratend" is maximaal ${MAX_CLIP_SEC} seconden.

${REGELS}

Trends die we al hebben (niet opnieuw voorstellen, ook niet onder een andere naam):
${bekend || "(nog geen)"}`;

  for (let ronde = 0; ronde < 5; ronde++) {
    const m = await client.messages
      .stream({
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        system,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 12 }],
        messages,
      })
      .finalMessage();
    if (m.stop_reason !== "pause_turn") return tekstUit(m);
    messages.push({ role: "assistant", content: m.content });
  }
  throw new Error("De zoektocht bleef maar doorgaan.");
}

/** Ronde 2: uitschrijven in het vaste formaat, met de opdrachten erbij. */
async function schrijfUit(client: Anthropic, verslag: string): Promise<Voorstel[]> {
  const m = await client.messages
    .stream({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      system: `Je maakt van een verslag over virale trends kant-en-klare recepten voor de Trends-studio van Animideo. Kies per trend de bouwsteen die het origineel het best benadert (elke trend is anders gemaakt) en schrijf de opdrachten zoals een vakman: concreet over decor, kleding, licht, camera en beweging.

Bouwstenen:
${BOUWSTENEN}

Hoe de bouwstenen werken:
- foto / foto-video: Nano Banana Pro bewerkt de foto('s) van de klant met scenePrompt ("the person from the reference photo …"). foto-video laat dat beeld daarna 5 s bewegen met Kling 2.5 (bewegingPrompt).
- video-effect: Kling 2.5 laat de foto van de klant 5 s bewegen met bewegingPrompt (geen scène).
- tekst-foto / tekst-video: geen foto; scenePrompt (beeld) of bewegingPrompt (5 s video) komt helemaal uit de tekst, met {tekst} voor wat de klant invult.
- beweging: Kling Motion Control neemt de beweging over uit de trendvideo die Sam erbij zet (houding volgt de video, het geluid van de trend blijft). Optioneel eerst een scenePrompt om de klant in het juiste decor/de juiste kleding te zetten (bv. voetbaltenue op een stadionveld). bewegingPrompt mag kort zijn of leeg.
- pratend: Kling Avatar laat de foto (of de scène) het geluid van de trend playbacken. Optioneel een scenePrompt.
Video's vanuit een stilstaande foto kunnen slecht iets toevoegen dat er niet is (sneeuw die valt, een sprong door de lucht): kies dan liever "beweging" of een foto-trend.

${REGELS}

Alleen trends die écht na te maken zijn; twijfel je, laat hem weg. Hooguit ${MAX_VOORSTELLEN}, de heetste eerst. Niets geschikts? Een lege lijst is een goed antwoord.`,
      messages: [{ role: "user", content: `Het verslag van vandaag:\n\n${verslag}` }],
    })
    .finalMessage();
  return ((JSON.parse(tekstUit(m) || "{}") as { trends?: Voorstel[] }).trends ?? []).slice(0, MAX_VOORSTELLEN);
}

function naarRij(v: Voorstel, bron: string) {
  if (!isMethode(v.methode) || !v.titel?.trim()) return null;
  const zonderFoto = v.methode === "tekst-foto" || v.methode === "tekst-video";
  const velden = leesVelden({
    fotos: zonderFoto ? [] : (v.fotos?.length ? v.fotos : ["Een foto van jezelf"]).map((label) => ({ label })),
    tekst: v.tekstveld?.label?.trim() ? v.tekstveld : null,
  });
  const clip = v.clip_zoeken?.trim();
  return {
    titel: v.titel.trim().slice(0, 80),
    uitleg: (v.uitleg ?? "").trim().slice(0, 300),
    waarom_viral: [v.waarom_viral?.trim(), clip ? `🎬 Trendvideo nodig: ${clip}` : ""].filter(Boolean).join("\n\n").slice(0, 2000),
    origineel: (v.origineel ?? "").trim().slice(0, 600),
    bron_links: (v.bron_links ?? []).filter((l) => /^https?:\/\//.test(l.url)).slice(0, 6),
    icoon: (v.icoon ?? "🔥").trim().slice(0, 8) || "🔥",
    methode: v.methode,
    velden,
    opdracht: leesOpdracht(v),
    gezicht: !zonderFoto && v.gezicht !== false,
    hotness: Math.min(10, Math.max(1, Math.round(Number(v.hotness) || 5))),
    status: "voorstel",
    bron,
  };
}

async function bekendeTitels(): Promise<string[]> {
  const { data } = await createServiceClient().from("trends").select("titel").limit(500);
  return (data ?? []).map((t) => t.titel as string);
}

async function bekendeTrends(): Promise<string> {
  const { data } = await createServiceClient().from("trends").select("titel, status").order("created_at", { ascending: false }).limit(150);
  return (data ?? []).map((t) => `- ${t.titel}${t.status === "afgewezen" ? " (afgewezen)" : ""}`).join("\n");
}

/** Zoeken en uitschrijven, zonder iets op te slaan (ook voor een proefronde). */
export async function zoekVoorstellen(bekend: string): Promise<Voorstel[]> {
  const client = new Anthropic();
  const verslag = await zoek(
    client,
    `Vandaag is het ${new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}. Wat gaat er nu viral dat mensen massaal namaken? Zoek de 5-10 sterkste kandidaten.`,
    bekend,
  );
  return schrijfUit(client, verslag);
}

/** De dagelijkse ronde: zoeken, uitschrijven, opslaan, Sam mailen. */
export async function speurtocht(): Promise<{ nieuw: number; titels: string[] }> {
  return bewaar(await zoekVoorstellen(await bekendeTrends()), "speurtocht");
}

/** Sam zag zelf iets (een link of een omschrijving): zoek het uit en maak er een voorstel van. */
export async function voegToeVanuit(tip: string): Promise<{ nieuw: number; titels: string[] }> {
  const client = new Anthropic();
  const verslag = await zoek(
    client,
    `Sam (de eigenaar) zag deze trend en wil hem in de app: "${tip.slice(0, 1000)}". Zoek uit wat het precies is, hoe groot het is, hoe het origineel gemaakt is en waar je hem ziet. Beschrijf alleen deze ene trend (ook als hij al op de lijst lijkt te staan: dan in een nieuwe variant).`,
    "",
  );
  return bewaar(await schrijfUit(client, verslag), "handmatig", 1);
}

async function bewaar(voorstellen: Voorstel[], bron: string, max = MAX_VOORSTELLEN) {
  // Claude krijgt de lijst al mee, maar twee zoekrondes tegelijk (de ochtendronde en "Zoek
  // nu") zagen elkaars vondsten niet: zo stonden er op 25-10 twee keer "Pray For Me".
  const bekend = bron === "speurtocht" ? await bekendeTitels() : [];
  const ruw = voorstellen.map((v) => naarRij(v, bron)).filter((r): r is NonNullable<typeof r> => !!r);
  const uniek = ruw.filter((r, i) => !bekend.some((t) => lijktOp(t, r.titel)) && !ruw.slice(0, i).some((x) => lijktOp(x.titel, r.titel))).slice(0, max);
  // Bij elke trend echte TikToks als voorbeeld (Sam: veel beter dan screenshots). Lukt het
  // zoeken niet, dan gaat de trend gewoon door met wat er wel is.
  const rijen = await Promise.all(
    uniek.map(async (r) => {
      const tiktoks = await zoekTikToks(r).catch((e) => (console.error("[trends] TikToks zoeken mislukt:", e), []));
      return { ...r, bron_links: await vulLinksAan(voegToe(r.bron_links, tiktoks)) };
    }),
  );
  if (rijen.length) {
    const { error } = await createServiceClient().from("trends").insert(rijen);
    if (error) throw new Error(error.message);
    if (bron === "speurtocht") await mailSam(rijen.map((r) => `${r.icoon} ${r.titel} — ${METHODE_INFO[r.methode as keyof typeof METHODE_INFO].naam}`));
  }
  return { nieuw: rijen.length, titels: rijen.map((r) => r.titel) };
}

async function mailSam(regels: string[]) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const link = `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://ai.jouwanimatievideo.nl").replace(/\/$/, "")}/admin/trends`;
  const tekst = `Ik vond vandaag ${regels.length} nieuwe trend${regels.length === 1 ? "" : "s"} die klanten kunnen namaken:\n\n${regels.join("\n")}\n\nKeur ze op de beheerpagina; pas daarna zien klanten ze.`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: AFZENDER, to: [...ADMIN_ACCOUNTS], subject: `🔥 ${regels.length} nieuwe trend${regels.length === 1 ? "" : "s"} om te keuren`, text: `${tekst}\n\nNaar de trends: ${link}` }),
  });
  if (!res.ok) console.error("[trends] mail mislukt:", res.status, (await res.text().catch(() => "")).slice(0, 200));
}
