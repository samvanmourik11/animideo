// VOORBEELDEN VAN DE TREND — wie een trend ziet, moet meteen snappen wat het is (Sam,
// 25-10-2026: "je moet een voorbeeld laten zien, screenshots zijn prima").
//
// Bij elke bronlink zoeken we een beeld en, als het een video is, een speler:
//   TikTok-video   → de omslagfoto uit de pagina + de officiële TikTok-speler
//   YouTube        → de miniatuur + de YouTube-speler
//   Instagram-reel → de Instagram-speler (het beeld geeft Instagram niet vrij)
//   artikel        → het hoofdbeeld (og:image), vaak een screenshot van de trend
// De beelden kopiëren we naar onze opslag: de links van TikTok verlopen na een paar dagen.

import type { BronLink } from "./types";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** Welke speler bij een link hoort, zonder iets op te halen. */
export function spelerVoor(url: string): string | null {
  const tt = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
  if (tt) return `https://www.tiktok.com/player/v1/${tt[1]}?music_info=1&description=1`;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const ig = url.match(/instagram\.com\/(reel|p)\/([\w-]+)/);
  if (ig) return `https://www.instagram.com/${ig[1]}/${ig[2]}/embed`;
  return null;
}

async function pagina(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "nl,en;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.text()).slice(0, 3_000_000);
}

/** Waar het beeld van een link staat (nog op de site zelf). */
export function beeldUitPagina(url: string, html: string): string | null {
  if (/tiktok\.com\/@[^/]+\/video\//.test(url)) {
    const m = html.match(/"(?:originCover|cover)":"(https:[^"]+)"/);
    if (m) return m[1].replace(/\\u002F/g, "/").replace(/\\u0026/g, "&");
  }
  const meta =
    html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
  if (!meta) return null;
  const adres = meta[1].replace(/&amp;/g, "&");
  try {
    return new URL(adres, url).toString();
  } catch {
    return null;
  }
}

async function kopieer(beeld: string): Promise<string | null> {
  try {
    const res = await fetch(beeld, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!res.ok || !mime.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Logo's en lege pixels van sites zonder echt beeld willen we niet als voorbeeld.
    if (buf.length < 8000) return null;
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    // Pas hier laden: de wachtrij trekt alle modellen mee, en de rest van dit bestand is puur (getest).
    const { uploadNaarOpslag } = await import("@/lib/creaties/wachtrij");
    return await uploadNaarOpslag("trends", buf, ext, mime);
  } catch {
    return null;
  }
}

/** Zoekt bij één link een beeld en een speler. Mislukt het, dan blijft de link gewoon staan. */
export async function vulLinkAan(link: BronLink): Promise<BronLink> {
  const embed = link.embed ?? spelerVoor(link.url) ?? undefined;
  if (link.beeld) return { ...link, ...(embed ? { embed } : {}) };
  let beeld: string | null = null;
  const yt = link.url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  try {
    const bron = yt ? `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` : beeldUitPagina(link.url, await pagina(link.url));
    if (bron) beeld = await kopieer(bron);
  } catch {
    beeld = null;
  }
  return { ...link, ...(beeld ? { beeld } : {}), ...(embed ? { embed } : {}) };
}

export async function vulLinksAan(links: BronLink[]): Promise<BronLink[]> {
  return Promise.all(links.map(vulLinkAan));
}
