import { NextRequest, NextResponse } from "next/server";
import { transcribeWords } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Playground-autosync: leest de voice-over audio van het project en de
// in_video-nodes, vraagt Whisper om woord-timestamps, en schrijft per shot
// een duration_sec die exact past op het deel van de audio waarin de tekst
// van die shot wordt uitgesproken. Daarna wordt project.scenes ook bijgewerkt
// zodat de editor dezelfde durations gebruikt.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessie ongeldig, log opnieuw in" }, { status: 401 });
  }

  const { projectId } = (await req.json().catch(() => ({}))) as { projectId?: string };
  if (!projectId) {
    return NextResponse.json({ error: "projectId is verplicht" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, mode, voice_audio_url, language, scenes, status")
    .eq("id", projectId)
    .single();
  if (!project || project.user_id !== user.id || project.mode !== "playground") {
    return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  }
  if (!project.voice_audio_url) {
    return NextResponse.json(
      { error: "Genereer eerst de voice-over voordat je autosync gebruikt." },
      { status: 400 }
    );
  }

  const { data: nodes } = await supabase
    .from("playground_nodes")
    .select("id, voiceover_text, sort_order")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .eq("in_video", true)
    .order("sort_order", { ascending: true });

  const shots = (nodes ?? []).filter((n) => n);
  if (shots.length === 0) {
    return NextResponse.json({ error: "Geen shots in de eindmontage" }, { status: 400 });
  }
  if (!shots.some((n) => (n.voiceover_text ?? "").trim().length > 0)) {
    return NextResponse.json(
      { error: "Geen voice-over tekst gevonden om op te aligneren." },
      { status: 400 }
    );
  }

  const audioRes = await fetch(project.voice_audio_url);
  if (!audioRes.ok) {
    return NextResponse.json(
      { error: `Audio download mislukt (HTTP ${audioRes.status})` },
      { status: 500 }
    );
  }
  const audioBuf = Buffer.from(await audioRes.arrayBuffer());

  const langMap: Record<string, string> = {
    Dutch: "nl",
    English: "en",
    German: "de",
    French: "fr",
    Spanish: "es",
    Italian: "it",
  };
  const lang = langMap[project.language] ?? undefined;

  let words: WordTimestamp[] = [];
  let totalAudioDuration = 0;
  try {
    const t = await transcribeWords(audioBuf, { language: lang });
    words = t.words;
    totalAudioDuration = t.duration;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Whisper transcriptie mislukt: ${msg}` }, { status: 500 });
  }

  if (words.length === 0) {
    return NextResponse.json({ error: "Geen woord-timestamps van Whisper" }, { status: 500 });
  }

  // Match shot-tokens cumulatief op transcript-words. Duur van shot N is
  // (start van shot N+1) − (start van shot N), zodat stiltes tussen zinnen
  // meegerekend worden en alle durations samen exact gelijk zijn aan de
  // audio-duur. Geen gaps, geen overlap.
  const shotTokens = shots.map((s) => tokenize(s.voiceover_text ?? ""));
  const totalShotWords = shotTokens.reduce((a, t) => a + t.length, 0);
  const ratioMismatch =
    totalShotWords === 0
      ? 1
      : Math.abs(words.length - totalShotWords) / Math.max(words.length, totalShotWords);

  let shotStarts: number[];
  if (ratioMismatch > 0.3 || totalShotWords === 0) {
    // Fallback: proportional starts based on character length
    const charLens = shots.map((s) => Math.max(1, (s.voiceover_text ?? "").trim().length));
    const totalChars = charLens.reduce((a, n) => a + n, 0);
    let acc = 0;
    shotStarts = charLens.map((c) => {
      const start = (acc / totalChars) * totalAudioDuration;
      acc += c;
      return start;
    });
  } else {
    shotStarts = [];
    let cursor = 0;
    for (let i = 0; i < shots.length; i++) {
      const idx = Math.min(cursor, words.length - 1);
      shotStarts.push(words[idx]?.start ?? 0);
      cursor += shotTokens[i].length;
    }
  }
  if (shotStarts.length > 0) shotStarts[0] = 0;

  const durations = shots.map((_, i) => {
    const start = shotStarts[i];
    const end = i < shots.length - 1 ? shotStarts[i + 1] : totalAudioDuration;
    const raw = Math.max(1, end - start);
    return Math.round(raw * 10) / 10;
  });

  // Schrijf elke nieuwe duur naar de bijbehorende playground_node.
  for (let i = 0; i < shots.length; i++) {
    await supabase
      .from("playground_nodes")
      .update({ duration_sec: durations[i] })
      .eq("id", shots[i].id)
      .eq("user_id", user.id)
      .eq("project_id", projectId);
  }

  // En spiegel direct in project.scenes zodat de editor de nieuwe durations
  // ziet zonder opnieuw te hoeven finaliseren.
  const existingScenes = Array.isArray(project.scenes) ? [...project.scenes] : [];
  const idxById = new Map(shots.map((n, i) => [n.id, i] as const));
  const syncedScenes = existingScenes.map((s) => {
    const i = idxById.get(s.id);
    if (i === undefined) return s;
    return { ...s, duration: durations[i] };
  });
  await supabase
    .from("projects")
    .update({ scenes: syncedScenes })
    .eq("id", projectId)
    .eq("user_id", user.id);

  // Geef de bijgewerkte nodes terug zodat de UI direct kan refreshen.
  const { data: refreshedNodes } = await supabase
    .from("playground_nodes")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    nodes: refreshedNodes ?? [],
    audioDuration: totalAudioDuration,
    wordsMatched: words.length,
    shotWords: totalShotWords,
    fallbackUsed: ratioMismatch > 0.3,
  });
}
