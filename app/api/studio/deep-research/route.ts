// Diepgaand website-onderzoek voor de Creator Studio. Crawlt de homepage + een
// paar relevante pagina's, maakt een screenshot van de homepage, verzamelt de
// echte foto's van de site, en laat GPT-4o (beeld + tekst) het merk onderzoeken:
// kernverhaal/brief, tone of voice & communicatiestijl, merkwaarden, do-nots,
// huisstijlkleuren, terugkerende omgevingen, en welke echte werkfoto's geschikt
// zijn als visuele referentie. Geselecteerde foto's worden naar Supabase gehost
// zodat ze stabiel zijn en in de beeldgeneratie gebruikt kunnen worden.

import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits } from "@/lib/credits";
import { makeAssetId } from "@/lib/studio/brand-assets";
import type { BrandAssetRole } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 240;

const RESEARCH_COST = 3;
const MAX_PAGES = 8;          // homepage + extra (door gebruiker opgegeven + auto-ontdekt)
const MAX_TEXT = 16000;
const MAX_VISION_IMAGES = 14; // hoeveel foto's GPT-4o bekijkt (was de bottleneck)
const MAX_WORK_PHOTOS = 8;    // hoeveel echte werkfoto's max als referentie gekozen worden

const PAGE_KEYWORDS = [
  "over", "about", "dienst", "service", "werk", "project", "portfolio", "team",
  "wie-zijn", "aanpak", "expertise", "galerij", "gallery", "foto", "photo",
  "media", "cases", "case", "realisaties", "producten", "product", "diensten",
];

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (["localhost", "0.0.0.0", "::1"].includes(h)) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h) || /^fc[0-9a-f]{2}:/i.test(h) || /^fe[89ab][0-9a-f]:/i.test(h)) return true;
  return false;
}

function normalize(raw: string): URL {
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

function internalLinks(html: string, base: URL): string[] {
  const out = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.size < 40) {
    try {
      const href = new URL(m[1], base);
      if (href.hostname !== base.hostname) continue;
      const path = href.pathname.toLowerCase();
      if (PAGE_KEYWORDS.some((k) => path.includes(k))) {
        href.hash = "";
        out.add(href.toString());
      }
    } catch {}
  }
  return [...out].slice(0, MAX_PAGES - 1);
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
      if (/logo|icon|sprite|favicon|avatar|badge|placeholder|spinner/.test(low)) return;
      seen.add(s);
      out.push(s);
    } catch {}
  };
  // og:image eerst (vaak de hero/sterkste afbeelding)
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (og) push(og[1]);
  const re = /<img\b[^>]*?(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 30) push(m[1]);
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
    if (buf.length < 8000 || buf.length > 6_000_000) return null; // skip tiny (icons) en te grote
    return { b64: buf.toString("base64"), mime: ct.split(";")[0] };
  } catch {
    return null;
  }
}

// Logo-lane: het tegenovergestelde van imageCandidates — houdt juist de logo-
// achtige beelden vast (header/nav, og:logo, bestandsnaam 'logo'), inclusief SVG.
// Het logo wordt los gecomposit (eindscène/overlay), niet door de AI getekend.
function logoCandidates(html: string, base: URL): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw?: string) => {
    if (!raw) return;
    try {
      const s = new URL(raw, base).toString();
      if (seen.has(s) || /^data:/i.test(s)) return;
      seen.add(s);
      out.push(s);
    } catch {}
  };
  const ogLogo = html.match(/<meta[^>]+property=["']og:logo["'][^>]+content=["']([^"']+)["']/i);
  if (ogLogo) push(ogLogo[1]);
  // <img> binnen de eerste <header>/<nav> = meestal het logo.
  const headerBlock = html.match(/<(?:header|nav)\b[\s\S]{0,6000}?<\/(?:header|nav)>/i)?.[0] ?? "";
  const hRe = /<img\b[^>]*?(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = hRe.exec(headerBlock)) && out.length < 6) push(hm[1]);
  // Elke <img> waarvan de tag 'logo' bevat (src/alt/class).
  const aRe = /<img\b[^>]*>/gi;
  let am: RegExpExecArray | null;
  while ((am = aRe.exec(html)) && out.length < 12) {
    if (/logo/i.test(am[0])) push(am[0].match(/(?:src|data-src)=["']([^"']+)["']/i)?.[1]);
  }
  return out;
}

async function fetchLogoB64(url: string): Promise<{ b64: string; mime: string; ext: string } | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; JouwAnimatieVideoBot/1.0)" } });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "image/png").split(";")[0];
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200 || buf.length > 3_000_000) return null; // logo's mogen klein zijn
    const ext = ct.includes("svg") ? "svg" : ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
    return { b64: buf.toString("base64"), mime: ct, ext };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const credit = await deductCredits(user.id, RESEARCH_COST, "Diepgaand website-onderzoek");
  if (!credit.success) {
    return NextResponse.json({ error: "insufficient_credits", credits: credit.credits, required: RESEARCH_COST }, { status: 402 });
  }
  const refund = async () => { try { await addCredits(user.id, RESEARCH_COST, "Refund: website-onderzoek"); } catch {} };

  try {
    const body = (await req.json()) as { url?: string; urls?: string[] };
    // Eén of meerdere URL's. De gebruiker kan extra pagina's opgeven (bijv. een
    // galerij- of werk-pagina) zodat ook foto's die niet op de homepage staan
    // worden meegenomen. Splitst ook op regels/komma's.
    const rawUrls = (body.urls && body.urls.length > 0 ? body.urls : [body.url ?? ""])
      .flatMap(u => (u ?? "").split(/[\n,]+/))
      .map(u => u.trim())
      .filter(Boolean);
    if (rawUrls.length === 0) { await refund(); return NextResponse.json({ error: "URL ontbreekt" }, { status: 400 }); }

    const provided: URL[] = [];
    const seenUrl = new Set<string>();
    for (const r of rawUrls) {
      try {
        const u = normalize(r);
        if (!seenUrl.has(u.toString())) { seenUrl.add(u.toString()); provided.push(u); }
      } catch { /* sla ongeldige URL over */ }
    }
    if (provided.length === 0) { await refund(); return NextResponse.json({ error: "Geen geldige URL" }, { status: 400 }); }

    const home = provided[0];

    // 1) Crawl alle opgegeven pagina's + automatisch ontdekte relevante pagina's.
    const homeHtml = await fetchHtml(home.toString());
    if (!homeHtml) { await refund(); return NextResponse.json({ error: "Homepage kon niet gelezen worden" }, { status: 400 }); }

    const pageSet = new Set<string>(provided.map(u => u.toString()));
    for (const link of internalLinks(homeHtml, home)) {
      if (pageSet.size >= MAX_PAGES) break;
      pageSet.add(link);
    }
    const pages = [...pageSet].slice(0, MAX_PAGES);

    let text = `[${home.toString()}]\n${stripText(homeHtml)}`;
    const imgUrls = imageCandidates(homeHtml, home);
    // Extra pagina's PARALLEL ophalen (sneller bij meerdere URL's/sub-pagina's).
    const extraPages = pages.filter(p => p !== home.toString());
    const fetched = await Promise.all(extraPages.map(async p => ({ p, h: await fetchHtml(p) })));
    for (const { p, h } of fetched) {
      if (!h) continue;
      text += `\n\n[${p}]\n${stripText(h)}`;
      for (const iu of imageCandidates(h, new URL(p))) if (!imgUrls.includes(iu)) imgUrls.push(iu);
    }
    text = text.slice(0, MAX_TEXT);

    // 2) Geen homepage-screenshot meer: playwright/chromium draait niet op Vercel
    // serverless (en blaast de functie-bundle op). Het merkonderzoek draait op de
    // websitetekst + de echte foto's; GPT-4o leidt de kleuren uit de foto's af.
    const shot: string | null = null;

    // 3) Kandidaat-foto's PARALLEL downloaden (snel, ook met veel kandidaten),
    // daarna de eerste MAX_VISION_IMAGES bruikbare in volgorde nemen.
    const toTry = imgUrls.slice(0, MAX_VISION_IMAGES * 2);
    const downloaded = await Promise.all(
      toTry.map(async iu => {
        const got = await fetchImageB64(iu);
        return got ? { url: iu, ...got } : null;
      }),
    );
    const candidates = downloaded
      .filter((c): c is { url: string; b64: string; mime: string } => !!c)
      .slice(0, MAX_VISION_IMAGES);

    // 4) GPT-4o vision: merk onderzoeken + werkfoto's kiezen.
    const visionContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } }> = [];
    if (shot) visionContent.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${shot}`, detail: "high" } });
    candidates.forEach((c, i) => visionContent.push({ type: "image_url", image_url: { url: `data:${c.mime};base64,${c.b64}`, detail: "low" } }));

    const instruction = `Je doet diepgaand merkonderzoek voor een animatie-explainervideo. Hierboven staan${shot ? " een screenshot van de homepage en" : ""} ${candidates.length} genummerde foto's van de website (foto 1 t/m ${candidates.length}), gevolgd door de websitetekst.

Onderzoek het bedrijf grondig en geef ALLEEN een JSON-object terug:
{
  "company_name": "<bedrijfsnaam>",
  "tagline": "<korte slogan of kernbelofte>",
  "idea_brief": "<rijke brief van 4-7 zinnen in het Nederlands voor een scriptwriter: voor wie, welk probleem, wat uniek is, hoofdpersoon/setting, verloop, en een natuurlijke call-to-action. Concreet en specifiek voor DIT bedrijf.>",
  "tone_of_voice": "<communicatietoon, bijv: warm en persoonlijk / professioneel en zakelijk>",
  "communication_style": "<hoe communiceren ze: zinslengte, jij/u, formeel/informeel, vakjargon, humor>",
  "brand_values": ["waarde1","waarde2","waarde3"],
  "do_nots": "<wat NIET bij het merk past>",
  "colors": { "primary": "#rrggbb", "secondary": "#rrggbb", "accent": "#rrggbb", "background": "#rrggbb" },
  "fonts": { "primary": "<lettertype/stijl>", "secondary": "" },
  "environment": "<beschrijf PRECIES de herkenbare visuele signatuur van dit bedrijf op basis van de foto's, zodat scènes het exact kunnen nabootsen: producten/voertuigen/boten (type, vorm, exacte kleuren, branding/teksten erop), werkkleding/uniform van medewerkers (kleur, stijl, logo), terugkerende locaties, en kenmerkende props. Wees concreet, bijv. 'witte zeiljachten met fel-oranje zeilen, medewerkers in marineblauwe polo's met oranje logo'.>",
  "work_photos": [{ "i": <fotonummer>, "role": "<vehicle|product|team|location|other>", "element": "<het EXACTE over te nemen merk-element, kort en concreet, bijv. 'wit zeiljacht met fel-oranje zeilen' of 'medewerkers in marineblauwe polo met oranje logo'>", "description": "<wat de foto verder toont>" }]
  (alleen ECHTE werk-, team-, product- of locatiefoto's die geschikt zijn als visuele referentie; laat decoratieve/stock/UI/logo-beelden weg. Geef per foto één rol: vehicle=voertuig/boot/machine, product=product, team=mensen/werkkleding, location=locatie/pand, other=overig.)
}
Kleuren MOETEN geldige hex zijn (#rrggbb), gebaseerd op de screenshot. Antwoord met alleen het JSON-object.

WEBSITETEKST:
"""
${text}
"""`;
    visionContent.push({ type: "text", text: instruction });

    let analysis: Record<string, unknown> = {};
    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 1800,
        messages: [{ role: "user", content: visionContent }],
      });
      const raw = (resp.choices[0]?.message?.content ?? "{}").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      analysis = JSON.parse(raw);
    } catch (e) {
      await refund();
      return NextResponse.json({ error: `Analyse mislukt: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
    }

    // 5) Geselecteerde werkfoto's naar Supabase hosten (stabiel + bruikbaar in generatie).
    // Elke gekozen foto met een beschrijving (wat erop staat + bruikbaar merk-
    // element), zodat de beeld-generatie later per scène kan matchen. Robuust
    // voor 1-based én 0-based indices.
    type WP = { i?: number; role?: string; element?: string; description?: string };
    const ROLES_OK = new Set(["vehicle", "product", "team", "location", "other"]);
    let picks: { url: string; b64: string; mime: string; role: BrandAssetRole; element: string; description: string }[] = [];
    const rawPicks: WP[] = Array.isArray(analysis.work_photos)
      ? (analysis.work_photos as WP[])
      : Array.isArray(analysis.work_photo_indices)
      ? (analysis.work_photo_indices as number[]).map(n => ({ i: n }))
      : [];
    if (rawPicks.length > 0) {
      const seenPick = new Set<string>();
      for (const p of rawPicks) {
        const n = p.i ?? 0;
        const c = candidates[n - 1] ?? candidates[n];
        if (c && !seenPick.has(c.url)) {
          seenPick.add(c.url);
          const role = (p.role && ROLES_OK.has(p.role) ? p.role : "other") as BrandAssetRole;
          const element = (p.element ?? "").trim() || (p.description ?? "").trim() || "merk-element";
          const description = (p.description ?? "").trim() || element;
          picks.push({ ...c, role, element, description });
        }
      }
    }
    if (picks.length === 0) picks = candidates.slice(0, 3).map(c => ({ ...c, role: "other" as BrandAssetRole, element: "Echte foto van het bedrijf", description: "Echte foto van het bedrijf" }));
    picks = picks.slice(0, MAX_WORK_PHOTOS);

    const stamp = Date.now();

    // Logo apart vastleggen — wordt los gecomposit (eindscène/overlay), niet door
    // de AI getekend (die rendert logo's slecht en BEELDREGELS verbieden tekst).
    let logoUrl: string | null = null;
    try {
      for (const lu of logoCandidates(homeHtml, home)) {
        const got = await fetchLogoB64(lu);
        if (!got) continue;
        const path = `${user.id}/research/${stamp}-logo.${got.ext}`;
        const { error: upErr } = await supabase.storage.from("scene-assets").upload(path, Buffer.from(got.b64, "base64"), { contentType: got.mime, upsert: true });
        if (!upErr) { logoUrl = supabase.storage.from("scene-assets").getPublicUrl(path).data.publicUrl; break; }
      }
    } catch {}

    const workPhotos: { url: string; description: string; id: string; role: BrandAssetRole; element: string }[] = [];
    const seenId = new Set<string>();
    for (let i = 0; i < picks.length; i++) {
      try {
        const ext = picks[i].mime.includes("png") ? "png" : "jpg";
        const path = `${user.id}/research/${stamp}-${i}.${ext}`;
        const bytes = Buffer.from(picks[i].b64, "base64");
        const { error: upErr } = await supabase.storage.from("scene-assets").upload(path, bytes, { contentType: picks[i].mime, upsert: true });
        if (!upErr) {
          const url = supabase.storage.from("scene-assets").getPublicUrl(path).data.publicUrl;
          let id = makeAssetId(picks[i].role, picks[i].element);
          while (seenId.has(id)) id = `${id}-${i}`;
          seenId.add(id);
          workPhotos.push({ url, description: picks[i].description, id, role: picks[i].role, element: picks[i].element });
        }
      } catch {}
    }

    return NextResponse.json({
      research: {
        company_name: analysis.company_name ?? "",
        tagline: analysis.tagline ?? "",
        idea_brief: analysis.idea_brief ?? "",
        tone_of_voice: analysis.tone_of_voice ?? "",
        communication_style: analysis.communication_style ?? "",
        brand_values: Array.isArray(analysis.brand_values) ? analysis.brand_values : [],
        do_nots: analysis.do_nots ?? "",
        colors: analysis.colors ?? {},
        fonts: analysis.fonts ?? {},
        environment: analysis.environment ?? "",
        logo_url: logoUrl,
        workPhotos,
        sourceUrl: home.toString(),
      },
    });
  } catch (err) {
    await refund();
    const msg = err instanceof Error ? err.message : String(err);
    console.error("deep-research failed:", msg);
    return NextResponse.json({ error: `Onderzoek mislukt: ${msg}` }, { status: 500 });
  }
}
