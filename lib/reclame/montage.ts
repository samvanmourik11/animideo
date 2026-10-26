// De montage van een reclame met ffmpeg: drie clips achter elkaar, op elk shot een
// tekstbalkje in de merkkleur, de laatste clip bevriest tot eindkaart (donkerder, met
// productnaam, de oproep in een knop in de merkkleur en de website), en daaronder Hugo
// met een muziekbed. Alleen op de server.
//
// Bewust zonder de editor-renderer (Chromium, ~1,5 s per seconde video): dit is een vaste
// opmaak, en ffmpeg doet 17 seconden in een paar seconden. Zo past de montage ruim binnen
// de tijd die een serverfunctie krijgt.

import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderMusicBed } from "@/lib/music/bed";
import { tekstPng } from "@/lib/export/tekst-png";
import type { ReclameFormaat } from "./types";

const run = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;

export const SHOT_DUUR = 5;
const MIN_EINDKAART = 2.5;
// Hugo begint niet op de eerste frame: een fractie stilte voelt als een echte reclame
// in plaats van een stem die er hard in valt.
const STEM_START = 0.3;

const MATEN: Record<ReclameFormaat, { w: number; h: number }> = {
  "9:16": { w: 720, h: 1280 },
  "1:1": { w: 720, h: 720 },
  "16:9": { w: 1280, h: 720 },
};


export interface MontageInvoer {
  formaat: ReclameFormaat;
  clips: string[];
  stem: string;
  muziek: string | null;
  teksten: string[];
  naam: string;
  eindtekst: string;
  website: string;
  kleur: string;
}

/** Knipt een tekst in regels van hooguit `max` tekens, op woordgrenzen. De tekstlaag breekt zelf niet af. */
export function regels(tekst: string, max: number): string[] {
  const uit: string[] = [];
  let regel = "";
  for (const woord of tekst.split(/\s+/).filter(Boolean)) {
    if (regel && (regel + " " + woord).length > max) {
      // "'s ochtends", "de koffie": een los kort woordje hoort bij het volgende woord.
      const los = regel.match(/^(.*\S)\s+(\S{1,2})$/);
      if (los) {
        uit.push(los[1]);
        regel = `${los[2]} ${woord}`;
      } else {
        uit.push(regel);
        regel = woord;
      }
    } else {
      regel = regel ? `${regel} ${woord}` : woord;
    }
  }
  if (regel) uit.push(regel);
  return uit.slice(0, 3);
}

/** Lichte merkkleur → donkere letters, anders lees je de tekst in de knop niet. */
export function letterKleurOp(hex: string): "white" | "black" {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? "black" : "white";
}

/** Eindkaart lang genoeg dat Hugo zijn zin kan afmaken. */
export function eindkaartDuur(stemDuur: number, aantalClips: number): number {
  const nodig = STEM_START + stemDuur + 0.6 - aantalClips * SHOT_DUUR;
  return Math.max(MIN_EINDKAART, Math.min(8, nodig));
}

async function duur(bestand: string): Promise<number> {
  // ffmpeg-static heeft geen ffprobe; de duur staat ook in wat ffmpeg -i meldt.
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", bestand], { maxBuffer: 1 << 22 }).catch(
    (e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }),
  );
  const m = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!m) throw new Error("Kon de lengte van de voice-over niet lezen.");
  return +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
}

async function download(url: string, doel: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download mislukt (HTTP ${res.status})`);
  await writeFile(doel, Buffer.from(await res.arrayBuffer()));
  return doel;
}

/** Monteert de reclame en geeft de mp4 terug. */
export async function monteer(m: MontageInvoer): Promise<Buffer> {
  const map = await mkdtemp(path.join(tmpdir(), "reclame-"));
  try {
    const clips = await Promise.all(m.clips.map((u, i) => download(u, path.join(map, `clip${i}.mp4`))));
    const stem = await download(m.stem, path.join(map, "stem.mp3"));
    const stemDuur = await duur(stem);
    const eind = eindkaartDuur(stemDuur, clips.length);
    const totaal = clips.length * SHOT_DUUR + eind;

    let muziek: string | null = null;
    if (m.muziek) {
      try {
        const bron = await download(m.muziek, path.join(map, "muziek.mp3"));
        muziek = await renderMusicBed(bron, totaal, path.join(map, "bed.wav"));
      } catch (e) {
        // Zonder muziek is de reclame nog steeds af; niet de hele montage laten mislukken.
        console.error("[reclame] muziekbed mislukt, verder zonder:", e);
      }
    }

    const { w, h } = MATEN[m.formaat];
    const kort = Math.min(w, h);
    const opKleur = letterKleurOp(m.kleur);

    // Tekst gaat als doorzichtige PNG over de clip (drawtext bestaat niet in de ffmpeg op de
    // server, zie lib/export/tekst-png.ts). Elke laag hoort bij één clip en faded in.
    const lagen: { png: string; clip: number; van: number; tot?: number }[] = [];
    async function blok(
      clip: number,
      t: string,
      o: { grootte: number; y: number; van: number; tot?: number; box?: string; kleur?: string },
    ): Promise<void> {
      const max = Math.max(10, Math.floor((w * 0.86) / (o.grootte * 0.58)));
      const png = path.join(map, `t${lagen.length}.png`);
      await writeFile(
        png,
        tekstPng({
          regels: regels(t, max),
          breedte: w,
          hoogte: h,
          grootte: o.grootte,
          kleur: o.kleur ?? "white",
          midden: o.y,
          regelafstand: Math.round(o.grootte * 1.45),
          ...(o.box ? { vlak: o.box } : { schaduw: true }),
        }),
      );
      lagen.push({ png, clip, van: o.van, tot: o.tot });
    }

    const tekstGrootte = Math.round(kort * 0.068);
    const laagIn = clips.length + 1 + (muziek ? 1 : 0);
    const filters: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const laatste = i === clips.length - 1;
      const stappen = [
        `scale=${w}:${h}:force_original_aspect_ratio=increase`,
        `crop=${w}:${h}`,
        "fps=30",
        "setsar=1",
        `trim=0:${SHOT_DUUR}`,
        "setpts=PTS-STARTPTS",
      ];
      // De laatste clip bevriest op zijn eindbeeld en wordt de eindkaart.
      if (laatste) stappen.push(`tpad=stop_mode=clone:stop_duration=${eind.toFixed(2)}`);
      if (m.teksten[i]) {
        await blok(i, m.teksten[i], {
          grootte: tekstGrootte,
          y: Math.round(h * 0.78),
          van: 0.4,
          tot: SHOT_DUUR - 0.25,
          box: `${m.kleur}@0.92`,
          kleur: opKleur,
        });
      }
      if (laatste) {
        const t0 = SHOT_DUUR;
        stappen.push(`drawbox=x=0:y=0:w=iw:h=ih:color=black@0.6:t=fill:enable='gte(t,${t0})'`);
        await blok(i, m.naam, { grootte: Math.round(kort * 0.085), y: Math.round(h * 0.4), van: t0 + 0.15 });
        if (m.eindtekst) {
          await blok(i, m.eindtekst, {
              grootte: Math.round(kort * 0.058),
              y: Math.round(h * 0.56),
              van: t0 + 0.45,
              box: `${m.kleur}@1`,
              kleur: opKleur,
            });
        }
        if (m.website) {
          await blok(i, m.website, { grootte: Math.round(kort * 0.042), y: Math.round(h * 0.68), van: t0 + 0.7 });
        }
      }
      // De lagen van deze clip er één voor één overheen.
      const eigen = lagen.map((l, k) => ({ ...l, k })).filter((l) => l.clip === i);
      let vorige = `b${i}`;
      filters.push(`[${i}:v]${stappen.join(",")}[${vorige}]`);
      for (const [j, l] of eigen.entries()) {
        const naar = j === eigen.length - 1 ? `v${i}` : `b${i}_${j}`;
        const zicht = l.tot ? `:enable='between(t,${l.van},${l.tot})'` : "";
        filters.push(`[${laagIn + l.k}:v]format=rgba,fade=t=in:st=${l.van}:d=0.35:alpha=1[l${l.k}]`);
        filters.push(`[${vorige}][l${l.k}]overlay=0:0${zicht}[${naar}]`);
        vorige = naar;
      }
      if (!eigen.length) filters.push(`[${vorige}]null[v${i}]`);
    }
    filters.push(`${clips.map((_, i) => `[v${i}]`).join("")}concat=n=${clips.length}:v=1:a=0[v]`);

    const stemIn = clips.length;
    const ms = Math.round(STEM_START * 1000);
    filters.push(`[${stemIn}:a]aformat=channel_layouts=stereo,aresample=44100,adelay=${ms}|${ms}[stem]`);
    if (muziek) {
      filters.push(`[${stemIn + 1}:a]volume=0.2[bed]`);
      filters.push(`[stem][bed]amix=inputs=2:duration=longest:normalize=0[a]`);
    } else {
      filters.push(`[stem]apad[a]`);
    }

    const uit = path.join(map, "reclame.mp4");
    await run(
      FFMPEG,
      [
        "-hide_banner",
        ...clips.flatMap((c) => ["-i", c]),
        "-i", stem,
        ...(muziek ? ["-i", muziek] : []),
        ...lagen.flatMap((l) => ["-loop", "1", "-framerate", "30", "-t", (l.clip === clips.length - 1 ? SHOT_DUUR + eind : SHOT_DUUR).toFixed(2), "-i", l.png]),
        "-filter_complex", filters.join(";"),
        "-map", "[v]",
        "-map", "[a]",
        "-t", totaal.toFixed(2),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart",
        "-y", uit,
      ],
      { maxBuffer: 1 << 24 },
    );
    return await readFile(uit);
  } finally {
    await rm(map, { recursive: true, force: true }).catch(() => {});
  }
}
