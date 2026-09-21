import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits } from "@/lib/credits";
import { isTeamAccount } from "@/lib/studio/access";
import { kiesStem } from "@/lib/infographics/dialogue-stem";
import { lipsyncCredits, LIPSYNC_MAX_SEC, LIPSYNC_MODEL } from "@/lib/lipsync";

fal.config({ credentials: process.env.FAL_KEY });

export const runtime = "nodejs";
export const maxDuration = 120;

// Lipsync in de upload-tool: een beeld plus een zin (ingesproken door ElevenLabs) of een
// eigen opname wordt een pratende clip. Editors gebruiken die los in After Effects.
//
// Kling AI Avatar v2 Standard: in de proef van augustus 2026 de beste prijs/kwaliteit
// die de tekenstijl van het beeld houdt (zie de dialoogmodus). Maximaal 60 s en 5 MB audio.

const TAALCODE: Record<string, string> = {
  Dutch: "nl", English: "en", Spanish: "es", French: "fr", German: "de",
  Portuguese: "pt", Italian: "it", Japanese: "ja", Chinese: "zh",
};

function meetDuur(file: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn((ffmpegPath as unknown as string) || "ffmpeg", ["-hide_banner", "-i", file, "-f", "null", "-"]);
    let s = "";
    proc.stderr.on("data", (c) => { s += c.toString(); });
    proc.on("close", () => {
      const m = s.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      resolve(m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0);
    });
    proc.on("error", () => resolve(0));
  });
}

interface Body {
  imageUrl?: string;
  tekst?: string;
  stem?: string;
  taal?: string;
  audioUrl?: string;
  aanwijzing?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  // De upload-tool staat alleen in het menu van interne accounts; deze route dus ook.
  if (!isTeamAccount(user.email)) return NextResponse.json({ error: "Deze functie is niet beschikbaar" }, { status: 403 });

  const b = (await req.json()) as Body;
  const imageUrl = b.imageUrl?.trim();
  const tekst = (b.tekst ?? "").trim();
  if (!imageUrl) return NextResponse.json({ error: "Deze scène heeft nog geen afbeelding" }, { status: 400 });
  if (!tekst && !b.audioUrl) return NextResponse.json({ error: "Vul een tekst in of upload een geluidsopname" }, { status: 400 });

  let dir: string | null = null;
  try {
    // ---------- 1. Het geluid ----------
    let bronAudio: string;
    if (b.audioUrl) {
      bronAudio = b.audioUrl;
    } else {
      const tts = await fal.subscribe("fal-ai/elevenlabs/tts/eleven-v3", {
        input: {
          text: tekst.slice(0, 2000), voice: kiesStem(b.stem), language_code: TAALCODE[b.taal ?? ""] ?? "nl",
          stability: 0.5, similarity_boost: 0.75,
        } as never,
      });
      const url = (tts.data as { audio?: { url: string } }).audio?.url;
      if (!url) throw new Error("De stem kwam niet terug van ElevenLabs");
      bronAudio = url;
    }

    const res = await fetch(bronAudio);
    if (!res.ok) throw new Error(`Geluid ophalen mislukt (HTTP ${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Het geluidsbestand is groter dan 5 MB. Maak het korter of kleiner (bijv. mp3)." }, { status: 400 });
    }
    dir = await mkdtemp(path.join(tmpdir(), "lipsync-"));
    const ext = (bronAudio.split("?")[0].match(/\.(mp3|wav|m4a)$/i)?.[1] ?? "mp3").toLowerCase();
    const lokaal = path.join(dir, `stem.${ext}`);
    await writeFile(lokaal, buf);
    const duur = await meetDuur(lokaal);
    if (!duur) return NextResponse.json({ error: "Dit geluidsbestand kon niet gelezen worden. Gebruik mp3, wav of m4a." }, { status: 400 });
    if (duur > LIPSYNC_MAX_SEC) {
      return NextResponse.json({ error: `Het geluid duurt ${Math.round(duur)} seconden; lipsync kan maximaal ${LIPSYNC_MAX_SEC} seconden.` }, { status: 400 });
    }

    // Ingesproken tekst bewaren: de link van fal verloopt.
    let audioUrl = bronAudio;
    if (!b.audioUrl) {
      const pad = `${user.id}/lipsync/${randomUUID()}.mp3`;
      const { error } = await supabase.storage.from("audio").upload(pad, buf, { contentType: "audio/mpeg", upsert: true });
      if (error) throw new Error(`Stem opslaan mislukt: ${error.message}`);
      audioUrl = supabase.storage.from("audio").getPublicUrl(pad).data.publicUrl;
    }

    // ---------- 2. Credits en de clip ----------
    const credits = lipsyncCredits(duur);
    const credit = await deductCredits(user.id, credits, "Lipsync-clip");
    if (!credit.success) {
      return NextResponse.json({ error: "insufficient_credits", credits: credit.credits, required: credits }, { status: 402 });
    }
    try {
      const aanwijzing = (b.aanwijzing ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
      const { request_id } = await fal.queue.submit(LIPSYNC_MODEL, {
        input: { image_url: imageUrl, audio_url: audioUrl, ...(aanwijzing ? { prompt: aanwijzing } : {}) } as never,
      });
      return NextResponse.json({ requestId: request_id, audioUrl, duur, credits });
    } catch (e) {
      await addCredits(user.id, credits, "Refund: lipsync indienen mislukt").catch(() => {});
      throw e;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-lipsync] mislukt:", msg);
    return NextResponse.json({ error: `Lipsync mislukt: ${msg}` }, { status: 500 });
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
