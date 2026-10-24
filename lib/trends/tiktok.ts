// ECHTE TIKTOKS BIJ EEN TREND — Sam (25-10-2026): "van elke trend een TikTok als voorbeeld,
// veel beter dan screenshots".
//
// TikTok heeft geen open zoekfunctie, en de overzichtspagina's (discover, tag) laden hun
// video's pas in de browser: opgehaald vanaf de server staat er niets in. Daarom zoekt
// Claude met web search gericht naar losse video-adressen (tiktok.com/@maker/video/123…),
// en controleren we elk adres op TikTok zelf: bestaat de video, is hij openbaar, en gaat de
// beschrijving of het geluid over deze trend? Verzonnen of verwijderde video's vallen zo af.
// (TikToks eigen oEmbed geeft sinds kort geen titel meer, en gaf ons al snel "te veel verzoeken".)

import Anthropic from "@anthropic-ai/sdk";
import type { BronLink } from "./types";

const MODEL = "claude-opus-5-5";
const VIDEO = /https?:\/\/(?:www\.|m\.)?tiktok\.com\/@[\w.-]+\/video\/\d{15,22}/g;

export interface TikTokInfo {
  url: string;
  /** Beschrijving van de maker. */
  titel: string;
  maker: string;
  /** Het geluid onder de video: bij een dans- of audiotrend hét kenmerk. */
  geluid: string;
  weergaven: number;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function ontsnapt(t: string): string {
  return t.replace(/\\u002F/g, "/").replace(/\\u0026/g, "&").replace(/\\"/g, '"');
}

/** Leest de gegevens van een video uit zijn pagina (puur, voor de test). */
export function leesVideoPagina(url: string, html: string): TikTokInfo | null {
  const maker = html.match(/"uniqueId":"([^"]+)"/)?.[1];
  const id = url.match(/video\/(\d+)/)?.[1];
  // Een verwijderde of privé-video geeft een pagina zonder de videogegevens (wel met het id
  // in de link), dus kijken we naar de teller.
  if (!maker || !id || !/"playCount":\d+/.test(html)) return null;
  return {
    url: `https://www.tiktok.com/@${maker}/video/${id}`,
    titel: ontsnapt(html.match(/"desc":"([^"]*)"/)?.[1] ?? "").slice(0, 300),
    maker,
    geluid: ontsnapt(html.match(/"music":\{"id":"\d+","title":"([^"]*)"/)?.[1] ?? ""),
    weergaven: Number(html.match(/"playCount":(\d+)/)?.[1] ?? 0),
  };
}

/** Bestaat deze TikTok (openbaar)? Haalt beschrijving, geluid en weergaven op. */
export async function controleerTikTok(url: string): Promise<TikTokInfo | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "nl,en;q=0.8" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return leesVideoPagina(url, await res.text());
  } catch {
    return null;
  }
}

/** Alle TikTok-video-adressen in een stuk tekst, zonder dubbele. */
export function tiktoksIn(tekst: string): string[] {
  return [...new Set((tekst.match(VIDEO) ?? []).map((u) => u.replace(/^https?:\/\/(?:m\.)?(?:www\.)?/, "https://www.")))];
}

/**
 * Zoekt 1-3 echte TikToks van een trend. Claude zoekt, wij controleren; Claude krijgt de
 * beschrijvingen van de gevonden video's terug om de juiste te kiezen (zelfde dans, zelfde
 * geluid, geen video óver de trend van een nieuwszender).
 */
export async function zoekTikToks(trend: { titel: string; uitleg: string; waarom_viral?: string | null }, max = 3): Promise<TikTokInfo[]> {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Zoek losse TikTok-video's van deze trend, zodat klanten in één oogopslag zien wat het is.

Trend: ${trend.titel}
Wat het is: ${trend.uitleg}
${trend.waarom_viral ? `Achtergrond: ${trend.waarom_viral.slice(0, 800)}` : ""}

Zoek op de naam van de trend, het geluid/nummer en de hashtag, en zoek specifiek naar adressen van de vorm tiktok.com/@maker/video/<nummer> (bijvoorbeeld met "site:tiktok.com" in je zoekopdracht). Overzichtspagina's (/discover/, /tag/, /music/) tellen niet. Geen nieuwszenders of video's óver de trend, en niets met politiek, politici, rampen of ongepaste inhoud: klanten zien deze video's als voorbeeld in onze app. Het liefst: het origineel en één of twee goede navolgingen waarop de trend duidelijk te zien is.

Geef aan het eind alleen een lijstje met de video-adressen, één per regel. Niets gevonden? Zeg dat dan.`,
    },
  ];
  let tekst = "";
  for (let ronde = 0; ronde < 4; ronde++) {
    const m = await client.messages
      .stream({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: "low" },
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
        messages,
      })
      .finalMessage();
    // Ook de zoekresultaten zelf doorzoeken: daar staan vaak adressen die Claude niet opsomt.
    tekst += JSON.stringify(m.content);
    if (m.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: m.content });
  }
  const gevonden = (await Promise.all(tiktoksIn(tekst).slice(0, 15).map(controleerTikTok))).filter((v): v is TikTokInfo => !!v);
  return kiesBeste(trend, gevonden).slice(0, max);
}

/** Video's waarvan de beschrijving woorden van de trend bevat, eerst. */
export function kiesBeste(trend: { titel: string; uitleg: string }, lijst: TikTokInfo[]): TikTokInfo[] {
  const woorden = `${trend.titel} ${trend.uitleg}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  const score = (v: TikTokInfo) => woorden.filter((w) => `${v.titel} ${v.geluid}`.toLowerCase().includes(w)).length;
  // Eerst wat duidelijk over deze trend gaat, dan de best bekeken: dat is meestal het beste voorbeeld.
  return [...lijst].sort((a, b) => score(b) - score(a) || b.weergaven - a.weergaven);
}

/** Zet gevonden TikToks vooraan in de bronlinks (zonder dubbele). */
export function voegToe(links: BronLink[], tiktoks: TikTokInfo[]): BronLink[] {
  const bekend = new Set(links.map((l) => l.url.match(/video\/(\d+)/)?.[1]).filter(Boolean));
  const nieuw = tiktoks
    .filter((t) => !bekend.has(t.url.match(/video\/(\d+)/)?.[1]))
    .map((t) => ({ url: t.url, titel: `TikTok · @${t.maker}${t.geluid ? ` · ♫ ${t.geluid}` : ""}${t.weergaven ? ` · ${Math.round(t.weergaven / 1000)}K× bekeken` : ""}` }));
  return [...nieuw, ...links];
}
