// Delen met een link — de serverkant. Alleen de eigenaar van een creatie kan hem delen
// of het delen stoppen; de openbare pagina leest met de service-client, alleen rijen
// mét een deelcode.

import { randomBytes } from "node:crypto";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadNaarOpslag } from "@/lib/creaties/wachtrij";
import type { Creatie } from "@/lib/creaties/types";
import { heeftGezicht } from "./herkomst";

const run = promisify(execFile);

export class DeelFout extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// Zonder 0/O en 1/l/I: de link wordt soms overgetypt of voorgelezen.
const TEKENS = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

export function nieuweCode(lengte = 8): string {
  const b = randomBytes(lengte);
  return Array.from(b, (x) => TEKENS[x % TEKENS.length]).join("");
}

export function deelLink(origin: string, code: string): string {
  return `${origin}/d/${code}`;
}

/** Een stilstaand beeld uit de video, voor het voorbeeld in WhatsApp en op LinkedIn. */
async function maakPoster(userId: string, videoUrl: string): Promise<string | null> {
  const map = await mkdtemp(path.join(tmpdir(), "poster-"));
  try {
    const uit = path.join(map, "poster.jpg");
    await run(ffmpegPath as unknown as string, ["-hide_banner", "-ss", "1", "-i", videoUrl, "-frames:v", "1", "-q:v", "3", "-y", uit], {
      maxBuffer: 1 << 22,
    });
    return await uploadNaarOpslag(userId, await readFile(uit), "jpg", "image/jpeg");
  } catch (e) {
    // Zonder poster deelt de link nog steeds; alleen het voorbeeldplaatje ontbreekt.
    console.error("[delen] poster maken mislukt:", e instanceof Error ? e.message : e);
    return null;
  } finally {
    await rm(map, { recursive: true, force: true }).catch(() => {});
  }
}

async function eigenCreatie(userId: string, id: string): Promise<Creatie> {
  const { data } = await createServiceClient().from("creaties").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!data) throw new DeelFout("Niet gevonden.", 404);
  return data as Creatie;
}

export async function deel(userId: string, id: string, toestemming: boolean): Promise<Creatie> {
  const c = await eigenCreatie(userId, id);
  if (c.deel_code) return c;
  if (c.status !== "klaar" || !c.url) throw new DeelFout("Alleen iets wat klaar is, kun je delen.");
  if (c.maker === "upload") throw new DeelFout("Een eigen geüploade foto kun je hier niet delen.");
  if (heeftGezicht(c) && !toestemming) {
    throw new DeelFout("Bevestig eerst dat iedereen op dit beeld het goed vindt dat je het deelt.");
  }
  const poster = c.soort === "video" ? await maakPoster(userId, c.url) : null;
  // Een botsing op de unieke code is bij 57^8 mogelijkheden zo goed als uitgesloten,
  // maar één nieuwe poging kost niets.
  for (let poging = 0; poging < 2; poging++) {
    const { data, error } = await createServiceClient()
      .from("creaties")
      .update({ deel_code: nieuweCode(), deel_poster: poster, gedeeld_op: new Date().toISOString() })
      .eq("id", c.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (!error && data) return data as Creatie;
    if (error && !/duplicate|unique/i.test(error.message)) {
      console.error("[delen] opslaan mislukt:", error.message);
      throw new DeelFout("Delen mislukt. Probeer het opnieuw.", 500);
    }
  }
  throw new DeelFout("Delen mislukt. Probeer het opnieuw.", 500);
}

export async function stopDelen(userId: string, id: string): Promise<Creatie> {
  await eigenCreatie(userId, id);
  const { data } = await createServiceClient()
    .from("creaties")
    .update({ deel_code: null, gedeeld_op: null })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  return data as Creatie;
}

/** Voor de openbare pagina: alleen wat gedeeld is, en alleen wat een bezoeker mag zien. */
export async function gedeeld(code: string): Promise<Pick<Creatie, "soort" | "maker" | "invoer" | "url" | "deel_poster" | "gedeeld_op"> | null> {
  if (!/^[A-Za-z0-9]{6,16}$/.test(code)) return null;
  const { data } = await createServiceClient()
    .from("creaties")
    .select("soort, maker, invoer, url, deel_poster, gedeeld_op, status")
    .eq("deel_code", code)
    .maybeSingle();
  if (!data || data.status !== "klaar" || !data.url) return null;
  // Alleen de velden die de pagina nodig heeft om te zeggen waarmee het gemaakt is; de
  // rest van de invoer (eigen teksten, bronfoto's) blijft privé.
  const invoer = data.invoer as Record<string, unknown>;
  return {
    soort: data.soort,
    maker: data.maker,
    invoer: { receptId: invoer.receptId, formaat: invoer.formaat },
    url: data.url,
    deel_poster: data.deel_poster,
    gedeeld_op: data.gedeeld_op,
  };
}
