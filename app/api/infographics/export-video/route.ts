import { NextRequest, NextResponse } from "next/server";
import { launchBrowser, type Browser } from "@/lib/browser";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { canvasSize } from "@/lib/infographics/canvas-size";
import { totalDuration, FPS } from "@/lib/infographics/video";
import type { InfographicSpec } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// launchBrowser: gedeelde helper in @/lib/browser (Vercel-proof via @sparticuz/chromium).

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = (ffmpegPath as unknown as string) || "ffmpeg";
    const proc = spawn(bin, args);
    let err = "";
    proc.stderr.on("data", (d) => { err += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg faalde: " + err.slice(-500)))));
  });
}

export async function POST(req: NextRequest) {
  let browser: Browser | null = null;
  let dir: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId } = (await req.json()) as { projectId: string };
    const { data: project } = await supabase
      .from("projects")
      .select("title, infographic_spec")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();
    if (!project?.infographic_spec) {
      return NextResponse.json({ error: "Geen infographic gevonden om te exporteren" }, { status: 404 });
    }

    const spec = project.infographic_spec as InfographicSpec;
    const { width, height } = canvasSize(spec.format);
    const totalFrames = Math.max(1, Math.round(totalDuration(spec) * FPS));

    const b64 = Buffer.from(JSON.stringify(spec), "utf-8").toString("base64");
    const host = req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    const appUrl = host ? `${proto}://${host}` : new URL(req.url).origin;
    const renderUrl = `${appUrl}/infographic-video-render?spec=${encodeURIComponent(b64)}`;

    dir = await mkdtemp(path.join(tmpdir(), "igv-"));
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(renderUrl, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction("window.__igvReady === true", null, { timeout: 30000 });

    // Frame voor frame: zet het frame, wacht op de paint, maak een screenshot.
    for (let f = 0; f < totalFrames; f++) {
      await page.evaluate(
        (frame) =>
          new Promise<void>((resolve) => {
            (window as unknown as { __igvSetFrame: (n: number) => void }).__igvSetFrame(frame);
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
        f
      );
      await page.screenshot({
        path: path.join(dir, `frame-${String(f).padStart(5, "0")}.png`),
        clip: { x: 0, y: 0, width, height },
      });
    }
    await browser.close();
    browser = null;

    const outPath = path.join(dir, "out.mp4");
    await runFfmpeg([
      "-y",
      "-framerate", String(FPS),
      "-i", path.join(dir, "frame-%05d.png"),
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outPath,
    ]);

    const bytes = await readFile(outPath);
    const storagePath = `${user.id}/${projectId}/infographic-video-${Date.now()}.mp4`;
    const { error: uploadErr } = await supabase.storage
      .from("scene-assets")
      .upload(storagePath, bytes, { contentType: "video/mp4", upsert: true });
    if (uploadErr) throw new Error(`Upload mislukt: ${uploadErr.message}`);

    const downloadName = `${(project.title || "infographic").replace(/\s+/g, "-")}.mp4`;
    const { data: urlData } = supabase.storage
      .from("scene-assets")
      .getPublicUrl(storagePath, { download: downloadName });

    await rm(dir, { recursive: true, force: true });
    dir = null;

    await supabase.from("projects").update({ video_url: urlData.publicUrl, status: "Done" }).eq("id", projectId).eq("user_id", user.id);

    return NextResponse.json({ url: urlData.publicUrl, frames: totalFrames });
  } catch (err: unknown) {
    if (browser) await browser.close().catch(() => {});
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    console.error("infographic video export failed:", msg);
    return NextResponse.json({ error: "Video-export mislukt, probeer het opnieuw.", detail: msg }, { status: 500 });
  }
}
