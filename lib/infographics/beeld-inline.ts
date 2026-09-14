// BEELDEN ZELF OPHALEN VOOR EEN KIJKVRAAG.
//
// Een kijkvraag aan OpenAI met alleen een link laat OpenAI het beeld zelf downloaden.
// Bij onze opslag liep dat geregeld mis met "Unable to download content from the
// provided URL before the timeout": vijftien keer op één avond bij de beeldcontrole,
// die dan stil oversloeg, en de aanwijzing op een storyboardbeeld (tot negen beelden)
// faalde er meteen op. Hier halen we het beeld zelf op, verkleinen het — een kijkvraag
// heeft geen 2K nodig — en sturen het mee in het bericht.
import sharp from "sharp";

export async function beeldAlsDataUrl(
  url: string,
  opties: { maxZijde?: number; timeoutMs?: number } = {},
): Promise<string | null> {
  if (url.startsWith("data:")) return url;
  if (!/^https?:\/\//.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opties.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const bron = Buffer.from(await res.arrayBuffer());
    const zijde = opties.maxZijde ?? 1024;
    const jpeg = await sharp(bron)
      .resize({ width: zijde, height: zijde, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch (e) {
    console.warn(`[beeld-inline] niet opgehaald (${url.slice(0, 80)}):`, e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Voor de beeldcontrole: liever het beeld zelf, en anders toch de link. Zo wordt een
 * controle nooit slechter dan hij was als het zelf ophalen een keer mislukt.
 */
export async function beeldVoorKijkvraag(url: string, maxZijde = 1024): Promise<string> {
  return (await beeldAlsDataUrl(url, { maxZijde })) ?? url;
}
