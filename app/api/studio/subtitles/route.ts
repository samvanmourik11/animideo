// Ondertiteling inbranden op de geëxporteerde video — met de ECHTE voice-over-
// tekst uit het script (geen audio-transcriptie, dus geen fouten) en volledig
// instelbaar (tekst per scène + grootte). We bouwen zelf een ASS-ondertitel en
// branden die met ffmpeg in, zodat we volledige controle hebben over de stijl.

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 300;

const FFMPEG = (ffmpegPath as unknown as string) || "ffmpeg";

type Segment = { start: number; duration: number; text: string };
type Cue = { start: number; end: number; text: string };

// Splits een (scène-)tekst in leesbare blokjes (max ~12 woorden / 84 tekens) en
// verdeelt de scèneduur evenredig over die blokjes op basis van lengte.
function buildCues(segments: Segment[]): Cue[] {
  const cues: Cue[] = [];
  for (const seg of segments) {
    const words = (seg.text || "").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0 || seg.duration <= 0) continue;
    const chunks: string[] = [];
    let cur: string[] = [];
    let curLen = 0;
    for (const w of words) {
      if (cur.length > 0 && (cur.length >= 12 || curLen + w.length + 1 > 84)) {
        chunks.push(cur.join(" ")); cur = []; curLen = 0;
      }
      cur.push(w); curLen += w.length + 1;
    }
    if (cur.length) chunks.push(cur.join(" "));
    const total = chunks.reduce((s, c) => s + c.length, 0) || 1;
    let t = seg.start;
    for (const c of chunks) {
      const d = seg.duration * (c.length / total);
      cues.push({ start: t, end: t + Math.max(0.6, d), text: c });
      t += d;
    }
  }
  return cues;
}

// Breek een regel in max 2 regels rond het midden (op een spatie).
function wrap2(text: string): string {
  if (text.length <= 42) return text;
  const mid = Math.floor(text.length / 2);
  let split = text.lastIndexOf(" ", mid);
  if (split < 10) split = text.indexOf(" ", mid);
  if (split < 0) return text;
  return text.slice(0, split) + "\\N" + text.slice(split + 1);
}

function assTime(s: number): string {
  const cs = Math.max(0, Math.round(s * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

function buildAss(cues: Cue[], W: number, H: number, fontSize: number): string {
  const outline = Math.max(2, Math.round(fontSize * 0.07));
  const marginV = Math.round(H * 0.06);
  const head = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 0",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,Arial,${fontSize},&H00FFFFFF,&H00000000,&H64000000,0,0,1,${outline},0,2,60,60,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");
  const events = cues.map(c =>
    `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${wrap2(c.text.replace(/[\r\n]+/g, " "))}`
  ).join("\n");
  return head + "\n" + events + "\n";
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args);
    let err = "";
    p.stderr.on("data", d => (err += d.toString()));
    p.on("error", reject);
    p.on("close", code => (code === 0 ? resolve() : reject(new Error("ffmpeg faalde: " + err.slice(-500)))));
  });
}

function probeDims(file: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, ["-hide_banner", "-i", file]);
    let err = "";
    p.stderr.on("data", d => (err += d.toString()));
    p.on("error", () => resolve({ w: 1920, h: 1080 }));
    p.on("close", () => {
      const m = err.match(/,\s(\d{2,5})x(\d{2,5})[\s,]/);
      resolve(m ? { w: parseInt(m[1]), h: parseInt(m[2]) } : { w: 1920, h: 1080 });
    });
  });
}

const SIZE_FACTOR: Record<string, number> = { small: 0.040, medium: 0.052, large: 0.068 };

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { editorProjectId, segments, fontSize } = await req.json() as {
    editorProjectId?: string; segments?: Segment[]; fontSize?: string;
  };
  if (!editorProjectId) return NextResponse.json({ error: "editorProjectId vereist" }, { status: 400 });
  if (!Array.isArray(segments) || segments.length === 0) {
    return NextResponse.json({ error: "Geen ondertiteltekst meegegeven" }, { status: 400 });
  }

  const { data: ep } = await supabase
    .from("editor_projects")
    .select("export_url, title")
    .eq("id", editorProjectId).eq("user_id", user.id).single();
  if (!ep?.export_url) {
    return NextResponse.json({ error: "Exporteer eerst de video in de editor; daarna kun je ondertiteling toevoegen." }, { status: 400 });
  }

  const credit = await deductCredits(user.id, CREDIT_COSTS.SUBTITLES, "Ondertiteling inbranden");
  if (!credit.success) {
    return NextResponse.json({ error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.SUBTITLES }, { status: 402 });
  }
  const refund = async () => { try { await addCredits(user.id, CREDIT_COSTS.SUBTITLES, "Refund: ondertiteling"); } catch {} };

  let dir: string | null = null;
  try {
    dir = await mkdtemp(path.join(tmpdir(), "subs-"));
    const inPath = path.join(dir, "in.mp4");
    const res = await fetch((ep.export_url as string).split("?")[0]);
    if (!res.ok) { await refund(); return NextResponse.json({ error: `Download mislukt (${res.status})` }, { status: 500 }); }
    await writeFile(inPath, Buffer.from(await res.arrayBuffer()));

    const { w, h } = await probeDims(inPath);
    const factor = SIZE_FACTOR[fontSize ?? "medium"] ?? SIZE_FACTOR.medium;
    const fs = Math.max(16, Math.round(h * factor));
    const cues = buildCues(segments);
    if (cues.length === 0) { await refund(); return NextResponse.json({ error: "Lege ondertiteltekst" }, { status: 400 }); }

    const assPath = path.join(dir, "subs.ass");
    await writeFile(assPath, buildAss(cues, w, h, fs), "utf-8");

    const outPath = path.join(dir, "out.mp4");
    // ass-filter pad: backslashes/dubbele punten escapen voor de filtergraph.
    const assArg = assPath.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
    await runFfmpeg([
      "-y", "-i", inPath,
      "-vf", `ass=${assArg}`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
      "-c:a", "copy", "-movflags", "+faststart",
      outPath,
    ]);

    const stamp = Date.now();
    const storagePath = `${user.id}/editor/${editorProjectId}/subtitled-${stamp}.mp4`;
    const { error: upErr } = await supabase.storage.from("scene-assets").upload(storagePath, await readFile(outPath), { contentType: "video/mp4", upsert: true });
    if (upErr) { await refund(); return NextResponse.json({ error: upErr.message }, { status: 500 }); }
    const dl = `${String(ep.title || "video").replace(/\s+/g, "-")}-ondertiteld.mp4`;
    const pub = supabase.storage.from("scene-assets").getPublicUrl(storagePath, { download: dl }).data.publicUrl;
    return NextResponse.json({ url: `${pub}${pub.includes("?") ? "&" : "?"}t=${stamp}` });
  } catch (e) {
    await refund();
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    if (dir) { try { await rm(dir, { recursive: true, force: true }); } catch {} }
  }
}
