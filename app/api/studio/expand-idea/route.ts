import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  seed?:        string;
  audience?:    string;
  message?:     string;
  tone?:        string;
  character?:   string;
  url?:         string;
  genre?:       string;
  genreHint?:   string;
  brandKitId?:  string | null;
  mode:         "expand" | "from-questions" | "from-website" | "smart";
}

const BLOCKED_HOSTS = new Set([
  "localhost", "0.0.0.0", "::1",
]);

function isPrivateHost(hostname: string): boolean {
  if (BLOCKED_HOSTS.has(hostname.toLowerCase())) return true;
  if (/^127\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true; // link-local
  if (/^fc[0-9a-f]{2}:/i.test(hostname)) return true; // unique local v6
  if (/^fe[89ab][0-9a-f]:/i.test(hostname)) return true; // link-local v6
  return false;
}

async function scrapeWebsite(rawUrl: string): Promise<string> {
  let parsed: URL;
  try { parsed = new URL(rawUrl.trim()); }
  catch { throw new Error("Ongeldige URL"); }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Alleen http en https URL's");
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error("Deze URL kan niet worden gelezen");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  let html: string;
  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; JouwAnimatieVideoBot/1.0)",
        "Accept":     "text/html,*/*;q=0.8",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`Website gaf HTTP ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html") && !ct.includes("text")) {
      throw new Error(`Onverwacht content-type: ${ct.split(";")[0] || "onbekend"}`);
    }
    html = await res.text();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("Website laadde te traag");
    throw err;
  } finally {
    clearTimeout(timer);
  }

  // Strip script/style/noscript blocks, then tags, then collapse whitespace.
  const stripped = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped.length < 50) throw new Error("Te weinig leesbare tekst gevonden op de website");

  return stripped.slice(0, 8000);
}

export async function POST(req: NextRequest) {
  try {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Body;

  let brandContext = "";
  if (body.brandKitId) {
    const { data: kit } = await supabase
      .from("brand_kits")
      .select("name, description, tone_of_voice, brand_values")
      .eq("id", body.brandKitId)
      .eq("user_id", user.id)
      .single();
    if (kit) {
      brandContext = `\nHuisstijl context (gebruik subtiel, niet letterlijk overschrijven):
- Bedrijf: ${kit.name}${kit.description ? ` — ${kit.description}` : ""}
${kit.tone_of_voice ? `- Tone of voice: ${kit.tone_of_voice}` : ""}
${kit.brand_values?.length ? `- Brand values: ${kit.brand_values.join(", ")}` : ""}`;
    }
  }

  let userPrompt = "";
  if (body.mode === "smart") {
    const url    = (body.url ?? "").trim();
    const genre  = (body.genre ?? "").trim();
    const hint   = (body.genreHint ?? "").trim();
    const seed   = (body.seed ?? "").trim();

    if (!url && !genre && !seed) {
      return NextResponse.json({ error: "Geef minstens een URL, type of korte beschrijving" }, { status: 400 });
    }

    let scrapedSection = "";
    if (url) {
      try {
        const scraped = await scrapeWebsite(url);
        scrapedSection = `\n\nWEBSITE TEKST (mogelijk afgekapt) — ${url}:\n"""\n${scraped}\n"""`;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: `Website lezen mislukt: ${msg}` }, { status: 400 });
      }
    }

    const genreSection = genre
      ? `\n\nTYPE VIDEO: ${genre}${hint ? `\nTypische structuur voor dit type:\n"""\n${hint}\n"""` : ""}\nVolg deze structuur en spirit, maar maak het concreet voor déze klant op basis van de website-tekst hierboven (als die er is).`
      : "";

    const seedSection = seed
      ? `\n\nEXTRA RICHTING van de gebruiker: "${seed}"`
      : "";

    userPrompt = `Schrijf een idee-briefing voor een explainer-video van 30-60 seconden.${scrapedSection}${genreSection}${seedSection}
${brandContext}

Schrijf in het Nederlands, 4-7 zinnen, briefing-stijl die een scriptwriter kan gebruiken. Pak het kernverhaal: voor wie de video is, welk probleem wordt opgelost, wat het uniek maakt. Beschrijf: hoofdpersoon en setting, het probleem of de aanleiding, het verloop/de boodschap, en een natuurlijk eindpunt of call-to-action${genre ? ` passend bij een ${genre.toLowerCase()}` : ""}. Geen bullet points, geen markdown, alleen de paragraaf zelf.`;
  } else if (body.mode === "from-website") {
    const url = (body.url ?? "").trim();
    if (!url) return NextResponse.json({ error: "URL ontbreekt" }, { status: 400 });
    let scraped: string;
    try {
      scraped = await scrapeWebsite(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    userPrompt = `Lees de tekst van deze website en schrijf op basis daarvan een idee-briefing voor een explainer-video van 30-60 seconden.

URL: ${url}

WEBSITE TEKST (mogelijk afgekapt):
"""
${scraped}
"""
${brandContext}

Schrijf in het Nederlands, 4-7 zinnen, briefing-stijl die een scriptwriter kan gebruiken. Pak het kernverhaal van het bedrijf: voor wie ze er zijn, welk probleem ze oplossen, wat ze uniek maakt. Beschrijf: hoofdpersoon en setting, het probleem of de aanleiding, het verloop/de boodschap, en een natuurlijk eindpunt of call-to-action. Geen bullet points, geen markdown, alleen de paragraaf zelf.`;
  } else if (body.mode === "expand") {
    const seed = (body.seed ?? "").trim();
    if (!seed) return NextResponse.json({ error: "Geen tekst om uit te werken" }, { status: 400 });
    userPrompt = `Werk dit korte idee uit tot een rijk briefing-paragraaf voor een explainer-video van ongeveer 30-60 seconden:

"${seed}"
${brandContext}

Schrijf in het Nederlands, 4-7 zinnen, in een briefing-stijl die een scriptwriter kan gebruiken. Beschrijf: hoofdpersoon en setting, het probleem of de aanleiding, het verloop/de boodschap, en een natuurlijk eindpunt of call-to-action. Geen bullet points, geen markdown, alleen de paragraaf zelf.`;
  } else {
    const parts: string[] = [];
    if (body.audience)  parts.push(`Doelgroep: ${body.audience}`);
    if (body.message)   parts.push(`Boodschap of CTA: ${body.message}`);
    if (body.tone)      parts.push(`Toon: ${body.tone}`);
    if (body.character) parts.push(`Hoofdpersoon: ${body.character}`);
    if (parts.length === 0) {
      return NextResponse.json({ error: "Vul minimaal 1 vraag in" }, { status: 400 });
    }
    userPrompt = `Schrijf een idee-briefing voor een explainer-video van 30-60 seconden op basis van deze input:

${parts.join("\n")}
${brandContext}

Schrijf in het Nederlands, 4-7 zinnen, briefing-stijl die een scriptwriter kan gebruiken. Beschrijf: hoofdpersoon en setting, het probleem of de aanleiding, het verloop/de boodschap, en een natuurlijk eindpunt of call-to-action. Geen bullet points, geen markdown, alleen de paragraaf zelf.`;
  }

  const completion = await openai.chat.completions.create({
    model:       "gpt-4o-mini",
    messages:    [{ role: "user", content: userPrompt }],
    max_tokens:  600,
    temperature: 0.7,
  });

  const idea = (completion.choices[0]?.message?.content ?? "").trim();
  if (!idea) return NextResponse.json({ error: "Geen idee teruggekomen van AI" }, { status: 500 });

  return NextResponse.json({ idea });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("expand-idea failed:", msg);
    return NextResponse.json(
      { error: "Idee uitwerken mislukt, probeer het opnieuw." },
      { status: 500 }
    );
  }
}
