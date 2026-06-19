// Reproduceert de EXACTE export-pijplijn (huidige, gefixte code) op de echte
// clips van een project, om te bewijzen dat de videolaag nu de volle lengte
// haalt i.p.v. in te klappen na scene 1. Print geen secrets.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import ffmpegPath from "ffmpeg-static";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

const PROJECT_ID = process.argv[2] || "f462e5d2-6bf1-4f89-986f-104c574e8772";
const D = "/tmp/repro"; mkdirSync(D, { recursive: true });

// ── exact dezelfde constanten/logica als app/api/export/route.ts ──
const TRANS_DUR = 0.5, CUT_DUR = 0.1, EXPORT_FPS = 30;
const XFADE_MAP = { fade: "fadeblack", dissolve: "dissolve", "slide-left": "slideleft", "slide-right": "slideright", "zoom-in": "zoomin" };
const W = 1920, H = 1080;
const ff = (args) => spawnSync(ffmpegPath, args, { encoding: "utf8", maxBuffer: 1 << 28 });
const probeDur = (p) => { const o = ff(["-i", p]).stderr || ""; const m = o.match(/Duration: (\d+):(\d+):([\d.]+)/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0; };

const { data: p } = await supa.from("projects").select("scenes, voice_audio_url").eq("id", PROJECT_ID).single();
const scenes = (p.scenes || []).filter((s) => s && s.video_url);
console.log(`scenes met video: ${scenes.length}`);

// download clips + voice
const dl = async (url, path) => { const r = await fetch(url); writeFileSync(path, Buffer.from(await r.arrayBuffer())); };
const clipPaths = [];
for (let i = 0; i < scenes.length; i++) { const cp = `${D}/clip${i}.mp4`; await dl(scenes[i].video_url, cp); clipPaths.push(cp); process.stdout.write(`.`); }
let voicePath = null;
if (p.voice_audio_url) { voicePath = `${D}/voice.mp3`; await dl(p.voice_audio_url, voicePath); }
console.log(`\nclips gedownload, voice: ${voicePath ? "ja" : "nee"}`);

const srcDur = clipPaths.map(probeDur);
let totalDur = 0; for (const s of scenes) totalDur += s.duration;
const hasNonCut = scenes.length > 1 && scenes.slice(0, -1).some((s) => (s.transition_out ?? "cut") !== "cut");
const scaleFilter = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`;

// ── trim-stap (met fps-normalisatie uit de fix) ──
const trimmed = [];
for (let i = 0; i < scenes.length; i++) {
  const sceneDur = scenes[i].duration, isLast = i === scenes.length - 1;
  const trans = scenes[i].transition_out ?? "cut";
  const baseTrans = trans !== "cut" ? TRANS_DUR : (hasNonCut ? CUT_DUR : 0);
  const transDur = !isLast ? Math.min(baseTrans, sceneDur * 0.4, scenes[i + 1].duration * 0.4) : 0;
  const trimDur = sceneDur + transDur;
  const speed = srcDur[i] > 0 ? sceneDur / srcDur[i] : 1;
  const tp = `${D}/t${i}.mp4`;
  ff(["-i", clipPaths[i], "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "-pix_fmt", "yuv420p",
    "-vf", `setpts=${speed.toFixed(4)}*PTS,tpad=stop_mode=clone:stop_duration=2,${scaleFilter},fps=${EXPORT_FPS}`,
    "-t", String(trimDur), "-an", "-y", tp]);
  trimmed.push(tp);
}

// ── xfade-keten (gefixte offset-math) ──
const tdOf = (i) => { if (i >= scenes.length - 1) return 0; const tr = scenes[i].transition_out ?? "cut"; const base = tr !== "cut" ? TRANS_DUR : CUT_DUR; return Math.min(base, scenes[i].duration * 0.4, scenes[i + 1].duration * 0.4); };
const clipLen = (i) => scenes[i].duration + tdOf(i);
let vF = "", prev = "[0:v]", acc = clipLen(0);
for (let i = 0; i < scenes.length - 1; i++) {
  const tr = scenes[i].transition_out ?? "cut";
  const xType = tr !== "cut" ? (XFADE_MAP[tr] ?? "dissolve") : "fade";
  const ov = tdOf(i), offset = Math.max(0, acc - ov);
  const out = i === scenes.length - 2 ? "[vout]" : `[xv${i}]`;
  vF += `${prev}[${i + 1}:v]xfade=transition=${xType}:duration=${ov}:offset=${offset.toFixed(4)}${out};`;
  prev = out; acc = acc + clipLen(i + 1) - ov;
}
vF = vF.replace(/;$/, "");

const inputs = trimmed.flatMap((t) => ["-i", t]);
const n = scenes.length;
let aFilter = "", aMap = [];
if (voicePath) { inputs.push("-i", voicePath); aFilter = `;[${n}:a]volume=1.00,apad=whole_dur=999[aout]`; aMap = ["-map", "[aout]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000"]; }
const out = `${D}/out.mp4`;
const cmd = [...inputs, "-filter_complex", `${vF}${aFilter}`, "-map", "[vout]", ...aMap,
  "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "-pix_fmt", "yuv420p", "-t", String(totalDur), "-y", out];
console.log(`\nxfade-keten draaien (totaal verwacht ${totalDur.toFixed(1)}s)...`);
const r = ff(cmd);
if (r.status !== 0) { console.error("ffmpeg faalde:\n", (r.stderr || "").split("\n").slice(-8).join("\n")); process.exit(1); }

// probe video- vs audiostream
const vEnd = ff(["-i", out, "-map", "0:v", "-c", "copy", "-f", "null", "-"]).stderr.match(/time=(\d+):(\d+):([\d.]+)/g);
const aEnd = ff(["-i", out, "-map", "0:a", "-c", "copy", "-f", "null", "-"]).stderr.match(/time=(\d+):(\d+):([\d.]+)/g);
console.log("\n===== RESULTAAT =====");
console.log("container:", probeDur(out).toFixed(2) + "s");
console.log("videostream eindigt op:", vEnd ? vEnd[vEnd.length - 1].replace("time=", "") : "?");
console.log("audiostream eindigt op:", aEnd ? aEnd[aEnd.length - 1].replace("time=", "") : "?");
console.log(`verwacht: ~${totalDur.toFixed(1)}s. Als video ~= audio ~= verwacht -> chain OK (geen freeze).`);
