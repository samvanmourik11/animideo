// SAM PLAKT EEN VIDEO — Sam (25-10-2026): "geef mij de optie om een url in te voeren van een
// Instagram- of TikTok-video, om zo jou naar een trend te laten kijken". Hier halen we de
// video zelf op (niet alleen de link), zodat Claude hem echt kan bekijken. Het uitzoeken en
// testen gebeurt daarna in speuren.ts (bekijkVanuit).
//
// De video komt op onze opslag, maar alleen voor intern gebruik: Claude kijkt ernaar, de proef
// legt hem naast ons resultaat, en bij een bewegingstrend is hij de trendvideo. Klanten zien
// het origineel via de speler van TikTok/Instagram zelf.

import { duurUit } from "./clip";
import { uploadNaarOpslag } from "@/lib/creaties/wachtrij";
import { leesVideoPagina, type TikTokInfo } from "./tiktok";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_MB = 150;

export class BekijkFout extends Error {}

export interface OpgehaaldeVideo {
  /** De link zoals Sam hem plakte (of de link naar zijn upload). */
  link: string;
  /** De video op onze opslag. */
  video: string;
  duur: number;
  /** Wat de maker erbij schreef. */
  beschrijving: string;
  maker: string;
  /** Het geluid eronder (TikTok), bij een dans- of audiotrend hét kenmerk. */
  geluid: string;
  tiktok: TikTokInfo | null;
}

function ontsnapt(t: string): string {
  return t.replace(/\\u002F/g, "/").replace(/\\\//g, "/").replace(/\\u0026/g, "&").replace(/&amp;/g, "&");
}

/** De koekjes uit een antwoord, om bij het volgende verzoek mee te sturen (TikTok wil dat). */
function koekjes(res: Response): string {
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

async function binnenhalen(url: string, headers: Record<string, string> = {}): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new BekijkFout(`De video ophalen lukte niet (HTTP ${res.status}).`);
  const lengte = Number(res.headers.get("content-length") ?? 0);
  if (lengte > MAX_MB * 1024 * 1024) throw new BekijkFout(`De video is groter dan ${MAX_MB} MB.`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * TikTok: de videopagina bevat het adres van het mp4-bestand, maar dat geeft alleen iets terug
 * met de koekjes die de pagina net zette. Eén pagina en één video: geen massaal opvragen (zie
 * de blokkade van 25-10-2026 in tiktok.ts).
 */
async function vanTikTok(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "nl,en;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new BekijkFout(`TikTok gaf de pagina niet (HTTP ${res.status}).`);
  const html = await res.text();
  // Een korte link (vm.tiktok.com/…) wordt hier het echte adres met /video/<id>.
  const info = leesVideoPagina(res.url, html);
  const adres = html.match(/"playAddr":"([^"]+)"/)?.[1] ?? html.match(/"downloadAddr":"([^"]+)"/)?.[1];
  if (!info || !adres) throw new BekijkFout("Deze TikTok kon ik niet openen. Is hij openbaar, en is het een video (geen fotoserie)?");
  const video = await binnenhalen(ontsnapt(adres), { Referer: "https://www.tiktok.com/", Cookie: koekjes(res) });
  return { video, link: info.url, beschrijving: info.titel, maker: info.maker, geluid: info.geluid, tiktok: info };
}

/**
 * Instagram: zonder inlog geeft alleen de insluitpagina soms het videobestand vrij. Lukt dat
 * niet, dan uploadt Sam de video zelf (de knop ernaast).
 */
async function vanInstagram(url: string) {
  const code = url.match(/instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([\w-]+)/)?.[1];
  if (!code) throw new BekijkFout("Dit lijkt geen link naar een Instagram-video (reel of post).");
  const pagina = await fetch(`https://www.instagram.com/p/${code}/embed/captioned/`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) })
    .then((r) => (r.ok ? r.text() : ""))
    .catch(() => "");
  const adres = pagina.match(/"video_url":"([^"]+)"/)?.[1] ?? pagina.match(/<video[^>]+src="([^"]+)"/)?.[1];
  if (!adres) {
    throw new BekijkFout("Instagram geeft deze video niet vrij zonder inlog. Sla hem op (in de Instagram-app: ⋯ → Opslaan, of met een downloader) en upload het bestand met de knop ernaast.");
  }
  const beschrijving = ontsnapt(pagina.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  const maker = pagina.match(/class="UsernameText"[^>]*>([^<]+)</)?.[1] ?? "";
  return { video: await binnenhalen(ontsnapt(adres)), link: `https://www.instagram.com/reel/${code}/`, beschrijving, maker, geluid: "", tiktok: null };
}

async function duurVan(buf: Buffer): Promise<number> {
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const map = await mkdtemp(path.join(tmpdir(), "bekijk-"));
  try {
    const p = path.join(map, "in");
    await writeFile(p, buf);
    const ff = (await import("ffmpeg-static")).default as unknown as string;
    const { execFile } = await import("node:child_process");
    const err = await new Promise<string>((ok) => execFile(ff, ["-hide_banner", "-i", p], { timeout: 60000 }, (_e, _o, e) => ok(String(e))));
    return duurUit(err);
  } finally {
    await rm(map, { recursive: true, force: true });
  }
}

/**
 * Haalt de video achter een TikTok- of Instagram-link op, of neemt een video die Sam al
 * uploadde (een https-adres op onze opslag), en zet hem op onze opslag.
 */
export async function haalVideo(link: string, eigenUpload?: string): Promise<OpgehaaldeVideo> {
  const url = link.trim();
  let r: Omit<OpgehaaldeVideo, "duur">;
  if (eigenUpload) {
    if (!/^https:\/\//.test(eigenUpload)) throw new BekijkFout("Ongeldige upload.");
    r = { video: eigenUpload, link: /^https:\/\//.test(url) ? url : eigenUpload, beschrijving: "", maker: "", geluid: "", tiktok: null };
    const duur = await duurVan(await binnenhalen(eigenUpload));
    if (!(duur > 0)) throw new BekijkFout("Dit lijkt geen video te zijn.");
    return { ...r, duur };
  }
  if (!/^https?:\/\//.test(url)) throw new BekijkFout("Plak een link die met https:// begint.");
  const host = new URL(url).hostname;
  const v = /(^|\.)tiktok\.com$/.test(host) ? await vanTikTok(url) : /(^|\.)instagram\.com$/.test(host) ? await vanInstagram(url) : null;
  if (!v) throw new BekijkFout("Plak een link van TikTok of Instagram, of upload de video zelf.");
  const duur = await duurVan(v.video);
  if (!(duur > 0)) throw new BekijkFout("Wat ik binnenkreeg was geen video.");
  const { video, ...rest } = v;
  return { ...rest, duur, video: await uploadNaarOpslag("trends", video, "mp4", "video/mp4") };
}
