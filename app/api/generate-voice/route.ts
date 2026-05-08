import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { Scene } from "@/lib/types";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

type FalAudioResult = { audio?: { url: string } };

const ALLOWED_VOICES = new Set([
  "Aria","Roger","Sarah","Laura","Charlie","George","Callum","River","Liam","Charlotte",
  "Alice","Matilda","Will","Jessica","Eric","Chris","Brian","Daniel","Lily","Bill","Rachel",
]);

const LANGUAGE_TO_CODE: Record<string, string> = {
  Dutch:    "nl",
  English:  "en",
  German:   "de",
  French:   "fr",
  Spanish:  "es",
  Italian:  "it",
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Voice-over");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
      { status: 402 }
    );
  }

  const userId = user.id;
  async function refund() {
    try { await addCredits(userId, CREDIT_COSTS.IMAGE_GENERATION, "Refund: voice-over"); } catch {}
  }

  try {
    const { projectId, voice, stability, speed } = await req.json() as {
      projectId: string;
      voice?: string;
      stability?: number;
      speed?: number;
    };

    const { data: project } = await supabase
      .from("projects")
      .select("scenes, language")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();
    if (!project) {
      await refund();
      return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
    }

    const scenes = (project.scenes ?? []) as Scene[];
    const text = scenes.map(s => s.voiceover_text).filter(Boolean).join(" ").trim();
    if (!text) {
      await refund();
      return NextResponse.json({ error: "Geen voice-over tekst gevonden in scenes" }, { status: 400 });
    }

    const safeVoice = voice && ALLOWED_VOICES.has(voice) ? voice : "Charlotte";
    const langCode = LANGUAGE_TO_CODE[project.language] ?? "en";

    const result = await fal.subscribe("fal-ai/elevenlabs/tts/eleven-v3", {
      input: {
        text,
        voice:            safeVoice,
        language_code:    langCode,
        stability:        typeof stability === "number" ? Math.max(0, Math.min(1, stability)) : 0.5,
        similarity_boost: 0.75,
        speed:            typeof speed === "number" ? Math.max(0.7, Math.min(1.2, speed)) : 1,
      },
    });

    const tempUrl = (result.data as FalAudioResult).audio?.url;
    if (!tempUrl) {
      await refund();
      return NextResponse.json({ error: "Geen audio ontvangen van fal/ElevenLabs" }, { status: 500 });
    }

    const audioRes = await fetch(tempUrl);
    if (!audioRes.ok) {
      await refund();
      return NextResponse.json({ error: `Audio download mislukt (HTTP ${audioRes.status})` }, { status: 500 });
    }
    const audioBuffer = await audioRes.arrayBuffer();
    const fileName = `${userId}/${projectId}/voice.mp3`;

    const { error: uploadErr } = await supabase.storage
      .from("audio")
      .upload(fileName, audioBuffer, { contentType: "audio/mpeg", upsert: true });
    if (uploadErr) {
      await refund();
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from("audio").getPublicUrl(fileName);
    const audioUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    await supabase
      .from("projects")
      .update({ voice_audio_url: audioUrl, selected_voice: safeVoice, status: "VoiceReady" })
      .eq("id", projectId)
      .eq("user_id", userId);

    return NextResponse.json({ audioUrl, voice: safeVoice });
  } catch (err: unknown) {
    await refund();
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-voice] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
