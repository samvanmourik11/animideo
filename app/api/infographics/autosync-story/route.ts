import { NextRequest, NextResponse } from "next/server";
import { transcribeWords } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";
import type { StorySpec } from "@/lib/infographics/story-schema";
import { alignScenes, startsNaarDuren, type WordTimestamp } from "@/lib/infographics/story-align";

export const runtime = "nodejs";
export const maxDuration = 120;

// Taal van het verhaal → Whisper-taalcode. Zonder dit werd élke voice-over als
// Nederlands getranscribeerd; bij een eigen opname in een andere taal levert dat
// onzin-woorden op en dus scenegrenzen op willekeurige plekken.
const TAAL_NAAR_CODE: Record<string, string> = {
  // Vlaams valt onder "nl": Whisper kent geen aparte Vlaamse code en herkent
  // Vlaamse spraak prima als Nederlands.
  Nederlands: "nl", Vlaams: "nl", Engels: "en", Duits: "de", Frans: "fr", Spaans: "es", Italiaans: "it",
};

// Story-autosync (zelfde aanpak als de Creator Studio): transcribeer de doorlopende
// voice-over met Whisper (woord-timestamps) en leg de scenegrenzen op de plek in de
// audio waar de tekst van die scene wordt uitgesproken. Werkt zowel op een
// gegenereerde stem als op een eigen geüploade opname; het uitlijnen zelf zit in
// lib/infographics/story-align.ts.
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
      return NextResponse.json({ error: "Genereer of upload eerst een voice-over voordat je autosynct." }, { status: 400 });
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
      const t = await transcribeWords(audioBuf, {
        language: TAAL_NAAR_CODE[spec.language ?? "Nederlands"] ?? "nl",
      });
      words = t.words;
      audioDuration = t.duration;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Whisper transcriptie mislukt: ${msg}` }, { status: 500 });
    }
    if (words.length === 0) return NextResponse.json({ error: "Geen woord-timestamps van Whisper" }, { status: 500 });

    const uitlijning = alignScenes(
      words,
      spec.scenes.map((s) => s.voiceover ?? ""),
      audioDuration
    );
    const durations = startsNaarDuren(uitlijning.starts, audioDuration);

    return NextResponse.json({
      durations,
      audioDuration,
      wordsMatched: words.length,
      sceneWords: uitlijning.sceneWords,
      fallbackUsed: uitlijning.fallbackUsed,
      // Hoeveel scenegrenzen echt op een herkende zin liggen, i.p.v. op een
      // geschatte positie. De interface waarschuwt als dit tegenvalt.
      anchorsMatched: uitlijning.anchorsMatched,
      anchorsTotal: uitlijning.anchorsTotal,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("autosync-story failed:", msg);
    return NextResponse.json({ error: "Autosync mislukt", detail: msg }, { status: 500 });
  }
}
