import { NextRequest, NextResponse } from "next/server";
import { Resvg } from "@resvg/resvg-js";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { storyCanvasSize } from "@/lib/infographics/canvas-size";
import { storyWindows, STORY_CROSS, STORY_FPS } from "@/lib/infographics/story-layout";
import { buildSceneSvg } from "@/lib/infographics/story-svg";
import type { StorySpec } from "@/lib/infographics/story-schema";

export const runtime = "nodejs";
export const maxDuration = 300;

// De tekst-overlay is pure SVG (zie StoryScene); we rasteren die server-side met
// resvg i.p.v. een headless browser. Dat werkt betrouwbaar op Vercel (geen
// chromium) en is snel. Het Inter-font (op schijf, meegetraced) zorgt voor de
// juiste typografie.
const INTER_FONT_PATH = path.join(process.cwd(), "lib/export/Inter-Bold.ttf");

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

    const body = (await req.json()) as { spec?: StorySpec; navy?: string; accent?: string };
    const spec = body.spec;
    if (!spec || !Array.isArray(spec.scenes) || spec.scenes.length === 0) {
      return NextResponse.json({ error: "Geen scenes om te exporteren" }, { status: 400 });
    }
    const { width: W, height: H } = storyCanvasSize(spec.format);
    const { windows, total } = storyWindows(spec.scenes);
    const N = spec.scenes.length;
    const clipLen = (i: number) => windows[i].duration + (i < N - 1 ? STORY_CROSS : 0);

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
    const navy = body.navy ?? "#16243f";
    const accent = body.accent ?? "#e8643c";
    const texts: string[] = [];
    for (let i = 0; i < N; i++) {
      const svg = buildSceneSvg(spec.scenes[i], spec.format, navy, accent);
      const png = new Resvg(svg, {
        fitTo: { mode: "width", value: W },
        font: { fontFiles: [INTER_FONT_PATH], defaultFontFamily: "Inter", loadSystemFonts: false },
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

    // ── 4. ffmpeg: achtergrond (video loop / still zoompan) + tekst + xfade ──
    const inputs: string[] = [];
    for (let i = 0; i < N; i++) {
      // Geen -stream_loop meer: lange scenes worden in de filter vertraagd
      // (setpts) i.p.v. herhaald, zodat de clip de hele scene vult zonder loop.
      inputs.push("-i", media[i].file);
    }
    for (let i = 0; i < N; i++) inputs.push("-i", texts[i]);
    if (voicePath) inputs.push("-i", voicePath);
    if (musicPath) inputs.push("-i", musicPath);
    // Audio-inputindexen (na de N media + N tekst-overlays).
    const voiceIdx = voicePath ? 2 * N : -1;
    const musicIdx = musicPath ? 2 * N + (voicePath ? 1 : 0) : -1;

    let fg = "";
    for (let i = 0; i < N; i++) {
      if (media[i].isVideo) {
        // Vertraag de clip zodat hij precies de scene vult (alleen vertragen,
        // nooit versnellen), trim op de exacte sceneduur en reset de PTS naar 0
        // zodat de xfade-offsets blijven kloppen.
        const factor = Math.max(1, clipLen(i) / (media[i].clipDur || 5));
        fg += `[${i}:v]setpts=PTS*${factor.toFixed(4)},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${STORY_FPS},trim=duration=${clipLen(i).toFixed(3)},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[bg${i}];`;
      } else {
        const df = Math.round(clipLen(i) * STORY_FPS);
        const z = i % 2 === 0 ? "min(1.001+0.0010*on,1.12)" : "max(1.12-0.0010*on,1.0)";
        fg += `[${i}:v]scale=${W * 2}:${H * 2}:flags=lanczos,zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${df}:s=${W}x${H}:fps=${STORY_FPS},setsar=1,format=yuv420p[bg${i}];`;
      }
      fg += `[bg${i}][${N + i}:v]overlay=0:0,format=yuv420p[c${i}];`;
    }
    let prev = "[c0]";
    for (let i = 0; i < N - 1; i++) {
      const out = i === N - 2 ? "[vout]" : `[x${i}]`;
      fg += `${prev}[c${i + 1}]xfade=transition=fade:duration=${STORY_CROSS}:offset=${windows[i + 1].start.toFixed(3)}${out};`;
      prev = out;
    }
    fg = fg.replace(/;$/, "");
    const vLabel = N > 1 ? "[vout]" : "[c0]";

    // Audio: voice op vol niveau, muziekbed zacht eronder (volume 0.18). normalize=0
    // houdt de voice op sterkte; duration=longest laat de muziek doorlopen als de
    // voice eerder klaar is (de -t hieronder kapt op de videolengte). Zonder voice
    // staat de muziek wat luider.
    let aLabel: string | null = null;
    if (voiceIdx >= 0 && musicIdx >= 0) {
      fg += `;[${voiceIdx}:a]aresample=44100[vo];[${musicIdx}:a]aresample=44100,volume=0.18[mu];[vo][mu]amix=inputs=2:duration=longest:normalize=0[aout]`;
      aLabel = "[aout]";
    } else if (musicIdx >= 0) {
      fg += `;[${musicIdx}:a]aresample=44100,volume=0.30[aout]`;
      aLabel = "[aout]";
    }

    const outPath = path.join(dir, "out.mp4");
    const cmd: string[] = [...inputs, "-filter_complex", fg, "-map", vLabel];
    if (aLabel) cmd.push("-map", aLabel, "-c:a", "aac", "-b:a", "192k");
    else if (voiceIdx >= 0) cmd.push("-map", `${voiceIdx}:a`, "-c:a", "aac", "-b:a", "192k", "-shortest");
    cmd.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(STORY_FPS), "-movflags", "+faststart", "-t", total.toFixed(3), "-y", outPath);
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
