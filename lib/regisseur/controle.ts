// Kwaliteitscontrole van AI-clips vóór de montage. De Regisseur kan geen video afspelen, dus
// halen we per clip drie stilstaande beelden (begin, midden, eind) die hij wél kan bekijken.
// Is een clip duidelijk mislukt (vervormde handen of gezichten, dingen die verschijnen of
// verdwijnen, een ander personage), dan keurt hij hem af met keur_af: de klant krijgt de
// credits van die clip terug en de Regisseur maakt hem één keer opnieuw.
//
// Aanleiding (25-11-2026): klanten kregen een slechte eerste versie en betaalden daarna zelf
// voor het herstellen. Een betere eerste oplevering scheelt credits en frustratie.

import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadNaarOpslag } from "@/lib/creaties/wachtrij";
import { betaalTerug } from "@/lib/team/team";
import type { Creatie } from "@/lib/creaties/types";

const run = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;

/** Clips die de Regisseur zelf liet maken en dus mag nakijken. */
export const CLIP_MAKERS = new Set(["beeld-naar-video"]);
/** Zoveel clips per gebruiker per dag mag de Regisseur kosteloos afkeuren. */
export const MAX_AFKEUR_PER_DAG = 6;

/** Drie beelden uit een klare clip (begin, midden, eind). Eén keer gemaakt, daarna uit de rij. */
export async function controleBeelden(c: Creatie): Promise<string[]> {
  const inv = (c.invoer ?? {}) as Record<string, unknown>;
  if (Array.isArray(inv.controleBeelden)) return inv.controleBeelden as string[];
  if (!c.url) return [];
  const map = await mkdtemp(path.join(tmpdir(), "controle-"));
  try {
    const res = await fetch(c.url);
    if (!res.ok) return [];
    const mp4 = path.join(map, "c.mp4");
    await writeFile(mp4, Buffer.from(await res.arrayBuffer()));
    const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", mp4], { maxBuffer: 1 << 22 }).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
    const m = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
    const duur = m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 5;
    const momenten = [0.3, duur / 2, Math.max(0.5, duur - 0.3)];
    const urls: string[] = [];
    for (const [k, t] of momenten.entries()) {
      const jpg = path.join(map, `b${k}.jpg`);
      await run(FFMPEG, ["-nostdin", "-hide_banner", "-loglevel", "error", "-ss", t.toFixed(2), "-i", mp4, "-frames:v", "1", "-vf", "scale='min(768,iw)':-2", "-q:v", "4", "-y", jpg]);
      urls.push(await uploadNaarOpslag(c.user_id, await readFile(jpg), "jpg", "image/jpeg"));
    }
    await createServiceClient().from("creaties").update({ invoer: { ...inv, controleBeelden: urls } }).eq("id", c.id);
    return urls;
  } catch (e) {
    console.error("[controle] beelden uit clip mislukt:", e);
    return [];
  } finally {
    await rm(map, { recursive: true, force: true }).catch(() => {});
  }
}

/** De Regisseur keurt een eigen clip af: credits terug naar de klant, clip gemarkeerd. */
export async function keurAf(userId: string, id: string, reden: string): Promise<string> {
  const db = createServiceClient();
  const { data: c } = await db.from("creaties").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!c) return "Onbekende clip.";
  const inv = (c.invoer ?? {}) as Record<string, unknown>;
  if (!CLIP_MAKERS.has(c.maker)) return "Alleen losse AI-clips kun je afkeuren.";
  if (c.status !== "klaar") return "Deze clip is niet klaar.";
  if (inv.afgekeurd) return "Deze clip is al afgekeurd.";
  if (Date.now() - new Date(c.created_at).getTime() > 6 * 3600 * 1000) return "Deze clip is te oud om af te keuren.";
  const sinds = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from("creaties").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", sinds).not("invoer->afgekeurd", "is", null);
  if ((count ?? 0) >= MAX_AFKEUR_PER_DAG) return `Vandaag al ${MAX_AFKEUR_PER_DAG} clips afgekeurd; gebruik deze clip of vraag de gebruiker wat hij wil.`;
  await db.from("creaties").update({ invoer: { ...inv, afgekeurd: reden.slice(0, 300) } }).eq("id", id);
  if ((c.credits ?? 0) > 0) await betaalTerug({ user_id: userId, betaald_door: c.betaald_door, credits: c.credits }, "Terug: clip afgekeurd door de Regisseur");
  return `Afgekeurd; ${c.credits ?? 0} credits terug naar de gebruiker. Maak de clip één keer opnieuw met maak_video, met een eenvoudigere beweging die de fout vermijdt. Een tweede poging keur je niet nog eens af.`;
}
