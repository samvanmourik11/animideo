import { launchBrowser, type Browser } from "@/lib/browser";
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
        // Een overgang telt mee als audio-fade van die lengte, net als in de
        // compositor — zo blijft de export gelijk aan de preview.
        fadeIn: Math.max(clip.fadeIn ?? 0, clip.transitionIn?.duration ?? 0),
        fadeOut: Math.max(clip.fadeOut ?? 0, clip.transitionOut?.duration ?? 0),
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

// Heeft een bestand een audiospoor? AI-videoclips (Seedance) zijn stil; die
// mogen NIET in de audiomix, anders faalt ffmpeg op "[idx:a] matches no streams".
function probeHasAudio(file: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const bin = ffmpegPath as unknown as string;
      const p = spawn(bin, ["-hide_banner", "-i", file]);
      let err = "";
      p.stderr.on("data", (d) => (err += d.toString()));
      p.on("error", () => resolve(false));
      p.on("close", () => resolve(/Stream #\d+:\d+.*:\s*Audio:/i.test(err)));
    } catch {
      resolve(false);
    }
  });
}

// launchBrowser: gedeelde helper in @/lib/browser (lokaal volledige playwright,
// op Vercel playwright-core + @sparticuz/chromium).

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

    // Deterministische frame-voor-frame render: voor elk frame zetten we de
    // compositie exact op tijd t (en wachten op de video-seeks), dan een
    // screenshot. Zo is de export hardware-ONAFHANKELIJK en exact gelijk aan de
    // preview — geen hapering meer doordat realtime afspelen op trage (Vercel-)
    // hardware frames laat vallen.
    onProgress?.(5, "Media voorbereiden");
    await page.evaluate(
      (d) =>
        (window as unknown as { __editorRenderInit: (x: unknown) => Promise<unknown> }).__editorRenderInit(d),
      doc as unknown as Record<string, unknown>
    );

    // Audiobronnen (audio- én videoclips) vooraf downloaden; stille AI-clips
    // (zonder audiospoor) eruit filteren, anders crasht de filtergraph.
    const audioCandidates = collectAudio(doc);
    const audio: AudioSource[] = [];
    const audioFiles: string[] = [];
    for (let k = 0; k < audioCandidates.length; k++) {
      const f = path.join(dir, `a${k}`);
      await download(audioCandidates[k].src, f);
      if (await probeHasAudio(f)) {
        audio.push(audioCandidates[k]);
        audioFiles.push(f);
      } else {
        // Stille clip (AI-video zonder audiospoor): meteen opruimen, scheelt /tmp.
        await rm(f, { force: true }).catch(() => {});
      }
    }

    // FFmpeg leest de frames via een pipe (image2pipe) — geen duizenden PNG's
    // naar de beperkte /tmp. Input 0 = de framestroom; daarna de audio-inputs.
    const final = path.join(dir, "final.mp4");
    const args = ["-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "pipe:0"];
    for (const f of audioFiles) args.push("-i", f);

    if (audio.length === 0) {
      args.push(
        "-map", "0:v:0",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "veryfast",
        "-r", String(fps), "-movflags", "+faststart",
        final
      );
    } else {
      const filters: string[] = [];
      audio.forEach((a, k) => {
        const idx = k + 1; // input 0 = de framestroom
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
        "-filter_complex", filters.join(";"),
        "-map", "0:v:0", "-map", "[aout]",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "veryfast",
        "-r", String(fps), "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
        final
      );
    }

    // FFmpeg starten; we pipen de frames erin terwijl ze gerenderd worden.
    const bin = ffmpegPath as unknown as string;
    const ff = spawn(bin, args);
    let ffErr = "";
    ff.stderr.on("data", (d) => (ffErr += d.toString()));
    const ffDone = new Promise<void>((resolve, reject) => {
      ff.on("error", reject);
      ff.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error("ffmpeg faalde: " + ffErr.slice(-800)))
      );
    });
    ff.stdin.on("error", () => {}); // EPIPE negeren als ffmpeg vroegtijdig stopt

    onProgress?.(8, "Frames renderen");
    const totalFrames = Math.max(1, Math.round(duration * fps));
    for (let f = 0; f < totalFrames; f++) {
      const t = Math.min(duration, f / fps);
      await page.evaluate(
        (tt) =>
          (window as unknown as { __editorRenderFrame: (n: number) => Promise<void> }).__editorRenderFrame(
            tt as number
          ),
        t
      );
      const png = (await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: doc.width, height: doc.height },
      })) as Buffer;
      if (!ff.stdin.write(png)) {
        await new Promise<void>((r) => ff.stdin.once("drain", () => r()));
      }
      if (f % 4 === 0) onProgress?.(8 + Math.round((f / totalFrames) * 82), "Frames renderen");
    }
    ff.stdin.end();

    try {
      await page.evaluate(() =>
        (window as unknown as { __editorRenderDestroy?: () => void }).__editorRenderDestroy?.()
      );
    } catch { /* niet kritiek */ }
    await browser.close();

    onProgress?.(94, "Video afronden");
    await ffDone;

    onProgress?.(98, "Afronden");
    return await readFile(final);
  } finally {
    await browser.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}
