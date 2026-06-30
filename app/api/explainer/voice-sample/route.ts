import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { synthesizeNarration } from "@/lib/explainer/voiceover";

export const runtime = "nodejs";
export const maxDuration = 30;

const SAMPLE = "Hallo, zo klinkt deze stem in jouw explainer-video.";
const VOICES = new Set(["Charlotte", "Sarah", "Alice", "Matilda", "Daniel", "Brian", "George"]);

// Korte stem-preview. Gecachet per stem in storage zodat herhaald beluisteren
// geen nieuwe TTS kost.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { voice } = (await req.json()) as { voice?: string };
    const v = voice && VOICES.has(voice) ? voice : "Charlotte";
    const path = `voice-samples/${v}.mp3`;
    const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(path);
    const url = urlData.publicUrl;

    const head = await fetch(url, { method: "HEAD" }).catch(() => null);
    if (head && head.ok) return NextResponse.json({ url });

    const buf = Buffer.from(await synthesizeNarration(SAMPLE, { voice: v, languageCode: "nl" }));
    const { error } = await supabase.storage.from("scene-assets").upload(path, buf, { contentType: "audio/mpeg", upsert: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ url: `${url}?t=${Date.now()}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
