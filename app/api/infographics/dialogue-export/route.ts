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

export const runtime = "nodejs";
export const maxDuration = 300;

// Elke clip bevat precies één gesproken regel. We knippen hem vanaf het gemeten
// moment waarop de mond opengaat en precies zo lang als de zin duurt — zo begint
// de stem op de mondbeweging en praat er niemand door nadat het geluid stopt.
//
// Tussen de segmenten een korte overvloeier. Dat is geen opsmuk: het kader en de
// personages blijven hetzelfde tussen twee regels, dus een harde las ziet eruit
// als een sprong. Prijs daarvan is dat we niet meer met de concat-demuxer kunnen
// stream-copyen; alles gaat door één filtergraph.
const XFADE = 0.25;

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

    // ---------- 1. Per regel een segment op maat ----------
    // `scene` bepaalt waar een overvloeier mag komen: alleen bij een scènewissel.
    const segmenten: { file: string; dur: number; scene: number }[] = [];
    let n = 0;
    for (const [si, scene] of spec.scenes.entries()) {
      for (const regel of scene.lines) {
        if (!regel.videoUrl) continue;

        const clip = path.join(dir, `c${n}.mp4`);
        const isActie = regel.kind === "actie";
        n++;
        if (!(await download(regel.videoUrl, clip))) continue;
        const clipDuur = await probeDuur(clip);

        const seg = path.join(dir, `s${String(segmenten.length).padStart(3, "0")}.mp4`);
        const scaleV = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${fps},setsar=1,format=yuv420p`;

        // Een actiebeeld ZONDER voice-over: de muziek draagt het. We plakken er wel
        // een stil audiospoor onder, want alle segmenten moeten dezelfde parameters
        // hebben voordat ze aan elkaar kunnen.
        if (isActie && !regel.audioUrl) {
          const duur = Math.max(1, Math.min(regel.seconden ?? 4, clipDuur || (regel.seconden ?? 4)));
          await runFfmpeg([
            "-i", clip, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            "-filter_complex", `[0:v]${scaleV}[v]`,
            "-map", "[v]", "-map", "1:a", "-t", duur.toFixed(3), ...ENC(fps), "-y", seg,
          ]);
          segmenten.push({ file: seg, dur: duur, scene: si });
          continue;
        }

        if (!regel.audioUrl) continue;
        const stem = path.join(dir, `a${n}.mp3`);
        if (!(await download(regel.audioUrl, stem))) continue;

        // De echte audiolengte meten in plaats van audioDuration uit de spec
        // vertrouwen: die is een schatting en een te lage waarde kapt de zin af.
        const stemDuur = (await probeDuur(stem)) || regel.audioDuration || 4;
        // Nooit voorbij het einde van de clip beginnen.
        // Bij een voice-over hoeft er niets op een mond te vallen: begin op nul.
        const start = isActie ? 0 : Math.max(0, Math.min(regel.mouthStart ?? 0, Math.max(0, clipDuur - stemDuur)));

        await runFfmpeg([
          "-ss", start.toFixed(3), "-i", clip, "-i", stem,
          "-filter_complex",
          `[0:v]${scaleV}[v];[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a]`,
          "-map", "[v]", "-map", "[a]", "-t", stemDuur.toFixed(3), ...ENC(fps), "-y", seg,
        ]);
        segmenten.push({ file: seg, dur: stemDuur, scene: si });
      }
    }

    if (segmenten.length === 0) {
      return NextResponse.json({ error: "Nog geen clips gegenereerd om te exporteren" }, { status: 400 });
    }

    // ---------- 2. Aan elkaar vloeien ----------
    //
    // Een overvloeier hoort bij een SCÈNEWISSEL, niet bij elke gesproken regel.
    // Binnen één scène komen alle beelden uit hetzelfde twee-shot: dezelfde
    // mensen, dezelfde omgeving, alleen een andere mond en houding. Daar een
    // dissolve overheen leggen ziet eruit als geflikker, en dat gebeurde bij élke
    // zin — twintig keer in een video van twee minuten.
    //
    // Dus: binnen een scène harde lassen (concat), tussen scènes een korte fade.
    const groepen: { file: string; dur: number }[] = [];
    for (let i = 0; i < segmenten.length; ) {
      const scene = segmenten[i].scene;
      const groep: typeof segmenten = [];
      while (i < segmenten.length && segmenten[i].scene === scene) groep.push(segmenten[i++]);

      if (groep.length === 1) {
        groepen.push({ file: groep[0].file, dur: groep[0].dur });
        continue;
      }
      // Alle segmenten zijn met dezelfde ENC()-parameters gemaakt, dus ze mogen
      // zonder omcodering aan elkaar. Toch via de concat-FILTER en niet de
      // demuxer: die laatste struikelt over kleine verschillen in tijdbasis.
      const samengevoegd = path.join(dir, `g${String(groepen.length).padStart(3, "0")}.mp4`);
      const labels = groep.map((_, j) => `[${j}:v][${j}:a]`).join("");
      await runFfmpeg([
        ...groep.flatMap((g) => ["-i", g.file]),
        "-filter_complex", `${labels}concat=n=${groep.length}:v=1:a=1[v][a]`,
        "-map", "[v]", "-map", "[a]", ...ENC(fps), "-y", samengevoegd,
      ]);
      groepen.push({ file: samengevoegd, dur: groep.reduce((a, g) => a + g.dur, 0) });
    }

    const samen = path.join(dir, "samen.mp4");
    if (groepen.length === 1) {
      await runFfmpeg(["-i", groepen[0].file, "-c", "copy", "-movflags", "+faststart", "-y", samen]);
    } else {
      // Eén filtergraph die alle scènes aan elkaar vloeit. De offset van elke
      // overgang is de som van de voorgaande lengtes minus de reeds gebruikte
      // overvloeitijd — anders schuift elke volgende overgang te ver naar achteren.
      const invoer = groepen.flatMap((g) => ["-i", g.file]);
      const delen: string[] = [];
      let vLabel = "0:v", aLabel = "0:a", gelopen = groepen[0].dur;
      for (let i = 1; i < groepen.length; i++) {
        const offset = Math.max(0, gelopen - XFADE);
        const vUit = `v${i}`, aUit = `a${i}`;
        delen.push(`[${vLabel}][${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}[${vUit}]`);
        delen.push(`[${aLabel}][${i}:a]acrossfade=d=${XFADE}:c1=tri:c2=tri[${aUit}]`);
        vLabel = vUit; aLabel = aUit;
        gelopen = offset + groepen[i].dur;
      }
      await runFfmpeg([
        ...invoer, "-filter_complex", delen.join(";"),
        "-map", `[${vLabel}]`, "-map", `[${aLabel}]`,
        ...ENC(fps), "-movflags", "+faststart", "-y", samen,
      ]);
    }

    // ---------- 3. Muziekbed met ducking ----------
    // Actiebeelden hebben geen stem. Met een muziekbed dat overal even zacht staat
    // vallen die momenten dood: je ziet iets gebeuren en hoort vrijwel niets.
    //
    // Daarom duckt de muziek zichzelf: sidechaincompress gebruikt het spraakspoor
    // als stuursignaal, dus onder een gesproken zin zakt de muziek weg en op een
    // actiebeeld komt hij vanzelf naar voren. Gemeten op een testmix levert dat
    // ~8,5 dB meer muziek op de stille stukken op, terwijl de dialoogsegmenten
    // exact even luid blijven. Dat gaat automatisch mee met elk draaiboek, zonder
    // dat we per segment tijdstippen hoeven bij te houden.
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

    // ---------- 4. Opslaan ----------
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
