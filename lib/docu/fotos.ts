// VRIJE FOTO'S voor een docu, van Wikimedia Commons.
//
// Alleen Commons, en daarvan alleen licenties die gebruik in een YouTube-video met
// naamsvermelding toestaan (publiek domein, CC0, CC BY, CC BY-SA). Geen "niet-commercieel"
// (NC) of "geen bewerkingen" (ND): een YouTube-kanaal verdient geld, en wij zoomen en snijden.
// Nieuwsbeelden van YouTube, die we in eigen video's wel gebruikten, doen we hier
// bewust niet: als een klant daar een claim op krijgt, komt die bij ons terecht.
//
// Per scene: zoeken op de zoekterm uit het script, de bruikbare kandidaten klein ophalen, het
// kleinste Claude-model kiest de foto die echt past (of geen: een verkeerde foto is erger dan
// geen foto; bij onze eigen video's zaten er tussen de zoekresultaten geregeld foute), en die
// gaat groot naar onze eigen opslag. Alleen op de server.

import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { claude } from "@/lib/motion/plan";
import { kosten } from "@/lib/motion/animatie";
import { uploadNaarOpslag } from "@/lib/creaties/wachtrij";
import type { MotionPlan } from "@/lib/motion/types";
import type { DocuFoto } from "./types";

const API = "https://commons.wikimedia.org/w/api.php";
// Wikimedia wil een herkenbare afzender en weigert anoniem zwaar gebruik.
const UA = "AnimideoDocu/1.0 (https://ai.animideo.com; documentary photo search)";
const KIES_MODEL = "claude-haiku-5-5";
/** Zoveel kandidaten bekijkt het model per scene. */
const KANDIDATEN = 6;
/** Zoveel scenes tegelijk: Commons knijpt als je te hard gaat. */
const TEGELIJK = 3;

const VRIJ = /^(cc0|public domain|pd\b|pd-|no restrictions|cc[ -]by(-sa)?[ -]?\d)/i;
const NIET = /\b(nc|nd)\b|non-?commercial|no ?deriv/i;

interface Kandidaat {
  titel: string;
  klein: string;
  groot: string;
  w: number;
  h: number;
  maker: string;
  licentie: string;
  wat: string;
  pagina: string;
}

const schoon = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();

async function haalJson(url: string): Promise<unknown> {
  for (let poging = 0; poging < 3; poging++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return res.json();
    // 429: Commons vraagt om rustiger aan te doen.
    await new Promise((r) => setTimeout(r, 4000 * (poging + 1)));
  }
  throw new Error("Wikimedia Commons gaf geen antwoord.");
}

async function haalBeeld(url: string): Promise<Buffer> {
  for (let poging = 0; poging < 3; poging++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    await new Promise((r) => setTimeout(r, 3000 * (poging + 1)));
  }
  throw new Error("Foto ophalen bij Commons mislukt.");
}

/**
 * Het adres van een kleine versie (500 px: Commons levert verkleiningen alleen nog in vaste
 * breedtes; 480 gaf HTTP 400 en daardoor kwam er in de eerste proef geen enkele foto mee).
 * Is de foto smaller dan gevraagd, dan geeft Commons het origineel terug in plaats van een verkleining; daar maken we zelf het thumb-adres van.
 */
function kleinAdres(url: string): string {
  if (/\/\d+px-[^/]+$/.test(url)) return url.replace(/\/\d+px-([^/]+)$/, "/500px-$1");
  const m = url.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(\w\/\w\w)\/([^/]+)$/);
  return m ? `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/500px-${m[2]}` : url;
}

/** Commons hangt sinds kort een volgcode achter de adressen (?utm_source=...); die moet eraf. */
const zonderQuery = (url: string) => url.split("?")[0];

async function zoekCommons(term: string): Promise<Kandidaat[]> {
  const p = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `filetype:bitmap ${term}`,
    gsrnamespace: "6",
    gsrlimit: "20",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "1920",
    format: "json",
    origin: "*",
  });
  const d = (await haalJson(`${API}?${p}`)) as { query?: { pages?: Record<string, { title: string; index?: number; imageinfo?: { url: string; thumburl?: string; width: number; height: number; descriptionurl: string; extmetadata?: Record<string, { value?: string }> }[] }> } };
  return Object.values(d.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap((pg) => {
      const ii = pg.imageinfo?.[0];
      if (!ii) return [];
      const m = ii.extmetadata ?? {};
      const licentie = schoon(m.LicenseShortName?.value ?? "");
      // Groot genoeg voor een beeldvullende foto. Staande foto's mogen ook (de meeste
      // archieffoto's van gebouwen zijn staand): de animatie snijdt en schuift erdoorheen.
      // Oude archieffoto's zijn vaak klein; wat zachter is beter dan geen foto.
      if (!VRIJ.test(licentie) || NIET.test(licentie) || ii.width < 700 || ii.height > ii.width * 1.7) return [];
      const groot = zonderQuery(ii.thumburl ?? ii.url);
      return [{
        titel: pg.title,
        groot,
        // Een kleine versie om te laten kiezen: dezelfde thumb-dienst, andere breedte.
        klein: kleinAdres(groot),
        w: ii.width,
        h: ii.height,
        maker: schoon(m.Artist?.value ?? "").slice(0, 60),
        licentie: licentie.replace(/^public domain$/i, "Public domain"),
        wat: schoon(m.ImageDescription?.value ?? pg.title.replace(/^File:/, "").replace(/\.\w+$/, "")).slice(0, 160),
        pagina: ii.descriptionurl,
      }];
    })
    .slice(0, KANDIDATEN);
}

/** Laat het kleinste model de best passende foto kiezen. -1: geen enkele past. */
async function kies(scene: { tekst: string; beeld: string }, term: string, ks: Kandidaat[], kleintjes: Buffer[]): Promise<{ keus: number; usd: number }> {
  const inhoud: Anthropic.Beta.BetaContentBlockParam[] = [];
  ks.forEach((k, i) => {
    inhoud.push({ type: "text", text: `Foto ${i + 1}: ${k.titel} — ${k.wat}` });
    inhoud.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: kleintjes[i].toString("base64") } });
  });
  inhoud.push({
    type: "text",
    text: `Dit is voor een scene in een documentaire.\nDe verteller zegt: ${scene.tekst}\nIn beeld hoort: ${scene.beeld}\nGezocht op: ${term}\n\nWelke foto laat echt dat onderwerp zien (de goede plek, het goede gebouw, de goede persoon of het goede ding) en is bruikbaar als beeldvullende foto (scherp, geen collage, geen logo of tekstbord als hoofdzaak, geen kaart of grafiek)? Twijfel je of het echt het goede onderwerp is, kies dan geen. Antwoord met alleen het nummer, of 0 als geen enkele past.`,
  });
  const m = await claude().beta.messages.create({ model: KIES_MODEL, max_tokens: 2000, output_config: { effort: "low" }, messages: [{ role: "user", content: inhoud }] });
  const tekst = m.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join(" ");
  const n = Number(tekst.match(/\d+/)?.[0] ?? 0);
  return { keus: n >= 1 && n <= ks.length ? n - 1 : -1, usd: kosten(KIES_MODEL, m.usage) };
}

async function fotoVoorScene(userId: string, scene: { tekst: string; beeld: string }, term: string): Promise<{ foto: Omit<DocuFoto, "id" | "scene"> | null; usd: number }> {
  // Niets gevonden: nog eens met een kortere zoekterm ("Vroom & Dreesmann store Netherlands"
  // → "Vroom & Dreesmann store"). Commons zoekt op alle woorden tegelijk.
  let ks = await zoekCommons(term);
  const woorden = term.split(/\s+/);
  for (let n = woorden.length - 1; !ks.length && n >= 2; n--) ks = await zoekCommons(woorden.slice(0, n).join(" "));
  if (!ks.length) return { foto: null, usd: 0 };
  const kleintjes = await Promise.all(ks.map(async (k) => sharp(await haalBeeld(k.klein)).resize(480, 480, { fit: "inside" }).flatten({ background: "#ffffff" }).jpeg({ quality: 75 }).toBuffer()));
  const { keus, usd } = await kies(scene, term, ks, kleintjes);
  if (keus < 0) return { foto: null, usd };
  const k = ks[keus];
  const { data, info } = await sharp(await haalBeeld(k.groot)).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).flatten({ background: "#000000" }).jpeg({ quality: 86 }).toBuffer({ resolveWithObject: true });
  const url = await uploadNaarOpslag(userId, data, "jpg", "image/jpeg");
  return { foto: { url, wat: k.wat, maker: k.maker, licentie: k.licentie, bron: k.pagina, w: info.width, h: info.height }, usd };
}

/**
 * Zoekt voor elke scene met een zoekterm een vrije foto. Scenes waarvoor niets goeds te
 * vinden is, krijgen geen foto: die tekent de animator dan helemaal zelf.
 */
export async function zoekFotos(userId: string, plan: MotionPlan, zoektermen: string[]): Promise<{ fotos: DocuFoto[]; usd: number }> {
  const taken = zoektermen.map((term, i) => ({ term: term.trim(), i })).filter((t) => t.term && plan.scenes[t.i]);
  const gevonden: (Omit<DocuFoto, "id" | "scene"> & { scene: number })[] = [];
  let usd = 0;
  for (let i = 0; i < taken.length; i += TEGELIJK) {
    const uitkomsten = await Promise.allSettled(taken.slice(i, i + TEGELIJK).map((t) => fotoVoorScene(userId, plan.scenes[t.i], t.term)));
    uitkomsten.forEach((u, j) => {
      const t = taken[i + j];
      if (u.status === "fulfilled") {
        usd += u.value.usd;
        if (u.value.foto) gevonden.push({ ...u.value.foto, scene: t.i + 1 });
      } else console.warn(`[docu/fotos] scene ${t.i + 1} ("${t.term}") mislukt:`, u.reason instanceof Error ? u.reason.message : u.reason);
    });
  }
  // Dezelfde foto twee keer achter elkaar is saai; de tweede vervalt.
  const gezien = new Set<string>();
  const fotos = gevonden
    .filter((f) => (gezien.has(f.bron) ? false : (gezien.add(f.bron), true)))
    .map((f, n) => ({ ...f, id: `f${n + 1}` }));
  return { fotos, usd };
}
