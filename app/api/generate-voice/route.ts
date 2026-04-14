import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, voiceId, text } = await req.json();

  // Generate audio via ElevenLabs
  const ttsRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!ttsRes.ok) {
    const err = await ttsRes.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  const audioBuffer = await ttsRes.arrayBuffer();

  // Upload to Supabase Storage
  const fileName = `voice_${projectId}_${Date.now()}.mp3`;
  const { error: uploadError } = await supabase.storage
    .from("audio")
    .upload(fileName, audioBuffer, { contentType: "audio/mpeg", upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("audio").getPublicUrl(fileName);

  await supabase
    .from("projects")
    .update({
      selected_voice: voiceId,
      voice_audio_url: urlData.publicUrl,
      status: "VoiceReady",
    })
    .eq("id", projectId)
    .eq("user_id", user.id);

  return NextResponse.json({ audioUrl: urlData.publicUrl });
}
