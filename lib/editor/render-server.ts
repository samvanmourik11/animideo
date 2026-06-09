import { chromium, type Browser } from "playwright";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";
import { mkdtemp, writeFile, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { computeDuration, type TimelineDoc } from "./timeline";

// Server-side render: een headless Chrome draait dezelfde Pixi-compositor als
// de preview (op /editor-render), rendert frame voor frame, en FFmpeg maakt er
// de MP4 van. Zo is de export identiek aan wat de gebruiker in de editor ziet.
//
// LET OP: dit module is alleen server-side (gebruikt Playwright + FFmpeg).

type Progress = (pct: number, label: string) => void;

interface AudioSource {
  src: string;
  start: number;
  trimIn: number;
  duration: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

/** Alle hoorbare audio- en videoclips verzamelen voor de audiomix. */
function collectAudio(doc: TimelineDoc): AudioSource[] {
  const out: AudioSource[] = [];
  for (const track of doc.tracks) {
    if (track.muted) continue;
    for (const clip of track.clips) {
      if (clip.type !== "audio" && clip.type !== "video") continue;
      const volume = clip.volume ?? 1;
      if (volume <= 0 || !clip.src) continue;
      out.push({
        src: clip.src,
        start: clip.start,
        trimIn: clip.trimIn ?? 0,
        duration: clip.duration,
        volume,
        fadeIn: clip.fadeIn ?? 0,
        fadeOut: clip.fadeOut ?? 0,
      });
    }
  }
  return out;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kon media niet ophalen (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = ffmpegPath as unknown as string;
    const p = spawn(bin, args);
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error("ffmpeg faalde: " + err.slice(-800)))
    );
  });
}

async function launchBrowser(): Promise<Browser> {
  // Echte Chrome met GPU (new-headless) is veruit het snelst voor het afspelen.
  // Val terug op bundled Chromium met software-rendering als Chrome ontbreekt.
  try {
    return await chromium.launch({
      channel: "chrome",
      args: [
        "--no-sandbox",
        "--ignore-gpu-blocklist",
        "--headless=new",
        "--use-angle=metal",
        "--enable-gpu",
      ],
    });
  } catch {
    return await chromium.launch({
      args: [
        "--no-sandbox",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--ignore-gpu-blocklist",
        "--enable-unsafe-swiftshader",
      ],
    });
  }
}

export async function renderTimeline(
  doc: TimelineDoc,
  appUrl: string,
  onProgress?: Progress
): Promise<Buffer> {
  const fps = doc.fps || 30;
  const duration = computeDuration(doc);
  if (duration <= 0) throw new Error("Lege tijdlijn: niets te exporteren.");

  const dir = await mkdtemp(path.join(tmpdir(), "editor-render-"));
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({
      viewport: { width: doc.width, height: doc.height },
      deviceScaleFactor: 1,
    });
    onProgress?.(3, "Compositor laden");
    await page.goto(`${appUrl}/editor-render`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction("window.__editorReady === true", null, { timeout: 60000 });

    // Realtime opname: de compositor speelt de compositie af op de GPU en een
    // MediaRecorder neemt het canvas op. Veel sneller dan frame-voor-frame.
    onProgress?.(5, "Opnemen");
    let finished = false;
    const recPromise = page
      .evaluate(
        (d) =>
          (window as unknown as { __editorRecord: (x: unknown) => Promise<string> }).__editorRecord(
            d
          ),
        doc as unknown as Record<string, unknown>
      )
      .then((r) => {
        finished = true;
        return r;
      });

    while (!finished) {
      const p = (await page
        .evaluate(() => (window as unknown as { __editorProgress?: number }).__editorProgress ?? 0)
        .catch(() => 0)) as number;
      onProgress?.(5 + Math.round(p * 0.7), "Opnemen");
      await new Promise((r) => setTimeout(r, 500));
    }

    const b64 = await recPromise;
    await browser.close();
    const webm = path.join(dir, "recording.webm");
    await writeFile(webm, Buffer.from(b64, "base64"));

    // FFmpeg: opname (webm) → H.264 MP4, met de audiomix erbij.
    onProgress?.(80, "Audio mixen");
    const audio = collectAudio(doc);
    const args = ["-y", "-i", webm];
    for (let k = 0; k < audio.length; k++) {
      const f = path.join(dir, `a${k}`);
      await download(audio[k].src, f);
      args.push("-i", f);
    }

    onProgress?.(88, "Video coderen");
    const final = path.join(dir, "final.mp4");
    if (audio.length === 0) {
      args.push(
        "-map",
        "0:v:0",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "20",
        "-r",
        String(fps),
        "-t",
        String(duration),
        "-movflags",
        "+faststart",
        final
      );
    } else {
      const filters: string[] = [];
      audio.forEach((a, k) => {
        const idx = k + 1; // input 0 = de opgenomen video
        const startMs = Math.max(0, Math.round(a.start * 1000));
        let f = `[${idx}:a]atrim=start=${a.trimIn}:end=${a.trimIn + a.duration},asetpts=PTS-STARTPTS,volume=${a.volume}`;
        if (a.fadeIn > 0) f += `,afade=t=in:st=0:d=${a.fadeIn}`;
        if (a.fadeOut > 0)
          f += `,afade=t=out:st=${Math.max(0, a.duration - a.fadeOut)}:d=${a.fadeOut}`;
        f += `,adelay=${startMs}:all=1[a${k}]`;
        filters.push(f);
      });
      const labels = audio.map((_, k) => `[a${k}]`).join("");
      filters.push(`${labels}amix=inputs=${audio.length}:normalize=0:dropout_transition=0[aout]`);
      args.push(
        "-filter_complex",
        filters.join(";"),
        "-map",
        "0:v:0",
        "-map",
        "[aout]",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "20",
        "-r",
        String(fps),
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-t",
        String(duration),
        "-shortest",
        "-movflags",
        "+faststart",
        final
      );
    }
    await runFfmpeg(args);

    onProgress?.(98, "Afronden");
    return await readFile(final);
  } finally {
    await browser.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}
