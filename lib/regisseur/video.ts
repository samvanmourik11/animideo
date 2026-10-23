// Een eigen video als bijlage voor de Regisseur. Claude kan geen video bekijken, wel
// beelden en tekst: we pakken een reeks stilstaande beelden over de hele lengte en
// schrijven uit wat er gezegd wordt (Whisper), met tijden erbij. Dat bewaren we bij de
// creatie, zodat het gesprek het later zonder opnieuw rekenen kan meesturen.

import { execFile } from "node:child_process";
import { transcribeWords, type WhisperWord } from "@/lib/openai";
import { uploadNaarOpslag } from "@/lib/creaties/wachtrij";

/** Langer dan dit lezen we niet in: de beelden worden te schaars om er iets van te zeggen. */
export const MAX_VIDEO_SEC = 10 * 60;
export const MAX_VIDEO_MB = 200;
/** Een beeld per ~5 s, minstens 4 en hoogstens 12 (meer maakt het gesprek duur). */
const MIN_BEELDEN = 4;
const MAX_BEELDEN = 12;
/** Achtervoegsel van de losse beelden, zodat het scherm ze niet als aparte foto's toont. */
export const STILL = ".still.jpg";

export interface VideoInhoud {
  duur: number;
  breedte: number;
  hoogte: number;
  beelden: { t: number; url: string }[];
  /** Regels "[0:12] wat er gezegd wordt"; leeg als er niets (verstaanbaars) gezegd wordt. */
  tekst: string;
}

async function ffmpeg(): Promise<string> {
  return (await import("ffmpeg-static")).default as unknown as string;
}

async function draai(args: string[], timeout = 60_000): Promise<{ uit: Buffer; fout: string; ok: boolean }> {
  const ff = await ffmpeg();
  return new Promise((klaar) => {
    execFile(ff, args, { encoding: "buffer", maxBuffer: 1 << 26, timeout }, (e, uit, fout) =>
      klaar({ uit: uit as Buffer, fout: String(fout), ok: !e }),
    );
  });
}

/** Duur, afmetingen en of er geluid in zit, uit wat ffmpeg over het bestand meldt. */
export function leesKop(stderr: string): { duur: number; breedte: number; hoogte: number; geluid: boolean } {
  const d = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const v = stderr.match(/Stream #[^\n]*Video:[^\n]*?, (\d{2,5})x(\d{2,5})/);
  const draaiing = /rotate\s*:\s*-?(90|270)|rotation of -?(90|270)/.test(stderr);
  const [b, h] = v ? [+v[1], +v[2]] : [0, 0];
  return {
    duur: d ? +d[1] * 3600 + +d[2] * 60 + parseFloat(d[3]) : 0,
    breedte: draaiing ? h : b,
    hoogte: draaiing ? b : h,
    geluid: /Stream #[^\n]*Audio:/.test(stderr),
  };
}

/** Tijdstippen midden in gelijke stukken, zodat begin en eind (vaak zwart) niet tellen. */
export function momenten(duur: number): number[] {
  const n = Math.min(MAX_BEELDEN, Math.max(MIN_BEELDEN, Math.round(duur / 5)));
  return Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) * duur * 10) / n) / 10);
}

export function tijd(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Woorden met tijden → regels per zin (of per ~8 s als er geen punten in staan). */
export function regelsUitWoorden(woorden: WhisperWord[]): string {
  const regels: string[] = [];
  let start = 0;
  let stuk: string[] = [];
  for (const w of woorden) {
    if (!stuk.length) start = w.start;
    stuk.push(w.word.trim());
    if (/[.!?]$/.test(w.word.trim()) || w.end - start >= 8) {
      regels.push(`[${tijd(start)}] ${stuk.join(" ")}`);
      stuk = [];
    }
  }
  if (stuk.length) regels.push(`[${tijd(start)}] ${stuk.join(" ")}`);
  return regels.join("\n");
}

export async function leesVideo(userId: string, url: string): Promise<VideoInhoud> {
  const kop = leesKop((await draai(["-hide_banner", "-i", url], 30_000)).fout);
  if (!kop.duur) throw new Error("Deze video kunnen we niet lezen. Probeer een MP4 of MOV.");
  if (kop.duur > MAX_VIDEO_SEC) throw new Error(`Video's mogen maximaal ${MAX_VIDEO_SEC / 60} minuten zijn.`);

  const beelden = Promise.all(
    momenten(kop.duur).map(async (t) => {
      const r = await draai(["-hide_banner", "-ss", String(t), "-i", url, "-frames:v", "1", "-vf", "scale='min(768,iw)':-2", "-q:v", "4", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"]);
      if (!r.ok || !r.uit.length) return null;
      return { t, url: await uploadNaarOpslag(userId, r.uit, STILL.slice(1), "image/jpeg") };
    }),
  ).then((x) => x.filter((b): b is { t: number; url: string } => !!b));

  // Mono, 16 kHz, lage bitrate: tien minuten blijft ruim onder de 25 MB van Whisper.
  const tekst = (async () => {
    if (!kop.geluid) return "";
    const r = await draai(["-hide_banner", "-i", url, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", "-f", "mp3", "pipe:1"], 120_000);
    if (!r.ok || !r.uit.length) return "";
    try {
      return regelsUitWoorden((await transcribeWords(r.uit)).words);
    } catch (e) {
      // Zonder tekst kan de Regisseur nog steeds de beelden zien.
      console.error("[regisseur/video] uitschrijven mislukt:", e);
      return "";
    }
  })();

  const [b, t] = await Promise.all([beelden, tekst]);
  if (!b.length) throw new Error("Uit deze video konden we geen beelden halen.");
  return { duur: Math.round(kop.duur * 10) / 10, breedte: kop.breedte, hoogte: kop.hoogte, beelden: b, tekst: t };
}

export function formaatVan(breedte: number, hoogte: number): string {
  if (!breedte || !hoogte) return "16:9";
  const r = breedte / hoogte;
  return r > 1.25 ? "16:9" : r < 0.8 ? "9:16" : "1:1";
}
