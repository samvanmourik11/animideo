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
import { METHODES, METHODE_INFO, MAX_CLIP_SEC, isMethode, leesOpdracht, leesVelden, lijktOp } from "./types";
import { vulLinksAan } from "./voorbeelden";
import { voegToe, zoekTikToks } from "./tiktok";
import { MAX_PROEVEN_PER_DAG, proevenVandaag, startProef } from "./proef";

const MODEL = "claude-opus-5-5";
/** Kandidaten uit de brede zoekronde; daarvan wordt er hooguit één uitgezocht en getest. */
const MAX_KANDIDATEN = 3;

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
          model_origineel: { type: "string", description: "Met welk AI-model / welke preset het origineel gemaakt is (bv. 'Higgsfield Viral-preset Vanish (Kling-gebaseerd)', 'Veo 3 tekst-naar-video', 'ChatGPT-beeld + Kling 2.1'), met de bron waar dat uit blijkt." },
          zekerheid: { type: "string", enum: ["hoog", "midden", "laag"], description: "Hoe zeker weten we hoe het gemaakt is én dat onze route hetzelfde resultaat geeft?" },
        },
        required: ["model_origineel", "zekerheid", "titel", "uitleg", "waarom_viral", "origineel", "bron_links", "icoon", "methode", "fotos", "tekstveld", "scenePrompt", "bewegingPrompt", "formaat", "gezicht", "hotness", "clip_zoeken"],
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
  model_origineel: string;
  zekerheid: "hoog" | "midden" | "laag";
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
  const system = `Je bent de trendspotter van Animideo, een Nederlandse app waarmee mensen en bedrijven met AI beelden en video's maken. Je zoekt op internet uit welke MET AI GEMAAKTE video's en beelden NU viral gaan op TikTok, Instagram Reels en YouTube Shorts (in Nederland en wereldwijd) en die mensen massaal namaken: effecten en presets van Higgsfield (Genjutsu/motion transfer, Viral-effecten), Kling, Veo, Sora, Seedance, Hailuo, Nano Banana of ChatGPT-beelden — bijvoorbeeld jezelf in een bekende dans of goal via motion transfer, een surrealistisch effect (verdwijnen, smelten, klonen), AI-personages, AI-fototrends. Gewone virale video's zonder AI tellen niet: wij verkopen het namaken met AI.

Zoek breed (trendrapporten, nieuws, TikTok Creative Center, Instagram-trendlijstjes, Nederlandse media) en controleer dat het echt nu loopt. Schrijf per trend op: wat het is, waarom viral, sinds wanneer, met welk AI-model of welke preset het origineel gemaakt is (en in welke stappen), en links waar je hem ziet (echte url's uit je zoekresultaten, niets verzinnen). Geef per trend minstens één of twee links naar een concrete video van de trend zelf (een TikTok-video met /video/ in het adres, een YouTube Short of een Instagram-reel), niet alleen een overzichtspagina of hashtag: die video laten we klanten zien als voorbeeld. Een artikel met screenshots van de trend is een goede aanvulling.

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
async function schrijfUit(client: Anthropic, verslag: string, max = MAX_KANDIDATEN): Promise<Voorstel[]> {
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
- beweging: Wan Animate Replace — de originele trendvideo (die Sam erbij zet) blijft staan, alleen de hoofdpersoon wordt de klant; het geluid blijft. Optioneel eerst een scenePrompt die de klant de kleding van de trend aantrekt. bewegingPrompt mag leeg.
- pratend: Kling Avatar laat de foto (of de scène) het geluid van de trend playbacken. Optioneel een scenePrompt.
Video's vanuit een stilstaande foto kunnen slecht iets toevoegen dat er niet is (sneeuw die valt, een sprong door de lucht): kies dan liever "beweging" of een foto-trend.

${REGELS}

Alleen trends die écht na te maken zijn en waarvan duidelijk is met welk model ze gemaakt zijn; twijfel je, laat hem weg of zet zekerheid op laag. Hooguit ${max}, de heetste en best na te maken eerst. Niets geschikts? Een lege lijst is een goed antwoord.`,
      messages: [{ role: "user", content: `Het verslag van vandaag:\n\n${verslag}` }],
    })
    .finalMessage();
  return ((JSON.parse(tekstUit(m) || "{}") as { trends?: Voorstel[] }).trends ?? []).slice(0, max);
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
    origineel: [v.model_origineel?.trim() ? `Model: ${v.model_origineel.trim()}` : "", (v.origineel ?? "").trim()].filter(Boolean).join(" — ").slice(0, 900),
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

/**
 * Ronde 1½: één kandidaat grondig uitzoeken. Sam (25-10-2026): "voordat je een viral voorstelt
 * echt goed onderzoeken hoe het gemaakt is, welk model, en hoe je dat vervolgens maakt".
 */
async function verdiep(client: Anthropic, v: Voorstel): Promise<string> {
  return zoek(
    client,
    `Zoek grondig uit hoe deze AI-trend gemaakt wordt, zodat wij hem precies kunnen namaken.

Trend: ${v.titel} — ${v.uitleg}
Wat we al weten: ${v.waarom_viral}
Vermoedelijk gemaakt met: ${v.model_origineel}

Zoek naar: de preset- of modelpagina (Higgsfield, Kling, Veo, Sora, Seedance …), wat makers zelf in hun beschrijving zetten, tutorials en prompts die ermee gemaakt zijn (tutorials mag je hier lezen, ze zijn bron, geen voorbeeld). Beschrijf daarna: welk model/preset, welke invoer (één foto? een video? tekst?), de stappen, typische prompts, wat het moeilijk maakt, en met welke van onze bouwstenen we het het dichtst benaderen. Wees eerlijk als je het niet zeker weet.`,
    "",
  );
}

type Rij = NonNullable<ReturnType<typeof naarRij>>;

/** Zoekt TikToks als voorbeeld van het origineel, slaat op en zet de proef in gang. */
async function bewaarEnTest(r: Rij, status: "proef" | "voorstel"): Promise<string> {
  const tiktoks = await zoekTikToks(r).catch((e) => (console.error("[trends] TikToks zoeken mislukt:", e), []));
  const rij = { ...r, status, bron_links: await vulLinksAan(voegToe(r.bron_links, tiktoks)) };
  const { data, error } = await createServiceClient().from("trends").insert(rij).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Opslaan mislukt");
  if (status === "proef") await startProef(data.id);
  return data.id;
}

/**
 * De dagelijkse ronde: breed zoeken, de beste kandidaat diep uitzoeken, één recept, en dat
 * eerst zelf testen. Sam krijgt pas een mail als de proef goed is (lib/trends/proef.ts).
 */
export async function speurtocht(): Promise<{ nieuw: number; titels: string[]; reden?: string }> {
  if ((await proevenVandaag()) >= MAX_PROEVEN_PER_DAG) return { nieuw: 0, titels: [], reden: "dagplafond proeven bereikt" };
  const client = new Anthropic();
  const verslag = await zoek(
    client,
    `Vandaag is het ${new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}. Welke met AI gemaakte video's of beelden gaan nu viral en worden massaal nagemaakt? Zoek de 3-5 sterkste kandidaten en zoek bij elk uit met welk model of welke preset ze gemaakt zijn.`,
    await bekendeTrends(),
  );
  const bekend = await bekendeTitels();
  // Zonder trendvideo kunnen we 'beweging' en 'pratend' niet zelf testen: die vallen hier af
  // (Sam kan ze via een tip met een video toevoegen, of ze komen via Higgsfield binnen).
  const kandidaten = (await schrijfUit(client, verslag)).filter(
    (v) => v.zekerheid !== "laag" && isMethode(v.methode) && !METHODE_INFO[v.methode].clipNodig && !bekend.some((t) => lijktOp(t, v.titel)),
  );
  for (const k of kandidaten.slice(0, 2)) {
    const diep = await verdiep(client, k);
    const [v] = await schrijfUit(client, `Kandidaat uit de brede zoekronde:\n${JSON.stringify(k)}\n\nGrondig onderzoek naar hoe hij gemaakt is:\n${diep}`, 1);
    const r = v && v.zekerheid !== "laag" && isMethode(v.methode) && !METHODE_INFO[v.methode].clipNodig ? naarRij(v, "speurtocht") : null;
    if (!r) continue;
    await bewaarEnTest(r, "proef");
    return { nieuw: 1, titels: [r.titel] };
  }
  return { nieuw: 0, titels: [], reden: "geen kandidaat waarvan we zeker weten hoe hij gemaakt is" };
}

/** Sam zag zelf iets (een link of een omschrijving): grondig uitzoeken en testen. */
export async function voegToeVanuit(tip: string): Promise<{ nieuw: number; titels: string[] }> {
  const client = new Anthropic();
  const verslag = await zoek(
    client,
    `Sam (de eigenaar) zag deze trend en wil hem in de app: "${tip.slice(0, 1000)}". Zoek grondig uit wat het precies is, hoe groot het is, met welk AI-model of welke preset het origineel gemaakt is (met bronnen), in welke stappen, en waar je hem ziet. Beschrijf alleen deze ene trend (ook als hij al op de lijst lijkt te staan: dan in een nieuwe variant).`,
    "",
  );
  const [v] = await schrijfUit(client, verslag, 1);
  const r = v ? naarRij(v, "handmatig") : null;
  if (!r) return { nieuw: 0, titels: [] };
  // Een beweging- of playbacktrend kunnen we pas testen als Sam de trendvideo erbij zet; dat
  // start de proef dan alsnog (zie de actie 'clip' op /api/admin/trends).
  await bewaarEnTest(r, METHODE_INFO[r.methode as keyof typeof METHODE_INFO].clipNodig ? "voorstel" : "proef");
  return { nieuw: 1, titels: [r.titel] };
}
