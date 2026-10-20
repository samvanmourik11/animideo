// Een productpagina lezen: naam, prijs, foto's en merkkleur van de link die de klant
// plakt. Eerst wat de pagina zelf netjes aanlevert (de productgegevens voor Google, de
// deel-plaatjes voor sociale media), daarna maakt de AI er een korte omschrijving en drie
// voordelen van. Alleen op de server.

import { openai } from "@/lib/openai";
import { fetchHtml, imageCandidates, normalizeBrandUrl, stripText } from "@/lib/brand/extract-from-website";
import type { Product } from "./types";

const MAX_FOTOS = 8;
const STANDAARD_KLEUR = "#1c72ed";

/** Wat er zonder AI uit de html te halen is. Los van het ophalen, zodat het te testen is. */
export interface PaginaGegevens {
  naam: string;
  merk: string;
  omschrijving: string;
  prijs: string;
  kleur: string;
  fotos: string[];
}

function decodeer(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html: string, sleutel: string): string {
  // Attributen staan in willekeurige volgorde: property/name vóór of ná content.
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${sleutel}["'][^>]*content=["']([^"']*)["']`, "i");
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${sleutel}["']`, "i");
  return decodeer(html.match(a)?.[1] ?? html.match(b)?.[1] ?? "");
}

type Ld = Record<string, unknown>;

/** Alle Product-blokken uit de structured data, ook als ze in een @graph of lijst zitten. */
function ldProducten(html: string): Ld[] {
  const uit: Ld[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  const loop = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(loop);
    if (!v || typeof v !== "object") return;
    const o = v as Ld;
    const type = o["@type"];
    if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) uit.push(o);
    if (o["@graph"]) loop(o["@graph"]);
  };
  while ((m = re.exec(html))) {
    try {
      loop(JSON.parse(m[1].trim()));
    } catch {
      // Kapotte JSON op de pagina zelf: overslaan, de rest kan nog wel goed zijn.
    }
  }
  return uit;
}

function tekstUit(v: unknown): string {
  if (typeof v === "string") return decodeer(v.replace(/<[^>]+>/g, " "));
  if (v && typeof v === "object" && typeof (v as Ld).name === "string") return decodeer((v as Ld).name as string);
  return "";
}

function fotosUit(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(fotosUit);
  if (v && typeof v === "object") {
    const o = v as Ld;
    if (typeof o.url === "string") return [o.url];
    if (typeof o.contentUrl === "string") return [o.contentUrl];
  }
  return [];
}

function prijsUit(offers: unknown): string {
  const lijst = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const o of lijst as Ld[]) {
    const bedrag = o.price ?? o.lowPrice ?? (o.priceSpecification as Ld | undefined)?.price;
    const getal = typeof bedrag === "number" ? bedrag : parseFloat(String(bedrag ?? "").replace(",", "."));
    if (Number.isFinite(getal) && getal > 0) return euro(getal, String(o.priceCurrency ?? "EUR"));
  }
  return "";
}

function euro(bedrag: number, valuta: string): string {
  try {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: valuta || "EUR" }).format(bedrag);
  } catch {
    return `€ ${bedrag.toFixed(2).replace(".", ",")}`;
  }
}

/** Is dit een echte merkkleur, of grijs/wit/zwart dat op elke site staat? */
function kleurrijk(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const licht = (max + min) / 2;
  const verzadiging = max === min ? 0 : (max - min) / (1 - Math.abs(2 * licht - 1));
  return verzadiging > 0.35 && licht > 0.15 && licht < 0.75;
}

function volledigHex(h: string): string {
  const s = h.toLowerCase();
  return s.length === 4 ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}` : s;
}

/**
 * De merkkleur zonder AI: eerst de themakleur die de site zelf opgeeft (de kleur van de
 * adresbalk op telefoons), anders de kleur die het vaakst in de opmaak terugkomt. Geen
 * kleur gevonden? Dan ons eigen blauw; de klant kan hem altijd zelf kiezen.
 */
export function merkkleur(html: string): string {
  const thema = meta(html, "theme-color");
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(thema) && kleurrijk(volledigHex(thema))) return volledigHex(thema);
  const telling = new Map<string, number>();
  for (const m of html.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)) {
    const hex = volledigHex(m[0]);
    if (kleurrijk(hex)) telling.set(hex, (telling.get(hex) ?? 0) + 1);
  }
  const beste = [...telling.entries()].sort((a, b) => b[1] - a[1])[0];
  return beste && beste[1] >= 3 ? beste[0] : STANDAARD_KLEUR;
}

export function leesHtml(html: string, url: URL): PaginaGegevens {
  const ld = ldProducten(html)[0] ?? {};
  const titel = decodeer(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");

  const naam = tekstUit(ld.name) || meta(html, "og:title") || titel.split(/\s[|–-]\s/)[0] || "";
  const merk = tekstUit(ld.brand) || meta(html, "og:site_name");
  const omschrijving = tekstUit(ld.description) || meta(html, "og:description") || meta(html, "description");
  const prijs =
    prijsUit(ld.offers) ||
    (() => {
      const bedrag = parseFloat((meta(html, "product:price:amount") || meta(html, "og:price:amount")).replace(",", "."));
      return Number.isFinite(bedrag) && bedrag > 0 ? euro(bedrag, meta(html, "product:price:currency") || "EUR") : "";
    })();

  const gezien = new Set<string>();
  const fotos: string[] = [];
  for (const ruw of [...fotosUit(ld.image), meta(html, "og:image"), ...imageCandidates(html, url)]) {
    if (!ruw) continue;
    try {
      const abs = new URL(ruw, url).toString();
      if (!/^https:\/\//.test(abs) || gezien.has(abs)) continue;
      gezien.add(abs);
      fotos.push(abs);
    } catch {}
    if (fotos.length >= MAX_FOTOS) break;
  }

  return {
    naam: naam.slice(0, 120),
    merk: merk.slice(0, 60),
    omschrijving: omschrijving.slice(0, 600),
    prijs,
    kleur: merkkleur(html),
    fotos,
  };
}

/**
 * Leest de pagina achter de link. Gooit met een melding voor op het scherm als de site
 * ons niet binnenlaat; veel grote webwinkels weren bezoekers die geen browser zijn. De
 * klant kan dan alles zelf invullen.
 */
export async function leesProductpagina(ruweUrl: string): Promise<Product> {
  let url: URL;
  try {
    url = normalizeBrandUrl(ruweUrl);
  } catch {
    throw new Error("Dat lijkt geen geldige link. Plak het hele adres van de productpagina.");
  }
  const html = await fetchHtml(url.toString());
  if (!html) {
    throw new Error("Deze website liet ons niet binnen. Vul de gegevens hieronder zelf in en upload een productfoto.");
  }
  const g = leesHtml(html, url);
  const website = url.hostname.replace(/^www\./, "");

  // De AI maakt van de (vaak lange, soms Engelse) winkeltekst een korte Nederlandse
  // omschrijving en drie voordelen. Lukt dat niet, dan gewoon door met wat er staat.
  let ai: { naam?: string; merk?: string; omschrijving?: string; voordelen?: string[] } = {};
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `Hieronder staat een productpagina van ${website}. Vat het product samen voor een korte reclame.

Gevonden gegevens:
- naam: ${g.naam || "(onbekend)"}
- merk: ${g.merk || "(onbekend)"}
- omschrijving: ${g.omschrijving || "(geen)"}
- prijs: ${g.prijs || "(onbekend)"}

Geef ALLEEN een JSON-object terug:
{
  "naam": "<korte productnaam, zonder winkelnaam of maat/kleurcodes>",
  "merk": "<merk of bedrijfsnaam>",
  "omschrijving": "<1-2 zinnen in gewoon Nederlands: wat is het en voor wie>",
  "voordelen": ["<voordeel 1, max 6 woorden>", "<voordeel 2>", "<voordeel 3>"]
}
Verzin niets wat niet op de pagina staat. Schrijf in het Nederlands, ook als de pagina Engels is.

PAGINATEKST:
"""
${stripText(html).slice(0, 6000)}
"""`,
        },
      ],
    });
    ai = JSON.parse(resp.choices[0]?.message?.content ?? "{}");
  } catch (e) {
    console.error("[reclame] samenvatten mislukt:", e instanceof Error ? e.message : e);
  }

  return {
    naam: (typeof ai.naam === "string" && ai.naam.trim()) || g.naam,
    merk: (typeof ai.merk === "string" && ai.merk.trim()) || g.merk || website,
    omschrijving: (typeof ai.omschrijving === "string" && ai.omschrijving.trim()) || g.omschrijving,
    voordelen: Array.isArray(ai.voordelen) ? ai.voordelen.filter((v) => typeof v === "string").slice(0, 3) : [],
    prijs: g.prijs,
    kleur: g.kleur,
    website,
    fotos: g.fotos,
  };
}
