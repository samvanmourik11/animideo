import { NextRequest, NextResponse } from "next/server";
import { transcribeWords } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { Scene } from "@/lib/types";

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

  // Per bullet het moment bepalen waarop de stem 'm noemt, binnen het tijdvenster
  // van die scène. We zoeken de eerste gesproken woord-match op de kenmerkende
  // woorden van de bullet; geen match → gelijkmatige spreiding (fallback).
  const cleanWord = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
  function bulletReveals(
    bullets: { text: string }[],
    sceneStart: number,
    sceneEnd: number,
    sceneDur: number,
  ): number[] {
    const win = words.filter(w => w.start >= sceneStart - 0.05 && w.start < sceneEnd);
    const out: number[] = [];
    let pointer = 0;
    let last = 0;
    for (let k = 0; k < bullets.length; k++) {
      let toks = tokenize(bullets[k].text).filter(t => t.length >= 4);
      if (toks.length === 0) toks = tokenize(bullets[k].text).filter(t => t.length >= 2);
      let foundIdx = -1;
      for (let w = pointer; w < win.length; w++) {
        const wt = cleanWord(win[w].word);
        if (wt && toks.some(tk => wt === tk || wt.startsWith(tk) || tk.startsWith(wt))) { foundIdx = w; break; }
      }
      let rel: number;
      if (foundIdx >= 0) {
        rel = Math.max(0, win[foundIdx].start - sceneStart);
        pointer = foundIdx + 1;
      } else {
        rel = (k + 0.4) * (sceneDur / Math.max(1, bullets.length));
      }
      rel = Math.min(Math.max(rel, last), Math.max(0, sceneDur - 0.3));
      last = rel;
      out.push(Math.round(rel * 100) / 100);
    }
    return out;
  }

  const updatedScenes = scenes.map((s, i) => {
    const start = sceneStarts[i];
    const end   = i < scenes.length - 1 ? sceneStarts[i + 1] : totalAudioDuration;
    const raw   = Math.max(2, end - start);
    const dur   = Math.round(raw * 10) / 10;

    if (s.designed?.kind === "bullets" && (s.designed.bullets?.length ?? 0) > 0) {
      const reveals = bulletReveals(s.designed.bullets!, start, end, dur);
      const bullets = s.designed.bullets!.map((b, k) => ({ ...b, revealAt: reveals[k] }));
      return { ...s, duration: dur, designed: { ...s.designed, bullets } };
    }
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
