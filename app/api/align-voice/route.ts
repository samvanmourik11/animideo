import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { createClient } from "@/lib/supabase/server";
import { Scene } from "@/lib/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface WordTimestamp { word: string; start: number; end: number }

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await req.json() as { projectId: string };
  if (!projectId) return NextResponse.json({ error: "projectId ontbreekt" }, { status: 400 });

  const { data: project } = await supabase
    .from("projects")
    .select("scenes, voice_audio_url, language")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  if (!project.voice_audio_url) return NextResponse.json({ error: "Eerst voice-over genereren" }, { status: 400 });

  const scenes = (project.scenes ?? []) as Scene[];
  if (scenes.length === 0) return NextResponse.json({ error: "Geen scenes" }, { status: 400 });

  const audioRes = await fetch(project.voice_audio_url);
  if (!audioRes.ok) return NextResponse.json({ error: `Audio download mislukt (HTTP ${audioRes.status})` }, { status: 500 });
  const audioBuf = Buffer.from(await audioRes.arrayBuffer());

  const langMap: Record<string, string> = {
    Dutch: "nl", English: "en", German: "de", French: "fr", Spanish: "es", Italian: "it",
  };
  const lang = langMap[project.language] ?? undefined;

  let words: WordTimestamp[] = [];
  let totalAudioDuration = 0;
  try {
    const transcription = await openai.audio.transcriptions.create({
      file:                     await toFile(audioBuf, "voice.mp3", { type: "audio/mpeg" }),
      model:                    "whisper-1",
      response_format:          "verbose_json",
      timestamp_granularities:  ["word"],
      ...(lang ? { language: lang } : {}),
    });
    const t = transcription as unknown as { words?: WordTimestamp[]; duration?: number };
    words = t.words ?? [];
    totalAudioDuration = t.duration ?? 0;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Whisper transcriptie mislukt: ${msg}` }, { status: 500 });
  }

  if (words.length === 0) {
    return NextResponse.json({ error: "Geen woord-timestamps van Whisper" }, { status: 500 });
  }

  // ── Match scene tokens cumulatief op transcript words ─────────────────────
  const sceneTokens = scenes.map(s => tokenize(s.voiceover_text ?? ""));
  const totalSceneWords = sceneTokens.reduce((a, t) => a + t.length, 0);
  const ratioMismatch = totalSceneWords === 0
    ? 1
    : Math.abs(words.length - totalSceneWords) / Math.max(words.length, totalSceneWords);

  // Bepaal voor elke scene het START-tijdstip in de audio. De DUUR van scene N
  // wordt dan (start van scene N+1) − (start van scene N), zodat eventuele
  // stiltes tussen zinnen worden meegerekend en alle durations samen exact
  // gelijk zijn aan de totale audio-duur. Geen gaps, geen overlap.
  let sceneStarts: number[];

  if (ratioMismatch > 0.3 || totalSceneWords === 0) {
    // Fallback: proportional starts based on character length
    const charLens = scenes.map(s => Math.max(1, (s.voiceover_text ?? "").trim().length));
    const totalChars = charLens.reduce((a, n) => a + n, 0);
    let acc = 0;
    sceneStarts = charLens.map(c => {
      const start = (acc / totalChars) * totalAudioDuration;
      acc += c;
      return start;
    });
  } else {
    sceneStarts = [];
    let cursor = 0;
    for (let i = 0; i < scenes.length; i++) {
      const tokens = sceneTokens[i];
      const idx = Math.min(cursor, words.length - 1);
      sceneStarts.push(words[idx]?.start ?? 0);
      cursor += tokens.length;
    }
  }

  // Eerste scene start altijd op 0 (anders zou een eventuele lead-in stilte
  // wegvallen en de durations niet tot totale audio optellen).
  if (sceneStarts.length > 0) sceneStarts[0] = 0;

  const updatedScenes = scenes.map((s, i) => {
    const start = sceneStarts[i];
    const end   = i < scenes.length - 1 ? sceneStarts[i + 1] : totalAudioDuration;
    const raw   = Math.max(2, end - start);
    const dur   = Math.round(raw * 10) / 10;
    return { ...s, duration: dur };
  });

  const { error: dbErr } = await supabase
    .from("projects")
    .update({ scenes: updatedScenes })
    .eq("id", projectId)
    .eq("user_id", user.id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({
    scenes:        updatedScenes,
    audioDuration: totalAudioDuration,
    wordsMatched:  words.length,
    sceneWords:    totalSceneWords,
    fallbackUsed:  ratioMismatch > 0.3,
  });
}
