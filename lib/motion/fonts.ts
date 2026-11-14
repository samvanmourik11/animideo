// De lettertypes als data in de pagina, in plaats van een link naar Google Fonts.
//
// Nodig sinds de video in de browser van de klant wordt gemaakt (14-11-2026): elk beeld
// wordt daar als losse SVG-afbeelding getekend, en een SVG-afbeelding mag niets van buiten
// laden, ook geen lettertype. Alleen de Latijnse tekens (Nederlands, Engels en de accenten).

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const cache = new Map<string, Promise<string>>();

async function haalCss(families: string[]): Promise<string> {
  const url = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=block`;
  const res = await fetch(url, { headers: { "User-Agent": CHROME } });
  if (!res.ok) throw new Error(`Lettertype ophalen mislukt (HTTP ${res.status})`);
  const css = await res.text();
  // Google zet boven elk blok een opmerking met de tekenset; alleen latin en latin-ext.
  const blokken = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)]
    .filter((m) => m[1] === "latin" || m[1] === "latin-ext")
    .map((m) => m[2]);
  const uit = await Promise.all(
    blokken.map(async (blok) => {
      const bron = blok.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1];
      if (!bron) return "";
      const f = await fetch(bron);
      if (!f.ok) return "";
      const b64 = Buffer.from(await f.arrayBuffer()).toString("base64");
      return blok.replace(/url\([^)]+\)\s*format\([^)]*\)/, `url(data:font/woff2;base64,${b64}) format('woff2')`);
    }),
  );
  return uit.filter(Boolean).join("\n");
}

/** De @font-face-regels voor deze families, met de lettertypes erin. Per server onthouden. */
export function lettertypeCss(families: string[]): Promise<string> {
  const sleutel = families.join("|");
  let p = cache.get(sleutel);
  if (!p) {
    p = haalCss(families).catch((e) => {
      cache.delete(sleutel);
      throw e;
    });
    cache.set(sleutel, p);
  }
  return p;
}
