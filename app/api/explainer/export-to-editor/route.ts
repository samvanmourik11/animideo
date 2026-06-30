import { NextRequest, NextResponse } from "next/server";
import { launchBrowser, type Browser } from "@/lib/browser";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { addCredits, deductCredits, CREDIT_COSTS } from "@/lib/credits";
import { canUseEditor } from "@/lib/editor/access";
import { canvasSize } from "@/lib/infographics/canvas-size";
import { synthesizeNarration } from "@/lib/explainer/voiceover";
import type { ExplainerSpec } from "@/lib/explainer/spec";
import type { TimelineDoc, VideoClip, AudioClip } from "@/lib/editor/timeline";

export const runtime = "nodejs";
export const maxDuration = 300;

const FFMPEG = (ffmpegPath as unknown as string) || "ffmpeg";
const FPS = 30;
const ANIM_FRAMES = 34;
const XFADE = 0.5;

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
  const refund = async () => { if (credited) { try { await addCredits(userId, CREDIT_COSTS.VOICE, "Refund: explainer naar editor"); } catch {} } };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
    if (!canUseEditor(user.email)) return NextResponse.json({ error: "Geen toegang tot de editor" }, { status: 403 });

    const { projectId, voice } = (await req.json()) as { projectId?: string; voice?: string };
    if (!projectId) return NextResponse.json({ error: "projectId vereist" }, { status: 400 });

    const { data: project } = await supabase
      .from("projects")
      .select("title, explainer_spec, format")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();
    const spec = project?.explainer_spec as ExplainerSpec | undefined;
    if (!spec || !Array.isArray(spec.scenes) || spec.scenes.length < 1) {
      return NextResponse.json({ error: "Geen geldige explainer gevonden" }, { status: 400 });
    }

    const credit = await deductCredits(user.id, CREDIT_COSTS.VOICE, "Explainer naar editor");
    if (!credit.success) {
      return NextResponse.json({ error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.VOICE }, { status: 402 });
    }
    credited = true;

    dir = await mkdtemp(path.join(tmpdir(), "ex2ed-"));
    const { width, height } = canvasSize(spec.format);

    // 1) Voice-over per scene: synthese, duur, upload.
    const audio: { url: string; dur: number }[] = [];
    for (let k = 0; k < spec.scenes.length; k++) {
      const narr = (spec.scenes[k].narration ?? "").trim();
      if (!narr) { audio.push({ url: "", dur: 0 }); continue; }
      const buf = Buffer.from(await synthesizeNarration(narr, { voice, languageCode: "nl" }));
      const af = path.join(dir, `a${k}.mp3`);
      await writeFile(af, buf);
      const dur = await probeDuration(af);
      spec.scenes[k].durationSec = Math.max(3, dur + 0.7);
      const apath = `${user.id}/explainer/${projectId}/voice-${k}-${Date.now()}.mp3`;
      const { error: aErr } = await supabase.storage.from("scene-assets").upload(apath, buf, { contentType: "audio/mpeg", upsert: true });
      if (aErr) throw new Error("Audio upload mislukt: " + aErr.message);
      audio.push({ url: supabase.storage.from("scene-assets").getPublicUrl(apath).data.publicUrl, dur });
    }

    // Sequentiële starttijden (clips overlappen niet op één track; crossfade via transitionIn).
    const starts: number[] = [];
    let cum = 0;
    for (const sc of spec.scenes) { starts.push(cum); cum += sc.durationSec; }

    // 2) Render per scene een clip en upload.
    const b64 = Buffer.from(JSON.stringify(spec), "utf-8").toString("base64");
    const host = req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    const appUrl = host ? `${proto}://${host}` : new URL(req.url).origin;
    const renderUrl = `${appUrl}/explainer-render?spec=${encodeURIComponent(b64)}`;

    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(renderUrl, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction("typeof window.__setExplainer === 'function'", null, { timeout: 30000 });

    const videoClips: VideoClip[] = [];
    const audioClips: AudioClip[] = [];
    for (let s = 0; s < spec.scenes.length; s++) {
      const sdir = path.join(dir, `s${s}`);
      await mkdir(sdir, { recursive: true });
      for (let f = 0; f < ANIM_FRAMES; f++) {
        await page.evaluate(
          ([sc, p]) => new Promise<void>((r) => {
            (window as unknown as { __setExplainer: (a: number, b: number) => void }).__setExplainer(sc as number, p as number);
            requestAnimationFrame(() => requestAnimationFrame(() => r()));
          }),
          [s, f / (ANIM_FRAMES - 1)]
        );
        await page.screenshot({ path: path.join(sdir, `f-${String(f).padStart(4, "0")}.png`), clip: { x: 0, y: 0, width, height } });
      }
      const dur = spec.scenes[s].durationSec;
      const clip = path.join(dir, `clip${s}.mp4`);
      const hold = Math.max(0, dur - ANIM_FRAMES / FPS);
      await runFfmpeg(["-y", "-framerate", String(FPS), "-i", path.join(sdir, "f-%04d.png"), "-vf", `tpad=stop_mode=clone:stop_duration=${hold.toFixed(3)},format=yuv420p`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", String(FPS), clip]);
      const bytes = await readFile(clip);
      const cpath = `${user.id}/explainer/${projectId}/scene-${s}-${Date.now()}.mp4`;
      const { error: cErr } = await supabase.storage.from("scene-assets").upload(cpath, bytes, { contentType: "video/mp4", upsert: true });
      if (cErr) throw new Error("Clip upload mislukt: " + cErr.message);
      const curl = supabase.storage.from("scene-assets").getPublicUrl(cpath).data.publicUrl;

      videoClips.push({
        id: randomUUID(), type: "video", src: curl, start: starts[s], duration: dur,
        trimIn: 0, naturalDuration: dur, volume: 0, speed: 1,
        ...(s > 0 ? { transitionIn: { kind: "fade", duration: XFADE } } : {}),
      });
      if (audio[s]?.url) {
        audioClips.push({ id: randomUUID(), type: "audio", src: audio[s].url, start: starts[s], duration: Math.max(0.3, audio[s].dur), trimIn: 0, volume: 1 });
      }
    }
    await browser.close();
    browser = null;

    // 3) TimelineDoc + editor-project.
    const ratio = spec.format === "9:16" ? "9:16" : "16:9";
    const timeline: TimelineDoc = {
      version: 1, ratio, width, height, fps: FPS, background: "#000000",
      tracks: [
        { id: randomUUID(), kind: "video", name: "Scenes", clips: videoClips },
        { id: randomUUID(), kind: "overlay", name: "Overlay", clips: [] },
        { id: randomUUID(), kind: "text", name: "Tekst", clips: [] },
        { id: randomUUID(), kind: "audio", name: "Voice-over", clips: audioClips },
      ],
    };

    const { data: ep, error: epErr } = await supabase
      .from("editor_projects")
      .insert({ user_id: user.id, title: `${project?.title || "Explainer"} (explainer)`, ratio, width, height, fps: FPS, timeline })
      .select("id")
      .single();
    if (epErr || !ep) throw new Error("Editor-project aanmaken mislukt: " + (epErr?.message ?? ""));

    await rm(dir, { recursive: true, force: true });
    dir = null;

    return NextResponse.json({ editorId: ep.id });
  } catch (err: unknown) {
    if (browser) await browser.close().catch(() => {});
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    await refund();
    const msg = err instanceof Error ? err.message : String(err);
    console.error("explainer export-to-editor failed:", msg);
    return NextResponse.json({ error: "Export naar editor mislukt, probeer het opnieuw.", detail: msg }, { status: 500 });
  }
}
