import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { spawn } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

export const runtime = "nodejs";
export const maxDuration = 120;

const ALLOWED_VOICES = new Set([
  "Aria", "Roger", "Sarah", "Laura", "Charlie", "George", "Callum", "River", "Liam", "Charlotte",
  "Alice", "Matilda", "Will", "Jessica", "Eric", "Chris", "Brian", "Daniel", "Lily", "Bill", "Rachel",
]);

function probeDuration(file: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath as unknown as string, ["-hide_banner", "-i", file, "-f", "null", "-"]);
    let s = "";
    proc.stderr.on("data", (c) => { s += c.toString(); });
    proc.on("close", () => {
      const m = s.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      resolve(m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0);
    });
    proc.on("error", () => resolve(0));
  });
}

// Genereert de ingesproken voice-over voor één scene-tekst. Geeft de audio-URL
// en de exacte duur terug; die duur stuurt de scene-lengte in player/export.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { text, voice, speed } = (await req.json()) as { text?: string; voice?: string; speed?: number };
    const clean = (text ?? "").trim();
    if (!clean) return NextResponse.json({ error: "Geen tekst" }, { status: 400 });
    // Spreeksnelheid begrenzen tot een natuurlijk bereik (ElevenLabs speed).
    const safeSpeed = typeof speed === "number" && Number.isFinite(speed) ? Math.max(0.7, Math.min(1.2, speed)) : 1;

    const credit = await deductCredits(user.id, CREDIT_COSTS.VOICE, "Story voice-over");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.VOICE },
        { status: 402 }
      );
    }

    const safeVoice = voice && ALLOWED_VOICES.has(voice) ? voice : "Charlotte";

    const result = await fal.subscribe("fal-ai/elevenlabs/tts/eleven-v3", {
      input: {
        text: clean,
        voice: safeVoice,
        language_code: "nl",
        stability: 0.5,
        similarity_boost: 0.75,
        speed: safeSpeed,
      } as never,
    });
    const tempUrl = (result.data as { audio?: { url: string } }).audio?.url;
    if (!tempUrl) return NextResponse.json({ error: "Geen audio ontvangen" }, { status: 500 });

    const buf = Buffer.from(await (await fetch(tempUrl)).arrayBuffer());

    // Duur meten
    const tmp = join(tmpdir(), `voice-${randomUUID()}.mp3`);
    await writeFile(tmp, buf);
    const duration = await probeDuration(tmp);
    await rm(tmp, { force: true }).catch(() => {});

    // Opslaan in de audio-bucket
    const path = `${user.id}/story/${randomUUID()}.mp3`;
    const { error: upErr } = await supabase.storage.from("audio").upload(path, buf, { contentType: "audio/mpeg", upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    const { data: urlData } = supabase.storage.from("audio").getPublicUrl(path);

    return NextResponse.json({ audioUrl: urlData.publicUrl, duration });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("scene-voice failed:", msg);
    return NextResponse.json({ error: "Voice-over genereren mislukt", detail: msg }, { status: 500 });
  }
}
