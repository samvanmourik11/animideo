import { NextRequest, NextResponse } from "next/server";
import { fal } from "@/lib/fal";
import { createClient } from "@/lib/supabase/server";
import { Scene } from "@/lib/types";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

// Trage externe TTS-generatie; zonder dit kapt Vercel na ~15s af (opaque 504).
export const maxDuration = 300;

type FalAudioResult = { audio?: { url: string } };

const ALLOWED_VOICES = new Set([
  "Aria","Roger","Sarah","Laura","Charlie","George","Callum","River","Liam","Charlotte",
  "Alice","Matilda","Will","Jessica","Eric","Chris","Brian","Daniel","Lily","Bill","Rachel",
  // Hugo V + de uitgebreide Nederlandse/Vlaamse/kinderstem-bibliotheek uit de
  // ElevenLabs-stemmenbibliotheek; fal accepteert naast namen ook voice-id's.
  // Zie lib/infographics/story-voices.ts voor de volledige lijst met uitleg.
  "rbqBOMK4BPTMGvIB7N8w", // Hugo
  "rN2gFSK0c2RP1mgdpt69", "MkRWZTk4OBui6Jb2lgK0", "yGnXd97Wft6RDkIaLXiR", "0qLmDzgqulxcvv0yf3kg",
  "SFlhmoT9q6x81D3fl3dp", "YWWzyiP9IlB03CVK6QXN", "2GJZCZIWrWiGFDntCFaz", "FsohHqfNToVd5t03K9nL",
  "7qdUFMklKPaaAVMsBTBt", "XCOm4Hr4NoqIsKeVFU2y", "qpYcCnnbKrqp5HBM19ou", "6e6TrJGLhrDGMKOy5x2i",
  "kZQ3IGqYUStQ8u1Y62s6", "46eAUFOjYHnAbq9XpWMc", "tfweP7lGJyLeNV9dH1Rm", "DiUBVrSFwkMaPz4XqWvR",
  "5krdMTA5HonvWAlY2vSx", "ihKwLOjVUMG4lgUI6meZ", "XjGYkUkzth8BPs29fmcV",
  "EeQEodFZVtBkjtgK3HBc", "hO2yZ8lxM3axUxL8OeKX", "0luPAj5RsdhmnkZaiYcb",
  "02TPKkY2rZbgnKFIPrT9", "Yv0oyZ3obP9foTH7emqG", "AgeYjqDIfXtkcA3mOcsH",
  "wwW0aOSbbYgXMec1zRTp", "4Q02te4SdfFsVbcIKmbk", "LoLnBvKBzvdDcAUMNbKV",
  "YXgx21dvgkRwunWFpa5d", // Jamie — storyteller-stem, diep en kalm
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

  const credit = await deductCredits(user.id, CREDIT_COSTS.VOICE, "Voice-over");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.VOICE },
      { status: 402 }
    );
  }

  const userId = user.id;
  async function refund() {
    try { await addCredits(userId, CREDIT_COSTS.VOICE, "Refund: voice-over"); } catch {}
  }

  try {
    const { projectId, voice, stability, speed, script } = await req.json() as {
      projectId: string;
      voice?: string;
      stability?: number;
      speed?: number;
      script?: string; // door de gebruiker bewerkte/ingevoerde voice-over-tekst
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
    // Gebruik de meegestuurde (bewerkte) tekst; val terug op de scène-teksten.
    const text = (typeof script === "string" && script.trim())
      ? script.trim()
      : scenes.map(s => s.voiceover_text).filter(Boolean).join(" ").trim();
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

    const { error: dbErr } = await supabase
      .from("projects")
      .update({ voice_audio_url: audioUrl, selected_voice: safeVoice, status: "VoiceReady" })
      .eq("id", projectId)
      .eq("user_id", userId);
    if (dbErr) {
      // Audio is uploaded, but project couldn't persist the URL. Tell the
      // client so it can retry instead of silently losing the link.
      console.error("[generate-voice] DB update failed:", dbErr.message);
      return NextResponse.json(
        { error: `Audio gegenereerd maar opslaan mislukt: ${dbErr.message}`, audioUrl, voice: safeVoice },
        { status: 500 }
      );
    }

    return NextResponse.json({ audioUrl, voice: safeVoice });
  } catch (err: unknown) {
    await refund();
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-voice] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
