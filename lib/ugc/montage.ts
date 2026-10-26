// Montage van een UGC-video: de stukjes achter elkaar (praatclip of B-roll, elk zo lang
// als de stem), met meelopende ondertitels zoals op TikTok: twee à drie woorden tegelijk,
// groot, wit met een zwarte rand, precies op het moment dat ze gezegd worden. De
// woordtijden komen uit Whisper (lib/openai.ts). Alleen op de server.

import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { transcribeWords } from "@/lib/openai";

const run = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;
const LETTER = path.join(process.cwd(), "lib/export/Poppins-Bold.ttf");
const W = 720;
const H = 1280;
// Zelfde les als de Regisseur-montage (26-10-2026): met ffmpegs standaard opent elke clip
// een decoder-thread per kern en liep de montage op de server onderuit. Twee is genoeg.
const DECODER = ["-threads", "2"];

export interface Woord {
  word: string;
  start: number;
  end: number;
}

export interface Blok {
  tekst: string;
  van: number;
  tot: number;
}

/**
 * Woorden → ondertitelblokjes. Hooguit `max` woorden of ~16 tekens per blok, en een
 * nieuw blok na een leesteken: zo valt een zin nooit midden in een blokje door.
 */
export function ondertitelBlokken(woorden: Woord[], max = 3): Blok[] {
  const uit: Blok[] = [];
  let huidig: Woord[] = [];
  const sluit = () => {
    if (!huidig.length) return;
    uit.push({ tekst: huidig.map((w) => w.word.trim()).join(" "), van: huidig[0].start, tot: huidig[huidig.length - 1].end });
    huidig = [];
  };
  for (const w of woorden) {
    const tekst = huidig.map((x) => x.word.trim()).join(" ");
    if (huidig.length >= max || (huidig.length && tekst.length + w.word.length > 16)) sluit();
    huidig.push(w);
    if (/[.,!?;:]$/.test(w.word.trim())) sluit();
  }
  sluit();
  // Geen gat tussen blokjes: het vorige blijft staan tot het volgende komt (rustiger).
  for (let i = 0; i < uit.length - 1; i++) {
    if (uit[i + 1].van - uit[i].tot < 0.4) uit[i].tot = uit[i + 1].van;
  }
  return uit;
}

/**
 * De woorden uit het script, met de tijden van Whisper. Whisper hoort merknamen en
 * websites verkeerd ("tonyschokolownly com"); wij weten precies wat er gezegd wordt.
 * Is het aantal woorden gelijk, dan één op één; anders naar evenredige plek in de zin.
 */
export function metScriptTekst(gehoord: Woord[], tekst: string): Woord[] {
  const woorden = tekst.split(/\s+/).filter(Boolean);
  if (!gehoord.length || !woorden.length) return gehoord;
  return woorden.map((word, i) => {
    const j = woorden.length === gehoord.length ? i : Math.round((i * (gehoord.length - 1)) / Math.max(1, woorden.length - 1));
    const k = woorden.length === gehoord.length ? i : Math.min(gehoord.length - 1, Math.round(((i + 1) * (gehoord.length - 1)) / Math.max(1, woorden.length - 1)));
    return { word, start: gehoord[j].start, end: Math.max(gehoord[k].end, gehoord[j].start + 0.05) };
  });
}

async function duur(bestand: string): Promise<number> {
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", bestand], { maxBuffer: 1 << 22 }).catch(
    (e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }),
  );
  const m = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!m) throw new Error("Kon de lengte van de stem niet lezen.");
  return +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
}

async function download(url: string, doel: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download mislukt (HTTP ${res.status})`);
  await writeFile(doel, Buffer.from(await res.arrayBuffer()));
  return doel;
}

export async function monteerUgc(m: { clips: string[]; audio: string[]; teksten: string[] }): Promise<Buffer> {
  const map = await mkdtemp(path.join(tmpdir(), "ugc-"));
  try {
    const clips = await Promise.all(m.clips.map((u, i) => download(u, path.join(map, `clip${i}.mp4`))));
    const stemmen = await Promise.all(m.audio.map((u, i) => download(u, path.join(map, `stem${i}.mp3`))));
    const duren = await Promise.all(stemmen.map(duur));

    // Ondertitels: per stukje transcriberen en op de tijdlijn van de hele video zetten.
    // Lukt Whisper niet, dan valt het stukje terug op de geschreven tekst over de hele duur.
    const blokken: Blok[] = [];
    let begin = 0;
    for (let i = 0; i < stemmen.length; i++) {
      let woorden: Woord[] = [];
      try {
        woorden = (await transcribeWords(await readFile(stemmen[i]), { language: "nl" })).words;
      } catch (e) {
        console.error("[ugc] woordtijden mislukt, verder met de tekst:", e instanceof Error ? e.message : e);
      }
      const stuk = woorden.length
        ? ondertitelBlokken(metScriptTekst(woorden, m.teksten[i]))
        : [{ tekst: m.teksten[i], van: 0, tot: duren[i] }];
      for (const b of stuk) blokken.push({ tekst: b.tekst, van: begin + b.van, tot: begin + Math.min(b.tot, duren[i]) });
      begin += duren[i];
    }
    const totaal = begin;

    const filters: string[] = [];
    clips.forEach((_, i) => {
      // Een B-roll-clip is 5 s; praat de stem langer, dan blijft het laatste beeld staan.
      filters.push(
        `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1,` +
          `tpad=stop_mode=clone:stop_duration=10,trim=0:${duren[i].toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
      );
      filters.push(`[${clips.length + i}:a]aformat=channel_layouts=stereo,aresample=44100,apad,atrim=0:${duren[i].toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
    });
    filters.push(`${clips.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${clips.length}:v=1:a=1[vc][a]`);

    const teksten: string[] = [];
    for (let i = 0; i < blokken.length; i++) {
      const f = path.join(map, `t${i}.txt`);
      // Elke regel als eigen bestand: geen gedoe met apostrofs ("'s ochtends") in het filter.
      await writeFile(f, blokken[i].tekst);
      // Een website of lang woord past anders niet in de breedte: dan kleinere letters.
      const grootte = Math.min(60, Math.floor((W * 0.9) / (blokken[i].tekst.length * 0.62)));
      teksten.push(
        `drawtext=fontfile='${LETTER}':textfile='${f}':expansion=none:fontsize=${grootte}:fontcolor=white:borderw=6:bordercolor=black@0.9:` +
          `x=(w-text_w)/2:y=h*0.7-text_h/2:enable='between(t,${blokken[i].van.toFixed(2)},${blokken[i].tot.toFixed(2)})'`,
      );
    }
    filters.push(teksten.length ? `[vc]${teksten.join(",")}[v]` : `[vc]null[v]`);

    const uit = path.join(map, "ugc.mp4");
    const args = [
      "-hide_banner", "-loglevel", "error",
      ...clips.flatMap((c) => [...DECODER, "-i", c]),
      ...stemmen.flatMap((s) => ["-i", s]),
      "-filter_complex_threads", "2",
      "-filter_complex", filters.join(";"),
      "-map", "[v]", "-map", "[a]",
      "-t", totaal.toFixed(2),
      "-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
      "-y", uit,
    ];
    // Eén keer opnieuw: een server die net even vol zit, laat ffmpeg soms halverwege stoppen.
    await run(FFMPEG, args, { maxBuffer: 1 << 24 }).catch(() => run(FFMPEG, args, { maxBuffer: 1 << 24 })).catch((e: { stderr?: string; signal?: string; message?: string }) => {
      const reden = e.signal ? `gestopt (${e.signal}), waarschijnlijk geheugen vol` : (e.stderr ?? "").trim().split("\n").slice(-3).join(" ") || e.message;
      throw new Error(`ffmpeg: ${reden}`);
    });
    return await readFile(uit);
  } finally {
    await rm(map, { recursive: true, force: true }).catch(() => {});
  }
}
