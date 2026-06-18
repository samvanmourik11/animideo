import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

export const runtime = "nodejs";
export const maxDuration = 120;

// Genereert een instrumentaal achtergrond-muziekbed voor het verhaal met
// CassetteAI (snelst + goedkoopst op fal, ~$0,02/min). Slaat het bed op in de
// `audio`-bucket (zoals de voice-over) en geeft de permanente URL + duur terug.
// Het bed wordt in player en export zacht onder de voice-over gemixt.
const MUSIC_MODEL = "cassetteai/music-generator";

// Vaste sturing zodat het echt een achtergrondbed blijft: instrumentaal, geen
// zang, rustig, niet opdringerig. De gebruikersstijl komt ervoor.
const BED_GUIDE =
  "Instrumental background music only, no vocals, no lyrics, no singing. Soft, calm, subtle and unobtrusive, sits gently under a spoken voice-over. Steady and looping, modern corporate explainer mood.";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const credit = await deductCredits(user.id, CREDIT_COSTS.MUSIC, "Story muziekbed");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.MUSIC },
        { status: 402 }
      );
    }

    const { prompt, duration } = (await req.json()) as { prompt?: string; duration?: number };
    const style = (prompt ?? "").trim();
    const fullPrompt = style ? `${style}. ${BED_GUIDE}` : BED_GUIDE;
    // CassetteAI rekent per minuut; we genereren precies de videolengte (geen loop
    // nodig). Begrenzen tegen uitschieters.
    const dur = Math.max(5, Math.min(600, Math.round(duration ?? 60)));

    const result = await fal.subscribe(MUSIC_MODEL, {
      input: { prompt: fullPrompt, duration: dur } as never,
    });
    const tempUrl = (result.data as { audio_file?: { url: string } }).audio_file?.url;
    if (!tempUrl) return NextResponse.json({ error: "Geen muziek ontvangen" }, { status: 500 });

    const buf = Buffer.from(await (await fetch(tempUrl)).arrayBuffer());
    const path = `${user.id}/story/music-${randomUUID()}.wav`;
    const { error: upErr } = await supabase.storage.from("audio").upload(path, buf, { contentType: "audio/wav", upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    const { data: urlData } = supabase.storage.from("audio").getPublicUrl(path);

    return NextResponse.json({ musicUrl: urlData.publicUrl, duration: dur });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("story-music failed:", msg);
    return NextResponse.json({ error: "Muziekbed genereren mislukt", detail: msg }, { status: 500 });
  }
}
