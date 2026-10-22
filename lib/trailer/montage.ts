// De montage van een trailer met ffmpeg, volgens de tijdlijn uit het plan.
//
// Beeld: per element een stukje (een shot geknipt uit een clip, zwart, een tekstkaart of
// de titel), filmische balken en een koele kleur met warme accenten (regelboek §4).
// Geluid: de stemmen achter elkaar op hun plek (een zin loopt door over de volgende
// shots, §3), muziek die zacht begint, onder de stemmen zakt en bij de "adem" helemaal
// wegvalt, zodat de klap erna binnenkomt (§1.4). Alleen op de server.

import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderMusicBed } from "@/lib/music/bed";
import { CLIP_SEC, type Element } from "./types";
import { beginRuimte } from "./plan";

const run = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;
const LETTER = path.join(process.cwd(), "lib/export/Arvo-Bold.ttf");
const W = 1280;
const H = 720;
const BALK = 88; // ≈ 2,39:1 binnen 16:9
const FPS = 24;
const KLEUR = "eq=contrast=1.08:saturation=0.85,colorbalance=rs=-0.04:gs=-0.01:bs=0.05:rh=0.05:gh=0.01:bh=-0.04";

export interface Plaatsing {
  index: number;
  start: number;
  duur: number;
}

/** Begintijd van elk element op de tijdlijn. */
export function begintijden(t: Element[]): number[] {
  const uit: number[] = [];
  let s = 0;
  for (const e of t) {
    uit.push(s);
    s += e.duur;
  }
  return uit;
}

/**
 * Waar elke zin komt: bij zijn element, maar nooit over de vorige zin heen. Loopt het
 * uit, dan schuift de volgende op; zo blijft elke zin verstaanbaar.
 */
export function plaatsStemmen(t: Element[], duren: Map<number, number>): Plaatsing[] {
  const starts = begintijden(t);
  const uit: Plaatsing[] = [];
  let vrij = 0;
  t.forEach((e, i) => {
    const d = duren.get(i);
    if (!e.regel || d === undefined) return;
    const start = Math.max(starts[i] + 0.15, vrij);
    uit.push({ index: i, start, duur: d });
    vrij = start + d + 0.2;
  });
  return uit;
}

/** Het muziekniveau op tijdstip x: stil bij de adem, zacht onder de stem, opbouw in de opening. */
export function muziekNiveau(t: Element[], stemmen: Plaatsing[], x: number): number {
  const starts = begintijden(t);
  // De openingsstilte is "bijna stil" (GoT S7: -40 dB), niet digitaal stil: 4,5 s niets
  // klonk in de proef alsof de video kapot was.
  if (t[0]?.soort === "zwart" && t[0].stil && x < t[0].duur) return 0.06;
  if (t.some((e, i) => i > 0 && e.soort === "zwart" && e.stil && x >= starts[i] && x < starts[i] + e.duur)) return 0;
  if (stemmen.some((s) => x >= s.start - 0.1 && x < s.start + s.duur + 0.1)) return 0.35;
  const eindOpening = t.reduce((m, e, i) => (e.deel === "opening" ? starts[i] + e.duur : m), 0);
  return x < eindOpening ? 0.45 : 0.9;
}

/**
 * Sleutelmomenten voor het muziekvolume, met glijdende overgangen. In de proef sprong het
 * volume in één frame van 0,9 naar 0,35 zodra de stem begon: dat klonk houterig. Nu zakt de
 * muziek vlak vóór een zin weg en komt hij er rustig weer onder vandaan. Alleen de klap na
 * de adem komt meteen terug: dat hoort hard te zijn.
 */
export function muziekSleutels(t: Element[], stemmen: Plaatsing[]): [number, number][] {
  const starts = begintijden(t);
  const eind = starts.length ? starts[starts.length - 1] + t[t.length - 1].duur : 0;
  const punten = new Set<number>();
  t.forEach((e, i) => {
    if (e.soort === "zwart" && e.stil) [starts[i], starts[i] + e.duur].forEach((p) => punten.add(p));
    if (e.deel === "opening") punten.add(starts[i] + e.duur);
  });
  stemmen.forEach((s) => [s.start - 0.1, s.start + s.duur + 0.1].forEach((p) => punten.add(p)));
  const sleutels: [number, number][] = [[0, muziekNiveau(t, stemmen, 0)]];
  for (const p of [...punten].filter((p) => p > 0 && p < eind).sort((a, b) => a - b)) {
    const voor = muziekNiveau(t, stemmen, p - 0.001);
    const na = muziekNiveau(t, stemmen, p + 0.001);
    if (Math.abs(voor - na) < 0.001) continue;
    const r = na < voor ? (na === 0 ? 0.2 : 0.3) : voor === 0 ? 0.05 : voor === 0.35 ? 0.8 : 0.6;
    const [a, b] = na < voor ? [p - r, p] : [p, p + r];
    const laatste = sleutels[sleutels.length - 1];
    if (a > laatste[0]) sleutels.push([a, voor]);
    else laatste[1] = voor;
    sleutels.push([Math.max(b, sleutels[sleutels.length - 1][0] + 0.01), na]);
  }
  return sleutels.map(([x, v]) => [Math.round(x * 100) / 100, v]);
}

/** Het muziekvolume als ffmpeg-uitdrukking: lineair tussen de sleutelmomenten. */
export function muziekVolume(t: Element[], stemmen: Plaatsing[]): string {
  const k = muziekSleutels(t, stemmen);
  let expr = k[k.length - 1][1].toFixed(3);
  for (let i = k.length - 2; i >= 0; i--) {
    const [x0, v0] = k[i];
    const [x1, v1] = k[i + 1];
    const lijn = v0 === v1 ? v0.toFixed(3) : `(${v0.toFixed(3)}+(${(v1 - v0).toFixed(3)})*(t-${x0.toFixed(2)})/${Math.max(0.01, x1 - x0).toFixed(2)})`;
    expr = `if(lt(t,${x1.toFixed(2)}),${lijn},${expr})`;
  }
  return expr;
}

/**
 * Waar de opname van de verteller te knippen is: n zinnen, gescheiden door de n-1 langste
 * pauzes (we zetten tussen elke zin een lange pauze). Een zin begint net vóór zijn eerste
 * klank en houdt 0,25 s na zijn laatste op, zodat geen enkele zin wordt afgeknipt.
 * Null als er minder pauzes zijn dan nodig.
 */
export function zinsgrenzen(stil: [number, number][], totaal: number, n: number): { start: number; eind: number }[] | null {
  if (n < 1) return [];
  const begin = stil[0] && stil[0][0] <= 0.05 ? stil[0][1] : 0;
  const laatste = stil[stil.length - 1];
  const einde = laatste && laatste[1] >= totaal - 0.05 ? laatste[0] : totaal;
  const binnen = stil.filter(([a, b]) => a > begin + 0.05 && b < einde - 0.05 && a >= begin && b <= einde);
  if (binnen.length < n - 1) return null;
  const pauzes = [...binnen].sort((x, y) => y[1] - y[0] - (x[1] - x[0])).slice(0, n - 1).sort((x, y) => x[0] - y[0]);
  return Array.from({ length: n }, (_, k) => {
    const start = k === 0 ? begin : pauzes[k - 1][1];
    const eind = k === n - 1 ? einde : pauzes[k][0];
    const ruimte = k === n - 1 ? totaal - eind : (pauzes[k][1] - pauzes[k][0]) / 2;
    return { start: Math.max(0, start - 0.08), eind: Math.min(totaal, eind + Math.min(0.25, ruimte)) };
  });
}

/**
 * Het beeld volgt de stem: na elke zin loopt het beeld minstens zo lang door als de zin
 * duurt (plus een ademhaling), vóór de volgende zin, de adem of de titel komt. Is dat
 * korter, dan worden de shots daar langer (tot de lengte van hun clip). In de proef
 * kregen zinnen te weinig ruimte en schoven ze over elkaar en over de stiltes heen.
 */
export function volgDeStem(t: Element[], duren: Map<number, number>, adem = 0.5): Element[] {
  const uit = t.map((e) => ({ ...e }));
  const zinnen = uit.map((e, i) => i).filter((i) => duren.has(i));
  zinnen.forEach((i, k) => {
    const volgende = zinnen[k + 1] ?? uit.length;
    let eind = i + 1;
    while (eind < volgende && !(uit[eind].soort === "titel" || (uit[eind].soort === "zwart" && (uit[eind] as { stil?: boolean }).stil))) eind++;
    const stuk = uit.slice(i, eind);
    let tekort = duren.get(i)! + adem - stuk.reduce((s, e) => s + e.duur, 0);
    if (tekort <= 0) return;
    const shots = stuk.map((e, j) => [e, i + j] as const).filter(([e]) => e.soort === "shot");
    const ruimte = shots.reduce((s, [e]) => s + Math.max(0, CLIP_SEC - e.duur), 0);
    if (ruimte <= 0) return;
    const deel = Math.min(1, tekort / ruimte);
    for (const [e, j] of shots) {
      if (e.soort !== "shot") continue;
      const duur = Math.round((e.duur + Math.max(0, CLIP_SEC - e.duur) * deel) * 100) / 100;
      const [vroegst, laatst] = beginRuimte(duur);
      uit[j] = { ...e, duur, van: Math.min(laatst, Math.max(vroegst, e.van)) };
    }
    tekort -= ruimte * deel;
  });
  return uit;
}

/**
 * Beweegt er iets in de clip? Gemiddeld verschil tussen opeenvolgende frames, laag
 * opgelost. Gemeten op de proefclips: een stilstaande ijsvlakte ~0, een lopende koning ~2.
 */
async function isStilstaand(bestand: string): Promise<boolean> {
  try {
    const { stderr } = await run(
      FFMPEG,
      ["-hide_banner", "-i", bestand, "-vf", "scale=160:-2,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"],
      { maxBuffer: 1 << 25 },
    );
    const w = [...stderr.matchAll(/YAVG=([\d.]+)/g)].map((m) => parseFloat(m[1]));
    return w.length > 0 && w.reduce((a, b) => a + b, 0) / w.length < 0.4;
  } catch {
    return false;
  }
}

async function stiltes(bestand: string): Promise<[number, number][]> {
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", bestand, "-af", "silencedetect=n=-40dB:d=0.25", "-f", "null", "-"], { maxBuffer: 1 << 24 });
  const uit: [number, number][] = [];
  let open: number | null = null;
  for (const regel of stderr.split("\n")) {
    const a = regel.match(/silence_start: ([\d.]+)/);
    const b = regel.match(/silence_end: ([\d.]+)/);
    if (a) open = parseFloat(a[1]);
    if (b && open !== null) {
      uit.push([open, parseFloat(b[1])]);
      open = null;
    }
  }
  if (open !== null) uit.push([open, Infinity]);
  return uit;
}

async function duur(bestand: string): Promise<number> {
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", bestand], { maxBuffer: 1 << 22 }).catch(
    (e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }),
  );
  const m = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!m) throw new Error("Kon de lengte van een stem niet lezen.");
  return +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
}

async function download(url: string, doel: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download mislukt (HTTP ${res.status})`);
  await writeFile(doel, Buffer.from(await res.arrayBuffer()));
  return doel;
}

export async function monteerTrailer(m: {
  tijdlijn: Element[];
  titel: string;
  clips: string[];
  /** Per element-index met een zin: de stem (oude trailers). */
  stemmen: Map<number, string>;
  /** De hele voice-over in één opname (trailers met één verteller). */
  voiceOver?: string;
  muziek: string | null;
}): Promise<Buffer> {
  const map = await mkdtemp(path.join(tmpdir(), "trailer-"));
  try {
    const clips = await Promise.all(m.clips.map((u, i) => download(u, path.join(map, `clip${i}.mp4`))));
    const stemBestanden = new Map<number, string>();
    await Promise.all(
      [...m.stemmen].map(async ([i, u]) => stemBestanden.set(i, await download(u, path.join(map, `stem${i}.mp3`)))),
    );
    const duren = new Map<number, number>();
    for (const [i, f] of stemBestanden) duren.set(i, await duur(f));
    let tijdlijn = m.tijdlijn;
    if (m.voiceOver) {
      // Eén opname van de verteller, op de pauzes geknipt in zinnen, elk op zijn eigen plek.
      const vo = await download(m.voiceOver, path.join(map, "vo.mp3"));
      const lengte = await duur(vo);
      const stil = (await stiltes(vo)).map(([a, b]) => [a, Math.min(b, lengte)] as [number, number]);
      const plekken = tijdlijn.map((e, i) => i).filter((i) => tijdlijn[i].regel?.tekst);
      const grenzen = zinsgrenzen(stil, lengte, plekken.length) ?? (plekken.length ? [{ start: 0, eind: lengte }] : []);
      for (const [k, g] of grenzen.entries()) {
        const doel = path.join(map, `zin${k}.wav`);
        const d = g.eind - g.start;
        await run(FFMPEG, ["-hide_banner", "-ss", g.start.toFixed(3), "-t", d.toFixed(3), "-i", vo, "-af", `afade=t=in:d=0.04,afade=t=out:st=${Math.max(0, d - 0.15).toFixed(3)}:d=0.15`, "-y", doel]);
        stemBestanden.set(plekken[k], doel);
        duren.set(plekken[k], d);
      }
      tijdlijn = volgDeStem(tijdlijn, duren);
    }
    const plaatsing = plaatsStemmen(tijdlijn, duren);
    const tijdlijnEind = tijdlijn.reduce((s, e) => s + e.duur, 0);
    const laatsteStem = plaatsing.reduce((x, p) => Math.max(x, p.start + p.duur + 0.6), 0);
    const totaal = Math.max(tijdlijnEind, laatsteStem);

    const stilstaand = await Promise.all(clips.map(isStilstaand));
    const inputs: string[] = [];
    const filters: string[] = [];
    const segmenten: string[] = [];
    let n = 0;
    const invoer = (bestand: string) => {
      inputs.push("-i", bestand);
      return n++;
    };
    /**
     * Herhaalde shots anders uitsnijden: ingezoomd en afwisselend links/rechts. In de proef
     * waren de laatste 20 s vooral letterlijke herhalingen van eerdere shots.
     */
    const uitsnede = (herhaling: number) => {
      if (!herhaling) return `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
      const zoom = 1.25 + 0.1 * Math.min(2, herhaling - 1);
      const x = herhaling % 2 ? 0.15 : 0.85;
      return `scale=${Math.round(W * zoom)}:${Math.round(H * zoom)}:force_original_aspect_ratio=increase,crop=${W}:${H}:(iw-${W})*${x}:(ih-${H})*0.4`;
    };
    /**
     * Overgangen van en naar zwart lopen via een korte fade, niet met een harde knip: zo'n
     * zwart dipje klonk in de proef als een hapering. De opening fadet langzamer (§1).
     */
    const opkomen = (i: number) => {
      const e = tijdlijn[i];
      const leeg = (x?: Element) => !!x && x.soort !== "shot";
      const lang = e.deel === "opening" && e.duur >= 2 ? 0.5 : Math.min(0.3, e.duur / 3);
      const f: string[] = [];
      if (leeg(tijdlijn[i - 1]) || i === 0) f.push(`fade=t=in:st=0:d=${lang.toFixed(2)}`);
      if (leeg(tijdlijn[i + 1]) || i === tijdlijn.length - 1) f.push(`fade=t=out:st=${(e.duur - lang).toFixed(3)}:d=${lang.toFixed(2)}`);
      return f.length ? `${f.join(",")},` : "";
    };
    /**
     * Een clip waarin bijna niets beweegt (de ijsvlakte in de proef) krijgt een langzame
     * camerabeweging, anders staat het beeld stil tussen bewegende shots.
     */
    const drift = (i: number, e: Extract<Element, { soort: "shot" }>) =>
      `scale=${Math.round(W * 1.12)}:${Math.round(H * 1.12)}:force_original_aspect_ratio=increase,crop=${W}:${H}:x='(iw-${W})*(${i % 2 ? "0.85-0.7" : "0.15+0.7"}*t/${e.duur.toFixed(2)})':y=(ih-${H})/2`;
    const tekstFilter = async (t: string, maxGrootte: number, d: number) => {
      const f = path.join(map, `t${segmenten.length}.txt`);
      // Een lange titel ("Het Fluisteren van de Draken") liep in de proef buiten beeld.
      const grootte = Math.min(maxGrootte, Math.floor((W * 0.86) / (t.length * 0.66)));
      await writeFile(f, t.toUpperCase());
      const fade = `alpha='if(lt(t,0.4),t/0.4,if(gt(t,${(d - 0.4).toFixed(2)}),max(0,(${d.toFixed(2)}-t)/0.4),1))'`;
      return `drawtext=fontfile='${LETTER}':textfile='${f}':expansion=none:fontsize=${grootte}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:${fade}`;
    };

    for (const [i, e] of tijdlijn.entries()) {
      const label = `s${i}`;
      const d = e.duur.toFixed(3);
      if (e.soort === "shot") {
        const k = invoer(clips[e.clip]);
        filters.push(
          `[${k}:v]trim=start=${Math.max(0, e.van).toFixed(3)}:duration=${d},setpts=PTS-STARTPTS,` +
            `${!e.herhaling && stilstaand[e.clip] ? drift(i, e) : uitsnede(e.herhaling ?? 0)},fps=${FPS},${KLEUR},${opkomen(i)}` +
            `drawbox=x=0:y=0:w=iw:h=${BALK}:color=black:t=fill,drawbox=x=0:y=ih-${BALK}:w=iw:h=${BALK}:color=black:t=fill,` +
            `tpad=stop_mode=clone:stop_duration=1,trim=duration=${d},setsar=1,format=yuv420p[${label}]`,
        );
      } else {
        const tekst =
          e.soort === "tekst" ? `,${await tekstFilter(e.tekst, 62, e.duur)}` : e.soort === "titel" ? `,${await tekstFilter(m.titel, 84, e.duur)}` : "";
        filters.push(`color=c=black:s=${W}x${H}:r=${FPS}:d=${d}${tekst},setsar=1,format=yuv420p[${label}]`);
      }
      segmenten.push(`[${label}]`);
    }
    filters.push(`${segmenten.join("")}concat=n=${segmenten.length}:v=1:a=0,tpad=stop_mode=add:stop_duration=${(totaal - tijdlijnEind + 0.1).toFixed(2)}:color=black[v]`);

    // Geluid: stemmen op hun plek, muziek eronder met het volumeverloop.
    const audio: string[] = [];
    for (const p of plaatsing) {
      const k = invoer(stemBestanden.get(p.index)!);
      const ms = Math.round(p.start * 1000);
      // Een trailerstem is vol en dichtbij: wat compressie en een beetje laag erbij.
      filters.push(`[${k}:a]aformat=channel_layouts=stereo,aresample=44100,acompressor=threshold=-20dB:ratio=3:attack=5:release=150,equalizer=f=110:t=q:w=1:g=2,adelay=${ms}|${ms}[st${p.index}]`);
      audio.push(`[st${p.index}]`);
    }
    if (m.muziek) {
      try {
        const bron = await download(m.muziek, path.join(map, "muziek.mp3"));
        const bed = await renderMusicBed(bron, totaal, path.join(map, "bed.wav"));
        const k = invoer(bed);
        filters.push(`[${k}:a]volume='${muziekVolume(tijdlijn, plaatsing)}':eval=frame[mu]`);
        audio.push("[mu]");
      } catch (e) {
        console.error("[trailer] muziek mislukt, verder zonder:", e);
      }
    }
    if (audio.length) {
      filters.push(`${audio.join("")}amix=inputs=${audio.length}:duration=longest:normalize=0,apad[a]`);
    } else {
      filters.push(`anullsrc=r=44100:cl=stereo[a]`);
    }

    const uit = path.join(map, "trailer.mp4");
    await run(
      FFMPEG,
      [
        "-hide_banner",
        ...inputs,
        "-filter_complex", filters.join(";"),
        "-map", "[v]", "-map", "[a]",
        "-t", totaal.toFixed(2),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        "-y", uit,
      ],
      { maxBuffer: 1 << 25 },
    );
    return await readFile(uit);
  } finally {
    await rm(map, { recursive: true, force: true }).catch(() => {});
  }
}
