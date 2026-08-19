// ── Losse elementen in beeld zetten ──────────────────────────────────────────
//
// "Zet een appel op zijn bureau" werkt hier zoals het in Premiere zou gaan: het
// element komt er als losse laag overheen, niet in de pixels van de clip. Je
// kunt het dus verslepen, schalen en weer weghalen zonder dat het beeld eronder
// verandert — en het kost één beeld-credit in plaats van een hele nieuwe render.
//
// Drie stappen:
//   1. een frame uit de clip pakken, zodat we zien waar het element hoort;
//   2. het element genereren en de achtergrond eraf halen (echte transparantie);
//   3. met beeldherkenning bepalen wáár het moet staan.
//
// Stap 3 is wat het verschil maakt tussen "ergens in het midden" en "op het
// bureau". Lukt het niet, dan zetten we het element onderin het midden neer en
// zeggen we erbij dat je het kunt verslepen — liever een eerlijke gok dan doen
// alsof.

import { fal } from "@fal-ai/client";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openai } from "@/lib/openai";
import { breedteNaarSchaal, pngFormaat } from "./element-geometry";

export { breedteNaarSchaal, pngFormaat };

const run = promisify(execFile);

fal.config({ credentials: process.env.FAL_KEY });

const BEELD_MODEL = "fal-ai/nano-banana";
// Achtergrond eraf. Geverifieerd op 19-8-2026: levert een echt alfakanaal
// (rgba), ook rond dunne delen zoals een steeltje of blaadje.
const KNIP_MODEL = "fal-ai/imageutils/rembg";

// Beweging maken van een (bewerkt) beeld. Zelfde model als de Studio gebruikt,
// dus zelfde look en dezelfde prijs; hier blokkerend aangeroepen omdat de chat
// pas verder kan als de nieuwe clip er is.
const BEWEGING_MODEL = "fal-ai/bytedance/seedance/v1/lite/image-to-video";

export interface ElementPlek {
  x: number; // 0..1, midden van het element
  y: number;
  scale: number; // fractie van de compositiebreedte
  /** Waarom hier — gaat mee in de chat zodat de klant het kan volgen. */
  toelichting?: string;
}

/**
 * Eén frame uit een clip, als PNG. Zonder frame kunnen we niets plaatsen.
 *
 * `metRaster` tekent er lijnen op elke 10%: een vision-model schat coördinaten
 * uit de losse pols slecht (onze eerste test zette een appel onder het bureau),
 * maar met zichtbare ijkpunten een stuk beter.
 */
export async function pakFrame(videoUrl: string, seconde: number, metRaster = false): Promise<Buffer | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "frame-"));
  try {
    const uit = path.join(dir, "frame.png");
    const filters = ["scale=768:-1"];
    if (metRaster) {
      filters.push("drawgrid=w=iw/10:h=ih/10:t=1:c=red@0.45");
      // Dikkere lijnen op de kwarten, zodat 0,25 / 0,5 / 0,75 herkenbaar zijn.
      filters.push("drawgrid=w=iw/4:h=ih/4:t=2:c=blue@0.55");
    }
    await run(ffmpegPath as unknown as string, [
      "-ss", Math.max(0, seconde).toFixed(2),
      "-i", videoUrl,
      "-frames:v", "1",
      "-vf", filters.join(","),
      "-y", uit,
    ], { maxBuffer: 1024 * 1024 * 32 });
    return await readFile(uit);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Genereert het element en haalt de achtergrond eraf. Levert een blijvende URL
 * in de `scene-assets`-bucket op, want de URL's van fal verlopen.
 */
export async function genereerElement(
  sb: SupabaseClient,
  userId: string,
  beschrijving: string,
  stijlHint?: string
): Promise<{ url: string; png: Buffer }> {
  const prompt = [
    `${beschrijving.trim()}.`,
    stijlHint ? `Visual style: ${stijlHint}.` : "Simple, clean illustration.",
    "One single object, centered, complete and unobstructed.",
    "Isolated on a plain pure white background. No shadow, no reflection, no text, no watermark, no extra objects.",
  ].join(" ");

  const gen = await fal.subscribe(BEELD_MODEL, {
    input: { prompt, num_images: 1, output_format: "png" } as never,
  });
  const ruw = (gen.data as { images?: { url: string }[] }).images?.[0]?.url;
  if (!ruw) throw new Error("Geen element ontvangen van de beeldgenerator");

  const geknipt = await fal.subscribe(KNIP_MODEL, { input: { image_url: ruw } as never });
  const transparant =
    (geknipt.data as { image?: { url: string } }).image?.url ??
    (geknipt.data as { images?: { url: string }[] }).images?.[0]?.url;
  if (!transparant) throw new Error("Achtergrond weghalen mislukt");

  const bytes = Buffer.from(await (await fetch(transparant)).arrayBuffer());
  const pad = `${userId}/editor/elements/${randomUUID()}.png`;
  const { error } = await sb.storage.from("scene-assets").upload(pad, bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw new Error(`Element opslaan mislukt: ${error.message}`);
  return { url: sb.storage.from("scene-assets").getPublicUrl(pad).data.publicUrl, png: bytes };
}

/**
 * Achtergrond van een bestaand plaatje weghalen.
 *
 * Zelfde model als bij de iconenbibliotheek, maar dan op materiaal dat er al
 * staat. Er wordt niets opnieuw bedacht: het model bepaalt alleen wélke pixels
 * doorzichtig worden, de rest van het beeld blijft onaangeroerd.
 */
export async function wisAchtergrond(
  sb: SupabaseClient,
  userId: string,
  beeldUrl: string
): Promise<string> {
  const geknipt = await fal.subscribe(KNIP_MODEL, { input: { image_url: beeldUrl } as never });
  const transparant =
    (geknipt.data as { image?: { url: string } }).image?.url ??
    (geknipt.data as { images?: { url: string }[] }).images?.[0]?.url;
  if (!transparant) throw new Error("Achtergrond weghalen mislukt");

  const bytes = Buffer.from(await (await fetch(transparant)).arrayBuffer());
  const pad = `${userId}/editor/uitgeknipt/${randomUUID()}.png`;
  const { error } = await sb.storage.from("scene-assets").upload(pad, bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw new Error(`Opslaan mislukt: ${error.message}`);
  return sb.storage.from("scene-assets").getPublicUrl(pad).data.publicUrl;
}

/**
 * Snijdt een stuk uit het beeld van de clip zelf en levert dat als los plaatje.
 *
 * Dit is het gum-en-stempel-gereedschap: kopieer een schoon stuk achtergrond en
 * plak het over iets wat weg moet. Volledig deterministisch — geen model dat
 * opnieuw mag gokken, dus er kan niets anders in beeld veranderen dan precies
 * het rechthoekje dat je aanwijst.
 *
 * Alle coördinaten zijn fracties van het beeld (0..1).
 */
export async function snijUitFrame(
  sb: SupabaseClient,
  userId: string,
  videoUrl: string,
  seconde: number,
  bron: { x: number; y: number; breedte: number; hoogte: number }
): Promise<{ url: string; png: Buffer } | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "patch-"));
  try {
    const uit = path.join(dir, "patch.png");
    // crop met fracties: ffmpeg rekent zelf met in_w/in_h, dus dit werkt bij elke
    // bronresolutie. x/y zijn hier de LINKERBOVENHOEK van het uitgesneden stuk.
    const links = Math.max(0, Math.min(1, bron.x - bron.breedte / 2));
    const boven = Math.max(0, Math.min(1, bron.y - bron.hoogte / 2));
    const crop = `crop=in_w*${bron.breedte.toFixed(4)}:in_h*${bron.hoogte.toFixed(4)}:in_w*${links.toFixed(4)}:in_h*${boven.toFixed(4)}`;
    await run(ffmpegPath as unknown as string, [
      "-ss", Math.max(0, seconde).toFixed(2),
      "-i", videoUrl,
      "-frames:v", "1",
      "-vf", crop,
      "-y", uit,
    ], { maxBuffer: 1024 * 1024 * 32 });

    const png = await readFile(uit);
    const pad = `${userId}/editor/patches/${randomUUID()}.png`;
    const { error } = await sb.storage.from("scene-assets").upload(pad, png, {
      contentType: "image/png",
      upsert: true,
    });
    if (error) throw new Error(`Uitsnede opslaan mislukt: ${error.message}`);
    return { url: sb.storage.from("scene-assets").getPublicUrl(pad).data.publicUrl, png };
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Leest de kleur op één punt uit het beeld, als hex. */
export async function leesKleur(
  videoUrl: string,
  seconde: number,
  punt: { x: number; y: number }
): Promise<string | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "kleur-"));
  try {
    const uit = path.join(dir, "pixel.raw");
    await run(ffmpegPath as unknown as string, [
      "-ss", Math.max(0, seconde).toFixed(2),
      "-i", videoUrl,
      "-frames:v", "1",
      "-vf", `crop=1:1:in_w*${Math.min(0.999, Math.max(0, punt.x)).toFixed(4)}:in_h*${Math.min(0.999, Math.max(0, punt.y)).toFixed(4)},format=rgb24`,
      "-f", "rawvideo", "-pix_fmt", "rgb24",
      "-y", uit,
    ], { maxBuffer: 1024 * 1024 });
    const rgb = await readFile(uit);
    if (rgb.length < 3) return null;
    return `#${[rgb[0], rgb[1], rgb[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Een effen vlak in een gegeven kleur, klaar om overheen te leggen. */
export async function maakVlak(
  sb: SupabaseClient,
  userId: string,
  kleur: string,
  formaat: { breedte: number; hoogte: number }
): Promise<{ url: string; png: Buffer } | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "vlak-"));
  try {
    const uit = path.join(dir, "vlak.png");
    const breedtePx = Math.max(8, Math.round(formaat.breedte * 1920));
    const hoogtePx = Math.max(8, Math.round(formaat.hoogte * 1080));
    await run(ffmpegPath as unknown as string, [
      "-f", "lavfi", "-i", `color=c=${kleur}:s=${breedtePx}x${hoogtePx}`,
      "-frames:v", "1", "-y", uit,
    ], { maxBuffer: 1024 * 1024 * 8 });
    const png = await readFile(uit);
    const pad = `${userId}/editor/patches/${randomUUID()}.png`;
    const { error } = await sb.storage.from("scene-assets").upload(pad, png, { contentType: "image/png", upsert: true });
    if (error) return null;
    return { url: sb.storage.from("scene-assets").getPublicUrl(pad).data.publicUrl, png };
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Vervaagt een stuk van het beeld en levert dat als los plaatje. */
export async function vervaagUitsnede(
  sb: SupabaseClient,
  userId: string,
  videoUrl: string,
  seconde: number,
  gebied: { x: number; y: number; breedte: number; hoogte: number },
  sterkte = 18
): Promise<{ url: string; png: Buffer } | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "blur-"));
  try {
    const uit = path.join(dir, "blur.png");
    const links = Math.max(0, Math.min(1, gebied.x - gebied.breedte / 2));
    const boven = Math.max(0, Math.min(1, gebied.y - gebied.hoogte / 2));
    // Eerst uitsnijden, dan vervagen: zo blijft de rest van het beeld scherp en
    // leggen we alleen dit stukje er straks overheen.
    const filter =
      `crop=in_w*${gebied.breedte.toFixed(4)}:in_h*${gebied.hoogte.toFixed(4)}:` +
      `in_w*${links.toFixed(4)}:in_h*${boven.toFixed(4)},boxblur=${Math.round(sterkte)}:2`;
    await run(ffmpegPath as unknown as string, [
      "-ss", Math.max(0, seconde).toFixed(2),
      "-i", videoUrl,
      "-frames:v", "1",
      "-vf", filter,
      "-y", uit,
    ], { maxBuffer: 1024 * 1024 * 32 });

    const png = await readFile(uit);
    const pad = `${userId}/editor/blur/${randomUUID()}.png`;
    const { error } = await sb.storage.from("scene-assets").upload(pad, png, { contentType: "image/png", upsert: true });
    if (error) return null;
    return { url: sb.storage.from("scene-assets").getPublicUrl(pad).data.publicUrl, png };
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Een getekende vorm in de opslag zetten, klaar om over de video te leggen. */
export async function uploadVorm(sb: SupabaseClient, userId: string, png: Buffer): Promise<string | null> {
  const pad = `${userId}/editor/vormen/${randomUUID()}.png`;
  const { error } = await sb.storage.from("scene-assets").upload(pad, png, { contentType: "image/png", upsert: true });
  if (error) return null;
  return sb.storage.from("scene-assets").getPublicUrl(pad).data.publicUrl;
}

/** Een frame in de opslag zetten zodat externe modellen erbij kunnen. */
export async function uploadFrame(sb: SupabaseClient, userId: string, png: Buffer): Promise<string | null> {
  const pad = `${userId}/editor/frames/${randomUUID()}.png`;
  const { error } = await sb.storage.from("scene-assets").upload(pad, png, { contentType: "image/png", upsert: true });
  if (error) return null;
  return sb.storage.from("scene-assets").getPublicUrl(pad).data.publicUrl;
}

/**
 * Leest de kleur op één punt uit het beeld en maakt daar een effen vlak van.
 *
 * Voor vlakke illustraties (wat onze tools maken) is dit betrouwbaarder dan een
 * stukje beeld kopiëren: geen randjes van een verkeerd gekozen bronstuk, geen
 * lucht over een groen bord. Je wijst een kleur aan, en krijgt precies dat
 * rechthoekje in precies die kleur.
 */
export async function vulVlak(
  sb: SupabaseClient,
  userId: string,
  videoUrl: string,
  seconde: number,
  monster: { x: number; y: number },
  formaat: { breedte: number; hoogte: number }
): Promise<{ url: string; png: Buffer; kleur: string } | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "vlak-"));
  try {
    // Eén pixel uitsnijden op het aangewezen punt en de kleur uitlezen.
    const pixel = path.join(dir, "pixel.png");
    await run(ffmpegPath as unknown as string, [
      "-ss", Math.max(0, seconde).toFixed(2),
      "-i", videoUrl,
      "-frames:v", "1",
      "-vf", `crop=1:1:in_w*${Math.min(0.999, Math.max(0, monster.x)).toFixed(4)}:in_h*${Math.min(0.999, Math.max(0, monster.y)).toFixed(4)},format=rgb24`,
      "-f", "rawvideo", "-pix_fmt", "rgb24",
      "-y", pixel,
    ], { maxBuffer: 1024 * 1024 });
    const rgb = await readFile(pixel);
    if (rgb.length < 3) return null;
    const kleur = `#${[rgb[0], rgb[1], rgb[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

    // En daar een effen vlak van maken, ruim bemeten zodat schalen scherp blijft.
    const uit = path.join(dir, "vlak.png");
    const breedtePx = Math.max(8, Math.round(formaat.breedte * 1920));
    const hoogtePx = Math.max(8, Math.round(formaat.hoogte * 1080));
    await run(ffmpegPath as unknown as string, [
      "-f", "lavfi",
      "-i", `color=c=${kleur}:s=${breedtePx}x${hoogtePx}`,
      "-frames:v", "1",
      "-y", uit,
    ], { maxBuffer: 1024 * 1024 * 8 });

    const png = await readFile(uit);
    const pad = `${userId}/editor/patches/${randomUUID()}.png`;
    const { error } = await sb.storage.from("scene-assets").upload(pad, png, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`Vlak opslaan mislukt: ${error.message}`);
    return { url: sb.storage.from("scene-assets").getPublicUrl(pad).data.publicUrl, png, kleur };
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Waar hoort het element in beeld? We laten een vision-model naar het frame
 * kijken en om coördinaten vragen. Zonder deze stap zou "op zijn bureau"
 * neerkomen op "ergens in het midden".
 */
export async function bepaalPlek(frame: Buffer, waar: string, wat: string): Promise<ElementPlek> {
  const standaard: ElementPlek = { x: 0.5, y: 0.68, scale: 0.18, toelichting: "onderin het midden gezet — versleep hem gerust" };
  try {
    const antwoord = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Je kijkt naar één frame uit een video en bepaalt waar een nieuw object moet komen. " +
            "Over het beeld ligt een hulpraster: dunne rode lijnen om de 10% en dikkere blauwe om de 25%. " +
            "Gebruik dat raster om je coördinaten af te lezen — tel de vakjes, schat niet. " +
            "Antwoord met JSON: {\"x\": 0..1, \"y\": 0..1, \"scale\": 0..1, \"uitleg\": \"...\"}. " +
            "x en y zijn het MIDDEN van het object als fractie van breedte en hoogte (0,0 = linksboven). " +
            "scale is de breedte van het object als fractie van de beeldbreedte; een voorwerp op een tafel is meestal 0,08-0,20. " +
            "Kies een plek waar het object logisch zou liggen of staan, niet over een gezicht heen.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Object: ${wat}. Gewenste plek: ${waar || "logisch in het beeld"}.` },
            { type: "image_url", image_url: { url: `data:image/png;base64,${frame.toString("base64")}` } },
          ],
        },
      ],
    });

    const ruw = antwoord.choices[0]?.message?.content;
    if (!ruw) return standaard;
    const j = JSON.parse(ruw) as { x?: number; y?: number; scale?: number; uitleg?: string };
    const klem = (n: number | undefined, min: number, max: number, fallback: number) =>
      typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

    return {
      x: klem(j.x, 0.02, 0.98, standaard.x),
      y: klem(j.y, 0.02, 0.98, standaard.y),
      scale: klem(j.scale, 0.03, 0.6, standaard.scale),
      toelichting: typeof j.uitleg === "string" ? j.uitleg : undefined,
    };
  } catch {
    return standaard;
  }
}


/**
 * Maakt van een stilstaand beeld weer een bewegende clip (Seedance, 5s/720p) en
 * zet die in de opslag. Blokkerend: de chat kan pas verder als de clip er is.
 */
export async function maakBeweging(
  sb: SupabaseClient,
  userId: string,
  beeldUrl: string,
  bewegingPrompt?: string
): Promise<{ url: string; duur: number }> {
  const res = await fal.subscribe(BEWEGING_MODEL, {
    input: {
      image_url: beeldUrl,
      prompt: (bewegingPrompt || "Subtle, slow cinematic camera movement. Keep the scene calm and natural.").slice(0, 2500),
      duration: "5",
      resolution: "720p",
    } as never,
  });
  const tijdelijk = (res.data as { video?: { url: string } }).video?.url;
  if (!tijdelijk) throw new Error("Geen bewegende clip ontvangen");

  const bytes = Buffer.from(await (await fetch(tijdelijk)).arrayBuffer());
  const pad = `${userId}/editor/motion/${randomUUID()}.mp4`;
  const { error } = await sb.storage.from("scene-assets").upload(pad, bytes, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) throw new Error(`Clip opslaan mislukt: ${error.message}`);
  return { url: sb.storage.from("scene-assets").getPublicUrl(pad).data.publicUrl, duur: 5 };
}

/**
 * Bewerkt het beeld van een clip: frame eruit, instructie erop (Flux Kontext
 * verandert alleen wat je vraagt en houdt compositie en personages gelijk), en
 * het resultaat in de opslag.
 */
export async function bewerkClipBeeld(
  sb: SupabaseClient,
  userId: string,
  frame: Buffer,
  instructie: string,
  format: string
): Promise<string> {
  // Flux Kontext heeft een URL nodig, dus het frame gaat eerst de opslag in.
  const framePad = `${userId}/editor/frames/${randomUUID()}.png`;
  const { error: upErr } = await sb.storage.from("scene-assets").upload(framePad, frame, {
    contentType: "image/png",
    upsert: true,
  });
  if (upErr) throw new Error(`Frame opslaan mislukt: ${upErr.message}`);
  const frameUrl = sb.storage.from("scene-assets").getPublicUrl(framePad).data.publicUrl;

  // Bewust NIET editImage() uit lib/image-gen: die is gemaakt voor scène-beelden
  // en bevat de regel "alle tekst in beeld moet correct Nederlands zijn". In de
  // editor werkte dat averechts — een instructie als "haal de koffiebeker weg"
  // belandde als tekst in beeld ("Hal de koffieber !"). Hier dus een strikte
  // eigen prompt die tekst juist met rust laat.
  const prompt = [
    `${instructie.trim()}.`,
    "This is a photo/illustration edit instruction, NOT text to render.",
    "Do NOT add, remove, translate or restyle any text, caption, title or lettering that is visible in the image — leave all existing text exactly as it is, pixel for pixel.",
    "Change ONLY what the instruction asks. Keep composition, framing, camera angle, all people and their identity, the background, lighting, colour palette and the illustration style identical to the source.",
    "No watermarks, no new logos, no extra objects.",
  ].join(" ").slice(0, 4000);

  const resultaat = await fal.subscribe("fal-ai/flux-pro/kontext", {
    input: {
      prompt,
      image_url: frameUrl,
      aspect_ratio: format === "9:16" ? "9:16" : "16:9",
      guidance_scale: 3.5,
      num_images: 1,
      output_format: "jpeg",
      safety_tolerance: "5",
    } as never,
  });
  const bewerkt = (resultaat.data as { images?: { url: string }[] }).images?.[0]?.url;
  if (!bewerkt) throw new Error("Geen bewerkt beeld ontvangen");

  const bytes = Buffer.from(await (await fetch(bewerkt)).arrayBuffer());
  const pad = `${userId}/editor/edits/${randomUUID()}.jpg`;
  const { error } = await sb.storage.from("scene-assets").upload(pad, bytes, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw new Error(`Bewerkt beeld opslaan mislukt: ${error.message}`);
  return sb.storage.from("scene-assets").getPublicUrl(pad).data.publicUrl;
}
