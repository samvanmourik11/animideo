import { NextRequest, NextResponse } from "next/server";
import { launchBrowser, type Browser } from "@/lib/browser";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { addCredits, deductCredits, CREDIT_COSTS } from "@/lib/credits";
import { canvasSize } from "@/lib/infographics/canvas-size";
import { FPS, sceneStarts, totalDuration } from "@/lib/explainer/timeline";
import { synthesizeNarration } from "@/lib/explainer/voiceover";
import type { ExplainerSpec } from "@/lib/explainer/spec";

export const runtime = "nodejs";
export const maxDuration = 300;

const FFMPEG = (ffmpegPath as unknown as string) || "ffmpeg";

// launchBrowser: gedeelde helper in @/lib/browser (Vercel-proof via @sparticuz/chromium).

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args);
    let err = "";
    proc.stderr.on("data", (d) => { err += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg faalde: " + err.slice(-500)))));
  });
}

function probeDuration(file: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(FFMPEG, ["-i", file]);
    let err = "";
    proc.stderr.on("data", (d) => { err += d.toString(); });
    proc.on("error", () => resolve(0));
    proc.on("close", () => {
      const m = err.match(/Duration: (\d+):(\d+):([\d.]+)/);
      resolve(m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0);
    });
  });
}

export async function POST(req: NextRequest) {
  let browser: Browser | null = null;
  let dir: string | null = null;
  let credited = false;
  let userId = "";
  const refund = async () => {
    if (credited) { try { await addCredits(userId, CREDIT_COSTS.VOICE, "Refund: explainer-export"); } catch {} }
  };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;

    const body = (await req.json()) as { projectId?: string; voice?: string };
    if (!body.projectId) return NextResponse.json({ error: "projectId vereist" }, { status: 400 });

    const { data: project } = await supabase
      .from("projects")
      .select("title, explainer_spec")
      .eq("id", body.projectId)
      .eq("user_id", user.id)
      .single();
    const spec = project?.explainer_spec as ExplainerSpec | undefined;
    if (!spec || !Array.isArray(spec.scenes) || spec.scenes.length < 2) {
      return NextResponse.json({ error: "Geen geldige explainer gevonden om te exporteren" }, { status: 400 });
    }

    // De voice-over kost; reken die af (met refund bij falen).
    const credit = await deductCredits(user.id, CREDIT_COSTS.VOICE, "Explainer voice-over export");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.VOICE },
        { status: 402 }
      );
    }
    credited = true;

    dir = await mkdtemp(path.join(tmpdir(), "exvid-"));

    // 1) TTS per scene; scene-duur op de gesproken duur baseren.
    const audio: { file: string; sceneIndex: number }[] = [];
    for (let k = 0; k < spec.scenes.length; k++) {
      const narration = (spec.scenes[k].narration ?? "").trim();
      if (!narration) continue;
      const buf = Buffer.from(await synthesizeNarration(narration, { voice: body.voice, languageCode: "nl" }));
      const af = path.join(dir, `a${k}.mp3`);
      await writeFile(af, buf);
      const d = await probeDuration(af);
      spec.scenes[k].durationSec = Math.max(3, d + 0.7);
      audio.push({ file: af, sceneIndex: k });
    }

    const { width, height } = canvasSize(spec.format);
    const totalFrames = Math.max(1, Math.round(totalDuration(spec) * FPS));
    const starts = sceneStarts(spec);

    // 2) Frames renderen via de render-host.
    const b64 = Buffer.from(JSON.stringify(spec), "utf-8").toString("base64");
    const host = req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    const appUrl = host ? `${proto}://${host}` : new URL(req.url).origin;
    const renderUrl = `${appUrl}/explainer-video-render?spec=${encodeURIComponent(b64)}`;

    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(renderUrl, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction("window.__exvReady === true", null, { timeout: 30000 });

    for (let f = 0; f < totalFrames; f++) {
      await page.evaluate(
        (frame) =>
          new Promise<void>((resolve) => {
            (window as unknown as { __exvSetFrame: (n: number) => void }).__exvSetFrame(frame);
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
        f
      );
      await page.screenshot({ path: path.join(dir, `frame-${String(f).padStart(5, "0")}.png`), clip: { x: 0, y: 0, width, height } });
    }
    await browser.close();
    browser = null;

    // 3) Stille video uit frames.
    const silent = path.join(dir, "silent.mp4");
    await runFfmpeg([
      "-y", "-framerate", String(FPS), "-i", path.join(dir, "frame-%05d.png"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent,
    ]);

    // 4) Voice-over per scene op de juiste starttijd muxen.
    const outPath = path.join(dir, "out.mp4");
    if (audio.length > 0) {
      const inputs = audio.flatMap((a) => ["-i", a.file]);
      let filter = "";
      audio.forEach((a, i) => {
        const ms = Math.round(starts[a.sceneIndex] * 1000);
        filter += `[${i + 1}:a]adelay=${ms}:all=1[d${i}];`;
      });
      filter += audio.map((_, i) => `[d${i}]`).join("") + `amix=inputs=${audio.length}:normalize=0:dropout_transition=0[aout]`;
      await runFfmpeg([
        "-i", silent, ...inputs, "-filter_complex", filter,
        "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-y", outPath,
      ]);
    }
    const finalFile = audio.length > 0 ? outPath : silent;

    // 5) Upload.
    const bytes = await readFile(finalFile);
    const storagePath = `${user.id}/explainer/${Date.now()}.mp4`;
    const { error: uploadErr } = await supabase.storage
      .from("scene-assets")
      .upload(storagePath, bytes, { contentType: "video/mp4", upsert: true });
    if (uploadErr) throw new Error(`Upload mislukt: ${uploadErr.message}`);

    const downloadName = `${(spec.title || "explainer").replace(/\s+/g, "-")}.mp4`;
    const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(storagePath, { download: downloadName });

    await supabase
      .from("projects")
      .update({ video_url: urlData.publicUrl, status: "Done" })
      .eq("id", body.projectId)
      .eq("user_id", user.id);

    await rm(dir, { recursive: true, force: true });
    dir = null;

    return NextResponse.json({ url: urlData.publicUrl, frames: totalFrames, duration: totalDuration(spec) });
  } catch (err: unknown) {
    if (browser) await browser.close().catch(() => {});
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    await refund();
    const msg = err instanceof Error ? err.message : String(err);
    console.error("explainer export failed:", msg);
    return NextResponse.json({ error: "Explainer-export mislukt, probeer het opnieuw.", detail: msg }, { status: 500 });
  }
}
