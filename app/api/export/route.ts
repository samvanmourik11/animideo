import { NextRequest } from "next/server";
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import type { Scene } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const TRANS_DUR = 0.5;
const FONT_PATH = join(process.cwd(), "lib/export/Inter-Bold.ttf");

// Per-plan kwaliteit — exact dezelfde tabel als de oude browser-export had.
const QUALITY = {
  free:    { width: 1280, height: 720,  crf: "30", preset: "ultrafast" },
  starter: { width: 1920, height: 1080, crf: "24", preset: "ultrafast" },
  pro:     { width: 1920, height: 1080, crf: "18", preset: "fast" },
  agency:  { width: 1920, height: 1080, crf: "15", preset: "fast" },
} as const;

const XFADE_MAP: Record<string, string> = {
  fade: "fadeblack",
  dissolve: "dissolve",
  "slide-left": "slideleft",
  "slide-right": "slideright",
  "zoom-in": "zoomin",
};

type Quality = (typeof QUALITY)[keyof typeof QUALITY];

interface ExportRequest {
  projectId: string;
  voiceVol: number;
  voiceSpeed: number;
  musicVol: number;
  bgMusicUrl?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let body: ExportRequest;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (!body.projectId) return new Response("projectId vereist", { status: 400 });

  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", body.projectId)
    .eq("user_id", user.id)
    .single();
  if (projectErr || !project) {
    return new Response("Project niet gevonden", { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  const plan = (profile?.plan as keyof typeof QUALITY) ?? "free";
  const quality = QUALITY[plan] ?? QUALITY.free;

  const scenes = (project.scenes ?? []) as Scene[];
  const videoScenes = scenes.filter((s) => s.video_url);
  if (videoScenes.length === 0) {
    return new Response(
      "Geen video clips gevonden — voltooi Motion Review (stap 4) eerst.",
      { status: 400 }
    );
  }

  let totalExpectedDuration = 0;
  for (const s of videoScenes) totalExpectedDuration += s.duration;

  const workDir = join(tmpdir(), `export-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Controller might be closed already
        }
      };

      try {
        emit({ type: "phase", phase: "Clips ophalen", pct: 2 });

        // ── Download clips ────────────────────────────────────────────
        const clipPaths: string[] = [];
        for (let i = 0; i < videoScenes.length; i++) {
          const localPath = join(workDir, `clip${i}.mp4`);
          await downloadTo(videoScenes[i].video_url!, localPath);
          clipPaths.push(localPath);
          emit({ type: "progress", pct: 2 + Math.round(((i + 1) / videoScenes.length) * 12) });
        }

        // ── Download voice + music (best effort) ──────────────────────
        let voicePath: string | null = null;
        if (project.voice_audio_url) {
          voicePath = join(workDir, "voice.mp3");
          try { await downloadTo(project.voice_audio_url, voicePath); }
          catch { voicePath = null; }
        }
        let musicPath: string | null = null;
        const bgMusicUrl = body.bgMusicUrl || project.bg_music_url;
        if (bgMusicUrl) {
          musicPath = join(workDir, "music.mp3");
          try { await downloadTo(bgMusicUrl, musicPath); }
          catch { musicPath = null; }
        }

        emit({ type: "phase", phase: "Bronlengtes meten", pct: 17 });

        const srcDurations: number[] = [];
        for (const p of clipPaths) srcDurations.push(await probeDuration(p));

        emit({ type: "phase", phase: "Scenes klaarmaken", pct: 20 });

        // ── Trim/rescale each clip — matches preview timing ────────────
        const scaleFilter =
          `scale=${quality.width}:${quality.height}:force_original_aspect_ratio=decrease,` +
          `pad=${quality.width}:${quality.height}:(ow-iw)/2:(oh-ih)/2:color=black`;

        const trimmedPaths: string[] = [];
        for (let i = 0; i < videoScenes.length; i++) {
          const sceneDur = videoScenes[i].duration;
          const isLast = i === videoScenes.length - 1;
          const trans = videoScenes[i].transition_out ?? "cut";
          const transDur = !isLast && trans !== "cut"
            ? Math.min(TRANS_DUR, sceneDur * 0.4, videoScenes[i + 1].duration * 0.4)
            : 0;
          const trimDur = sceneDur + transDur;

          const srcDur = srcDurations[i];
          const speedRatio = srcDur > 0 ? sceneDur / srcDur : 1;

          const trimmedPath = join(workDir, `clip${i}_trimmed.mp4`);
          await runFfmpeg([
            "-i", clipPaths[i],
            "-c:v", "libx264", "-preset", quality.preset, "-crf", quality.crf,
            "-pix_fmt", "yuv420p", "-profile:v", "main", "-level", "4.0",
            "-vf", `setpts=${speedRatio.toFixed(4)}*PTS,tpad=stop_mode=clone:stop_duration=2,${scaleFilter}`,
            "-t", String(trimDur),
            "-an",
            "-y",
            trimmedPath,
          ]);
          trimmedPaths.push(trimmedPath);
          emit({ type: "progress", pct: 20 + Math.round(((i + 1) / videoScenes.length) * 30) });
        }

        emit({ type: "phase", phase: "Video renderen", pct: 50 });

        // ── Decide xfade vs concat path ────────────────────────────────
        const hasNonCutTransition = videoScenes.length > 1 &&
          videoScenes.slice(0, -1).some((s) => (s.transition_out ?? "cut") !== "cut");
        const hasVoice = !!voicePath;
        const hasBgMusic = !!musicPath;

        const outputPath = join(workDir, "output.mp4");
        const concatTxt = join(workDir, "concat.txt");
        if (!hasNonCutTransition) {
          await writeFile(
            concatTxt,
            trimmedPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n")
          );
        }

        const finalCmd = buildFinalCommand({
          hasNonCutTransition,
          trimmedPaths,
          concatTxt,
          videoScenes,
          voicePath,
          musicPath,
          voiceVol: body.voiceVol,
          voiceSpeed: body.voiceSpeed,
          musicVol: body.musicVol,
          quality,
          totalDur: totalExpectedDuration,
          outputPath,
        });

        await runFfmpegWithProgress(finalCmd, totalExpectedDuration, (frac) => {
          emit({ type: "progress", pct: 50 + Math.round(frac * 30) });
        });

        // ── Watermark for free plan ────────────────────────────────────
        let uploadFile = outputPath;
        if (plan === "free") {
          emit({ type: "phase", phase: "Watermerk toevoegen", pct: 82 });
          const watermarkedPath = join(workDir, "watermarked.mp4");
          try {
            await runFfmpeg([
              "-i", outputPath,
              "-vf", buildWatermarkFilter(),
              "-c:v", "libx264", "-preset", "fast",
              "-pix_fmt", "yuv420p", "-profile:v", "main", "-level", "4.0",
              "-c:a", "copy",
              "-movflags", "+faststart",
              "-y",
              watermarkedPath,
            ]);
            uploadFile = watermarkedPath;
          } catch (wmErr) {
            console.warn("[export] Watermark pass failed:", wmErr);
            // Continue without watermark rather than failing the whole export
          }
        }

        emit({ type: "phase", phase: "Uploaden", pct: 90 });

        const fileBytes = await readFile(uploadFile);
        const storagePath = `${user.id}/${project.id}/export-${Date.now()}.mp4`;
        const { error: uploadErr } = await supabase.storage
          .from("scene-assets")
          .upload(storagePath, fileBytes, { contentType: "video/mp4", upsert: true });
        if (uploadErr) throw new Error(`Upload mislukt: ${uploadErr.message}`);

        // `download: filename` zorgt dat Supabase een Content-Disposition: attachment
        // header meegeeft. Dat is een safety-net voor als de URL ooit elders wordt
        // geopend — primair gaat de download via een client-side fetch+blob.
        const downloadName = `${(project.title as string).replace(/\s+/g, "-")}.mp4`;
        const { data: urlData } = supabase.storage
          .from("scene-assets")
          .getPublicUrl(storagePath, { download: downloadName });
        const finalUrl = `${urlData.publicUrl}${urlData.publicUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;

        await supabase
          .from("projects")
          .update({ video_url: finalUrl, status: "Done" })
          .eq("id", project.id)
          .eq("user_id", user.id);

        emit({ type: "complete", url: finalUrl, pct: 100 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[export]", err);
        emit({ type: "error", message: msg });
      } finally {
        try { await rm(workDir, { recursive: true, force: true }); } catch {}
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ── ffmpeg command builder ───────────────────────────────────────────────
interface FinalCmdArgs {
  hasNonCutTransition: boolean;
  trimmedPaths: string[];
  concatTxt: string;
  videoScenes: Scene[];
  voicePath: string | null;
  musicPath: string | null;
  voiceVol: number;
  voiceSpeed: number;
  musicVol: number;
  quality: Quality;
  totalDur: number;
  outputPath: string;
}

function buildFinalCommand(a: FinalCmdArgs): string[] {
  const hasVoice = !!a.voicePath;
  const hasBgMusic = !!a.musicPath;
  const voiceTempo = a.voiceSpeed !== 1 ? `atempo=${a.voiceSpeed.toFixed(2)},` : "";

  if (a.hasNonCutTransition) {
    // ── xfade chain over trimmed clips ─────────────────────────────────
    const videoInputs: string[] = [];
    for (const p of a.trimmedPaths) videoInputs.push("-i", p);

    // xfade-keten over de getrimde clips. Elke clip is exact `duration + transDur`
    // lang (zie trim-stap). De offset is de tijd in de TOT NU TOE samengevoegde
    // video waar de transitie start; dat is de lopende ketenlengte minus de
    // overlap. De vorige versie telde alleen scene-duren op (zonder overlap af te
    // trekken), waardoor de offsets wegliepen en de videolaag inklapte terwijl de
    // audio doorliep (scene 1 sprong naar de laatste scene).
    const scenes = a.videoScenes;
    const tdOf = (i: number): number => {
      if (i >= scenes.length - 1) return 0;
      const tr = scenes[i].transition_out ?? "cut";
      return tr !== "cut" ? Math.min(TRANS_DUR, scenes[i].duration * 0.4, scenes[i + 1].duration * 0.4) : 0;
    };
    const clipLen = (i: number): number => scenes[i].duration + tdOf(i);

    let vFilter = "";
    let prevLabel = "[0:v]";
    let acc = clipLen(0);
    for (let i = 0; i < scenes.length - 1; i++) {
      const tr = scenes[i].transition_out ?? "cut";
      const xType = tr !== "cut" ? (XFADE_MAP[tr] ?? "dissolve") : "fade";
      const ov = tr !== "cut" ? tdOf(i) : 0.001; // zichtbare transitieduur + overlap
      const offset = Math.max(0, acc - ov);
      const outLabel = i === scenes.length - 2 ? "[vout]" : `[xv${i}]`;
      vFilter += `${prevLabel}[${i + 1}:v]xfade=transition=${xType}:duration=${ov}:offset=${offset.toFixed(4)}${outLabel};`;
      prevLabel = outLabel;
      acc = acc + clipLen(i + 1) - ov;
    }
    vFilter = vFilter.replace(/;$/, "");

    const n = a.videoScenes.length;
    const audioInputs: string[] = [];
    let audioFilter = "";
    let audioMap: string[] = [];
    let audioCodec: string[] = [];

    if (hasBgMusic && hasVoice) {
      audioInputs.push("-i", a.musicPath!, "-i", a.voicePath!);
      audioFilter = `;[${n}:a]volume=${a.musicVol.toFixed(2)},apad=whole_dur=999[bg];[${n + 1}:a]${voiceTempo}volume=${a.voiceVol.toFixed(2)},apad=whole_dur=999[vo];[bg][vo]amix=inputs=2:duration=longest[aout]`;
      audioMap = ["-map", "[aout]"];
      audioCodec = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"];
    } else if (hasBgMusic) {
      audioInputs.push("-i", a.musicPath!);
      audioFilter = `;[${n}:a]volume=${a.musicVol.toFixed(2)},apad=whole_dur=999[aout]`;
      audioMap = ["-map", "[aout]"];
      audioCodec = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"];
    } else if (hasVoice) {
      audioInputs.push("-i", a.voicePath!);
      audioFilter = `;[${n}:a]${voiceTempo}volume=${a.voiceVol.toFixed(2)},apad=whole_dur=999[aout]`;
      audioMap = ["-map", "[aout]"];
      audioCodec = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"];
    }

    return [
      ...videoInputs,
      ...audioInputs,
      "-filter_complex", `${vFilter}${audioFilter}`,
      "-map", "[vout]",
      ...audioMap,
      "-c:v", "libx264", "-preset", a.quality.preset, "-crf", a.quality.crf,
      "-pix_fmt", "yuv420p", "-profile:v", "main", "-level", "4.0",
      ...audioCodec,
      "-movflags", "+faststart",
      "-t", String(a.totalDur),
      "-y",
      a.outputPath,
    ];
  }

  // ── Simple concat path (all cuts — no re-encode of video) ──────────────
  if (hasBgMusic && hasVoice) {
    return [
      "-f", "concat", "-safe", "0", "-i", a.concatTxt,
      "-i", a.musicPath!, "-i", a.voicePath!,
      "-filter_complex",
        `[1:a]volume=${a.musicVol.toFixed(2)},apad=whole_dur=999[bg];` +
        `[2:a]${voiceTempo}volume=${a.voiceVol.toFixed(2)},apad=whole_dur=999[vo];` +
        `[bg][vo]amix=inputs=2:duration=longest[aout]`,
      "-map", "0:v", "-map", "[aout]",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-movflags", "+faststart",
      "-t", String(a.totalDur),
      "-y",
      a.outputPath,
    ];
  }
  if (hasBgMusic) {
    return [
      "-f", "concat", "-safe", "0", "-i", a.concatTxt, "-i", a.musicPath!,
      "-filter_complex", `[1:a]volume=${a.musicVol.toFixed(2)},apad=whole_dur=999[aout]`,
      "-map", "0:v", "-map", "[aout]",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-movflags", "+faststart",
      "-t", String(a.totalDur),
      "-y",
      a.outputPath,
    ];
  }
  if (hasVoice) {
    return [
      "-f", "concat", "-safe", "0", "-i", a.concatTxt, "-i", a.voicePath!,
      "-filter_complex", `[1:a]${voiceTempo}volume=${a.voiceVol.toFixed(2)},apad=whole_dur=999[aout]`,
      "-map", "0:v", "-map", "[aout]",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-movflags", "+faststart",
      "-t", String(a.totalDur),
      "-y",
      a.outputPath,
    ];
  }
  return [
    "-f", "concat", "-safe", "0", "-i", a.concatTxt,
    "-c:v", "copy",
    "-movflags", "+faststart",
    "-t", String(a.totalDur),
    "-y",
    a.outputPath,
  ];
}

function buildWatermarkFilter(): string {
  // Centred semi-transparent box with "JouwAnimatieVideo A.I." in Inter Bold.
  // Visual parity with the old browser-canvas watermark (480x56 box, 35% black,
  // white text 55% opacity). On Linux the fontfile path must be absolute; we
  // escape ':' so ffmpeg's filter-arg parser doesn't read it as a separator.
  const fontEscaped = FONT_PATH.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
  return [
    `drawtext=fontfile='${fontEscaped}'`,
    `text='JouwAnimatieVideo A.I.'`,
    `fontsize=26`,
    `fontcolor=white@0.55`,
    `box=1`,
    `boxcolor=black@0.35`,
    `boxborderw=12`,
    `x=(w-text_w)/2`,
    `y=(h-text_h)/2`,
  ].join(":");
}

// ── ffmpeg child-process helpers ─────────────────────────────────────────
async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download mislukt (${res.status}) voor ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath!, ["-hide_banner", "-i", filePath, "-f", "null", "-"]);
    let stderr = "";
    proc.stderr.on("data", (c) => { stderr += c.toString(); });
    proc.on("close", () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (!m) return resolve(0);
      resolve(parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]));
    });
    proc.on("error", () => resolve(0));
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath!, ["-hide_banner", "-loglevel", "error", ...args]);
    let stderr = "";
    proc.stderr.on("data", (c) => { stderr += c.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-600).trim()}`));
    });
    proc.on("error", (err) => reject(err));
  });
}

function runFfmpegWithProgress(
  args: string[],
  totalDur: number,
  onProgress: (frac: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath!, [
      "-hide_banner", "-loglevel", "error",
      "-progress", "pipe:1", "-nostats",
      ...args,
    ]);
    let stderr = "";
    let stdoutBuf = "";
    proc.stdout.on("data", (c) => {
      stdoutBuf += c.toString();
      // -progress writes key=value lines; out_time_us is microseconds
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) {
        const m = line.match(/^out_time_us=(\d+)/) ?? line.match(/^out_time_ms=(\d+)/);
        if (m && totalDur > 0) {
          const cur = parseInt(m[1]) / 1_000_000;
          onProgress(Math.max(0, Math.min(1, cur / totalDur)));
        }
      }
    });
    proc.stderr.on("data", (c) => { stderr += c.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-600).trim()}`));
    });
    proc.on("error", (err) => reject(err));
  });
}
