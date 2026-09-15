import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { storyCanvasSize } from "@/lib/infographics/canvas-size";
import { STORY_FPS } from "@/lib/infographics/story-layout";
import type { DialogueSpec } from "@/lib/infographics/dialogue-schema";
import { renderMusicBed } from "@/lib/music/bed";
import {
  beginEindFade, montagePlan, overgangOffsets, segmentAudioFilter, segmentVideoFilter, zachteLassen, SCENE_OVERGANG,
} from "@/lib/infographics/dialoog-montage";

export const runtime = "nodejs";
export const maxDuration = 300;

// Elke clip bevat precies één gesproken regel. We knippen hem vanaf het gemeten
// moment waarop de mond opengaat en precies zo lang als de zin duurt — zo begint
// de stem op de mondbeweging en praat er niemand door nadat het geluid stopt.
//
// Hoe de clips in elkaar overlopen (een korte overvloeier binnen een scène, een
// langere over een stil moment tussen scènes, een fade aan begin en eind) staat in
// dialoog-montage.ts. Alles gaat door één filtergraph, dus geen stream-copy.

function runFfmpeg(args: string[], limietMs = 280_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = (ffmpegPath as unknown as string) || "ffmpeg";
    const proc = spawn(bin, ["-hide_banner", "-loglevel", "error", ...args]);
    let err = "";
    const t = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error("ffmpeg duurde te lang")); }, limietMs);
    proc.stderr.on("data", (d) => { err += d.toString(); });
    proc.on("error", (e) => { clearTimeout(t); reject(e); });
    proc.on("close", (code) => { clearTimeout(t); code === 0 ? resolve() : reject(new Error("ffmpeg: " + err.slice(-800))); });
  });
}

function probeDuur(file: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn((ffmpegPath as unknown as string) || "ffmpeg", ["-hide_banner", "-i", file, "-f", "null", "-"]);
    let s = "";
    proc.stderr.on("data", (c) => { s += c.toString(); });
    proc.on("close", () => {
      const m = s.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      resolve(m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0);
    });
    proc.on("error", () => resolve(0));
  });
}

async function download(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch { return false; }
}

const ENC = (fps: number) => [
  "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
  "-r", String(fps), "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "192k",
];

export async function POST(req: NextRequest) {
  let dir: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { spec } = (await req.json()) as { spec?: DialogueSpec };
    if (!spec || !Array.isArray(spec.scenes) || spec.scenes.length === 0) {
      return NextResponse.json({ error: "Geen dialoog om te exporteren" }, { status: 400 });
    }

    const { width: W, height: H } = storyCanvasSize(spec.format);
    const fps = STORY_FPS;
    dir = await mkdtemp(path.join(tmpdir(), "dialogue-"));

    // ---------- 1. Welke regels er in de video komen ----------
    // Eerst de lijst, dan pas de segmenten: of een regel een stille kop of staart
    // krijgt, hangt af van de regel ervoor en erna (zie montagePlan).
    const kandidaten: { scene: number; clip: string; stem: string | null; spraak: number; start: number; isActie: boolean }[] = [];
    let n = 0;
    for (const [si, scene] of spec.scenes.entries()) {
      for (const regel of scene.lines) {
        if (!regel.videoUrl) continue;
        const isActie = regel.kind === "actie";
        const metStem = !!regel.audioUrl;
        if (!isActie && !metStem) continue;

        const clip = path.join(dir, `c${n}.mp4`);
        const stem = path.join(dir, `a${n}.mp3`);
        n++;
        if (!(await download(regel.videoUrl, clip))) continue;
        const clipDuur = await probeDuur(clip);

        // Een actiebeeld ZONDER voice-over: de muziek draagt het.
        if (!metStem) {
          const duur = Math.max(1, Math.min(regel.seconden ?? 4, clipDuur || (regel.seconden ?? 4)));
          kandidaten.push({ scene: si, clip, stem: null, spraak: duur, start: 0, isActie });
          continue;
        }

        if (!(await download(regel.audioUrl as string, stem))) continue;
        // De echte audiolengte meten in plaats van audioDuration uit de spec
        // vertrouwen: die is een schatting en een te lage waarde kapt de zin af.
        const stemDuur = (await probeDuur(stem)) || regel.audioDuration || 4;
        // Nooit voorbij het einde van de clip beginnen.
        // Bij een voice-over hoeft er niets op een mond te vallen: begin op nul.
        const start = isActie ? 0 : Math.max(0, Math.min(regel.mouthStart ?? 0, Math.max(0, clipDuur - stemDuur)));
        kandidaten.push({ scene: si, clip, stem, spraak: stemDuur, start, isActie });
      }
    }

    if (kandidaten.length === 0) {
      return NextResponse.json({ error: "Nog geen clips gegenereerd om te exporteren" }, { status: 400 });
    }

    // ---------- 2. Per regel een segment op maat ----------
    const plan = montagePlan(kandidaten.map((k) => ({ scene: k.scene, spraak: k.spraak })));
    const schaal = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${fps},setsar=1,format=yuv420p`;
    const segmenten: { file: string; dur: number; beeldDur: number; scene: number }[] = [];
    for (const [i, k] of kandidaten.entries()) {
      const p = plan[i];
      const seg = path.join(dir, `s${String(i).padStart(3, "0")}.mp4`);
      // Het beeld is de zachte las langer dan het geluid: dat stuk overlapt straks de
      // volgende zin van de scène. Daarom per spoor afkappen in plaats van met -t.
      const beeldDur = p.duur + p.las;
      const afBeeld = `trim=duration=${beeldDur.toFixed(3)},setpts=PTS-STARTPTS`;
      const afGeluid = `atrim=duration=${p.duur.toFixed(3)}`;
      // Bij een gesproken regel blijft het laatste beeld staan in de stilte erna; bij
      // een actiebeeld loopt de beweging door. Zie segmentVideoFilter.
      const beeldFilter = `${segmentVideoFilter(schaal, p, !k.isActie)},${afBeeld}`;
      if (!k.stem) {
        // Alle segmenten moeten dezelfde parameters hebben voordat ze aan elkaar
        // kunnen, dus ook een stil actiebeeld krijgt een (stil) audiospoor.
        await runFfmpeg([
          "-i", k.clip, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
          "-filter_complex", `[0:v]${beeldFilter}[v];[1:a]${afGeluid}[a]`,
          "-map", "[v]", "-map", "[a]", ...ENC(fps), "-y", seg,
        ]);
      } else {
        await runFfmpeg([
          "-ss", k.start.toFixed(3), "-i", k.clip, "-i", k.stem,
          "-filter_complex", `[0:v]${beeldFilter}[v];[1:a]${segmentAudioFilter(p)},${afGeluid}[a]`,
          "-map", "[v]", "-map", "[a]", ...ENC(fps), "-y", seg,
        ]);
      }
      segmenten.push({ file: seg, dur: p.duur, beeldDur, scene: k.scene });
    }

    // ---------- 3. Per scène aan elkaar ----------
    //
    // Binnen één scène een korte overvloeier van beeld tot beeld. Harde lassen gaven
    // geflikker sinds elke zin een eigen storyboardbeeld heeft (zie dialoog-montage.ts).
    // Het geluid gaat gewoon achter elkaar: de overvloeier ligt over het extra stuk
    // beeld van de vorige zin (dat doorloopt), dus beeld en stem blijven gelijk.
    const groepen: { file: string; dur: number }[] = [];
    for (let i = 0; i < segmenten.length; ) {
      const scene = segmenten[i].scene;
      const groep: typeof segmenten = [];
      while (i < segmenten.length && segmenten[i].scene === scene) groep.push(segmenten[i++]);

      if (groep.length === 1) {
        groepen.push({ file: groep[0].file, dur: groep[0].dur });
        continue;
      }
      // Alle segmenten zijn met dezelfde ENC()-parameters gemaakt. Toch via de
      // concat-FILTER en niet de demuxer: die laatste struikelt over kleine
      // verschillen in tijdbasis.
      const nr = String(groepen.length).padStart(3, "0");
      const samengevoegd = path.join(dir, `g${nr}.mp4`);
      const alleenBeeld = path.join(dir, `g${nr}-beeld.mp4`);
      const alleenGeluid = path.join(dir, `g${nr}-geluid.m4a`);
      const invoerGroep = groep.flatMap((g) => ["-i", g.file]);
      const lassen = zachteLassen(groep.map((g) => g.beeldDur));
      // Beeld en geluid in aparte stappen. In één filtergraph met de concat van het
      // geluid sloeg ffmpeg 6 de overvloeiers over: gemeten ging het beeld in 0,04 s van
      // 16% naar 81% nieuw, een harde las. Los vloeide hetzelfde beeld netjes over.
      await runFfmpeg([
        ...invoerGroep, "-filter_complex", lassen.filter,
        "-map", `[${lassen.label}]`, "-an", ...ENC(fps), "-y", alleenBeeld,
      ]);
      await runFfmpeg([
        ...invoerGroep, "-filter_complex", `${groep.map((_, j) => `[${j}:a]`).join("")}concat=n=${groep.length}:v=0:a=1[a]`,
        "-map", "[a]", "-vn", ...ENC(fps), "-y", alleenGeluid,
      ]);
      await runFfmpeg(["-i", alleenBeeld, "-i", alleenGeluid, "-map", "0:v", "-map", "1:a", "-c", "copy", "-y", samengevoegd]);
      groepen.push({ file: samengevoegd, dur: groep.reduce((a, g) => a + g.dur, 0) });
    }

    // ---------- 4. Scènes in elkaar laten overvloeien ----------
    // Elke overvloeier valt op de stille staart van de ene scène en de stille kop van
    // de volgende; de stemmen raken elkaar dus nooit.
    const samen = path.join(dir, "samen.mp4");
    const { offsets, totaal } = overgangOffsets(groepen.map((g) => g.dur));
    const invoer = groepen.flatMap((g) => ["-i", g.file]);
    const delen: string[] = [];
    let vLabel = "0:v", aLabel = "0:a";
    for (let i = 1; i < groepen.length; i++) {
      const vUit = `v${i}`, aUit = `a${i}`;
      delen.push(`[${vLabel}][${i}:v]xfade=transition=fade:duration=${SCENE_OVERGANG}:offset=${offsets[i - 1].toFixed(3)}[${vUit}]`);
      delen.push(`[${aLabel}][${i}:a]acrossfade=d=${SCENE_OVERGANG}:c1=tri:c2=tri[${aUit}]`);
      vLabel = vUit; aLabel = aUit;
    }
    delen.push(`[${vLabel}]${beginEindFade(totaal)}[veind]`);
    await runFfmpeg([
      ...invoer, "-filter_complex", delen.join(";"),
      "-map", "[veind]", "-map", groepen.length > 1 ? `[${aLabel}]` : "0:a",
      ...ENC(fps), "-movflags", "+faststart", "-y", samen,
    ]);

    // ---------- 5. Muziekbed met ducking ----------
    // Actiebeelden hebben geen stem. Met een muziekbed dat overal even zacht staat
    // vallen die momenten dood: je ziet iets gebeuren en hoort vrijwel niets.
    //
    // Daarom duckt de muziek zichzelf: sidechaincompress gebruikt het spraakspoor
    // als stuursignaal, dus onder een gesproken zin zakt de muziek weg en op een
    // actiebeeld komt hij vanzelf naar voren. Gemeten op een testmix levert dat
    // ~8,5 dB meer muziek op de stille stukken op, terwijl de dialoogsegmenten
    // exact even luid blijven. Dat gaat automatisch mee met elk draaiboek, zonder
    // dat we per segment tijdstippen hoeven bij te houden. Ook de stille momenten
    // rond een scènewissel krijgen zo muziek, zodat de overgang niet stilvalt.
    let eind = samen;
    if (spec.musicUrl) {
      const bron = path.join(dir, "muziek-bron.mp3");
      const muziek = path.join(dir, "muziek.wav");
      // Het gekozen nummer is 1,5–8,5 minuut lang en de video meestal korter of
      // (bij een lang draaiboek) juist langer. renderMusicBed zet het op exact de
      // videolengte: doorlussen of afkappen, met een uitfade.
      const bedKlaar = (await download(spec.musicUrl, bron))
        ? await renderMusicBed(bron, await probeDuur(samen), muziek).then(() => true).catch(() => false)
        : false;
      if (bedKlaar) {
        // Basisniveau van de muziek als er NIET gepraat wordt. Bewust hoger dan de
        // oude vaste 0,12: dat was afgestemd op "altijd onder spraak".
        const basis = typeof spec.musicVolume === "number" ? spec.musicVolume : 0.45;
        const metMuziek = path.join(dir, "eind.mp4");
        // duration=first houdt de mix op de videolengte; het bed is daar al op
        // gezet, dus er valt niets meer af te kappen.
        await runFfmpeg([
          "-i", samen, "-i", muziek,
          "-filter_complex",
          // De spraak wordt twee keer gebruikt: als stuursignaal én in de mix zelf.
          `[0:a]asplit=2[spraak][stuur];` +
          `[1:a]aresample=44100,volume=${basis.toFixed(3)}[m];` +
          `[m][stuur]sidechaincompress=threshold=0.03:ratio=12:attack=20:release=400[gedempt];` +
          `[spraak][gedempt]amix=inputs=2:duration=first:normalize=0[a]`,
          "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
          "-movflags", "+faststart", "-y", metMuziek,
        ]);
        eind = metMuziek;
      }
    }

    // ---------- 6. Opslaan ----------
    const bytes = await readFile(eind);
    const pad = `${user.id}/dialogue/dialoog-${Date.now()}.mp4`;
    const { error: upErr } = await supabase.storage.from("scene-assets").upload(pad, bytes, { contentType: "video/mp4", upsert: true });
    if (upErr) throw new Error(`Upload mislukt: ${upErr.message}`);
    const bestandsnaam = `${(spec.title || "dialoog").replace(/\s+/g, "-")}.mp4`;
    const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(pad, { download: bestandsnaam });

    await rm(dir, { recursive: true, force: true });
    dir = null;

    return NextResponse.json({ url: urlData.publicUrl, segments: segmenten.length });
  } catch (err: unknown) {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-export failed:", msg);
    return NextResponse.json({ error: "Video exporteren mislukt", detail: msg }, { status: 500 });
  }
}
