import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

const KLING_PRO_T2V      = "fal-ai/kling-video/v1.6/pro/text-to-video";
const KLING_STANDARD_T2V = "fal-ai/kling-video/v1.6/standard/text-to-video";
const SEEDANCE_PRO_T2V   = "fal-ai/bytedance/seedance/v1/pro/text-to-video";
const SEEDANCE_LITE_T2V  = "fal-ai/bytedance/seedance/v1/lite/text-to-video";

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

  const { videoPrompt, format, videoModel = "kling-standard-t2v" } = await req.json();
  const safePrompt = (videoPrompt || "Cinematic scene with smooth motion").slice(0, 950);
  const aspectRatio = format === "9:16" ? "9:16" : "16:9";

  try {
    let modelId: string;
    let input: Record<string, unknown>;

    if (videoModel === "seedance-pro-t2v" || videoModel === "seedance-lite-t2v") {
      modelId = videoModel === "seedance-pro-t2v" ? SEEDANCE_PRO_T2V : SEEDANCE_LITE_T2V;
      input = {
        prompt:       safePrompt,
        aspect_ratio: aspectRatio,
        duration:     "5",
        resolution:   "720p",
      };
    } else {
      modelId = videoModel === "kling-pro-t2v" ? KLING_PRO_T2V : KLING_STANDARD_T2V;
      input = {
        prompt:       safePrompt,
        duration:     "5",
        aspect_ratio: aspectRatio,
      };
    }

    const { request_id } = await fal.queue.submit(modelId, { input });
    return NextResponse.json({ taskId: request_id, videoModel });
  } catch (err: unknown) {
    try { await addCredits(user.id, CREDIT_COSTS.VIDEO_GENERATION, "Refund: video submit mislukt"); } catch {}
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-t2v] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
