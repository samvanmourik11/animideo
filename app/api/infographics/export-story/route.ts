import { NextRequest, NextResponse } from "next/server";
import { Resvg } from "@resvg/resvg-js";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { storyCanvasSize } from "@/lib/infographics/canvas-size";
import { storyWindows, STORY_FPS } from "@/lib/infographics/story-layout";
import { buildSceneSvg } from "@/lib/infographics/story-svg";
import { STORY_FONT_FILES, resolveStoryFont } from "@/lib/infographics/story-fonts";
import type { StorySpec } from "@/lib/infographics/story-schema";

export const runtime = "nodejs";
export const maxDuration = 300;

// De tekst-overlay is pure SVG (zie StoryScene); we rasteren die server-side met
// resvg i.p.v. een headless browser. Dat werkt betrouwbaar op Vercel (geen
// chromium) en is snel. Het Inter-font (op schijf, meegetraced) zorgt voor de
// juiste typografie. Alle huisstijl-fonts (zie story-fonts.ts) worden geladen,
// zodat de gekozen font in de export exact als in de preview rendert.
const FONT_FILES = STORY_FONT_FILES.map((f) => path.join(process.cwd(), "lib/export", f));

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = (ffmpegPath as unknown as string) || "ffmpeg";
    const proc = spawn(bin, ["-hide_banner", "-loglevel", "error", ...args]);
    let err = "";
    proc.stderr.on("data", (d) => { err += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg: " + err.slice(-800)))));
  });
}

// Meet de duur van een (gedownloade) clip via ffmpeg. Nodig om lange scenes te
// vertragen i.p.v. te loopen: factor = sceneduur / clipduur.
function probeDuration(file: string): Promise<number> {
  return new Promise((resolve) => {
    const bin = (ffmpegPath as unknown as string) || "ffmpeg";
    const proc = spawn(bin, ["-hide_banner", "-i", file, "-f", "null", "-"]);
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

export async function POST(req: NextRequest) {
  let dir: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { spec?: StorySpec; navy?: string; accent?: string; fontFamily?: string; logoUrl?: string | null };
    const spec = body.spec;
    if (!spec || !Array.isArray(spec.scenes) || spec.scenes.length === 0) {
      return NextResponse.json({ error: "Geen scenes om te exporteren" }, { status: 400 });
    }
    const { width: W, height: H } = storyCanvasSize(spec.format);
    const { windows, total } = storyWindows(spec.scenes);
    const N = spec.scenes.length;

    dir = await mkdtemp(path.join(tmpdir(), "story-"));

    // ── 1. Achtergrond per scene: bewegende clip of stilstaand beeld ──
    const media: { file: string; isVideo: boolean; clipDur: number }[] = [];
    for (let i = 0; i < N; i++) {
      const s = spec.scenes[i];
      if (s.videoUrl) {
        const f = path.join(dir, `media-${i}.mp4`);
        if (await download(s.videoUrl, f)) {
          const clipDur = await probeDuration(f);
          media.push({ file: f, isVideo: true, clipDur: clipDur > 0 ? clipDur : 5 });
          continue;
        }
      }
      if (s.imageUrl) {
        const f = path.join(dir, `media-${i}.jpg`);
        if (await download(s.imageUrl, f)) { media.push({ file: f, isVideo: false, clipDur: 0 }); continue; }
      }
      // fallback: effen achtergrond
      const f = path.join(dir, `media-${i}.png`);
      await runFfmpeg(["-f", "lavfi", "-i", `color=#f3f1ec:s=${W}x${H}`, "-frames:v", "1", "-y", f]);
      media.push({ file: f, isVideo: false, clipDur: 0 });
    }

    // ── 2. Transparante tekst-overlay per scene (resvg, geen browser) ──
    const navy = body.navy ?? spec.navy ?? "#16243f";
    const accent = body.accent ?? spec.accent ?? "#e8643c";
    const fontFamily = resolveStoryFont(body.fontFamily ?? spec.fontFamily);

    // Merklogo als data-URI inbedden. Alleen PNG/JPEG (resvg rastert die
    // betrouwbaar); overige formaten worden overgeslagen zodat de export nooit
    // breekt. Eén keer ophalen, daarna in elke scene hergebruiken.
    let logoDataUri: string | null = null;
    const logoUrl = body.logoUrl ?? (spec.logoEnabled ? spec.logoUrl : null) ?? null;
    if (logoUrl) {
      try {
        const r = await fetch(logoUrl);
        if (r.ok) {
          const ct = (r.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
          if (ct === "image/png" || ct === "image/jpeg" || ct === "image/jpg") {
            const buf = Buffer.from(await r.arrayBuffer());
            logoDataUri = `data:${ct};base64,${buf.toString("base64")}`;
          }
        }
      } catch {}
    }

    const texts: string[] = [];
    for (let i = 0; i < N; i++) {
      const svg = buildSceneSvg(spec.scenes[i], spec.format, navy, accent, { fontFamily, logoDataUri });
      const png = new Resvg(svg, {
        fitTo: { mode: "width", value: W },
        font: { fontFiles: FONT_FILES, defaultFontFamily: fontFamily, loadSystemFonts: false },
      }).render().asPng();
      const p = path.join(dir, `text-${String(i).padStart(3, "0")}.png`);
      await writeFile(p, png);
      texts.push(p);
    }

    // ── 3. Voice-over + muziekbed downloaden (optioneel) ────────────
    let voicePath: string | null = null;
    if (spec.voiceUrl) {
      voicePath = path.join(dir, "voice.mp3");
      if (!(await download(spec.voiceUrl, voicePath))) voicePath = null;
    }
    let musicPath: string | null = null;
    if (spec.musicUrl) {
      musicPath = path.join(dir, "music.wav");
      if (!(await download(spec.musicUrl, musicPath))) musicPath = null;
    }

    // ── 4. ffmpeg: per scene een genormaliseerd segment + concat ──────
    // Géén xfade-keten: die maakt de Vercel-ffmpeg-build corrupt ("Error
    // reinitializing filters", -22). We renderen elke scene los naar een mp4 met
    // identieke parameters (resolutie, fps, pixfmt, SAR) en plakken ze daarna met
    // de concat-demuxer (harde cuts). Robuust op Vercel; de tekst-overlay zit per
    // segment gebakken. De voice-over loopt er als doorlopend spoor onder, dus de
    // harde cut valt visueel nauwelijks op.
    const segPaths: string[] = [];
    for (let i = 0; i < N; i++) {
      const segDur = windows[i].duration;
      let segFilter: string;
      if (media[i].isVideo) {
        // Alleen vertragen (nooit versnellen) zodat de clip de scene vult.
        const factor = Math.max(1, segDur / (media[i].clipDur || 5));
        segFilter = `[0:v]setpts=PTS*${factor.toFixed(4)},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${STORY_FPS},trim=duration=${segDur.toFixed(3)},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[bg];`;
      } else {
        const df = Math.round(segDur * STORY_FPS);
        const z = i % 2 === 0 ? "min(1.001+0.0010*on,1.12)" : "max(1.12-0.0010*on,1.0)";
        segFilter = `[0:v]scale=${W * 2}:${H * 2}:flags=lanczos,zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${df}:s=${W}x${H}:fps=${STORY_FPS},setsar=1,format=yuv420p[bg];`;
      }
      segFilter += `[bg][1:v]overlay=0:0,format=yuv420p[v]`;
      const segPath = path.join(dir, `seg-${String(i).padStart(3, "0")}.mp4`);
      await runFfmpeg([
        "-i", media[i].file, "-i", texts[i],
        "-filter_complex", segFilter, "-map", "[v]", "-an",
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-r", String(STORY_FPS), "-video_track_timescale", String(STORY_FPS * 1000),
        "-t", segDur.toFixed(3), "-y", segPath,
      ]);
      segPaths.push(segPath);
    }

    // Concat-lijst (de demuxer plakt de identiek-gecodeerde segmenten zonder
    // her-encoderen van het beeld).
    const concatTxt = path.join(dir, "concat.txt");
    await writeFile(concatTxt, segPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));

    // Audio: voice op vol niveau, muziekbed eronder op het ingestelde volume
    // (slider; default 0.18). Zonder voice klinkt de muziek wat luider.
    const musicVol = typeof spec.musicVolume === "number" ? spec.musicVolume : 0.18;
    const audioInputs: string[] = [];
    if (voicePath) audioInputs.push("-i", voicePath);
    if (musicPath) audioInputs.push("-i", musicPath);
    const voiceIdx = voicePath ? 1 : -1;          // 0 = concat-video
    const musicIdx = musicPath ? (voicePath ? 2 : 1) : -1;

    const outPath = path.join(dir, "out.mp4");
    const cmd: string[] = ["-f", "concat", "-safe", "0", "-i", concatTxt, ...audioInputs];
    if (voiceIdx >= 0 && musicIdx >= 0) {
      cmd.push("-filter_complex", `[${voiceIdx}:a]aresample=44100[vo];[${musicIdx}:a]aresample=44100,volume=${musicVol.toFixed(3)}[mu];[vo][mu]amix=inputs=2:duration=longest:normalize=0[aout]`, "-map", "0:v", "-map", "[aout]", "-c:a", "aac", "-b:a", "192k");
    } else if (musicIdx >= 0) {
      cmd.push("-filter_complex", `[${musicIdx}:a]aresample=44100,volume=${Math.min(1, musicVol * 1.6).toFixed(3)}[aout]`, "-map", "0:v", "-map", "[aout]", "-c:a", "aac", "-b:a", "192k");
    } else if (voiceIdx >= 0) {
      cmd.push("-map", "0:v", "-map", `${voiceIdx}:a`, "-c:a", "aac", "-b:a", "192k");
    } else {
      cmd.push("-map", "0:v");
    }
    cmd.push("-c:v", "copy", "-movflags", "+faststart", "-t", total.toFixed(3), "-y", outPath);
    await runFfmpeg(cmd);

    // ── 5. Uploaden ─────────────────────────────────────────────────
    const bytes = await readFile(outPath);
    const storagePath = `${user.id}/story/story-video-${Date.now()}.mp4`;
    const { error: upErr } = await supabase.storage.from("scene-assets").upload(storagePath, bytes, { contentType: "video/mp4", upsert: true });
    if (upErr) throw new Error(`Upload mislukt: ${upErr.message}`);
    const dl = `${(spec.title || "story").replace(/\s+/g, "-")}.mp4`;
    const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(storagePath, { download: dl });

    await rm(dir, { recursive: true, force: true });
    dir = null;

    return NextResponse.json({ url: urlData.publicUrl, scenes: N, duration: total });
  } catch (err: unknown) {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    console.error("export-story failed:", msg);
    return NextResponse.json({ error: "Video exporteren mislukt", detail: msg }, { status: 500 });
  }
}
