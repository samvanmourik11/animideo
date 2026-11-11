// Het logo en de voorbeeldbeelden van de klant klaarmaken, voor twee lezers:
//   - de pagina waarin de video wordt getekend: die mag niets van buiten ophalen, dus het
//     logo en de foto's die in beeld komen gaan er als data in mee;
//   - Claude: die krijgt elk beeld te zien met het doel dat de klant erbij zette.
// Alleen op de server.

import sharp from "sharp";
import type Anthropic from "@anthropic-ai/sdk";
import { MAX_BEELDEN, MOTION_DOELEN, isMotionDoel, type MotionBeeld } from "./types";

export interface PaginaLogo {
  src: string;
  w: number;
  h: number;
  /** Een wit of heel licht logo: dat hoort op een donker vlak, niet op een witte kaart. */
  licht: boolean;
}
export interface PaginaFoto {
  src: string;
  w: number;
  h: number;
}

/**
 * Beelden komen alleen van onze eigen opslag. De server haalt ze op, dus een adres dat de
 * klant zelf mag invullen zou hem naar elk intern adres kunnen laten kijken.
 */
export function eigenOpslag(url: unknown): url is string {
  const basis = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return typeof url === "string" && !!basis && url.startsWith(`${basis.replace(/\/$/, "")}/storage/v1/object/public/`);
}

/** De voorbeelden van de klant: alleen beelden op onze eigen opslag, opnieuw genummerd f1, f2, ... */
export function leesBeelden(ruw: unknown): MotionBeeld[] {
  return (Array.isArray(ruw) ? ruw : [])
    .map((b) => (b ?? {}) as Record<string, unknown>)
    .filter((b) => eigenOpslag(b.url) && isMotionDoel(b.doel))
    .slice(0, MAX_BEELDEN)
    .map((b, i) => ({ id: `f${i + 1}`, url: b.url as string, doel: b.doel as MotionBeeld["doel"], uitleg: (typeof b.uitleg === "string" ? b.uitleg.replace(/\s+/g, " ").trim().slice(0, 240) : ""), ...(b.vast ? { vast: true } : {}) }));
}

async function haal(url: string): Promise<Buffer> {
  if (!eigenOpslag(url)) throw new Error("Dit beeld staat niet op onze opslag.");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Beeld ophalen mislukt (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

const dataUrl = (buf: Buffer, mime: string) => `data:${mime};base64,${buf.toString("base64")}`;

/** Het logo als PNG van hooguit 900 pixels breed, zonder lege rand eromheen. */
export async function logoVanBuffer(ruw: Buffer): Promise<PaginaLogo> {
  // density: een SVG-logo wordt anders op 72 dpi omgezet en is dan korrelig.
  let beeld = sharp(ruw, { density: 300 }).rotate();
  try {
    // De lege rand eraf, zodat het logo even groot oogt als de tekst ernaast.
    const kaal = await beeld.clone().trim().png().toBuffer();
    beeld = sharp(kaal);
  } catch {
    // Een egaal beeld kan niet worden bijgesneden; dan gewoon het origineel.
  }
  const { data, info } = await beeld.resize({ width: 900, height: 450, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  // Hoe licht is het logo zelf? Alleen de pixels die niet doorzichtig zijn tellen mee.
  const klein = await sharp(data).resize(48, 48, { fit: "inside" }).ensureAlpha().raw().toBuffer();
  let som = 0, gewicht = 0, doorzichtig = 0;
  for (let i = 0; i < klein.length; i += 4) {
    const a = klein[i + 3] / 255;
    som += ((klein[i] * 299 + klein[i + 1] * 587 + klein[i + 2] * 114) / 1000) * a;
    gewicht += a;
    if (a < 0.5) doorzichtig++;
  }
  // Zonder doorzichtige delen heeft het logo zijn eigen achtergrond en maakt het niet uit.
  const licht = doorzichtig > klein.length / 4 / 10 && gewicht > 0 && som / gewicht > 190;
  return { src: dataUrl(data, "image/png"), w: info.width, h: info.height, licht };
}

export async function bereidLogo(url: string): Promise<PaginaLogo | null> {
  if (!url) return null;
  try {
    return await logoVanBuffer(await haal(url));
  } catch (e) {
    // Een logo dat niet te lezen is, mag de video niet tegenhouden: dan het merkteken met de letter.
    console.error("[motion] logo niet bruikbaar:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** De foto's die zelf in beeld komen (doel "tonen"), klein genoeg om in de pagina mee te gaan. */
export async function bereidFotos(beelden: MotionBeeld[]): Promise<Record<string, PaginaFoto>> {
  const uit: Record<string, PaginaFoto> = {};
  for (const b of beelden.filter((x) => x.doel === "tonen")) {
    try {
      const { data, info } = await sharp(await haal(b.url)).rotate().resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 86 }).toBuffer({ resolveWithObject: true });
      uit[b.id] = { src: dataUrl(data, "image/jpeg"), w: info.width, h: info.height };
    } catch (e) {
      console.error(`[motion] foto ${b.id} niet bruikbaar:`, e instanceof Error ? e.message : e);
    }
  }
  return uit;
}

type Blok = Anthropic.Beta.BetaContentBlockParam;

const DOEL_OPDRACHT: Record<MotionBeeld["doel"], string> = {
  natekenen: "teken dit na in de platte tekenstijl van de video. Het moet herkenbaar hetzelfde ding zijn: zelfde vorm, verhoudingen, kleuren en opvallende details (belettering als vlakken of korte tekst).",
  uitleg: "dit is wat de video moet uitleggen. Bouw het stap voor stap op in beeld, met dezelfde onderdelen, volgorde en cijfers.",
  stijl: "neem hiervan de sfeer over: de vormentaal, de compositie en het gebruik van kleur. Niet de inhoud.",
  tonen: "deze foto komt zelf in beeld.",
};

/**
 * De voorbeelden zoals Claude ze te zien krijgt: per beeld een regel met het doel, dan het
 * beeld zelf. Leeg als er geen beelden zijn.
 */
export async function beeldBlokken(beelden: MotionBeeld[], metFotoCode: boolean): Promise<Blok[]> {
  const blokken: Blok[] = [];
  for (const b of beelden) {
    let jpg: Buffer;
    try {
      jpg = await sharp(await haal(b.url), { density: 200 }).rotate().resize({ width: 1100, height: 1100, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 80 }).toBuffer();
    } catch (e) {
      console.error(`[motion] voorbeeld ${b.id} niet bruikbaar:`, e instanceof Error ? e.message : e);
      continue;
    }
    const doel = MOTION_DOELEN.find((d) => d.id === b.doel)?.naam ?? b.doel;
    blokken.push({
      type: "text",
      text: `Voorbeeld ${b.id} — doel: ${doel}. ${b.uitleg ? `De klant zegt erbij: "${b.uitleg}". ` : ""}Wat je ermee doet: ${DOEL_OPDRACHT[b.doel]}${b.doel === "tonen" && metFotoCode ? ` Gebruik foto(parent, '${b.id}', breedte).` : ""}`,
    });
    blokken.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpg.toString("base64") } });
  }
  if (blokken.length) {
    blokken.unshift({ type: "text", text: "De klant heeft voorbeelden meegegeven. Elk voorbeeld heeft een doel; houd je daaraan." });
  }
  return blokken;
}
