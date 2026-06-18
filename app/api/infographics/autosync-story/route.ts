import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";
import type { StorySpec } from "@/lib/infographics/story-schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const runtime = "nodejs";
export const maxDuration = 120;

interface WordTimestamp { word: string; start: number; end: number; }

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
}

// Story-autosync (zelfde aanpak als de Creator Studio): transcribeer de doorlopende
// voice-over met Whisper (woord-timestamps) en leg de scenegrenzen op de plek in de
// audio waar de tekst van die scene wordt uitgesproken. De duur van scene N is
// (start van N+1) - (start van N), zodat stiltes meetellen en alle duren samen
// exact de audioduur vullen: geen gaten, geen overlap, beeld loopt gelijk met stem.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { spec } = (await req.json()) as { spec?: StorySpec };
    if (!spec || !Array.isArray(spec.scenes) || spec.scenes.length === 0) {
      return NextResponse.json({ error: "Geen scenes" }, { status: 400 });
    }
    if (!spec.voiceUrl) {
      return NextResponse.json({ error: "Genereer eerst de voice-over voordat je autosynct." }, { status: 400 });
    }

    const credit = await deductCredits(user.id, CREDIT_COSTS.SYNC, "Story autosync");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.SYNC },
        { status: 402 }
      );
    }

    const audioRes = await fetch(spec.voiceUrl);
    if (!audioRes.ok) return NextResponse.json({ error: `Audio download mislukt (HTTP ${audioRes.status})` }, { status: 500 });
    const audioBuf = Buffer.from(await audioRes.arrayBuffer());

    let words: WordTimestamp[] = [];
    let audioDuration = 0;
    try {
      const tr = await openai.audio.transcriptions.create({
        file: await toFile(audioBuf, "voice.mp3", { type: "audio/mpeg" }),
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["word"],
        language: "nl",
      });
      const t = tr as unknown as { words?: WordTimestamp[]; duration?: number };
      words = t.words ?? [];
      audioDuration = t.duration ?? 0;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Whisper transcriptie mislukt: ${msg}` }, { status: 500 });
    }
    if (words.length === 0) return NextResponse.json({ error: "Geen woord-timestamps van Whisper" }, { status: 500 });

    const scenes = spec.scenes;
    const sceneTokens = scenes.map((s) => tokenize(s.voiceover ?? ""));
    const totalSceneWords = sceneTokens.reduce((a, t) => a + t.length, 0);
    const ratioMismatch = totalSceneWords === 0 ? 1 : Math.abs(words.length - totalSceneWords) / Math.max(words.length, totalSceneWords);

    // Startpunt per scene: cumulatief op de woord-timestamps. Wijkt het aantal
    // getranscribeerde woorden te ver af van de tekst (>30%), val dan terug op een
    // verdeling naar tekstlengte zodat we nooit volledig de mist in gaan.
    let starts: number[];
    if (ratioMismatch > 0.3 || totalSceneWords === 0) {
      const charLens = scenes.map((s) => Math.max(1, (s.voiceover ?? "").trim().length));
      const totalChars = charLens.reduce((a, n) => a + n, 0);
      let acc = 0;
      starts = charLens.map((c) => { const st = (acc / totalChars) * audioDuration; acc += c; return st; });
    } else {
      starts = [];
      let cursor = 0;
      for (let i = 0; i < scenes.length; i++) {
        const idx = Math.min(cursor, words.length - 1);
        starts.push(words[idx]?.start ?? 0);
        cursor += sceneTokens[i].length;
      }
    }
    if (starts.length > 0) starts[0] = 0;

    const durations = scenes.map((_, i) => {
      const start = starts[i];
      const end = i < scenes.length - 1 ? starts[i + 1] : audioDuration;
      return Math.round(Math.max(1, end - start) * 10) / 10;
    });

    return NextResponse.json({
      durations,
      audioDuration,
      wordsMatched: words.length,
      sceneWords: totalSceneWords,
      fallbackUsed: ratioMismatch > 0.3,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("autosync-story failed:", msg);
    return NextResponse.json({ error: "Autosync mislukt", detail: msg }, { status: 500 });
  }
}
