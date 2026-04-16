import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import RunwayML from "@runwayml/sdk";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

const runway = new RunwayML({ apiKey: process.env.RUNWAY_API_KEY });

const KLING_PRO      = "fal-ai/kling-video/v1.6/pro/image-to-video";
const KLING_STANDARD = "fal-ai/kling-video/v1.6/standard/image-to-video";

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

  const credit = await deductCredits(user.id, CREDIT_COSTS.RUNWAY_GENERATION, "Video beweging genereren");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.RUNWAY_GENERATION },
      { status: 402 }
    );
  }

  const { imageUrl, motionPrompt, format, videoModel = "kling-pro" } = await req.json();
  const safePrompt = (motionPrompt || "Smooth cinematic camera movement").slice(0, 950);

  // Signed URL zodat externe services de afbeelding kunnen ophalen
  let promptImage: string = imageUrl;
  const storageMatch = imageUrl.match(/\/object\/(?:public|sign)\/scene-assets\/(.+?)(?:\?|$)/);
  if (storageMatch) {
    const { data: signed } = await supabase.storage
      .from("scene-assets")
      .createSignedUrl(storageMatch[1], 3600);
    if (signed?.signedUrl) promptImage = signed.signedUrl;
  }

  console.log("[generate-motion] model:", videoModel);

  try {
    if (videoModel === "runway") {
      const ratio = format === "9:16" ? "768:1280" : "1280:768";
      const task = await runway.imageToVideo.create({
        model:       "gen3a_turbo",
        promptImage: promptImage,
        promptText:  safePrompt,
        duration:    5,
        ratio,
      });
      return NextResponse.json({ taskId: task.id, videoModel: "runway" });
    }

    // Kling Pro of Standard via fal queue
    const klingModel   = videoModel === "kling-standard" ? KLING_STANDARD : KLING_PRO;
    const aspectRatio  = format === "9:16" ? "9:16" : "16:9";
    const { request_id } = await fal.queue.submit(klingModel, {
      input: {
        image_url:    promptImage,
        prompt:       safePrompt.slice(0, 2500),
        duration:     "5",
        aspect_ratio: aspectRatio,
      },
    });

    return NextResponse.json({ taskId: request_id, videoModel });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-motion] Fout:", JSON.stringify(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
