import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

// Eigen voice-over uploaden voor de storytelling-infographic: de klant spreekt
// zelf in (of laat dat doen) en gebruikt dat bestand in plaats van een
// gegenereerde stem. Kost geen credits — er komt geen enkele externe API aan te
// pas, alleen opslag.
//
// Alles wordt naar mp3 omgezet zodat de rest van de keten (player, autosync,
// export) precies hetzelfde bestandstype ziet als bij een gegenereerde stem.

// Whisper (gebruikt door de autosync) neemt maximaal 25 MB aan. Groter
// accepteren zou betekenen dat de upload lukt maar de autosync erna faalt.
const MAX_BYTES = 25 * 1024 * 1024;

const TOEGESTAAN = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave",
  "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac",
  "audio/ogg", "audio/webm", "audio/flac", "audio/x-flac",
]);

function ffmpeg(args: string[]): Promise<{ code: number; log: string }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath as unknown as string, ["-hide_banner", ...args]);
    let log = "";
    proc.stderr.on("data", (c) => { log += c.toString(); });
    proc.on("close", (code) => resolve({ code: code ?? 1, log }));
    proc.on("error", (e) => resolve({ code: 1, log: String(e) }));
  });
}

function duurUitLog(log: string): number {
  const m = log.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
}

export async function POST(req: NextRequest) {
  const opruimen: string[] = [];
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Geen bestand ontvangen" }, { status: 400 });
    }

    const naam = file.name || "voice-over.mp3";
    const ext = (naam.split(".").pop() ?? "").toLowerCase();
    const typeOk = TOEGESTAAN.has(file.type.toLowerCase());
    const extOk = ["mp3", "wav", "m4a", "aac", "ogg", "webm", "flac", "mp4"].includes(ext);
    if (!typeOk && !extOk) {
      return NextResponse.json(
        { error: "Dit lijkt geen audiobestand. Upload een mp3 (of wav, m4a, ogg)." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      const mb = Math.round(file.size / 1024 / 1024);
      return NextResponse.json(
        { error: `Bestand is ${mb} MB. Maximaal 25 MB — comprimeer de opname of kort hem in.` },
        { status: 413 }
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Het bestand is leeg." }, { status: 400 });
    }

    const invoer = join(tmpdir(), `upload-${randomUUID()}.${ext || "bin"}`);
    opruimen.push(invoer);
    await writeFile(invoer, Buffer.from(await file.arrayBuffer()));

    // Altijd hercoderen naar een schone mono-mp3 op 44,1 kHz. Dat normaliseert
    // exotische invoer (variabele bitrate, 8-bit wav, opnames uit spraakmemo's)
    // waar ffmpeg in de export anders over kan struikelen.
    const uitvoer = join(tmpdir(), `voice-${randomUUID()}.mp3`);
    opruimen.push(uitvoer);
    const { code, log } = await ffmpeg([
      "-i", invoer,
      "-vn",                 // eventuele albumhoes weggooien
      "-ac", "1",
      "-ar", "44100",
      "-b:a", "128k",
      "-y", uitvoer,
    ]);
    if (code !== 0) {
      console.error("story-voice-upload: ffmpeg mislukt:", log.slice(-500));
      return NextResponse.json(
        { error: "Dit audiobestand kon niet verwerkt worden. Probeer een gewone mp3." },
        { status: 400 }
      );
    }

    const duration = duurUitLog(log);
    if (!duration) {
      return NextResponse.json({ error: "Kon de lengte van de audio niet bepalen." }, { status: 400 });
    }

    const buf = await readFile(uitvoer);
    const pad = `${user.id}/story/${randomUUID()}.mp3`;
    const { error: upErr } = await supabase.storage
      .from("audio")
      .upload(pad, buf, { contentType: "audio/mpeg", upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data: urlData } = supabase.storage.from("audio").getPublicUrl(pad);

    return NextResponse.json({
      audioUrl: urlData.publicUrl,
      duration: Math.round(duration * 10) / 10,
      fileName: naam,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("story-voice-upload failed:", msg);
    return NextResponse.json({ error: "Upload mislukt", detail: msg }, { status: 500 });
  } finally {
    await Promise.all(opruimen.map((p) => rm(p, { force: true }).catch(() => {})));
  }
}
