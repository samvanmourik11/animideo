// Rendert een ontworpen studio-scène (bullets/CTA) in de huisstijl tot een korte
// geanimeerde MP4 + een poster-beeld, en vult scene.video_url + scene.image_url.
// Volledig deterministisch (geen AI): Playwright screenshot per frame van
// /designed-scene-render, daarna ffmpeg met tpad om het laatste frame vast te
// houden tot de scèneduur. Geen credits — het kost geen externe API-calls.

import { NextRequest, NextResponse } from "next/server";
import { launchBrowser, type Browser } from "@/lib/browser";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { Scene, OutroContact } from "@/lib/types";
import {
  DESIGNED_SIZES,
  buildDesignedTheme,
  type DesignedScene,
  type DesignedFormat,
} from "@/lib/studio/designed-scene";

export const runtime = "nodejs";
export const maxDuration = 300;

const FFMPEG = (ffmpegPath as unknown as string) || "ffmpeg";
const FPS = 30;
const ANIM_FRAMES = 34;

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

export async function POST(req: NextRequest) {
  let browser: Browser | null = null;
  let dir: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId, sceneId, clientScenes } = await req.json() as {
      projectId: string; sceneId: string; clientScenes?: Scene[];
    };
    if (!projectId || !sceneId) {
      return NextResponse.json({ error: "projectId en sceneId zijn verplicht" }, { status: 400 });
    }

    const { data: project } = await supabase
      .from("projects")
      .select("scenes, format, brand_kit_id, outro_logo_url, outro_contact")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();
    if (!project) return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });

    const scenes: Scene[] = clientScenes && clientScenes.length > 0
      ? clientScenes
      : (project.scenes ?? []) as Scene[];
    const idx = scenes.findIndex(s => s.id === sceneId);
    const scene = scenes[idx];
    if (!scene) return NextResponse.json({ error: "Scene niet gevonden" }, { status: 404 });
    if (!scene.designed) return NextResponse.json({ error: "Scene is geen ontworpen scène" }, { status: 400 });

    // Huisstijlkleuren uit de brand kit. Hieruit bouwt buildDesignedTheme een
    // UNIEKE achtergrond als combinatie van die kleuren (gradient + kleurvlakken).
    let colors: { primary?: string; secondary?: string; accent?: string; background?: string } = {};
    let kitLogoUrl: string | null = null;
    if (project.brand_kit_id) {
      const { data: kit } = await supabase
        .from("brand_kits")
        .select("colors, logo_url")
        .eq("id", project.brand_kit_id)
        .eq("user_id", user.id)
        .single();
      if (kit?.colors) colors = kit.colors as typeof colors;
      kitLogoUrl = (kit?.logo_url as string | null) ?? null;
    }

    dir = await mkdtemp(path.join(tmpdir(), "designed-"));
    const framesDir = path.join(dir, "f");
    await mkdir(framesDir, { recursive: true });

    const theme = buildDesignedTheme(colors);
    const format: DesignedFormat = project.format === "9:16" ? "9:16" : "16:9";
    const outro = (project.outro_contact ?? {}) as OutroContact;

    const designed = scene.designed;
    const spec: DesignedScene = {
      kind: designed.kind,
      format,
      title: designed.title,
      subtitle: designed.subtitle,
      bullets: designed.bullets,
      theme,
      durationSec: scene.duration && scene.duration > 0 ? scene.duration : designed.kind === "bullets" ? 6 : 5,
      // Logo op de CTA-eindscène: handmatig geüpload logo heeft voorrang, anders
      // het logo uit de brand kit (uit het website-onderzoek).
      logoUrl: designed.kind === "cta" ? (project.outro_logo_url ?? kitLogoUrl ?? null) : null,
      contact: designed.kind === "cta"
        ? {
            cta: outro.tagline || undefined,
            website: outro.website || undefined,
            email: outro.email || undefined,
            phone: outro.phone || undefined,
          }
        : undefined,
    };

    const { width, height } = DESIGNED_SIZES[format];
    const b64 = Buffer.from(JSON.stringify(spec), "utf-8").toString("base64");
    const host = req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    const appUrl = host ? `${proto}://${host}` : new URL(req.url).origin;
    const renderUrl = `${appUrl}/designed-scene-render?spec=${encodeURIComponent(b64)}`;

    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(renderUrl, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction("typeof window.__setDesigned === 'function'", null, { timeout: 30000 });

    // Volledige duur renderen (progress loopt 0→1 over de hele scène), zodat de
    // per-bullet onthullingen exact op hun tijdstip landen.
    const totalFrames = Math.max(ANIM_FRAMES, Math.round(spec.durationSec * FPS));
    for (let f = 0; f < totalFrames; f++) {
      await page.evaluate(
        (p) => new Promise<void>((r) => {
          (window as unknown as { __setDesigned: (n: number) => void }).__setDesigned(p as number);
          requestAnimationFrame(() => requestAnimationFrame(() => r()));
        }),
        f / (totalFrames - 1)
      );
      await page.screenshot({ path: path.join(framesDir, `f-${String(f).padStart(4, "0")}.png`), clip: { x: 0, y: 0, width, height } });
    }
    await browser.close();
    browser = null;

    const clipPath = path.join(dir, "clip.mp4");
    await runFfmpeg([
      "-y", "-framerate", String(FPS), "-i", path.join(framesDir, "f-%04d.png"),
      "-vf", "format=yuv420p",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", String(FPS),
      clipPath,
    ]);

    // Upload clip + poster (laatste frame).
    const stamp = Date.now();
    const clipBytes = await readFile(clipPath);
    const clipKey = `${user.id}/${projectId}/${sceneId}-designed-${stamp}.mp4`;
    const { error: cErr } = await supabase.storage.from("scene-assets").upload(clipKey, clipBytes, { contentType: "video/mp4", upsert: true });
    if (cErr) throw new Error("Clip upload mislukt: " + cErr.message);
    const videoUrl = supabase.storage.from("scene-assets").getPublicUrl(clipKey).data.publicUrl;

    const posterBytes = await readFile(path.join(framesDir, `f-${String(totalFrames - 1).padStart(4, "0")}.png`));
    const posterKey = `${user.id}/${projectId}/${sceneId}-designed-${stamp}.png`;
    const { error: pErr } = await supabase.storage.from("scene-assets").upload(posterKey, posterBytes, { contentType: "image/png", upsert: true });
    if (pErr) throw new Error("Poster upload mislukt: " + pErr.message);
    const imageUrl = `${supabase.storage.from("scene-assets").getPublicUrl(posterKey).data.publicUrl}?t=${stamp}`;

    const updatedScenes = scenes.map(s => s.id === sceneId ? { ...s, image_url: imageUrl, video_url: videoUrl } : s);
    const { error: dbErr } = await supabase
      .from("projects")
      .update({ scenes: updatedScenes })
      .eq("id", projectId)
      .eq("user_id", user.id);
    if (dbErr) {
      return NextResponse.json({ error: `Gerenderd maar opslaan mislukt: ${dbErr.message}`, imageUrl, videoUrl }, { status: 500 });
    }

    return NextResponse.json({ scenes: updatedScenes, imageUrl, videoUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("render-designed-scene failed:", msg);
    return NextResponse.json({ error: `Ontworpen scène renderen mislukt: ${msg}` }, { status: 500 });
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
    if (dir) { try { await rm(dir, { recursive: true, force: true }); } catch {} }
  }
}
