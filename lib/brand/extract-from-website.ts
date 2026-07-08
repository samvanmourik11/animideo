// Gedeelde "website → huisstijl"-extractie. Afgeleid van app/api/studio/deep-research
// (scrape + GPT-4o-vision), maar getrimd: alleen kleuren, fonts, naam en tone —
// zónder de zware werkfoto-crawl. Gebruikt voor de infographics-tool (brand kit uit
// een website halen). Het logo halen we bewust NIET van de site: dat uploadt de
// gebruiker zelf, zodat het altijd het juiste, scherpe merklogo is.

import { openai } from "@/lib/openai";

export interface ExtractedBrand {
  name: string;
  toneOfVoice: string;
  colors: { primary?: string; secondary?: string; accent?: string; background?: string };
  fonts: { primary?: string; secondary?: string };
  sourceUrl: string;
}

const MAX_TEXT = 12000;
const MAX_VISION_IMAGES = 8;

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (["localhost", "0.0.0.0", "::1"].includes(h)) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h) || /^fc[0-9a-f]{2}:/i.test(h) || /^fe[89ab][0-9a-f]:/i.test(h)) return true;
  return false;
}

export function normalizeBrandUrl(raw: string): URL {
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  const parsed = new URL(u);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Alleen http/https");
  if (isPrivateHost(parsed.hostname)) throw new Error("Deze URL kan niet worden gelezen");
  return parsed;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JouwAnimatieVideoBot/1.0)", Accept: "text/html,*/*;q=0.8" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html") && !ct.includes("text")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function stripText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function imageCandidates(html: string, base: URL): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    try {
      const u = new URL(raw, base);
      const s = u.toString();
      const low = s.toLowerCase();
      if (seen.has(s)) return;
      if (/\.svg($|\?)|data:|\.gif($|\?)/.test(low)) return;
      if (/icon|sprite|favicon|avatar|badge|placeholder|spinner/.test(low)) return;
      seen.add(s);
      out.push(s);
    } catch {}
  };
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (og) push(og[1]);
  const re = /<img\b[^>]*?(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 24) push(m[1]);
  return out;
}

async function fetchImageB64(url: string): Promise<{ b64: string; mime: string } | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; JouwAnimatieVideoBot/1.0)" } });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 8000 || buf.length > 6_000_000) return null;
    return { b64: buf.toString("base64"), mime: ct.split(";")[0] };
  } catch {
    return null;
  }
}

// Homepage crawlen, een handvol beelden + de tekst door GPT-4o-vision halen en
// daaruit de huisstijl (kleuren, fonts, naam, tone) afleiden. Het logo laten we
// hier bewust weg — dat uploadt de gebruiker zelf.
export async function extractBrandFromWebsite(rawUrl: string): Promise<ExtractedBrand> {
  const home = normalizeBrandUrl(rawUrl);
  const homeHtml = await fetchHtml(home.toString());
  if (!homeHtml) throw new Error("Homepage kon niet gelezen worden");

  const text = stripText(homeHtml).slice(0, MAX_TEXT);

  // Een paar beelden downloaden (parallel) voor de kleur-/stijlafleiding.
  const imgUrls = imageCandidates(homeHtml, home).slice(0, MAX_VISION_IMAGES * 2);
  const downloaded = await Promise.all(imgUrls.map(async (iu) => fetchImageB64(iu)));
  const candidates = downloaded.filter((c): c is { b64: string; mime: string } => !!c).slice(0, MAX_VISION_IMAGES);

  const visionContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } }> = [];
  candidates.forEach((c) => visionContent.push({ type: "image_url", image_url: { url: `data:${c.mime};base64,${c.b64}`, detail: "low" } }));
  visionContent.push({
    type: "text",
    text: `Je bepaalt de huisstijl van een bedrijf op basis van bovenstaande ${candidates.length} website-foto's en de websitetekst hieronder. Geef ALLEEN een JSON-object terug:
{
  "company_name": "<bedrijfsnaam>",
  "tone_of_voice": "<communicatietoon in het kort>",
  "colors": { "primary": "#rrggbb", "secondary": "#rrggbb", "accent": "#rrggbb", "background": "#rrggbb" },
  "fonts": { "primary": "<lettertype/stijl van de koppen>", "secondary": "<lettertype voor bodytekst of leeg>" }
}
- primary = de dominante merkkleur (voor koppen/tekst). accent = de opvallende steunkleur (voor cijfers/nadruk). background = een lichte achtergrondkleur.
- Kleuren MOETEN geldige hex zijn (#rrggbb), afgeleid uit de beelden/site.
- Antwoord met UITSLUITEND het JSON-object.

WEBSITETEKST:
"""
${text}
"""`,
  });

  let analysis: Record<string, unknown> = {};
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 600,
      messages: [{ role: "user", content: visionContent }],
    });
    const raw = (resp.choices[0]?.message?.content ?? "{}").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    analysis = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Analyse mislukt: ${e instanceof Error ? e.message : String(e)}`);
  }

  const colors = (analysis.colors ?? {}) as ExtractedBrand["colors"];
  const fonts = (analysis.fonts ?? {}) as ExtractedBrand["fonts"];
  return {
    name: typeof analysis.company_name === "string" ? analysis.company_name : "",
    toneOfVoice: typeof analysis.tone_of_voice === "string" ? analysis.tone_of_voice : "",
    colors,
    fonts,
    sourceUrl: home.toString(),
  };
}
