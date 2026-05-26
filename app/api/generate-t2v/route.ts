import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

// T2V draait sinds de refactor altijd op Seedance Lite t2v. Kling- en
// Seedance-Pro varianten zijn weggehaald; runway-status accepteert nog wel
// de oude videoModel-strings voor backward compatibility.
const SEEDANCE_LITE_T2V = "fal-ai/bytedance/seedance/v1/lite/text-to-video";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const authHeader = req.headers.get("authorization");
  let user = null;
  if (authHeader?.startsWith("Bearer ")) {
    const { data } = await supabase.auth.getUser(authHeader.slice(7));
    user = data.user;
  } else {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

  const credit = await deductCredits(user.id, CREDIT_COSTS.VIDEO_GENERATION, "Video beweging genereren");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.VIDEO_GENERATION },
      { status: 402 }
    );
  }

  const { videoPrompt, format } = await req.json();
  const safePrompt = (videoPrompt || "Cinematic scene with smooth motion").slice(0, 950);
  const aspectRatio = format === "9:16" ? "9:16" : "16:9";
  const videoModel = "seedance-lite-t2v";

  try {
    const { request_id } = await fal.queue.submit(SEEDANCE_LITE_T2V, {
      input: {
        prompt:       safePrompt,
        aspect_ratio: aspectRatio,
        duration:     "5",
        resolution:   "720p",
      },
    });
    return NextResponse.json({ taskId: request_id, videoModel });
  } catch (err: unknown) {
    try { await addCredits(user.id, CREDIT_COSTS.VIDEO_GENERATION, "Refund: video submit mislukt"); } catch {}
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-t2v] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
