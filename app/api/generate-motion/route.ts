import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

const KLING_MODEL = "fal-ai/kling-video/v1.6/pro/image-to-video";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Bearer token of cookie auth
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

  // Credits check
  const credit = await deductCredits(user.id, CREDIT_COSTS.RUNWAY_GENERATION, "Video beweging genereren");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.RUNWAY_GENERATION },
      { status: 402 }
    );
  }

  const { imageUrl, motionPrompt, format } = await req.json();
  const aspectRatio = format === "9:16" ? "9:16" : "16:9";

  // Signed URL zodat Kling de afbeelding zeker kan ophalen
  let promptImage: string = imageUrl;
  const storageMatch = imageUrl.match(/\/object\/(?:public|sign)\/scene-assets\/(.+?)(?:\?|$)/);
  if (storageMatch) {
    const { data: signed } = await supabase.storage
      .from("scene-assets")
      .createSignedUrl(storageMatch[1], 3600);
    if (signed?.signedUrl) promptImage = signed.signedUrl;
  }

  const safePrompt = (motionPrompt || "Smooth cinematic camera movement").slice(0, 2500);

  console.log("[generate-motion] Kling model:", KLING_MODEL);
  console.log("[generate-motion] aspectRatio:", aspectRatio);
  console.log("[generate-motion] promptLength:", safePrompt.length);

  try {
    const { request_id } = await fal.queue.submit(KLING_MODEL, {
      input: {
        image_url:    promptImage,
        prompt:       safePrompt,
        duration:     "5",
        aspect_ratio: aspectRatio,
      },
    });

    return NextResponse.json({ taskId: request_id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-motion] Fout:", JSON.stringify(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
