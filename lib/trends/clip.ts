// De trendvideo die Sam bij een trend zet (de goal, het dansje, de audio-meme). De browser
// zet hem zelf in de opslag (Vercel neemt maar 4,5 MB aan); hier knippen we het stuk eruit
// dat telt, zodat de klant niet betaalt voor een intro van 20 seconden, en halen we het
// geluid eruit voor playback-trends.

import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { uploadNaarOpslag } from "@/lib/creaties/wachtrij";
import { MAX_CLIP_SEC } from "./types";

/** Draait ffmpeg; `controle` = gooien bij een fout (niet bij alleen informatie opvragen met -i). */
async function ffmpeg(args: string[], controle = true): Promise<string> {
  const ff = (await import("ffmpeg-static")).default as unknown as string;
  const { execFile } = await import("node:child_process");
  return new Promise((ok, fout) =>
    execFile(ff, ["-hide_banner", "-y", ...args], { maxBuffer: 1 << 24, timeout: 120000 }, (e, _o, err) =>
      e && controle ? fout(new Error(String(err).slice(-400))) : ok(String(err)),
    ),
  );
}

export function duurUit(stderr: string): number {
  const m = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0;
}

export interface VerwerkteClip {
  voorbeeldclip: string;
  geluid: string | null;
  clip_sec: number;
}

/**
 * Knipt [start, start+15 s] uit de video, en maakt er een mp3 van het geluid bij. Opnieuw
 * coderen in plaats van kopiëren: met -c copy begon de knip op de dichtstbijzijnde
 * sleutelbeeld, soms seconden te vroeg, en dan klopte de beweging niet meer met het begin.
 */
export async function verwerkClip(bron: string, start = 0, lengte = MAX_CLIP_SEC): Promise<VerwerkteClip> {
  if (!/^https:\/\//.test(bron)) throw new Error("Ongeldige video.");
  const map = await mkdtemp(path.join(tmpdir(), "trend-"));
  try {
    const res = await fetch(bron);
    if (!res.ok) throw new Error(`Video ophalen mislukt (HTTP ${res.status}).`);
    const inPad = path.join(map, "in");
    await writeFile(inPad, Buffer.from(await res.arrayBuffer()));
    const totaal = duurUit(await ffmpeg(["-i", inPad], false));
    if (!(totaal > 0)) throw new Error("Dit lijkt geen video te zijn.");
    const s = Math.max(0, Math.min(start, Math.max(0, totaal - 1)));
    const duur = Math.min(MAX_CLIP_SEC, Math.max(1, lengte), totaal - s);

    const uitPad = path.join(map, `${randomUUID()}.mp4`);
    await ffmpeg(["-ss", String(s), "-i", inPad, "-t", String(duur), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-f", "mp4", uitPad]);
    const voorbeeldclip = await uploadNaarOpslag("trends", await readFile(uitPad), "mp4", "video/mp4");

    // Geen geluidsspoor (een stille clip) is prima bij beweging; dan geen mp3.
    let geluid: string | null = null;
    const mp3 = path.join(map, "geluid.mp3");
    try {
      await ffmpeg(["-i", uitPad, "-vn", "-c:a", "libmp3lame", "-b:a", "160k", "-f", "mp3", mp3]);
      geluid = await uploadNaarOpslag("trends", await readFile(mp3), "mp3", "audio/mpeg");
    } catch {
      geluid = null;
    }
    return { voorbeeldclip, geluid, clip_sec: Math.round(duur * 10) / 10 };
  } finally {
    await rm(map, { recursive: true, force: true });
  }
}
