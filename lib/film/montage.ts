// De montage van een filmscène en van de hele film, met ffmpeg. Alleen op de server.
//
// Een scène: shots achter elkaar. Een dialoogshot (lipsync) houdt zijn eigen geluid en duurt
// zo lang als de zin; een stil shot is een stuk uit een clip van 5 s, vanaf het moment dat
// er beweging is. De verteller komt uit één opname die op de pauzes geknipt wordt (net als
// bij de trailer: losse korte zinnen knipte ElevenLabs zelf af). Muziek eronder, die zachter
// gaat onder spraak en er glijdend weer onder vandaan komt.
//
// De film: alle goedgekeurde scènes met dezelfde instellingen gecodeerd, zodat ze zonder
// opnieuw coderen aan elkaar kunnen (een film van 10 minuten opnieuw coderen past niet in
// de tijd van een serverfunctie).

import { tekstPng } from "@/lib/export/tekst-png";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderMusicBed } from "@/lib/music/bed";
import { zinsgrenzen } from "@/lib/trailer/montage";
import { EERSTE_BEWEGING } from "@/lib/trailer/plan";
import { FILM_CLIP_SEC } from "./types";

const run = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;
const FPS = 24;
const KLEUR = "eq=contrast=1.05:saturation=0.92";
/** Dezelfde uitvoer voor elke scène en kaart: dan kan de film zonder hercoderen aan elkaar. */
const UITVOER = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2"];

export interface SceneShot {
  url: string;
  /** Lipsync-clip: eigen geluid, volledige lengte. */
  praat: boolean;
  /** Gewenste lengte van een stil shot. */
  duur: number;
  /** Zin van de verteller die op dit shot begint. */
  verteller?: boolean;
}

export function maat(formaat: string): [number, number] {
  return formaat === "9:16" ? [720, 1280] : [1280, 720];
}

async function duur(bestand: string): Promise<number> {
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", bestand], { maxBuffer: 1 << 22 }).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
  const m = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!m) throw new Error("Kon de lengte van een bestand niet lezen.");
  return +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
}

async function download(url: string, doel: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download mislukt (HTTP ${res.status})`);
  await writeFile(doel, Buffer.from(await res.arrayBuffer()));
  return doel;
}

async function stiltes(bestand: string): Promise<[number, number][]> {
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", bestand, "-af", "silencedetect=n=-40dB:d=0.25", "-f", "null", "-"], { maxBuffer: 1 << 24 });
  const uit: [number, number][] = [];
  let open: number | null = null;
  for (const r of stderr.split("\n")) {
    const a = r.match(/silence_start: ([\d.]+)/);
    const b = r.match(/silence_end: ([\d.]+)/);
    if (a) open = parseFloat(a[1]);
    if (b && open !== null) {
      uit.push([open, parseFloat(b[1])]);
      open = null;
    }
  }
  if (open !== null) uit.push([open, Infinity]);
  return uit;
}

/**
 * Een dialoogzin zonder de stilte ervoor en erna (ElevenLabs zet er soms een halve seconde
 * omheen; de lipsync zou dan met een stille mond beginnen). Klein randje lucht blijft staan.
 */
export async function knipStilteWeg(bron: Buffer): Promise<Buffer> {
  const map = await mkdtemp(path.join(tmpdir(), "zin-"));
  try {
    const inn = path.join(map, "in.mp3");
    const uit = path.join(map, "uit.mp3");
    await writeFile(inn, bron);
    const weg = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1";
    await run(FFMPEG, ["-hide_banner", "-i", inn, "-af", `${weg},areverse,${weg},areverse,apad=pad_dur=0.25`, "-c:a", "libmp3lame", "-b:a", "192k", "-y", uit]);
    return await readFile(uit);
  } finally {
    await rm(map, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * De lengte per shot, zodat elke verteller-zin past: na een zin loopt het beeld minstens
 * zo lang door als de zin (plus een ademhaling), tot het volgende praatshot of de volgende
 * zin. Stille shots rekken daarvoor op tot hun clip vol is.
 */
export function shotDuren(shots: { praat: boolean; duur: number; verteller?: boolean }[], zinnen: number[], adem = 0.4): number[] {
  const d = shots.map((s) => s.duur);
  let z = 0;
  shots.forEach((s, i) => {
    if (!s.verteller) return;
    const zin = zinnen[z++];
    if (zin === undefined) return;
    let eind = i + 1;
    while (eind < shots.length && !shots[eind].verteller && !shots[eind].praat) eind++;
    const stuk = d.slice(i, eind).reduce((a, b) => a + b, 0);
    let tekort = zin + adem - stuk;
    for (let j = i; j < eind && tekort > 0; j++) {
      if (shots[j].praat) continue;
      const ruimte = FILM_CLIP_SEC - EERSTE_BEWEGING - d[j];
      const erbij = Math.max(0, Math.min(ruimte, tekort));
      d[j] += erbij;
      tekort -= erbij;
    }
  });
  return d.map((x) => Math.round(x * 100) / 100);
}

/** Muziekvolume: vol, zachter onder spraak, glijdend (0,3 s omlaag, 0,8 s omhoog). */
export function muziekUitdrukking(spraak: [number, number][], vol = 0.55, laag = 0.18): string {
  const s = [...spraak].sort((a, b) => a[0] - b[0]);
  const samen: [number, number][] = [];
  for (const [a, b] of s) {
    const l = samen[samen.length - 1];
    if (l && a - l[1] < 1.2) l[1] = Math.max(l[1], b);
    else samen.push([a, b]);
  }
  if (!samen.length) return vol.toFixed(2);
  const k: [number, number][] = [[0, vol]];
  for (const [a, b] of samen) {
    k.push([Math.max(k[k.length - 1][0] + 0.01, a - 0.3), vol], [Math.max(a, k[k.length - 1][0] + 0.02), laag], [b, laag], [b + 0.8, vol]);
  }
  let expr = vol.toFixed(2);
  for (let i = k.length - 2; i >= 0; i--) {
    const [x0, v0] = k[i];
    const [x1, v1] = k[i + 1];
    const lijn = v0 === v1 ? v0.toFixed(2) : `(${v0.toFixed(2)}+(${(v1 - v0).toFixed(2)})*(t-${x0.toFixed(2)})/${Math.max(0.01, x1 - x0).toFixed(2)})`;
    expr = `if(lt(t,${x1.toFixed(2)}),${lijn},${expr})`;
  }
  return expr;
}

export async function monteerScene(m: { shots: SceneShot[]; verteller?: string; muziek: string | null; formaat: string }): Promise<Buffer> {
  const [W, H] = maat(m.formaat);
  const map = await mkdtemp(path.join(tmpdir(), "scene-"));
  try {
    const clips = await Promise.all(m.shots.map((s, i) => download(s.url, path.join(map, `c${i}.mp4`))));
    const clipDuren = await Promise.all(clips.map(duur));
    const basis = m.shots.map((s, i) => ({ ...s, duur: s.praat ? clipDuren[i] : Math.min(s.duur, Math.max(0.5, clipDuren[i] - EERSTE_BEWEGING)) }));

    // De verteller: één opname, geknipt op de pauzes.
    const zinBestanden: string[] = [];
    const zinDuren: number[] = [];
    if (m.verteller) {
      const vo = await download(m.verteller, path.join(map, "vo.mp3"));
      const lengte = await duur(vo);
      const n = basis.filter((s) => s.verteller).length;
      const grenzen = zinsgrenzen((await stiltes(vo)).map(([a, b]) => [a, Math.min(b, lengte)] as [number, number]), lengte, n) ?? (n ? [{ start: 0, eind: lengte }] : []);
      for (const [k, g] of grenzen.entries()) {
        const doel = path.join(map, `zin${k}.wav`);
        const d = g.eind - g.start;
        await run(FFMPEG, ["-hide_banner", "-ss", g.start.toFixed(3), "-t", d.toFixed(3), "-i", vo, "-af", `afade=t=in:d=0.04,afade=t=out:st=${Math.max(0, d - 0.15).toFixed(3)}:d=0.15`, "-y", doel]);
        zinBestanden.push(doel);
        zinDuren.push(d);
      }
    }
    const duren = shotDuren(basis, zinDuren);
    const starts = duren.reduce<number[]>((a, d, i) => [...a, i ? a[i - 1] + duren[i - 1] : 0], []);
    const totaal = duren.reduce((a, b) => a + b, 0);

    const inputs: string[] = [];
    const filters: string[] = [];
    const v: string[] = [];
    const audio: string[] = [];
    const spraak: [number, number][] = [];
    let n = 0;
    const invoer = (f: string) => (inputs.push("-i", f), n++);

    basis.forEach((s, i) => {
      const k = invoer(clips[i]);
      const van = s.praat ? 0 : Math.min(EERSTE_BEWEGING, Math.max(0, clipDuren[i] - duren[i]));
      const d = duren[i].toFixed(3);
      const fades = [i === 0 ? "fade=t=in:st=0:d=0.4" : "", i === basis.length - 1 ? `fade=t=out:st=${(duren[i] - 0.4).toFixed(3)}:d=0.4` : ""].filter(Boolean).join(",");
      filters.push(
        `[${k}:v]trim=start=${van.toFixed(3)}:duration=${d},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},${KLEUR},` +
          `tpad=stop_mode=clone:stop_duration=2,trim=duration=${d}${fades ? `,${fades}` : ""},setsar=1,format=yuv420p[v${i}]`,
      );
      v.push(`[v${i}]`);
      if (s.praat) {
        const ms = Math.round(starts[i] * 1000);
        filters.push(`[${k}:a]atrim=0:${d},asetpts=PTS-STARTPTS,aformat=channel_layouts=stereo,aresample=44100,adelay=${ms}|${ms}[p${i}]`);
        audio.push(`[p${i}]`);
        spraak.push([starts[i], starts[i] + duren[i]]);
      }
    });
    filters.push(`${v.join("")}concat=n=${v.length}:v=1:a=0[v]`);

    // Vertellerzinnen op hun shot, nooit over elkaar heen.
    let z = 0;
    let vrij = 0;
    basis.forEach((s, i) => {
      if (!s.verteller || !zinBestanden[z]) return;
      const start = Math.max(starts[i] + 0.15, vrij);
      const k = invoer(zinBestanden[z]);
      const ms = Math.round(start * 1000);
      filters.push(`[${k}:a]aformat=channel_layouts=stereo,aresample=44100,acompressor=threshold=-20dB:ratio=3:attack=5:release=150,adelay=${ms}|${ms}[z${z}]`);
      audio.push(`[z${z}]`);
      spraak.push([start, start + zinDuren[z]]);
      vrij = start + zinDuren[z] + 0.2;
      z++;
    });

    if (m.muziek) {
      try {
        const bron = await download(m.muziek, path.join(map, "muziek.mp3"));
        const bed = await renderMusicBed(bron, totaal, path.join(map, "bed.wav"));
        const k = invoer(bed);
        filters.push(`[${k}:a]volume='${muziekUitdrukking(spraak)}':eval=frame[mu]`);
        audio.push("[mu]");
      } catch (e) {
        console.error("[film] muziek mislukt, verder zonder:", e);
      }
    }
    filters.push(audio.length ? `${audio.join("")}amix=inputs=${audio.length}:duration=longest:normalize=0,apad[a]` : `anullsrc=r=44100:cl=stereo[a]`);

    const uit = path.join(map, "scene.mp4");
    await run(FFMPEG, ["-hide_banner", ...inputs, "-filter_complex", filters.join(";"), "-map", "[v]", "-map", "[a]", "-t", totaal.toFixed(2), ...UITVOER, "-movflags", "+faststart", "-y", uit], { maxBuffer: 1 << 25 });
    return await readFile(uit);
  } finally {
    await rm(map, { recursive: true, force: true }).catch(() => {});
  }
}

/** Een tekstkaart (titel, einde) met dezelfde uitvoer als de scènes. */
async function kaart(map: string, naam: string, tekst: string, sec: number, formaat: string): Promise<string> {
  const [W, H] = maat(formaat);
  // Een plaatje op zwart in plaats van drawtext (die bestaat niet in de ffmpeg op de server,
  // zie lib/export/tekst-png.ts); een fade naar zwart is dan een fade van de letters.
  const png = path.join(map, `${naam}.png`);
  const grootte = Math.min(84, Math.floor((W * 0.86) / (tekst.length * 0.66)));
  await writeFile(png, tekstPng({ regels: [tekst.toUpperCase()], breedte: W, hoogte: H, grootte, lettertype: "Arvo", achtergrond: "black" }));
  const uit = path.join(map, `${naam}.mp4`);
  await run(FFMPEG, [
    "-hide_banner",
    "-loop", "1", "-framerate", String(FPS), "-t", String(sec), "-i", png,
    "-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo`,
    "-vf", `fade=t=in:st=0:d=0.6,fade=t=out:st=${(sec - 0.6).toFixed(2)}:d=0.6,format=yuv420p`,
    "-t", String(sec), ...UITVOER, "-y", uit,
  ]);
  return uit;
}

/** De hele film: titel, alle goedgekeurde scènes, einde. Aan elkaar zonder hercoderen. */
export async function monteerFilm(m: { scenes: string[]; titel: string; formaat: string }): Promise<Buffer> {
  const map = await mkdtemp(path.join(tmpdir(), "film-"));
  try {
    const delen = [
      await kaart(map, "titel", m.titel, 3.5, m.formaat),
      ...(await Promise.all(m.scenes.map((u, i) => download(u, path.join(map, `scene${i}.mp4`))))),
      await kaart(map, "einde", "Einde", 3, m.formaat),
    ];
    const lijst = path.join(map, "lijst.txt");
    await writeFile(lijst, delen.map((d) => `file '${d.replace(/'/g, "'\\''")}'`).join("\n"));
    const uit = path.join(map, "film.mp4");
    await run(FFMPEG, ["-hide_banner", "-f", "concat", "-safe", "0", "-i", lijst, "-c", "copy", "-movflags", "+faststart", "-y", uit], { maxBuffer: 1 << 25 });
    return await readFile(uit);
  } finally {
    await rm(map, { recursive: true, force: true }).catch(() => {});
  }
}
